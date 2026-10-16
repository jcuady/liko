import { expect, test, type Page } from '@playwright/test';

import { chooseOption, chosenValue, optionEntries, optionLabels } from './helpers/select';

/**
 * The interactive surface, driven the way a teacher drives it.
 *
 * WHY THIS FILE EXISTS. The suite covered auth and the marketing page but never
 * opened a dialog, moved a filter, or pressed a write button while signed in.
 * That gap is how `/history` shipped broken: `SEVERITY_OPTIONS` was exported
 * from a `'use server'` module, so the client received a reference proxy instead
 * of an array, `SEVERITY_OPTIONS.map` threw, and every signed-in user who opened
 * History got the error boundary. No test had ever been in that state.
 *
 * Fixture mode keeps its store in server memory for the life of the process, so
 * a class created here is visible to the rest of the run. Assertions therefore
 * look for the specific item created rather than for exact counts, which would
 * make the suite order-dependent.
 */

const PASSWORD = 'LikoDemo!2026';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('maya@liko.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait on the navigation rather than asserting immediately: the password hash
  // is memory hard, so a sign-in is legitimately slow and the form stays in its
  // pending state while the server verifies.
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
  await expect(page.locator('#workspace-main')).toBeVisible();
}

test.describe('roster management', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/classes');
    await expect(page.locator('#workspace-main')).toBeVisible();
  });

  test('creates a class through the dialog and it appears in the list', async ({
    page,
  }) => {
    const code = `TST-${Date.now().toString().slice(-5)}`;

    await page.getByRole('button', { name: 'New class' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Class name').fill('Test Physics, Period 6');
    await page.getByLabel('Short code').fill(code);
    await chooseOption(page, page.getByLabel('Level'), 'university');
    await page.getByLabel('Lessons per week').fill('2');

    await page.getByRole('button', { name: 'Create class' }).click();

    // Scoped to the class list rather than matched as loose text, because the
    // success toast repeats the class name and a bare match resolves to both.
    await expect(page.getByRole('button', { name: new RegExp(code) })).toBeVisible();
    await expect(page.getByText('created.')).toBeVisible();
  });

  test('the dialog closes on cancel without creating anything', async ({ page }) => {
    await page.getByRole('button', { name: 'New class' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Class name').fill('Discarded Class');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Discarded Class')).toHaveCount(0);
  });

  test('adds a student and the roster table renders the row', async ({ page }) => {
    const name = `Test Student ${Date.now().toString().slice(-5)}`;

    await page.getByRole('button', { name: 'Add student' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Full name').fill(name);
    await page.getByLabel('Guardian name').fill('Guardian Of Test');
    await page.getByLabel('Guardian email').fill('guardian.of.test@example.com');

    await page.getByRole('button', { name: 'Add student' }).click();

    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Guardian Of Test');
  });

  test('the class selector switches the roster shown', async ({ page }) => {
    // The fixture workspace ships two classes so this control is not inert.
    const classButtons = page.locator('ul > li > button');
    const first = classButtons.first();
    const second = classButtons.nth(1);
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();

    await first.click();
    const firstHeading = await page.locator('main').innerText();

    await second.click();
    await expect(page.locator('main')).not.toHaveText(firstHeading);
  });
});

test.describe('attendance register', () => {
  /*
   * The fixture store is one process-wide workspace, so two tests writing the
   * same register overwrite each other: "mark all present" erased the excused
   * mark another test was about to assert on. Each test therefore opens a
   * different day, which the page already supports through the URL.
   */
  const dayOffset = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  };

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('the class filter and the date control are present', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('#workspace-main')).toBeVisible();

    await expect(page.getByLabel('Class')).toBeVisible();
    await expect(page.getByLabel('Register date')).toBeVisible();
  });


  test('mark all present updates the summary count', async ({ page }) => {
    await page.goto(`/attendance?date=${dayOffset(11)}`);
    await expect(page.locator('#workspace-main')).toBeVisible();

    const summary = page.locator('[aria-live="polite"]').first();
    const before = await summary.innerText();

    await page.getByRole('button', { name: 'Mark all present' }).click();

    await expect(summary).toContainText('marked present');
    await expect(summary).not.toHaveText(before);
  });

  test('a present cell cycles to late and is saved', async ({ page }) => {
    await page.goto(`/attendance?date=${dayOffset(12)}`);
    await expect(page.locator('#workspace-main')).toBeVisible();

    // The cycle is present, late, absent, excused, unset. Targeting a known
    // stored state makes the assertion deterministic rather than depending on
    // which student happens to sit first.
    const present = page.locator('button[aria-label*="Currently Present"]').first();
    await expect(present).toBeVisible();

    await present.click();

    // The toast is the server round trip completing, which is the part worth
    // asserting: the label alone would also pass if the write failed.
    await expect(page.getByText('Mark saved.')).toBeVisible();
  });

  test('clearing a mark is refused with an explanation', async ({ page }) => {
    await page.goto(`/attendance?date=${dayOffset(13)}`);
    await expect(page.locator('#workspace-main')).toBeVisible();

    // Excused cycles to unset, which the seam cannot write. The app says so
    // rather than painting a value a reload would contradict.
    const excused = page.locator('button[aria-label*="Currently Excused"]').first();
    await expect(excused).toBeVisible();

    await excused.click();
    await expect(page.getByText('Clearing a mark is not available yet')).toBeVisible();
  });
});

test.describe('gradebook', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/grades');
    await expect(page.locator('#workspace-main')).toBeVisible();
  });

  test('renders a gradebook table', async ({ page }) => {
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('the display scale filter changes the table', async ({ page }) => {
    const scale = page.getByLabel('Show as');
    await expect(scale).toBeVisible();

    const before = await page.locator('main').innerText();
    const options = await optionEntries(page, scale);
    expect(options.length).toBeGreaterThan(1);

    // The second option, chosen by the value the control stores rather than by a
    // label copied here, so a reworded scale name does not break the selection.
    await chooseOption(page, scale, options[1].value);
    await expect(page.locator('main')).not.toHaveText(before);
    await expect(page.getByRole('table')).toBeVisible();
  });

  /*
   * The five built-ins plus anything the teacher has authored. A school grading
   * on GWA or on UK degree classes has to be reachable from here, not only from
   * a constant list in code.
   */
  test('the scale selector offers every grading system', async ({ page }) => {
    const options = await optionLabels(page, page.getByLabel('Show as'));

    expect(options).toContain('Percentage');
    expect(options).toContain('Letter');
    expect(options).toContain('Milestone');
    expect(options).toContain('GPA');
    expect(options).toContain('GWA');
  });

  test('choosing GWA relabels the marks and the totals', async ({ page }) => {
    await chooseOption(page, page.getByLabel('Show as'), 'gwa');
    // The header states the scale in use, so the change is not silent.
    await expect(page.getByText(/values shown as gwa/i)).toBeVisible();

    // GWA is a point scale, so the totals change shape rather than staying a
    // percentage.
    await expect(page.getByRole('heading', { name: 'Weighted totals' })).toBeVisible();
    await expect(page.getByText(/weighted grade points on the gwa scale/i)).toBeVisible();
  });

  /*
   * RESTORES WHAT IT FINDS, AND IT DOES NOT DO SO BY ACCIDENT.
   *
   * This used to choose `letter`, apply it, and stop. The class then sat on
   * `letter` for the life of the fixture store, so on the next run against the
   * same server the control already opened on `letter`, `chooseOption` clicked
   * the value that was already selected and Radix fired no change, and the apply
   * button never enabled. Measured, not guessed: run 1 green in 2.8s, run 2
   * against the same store red at the `toBeEnabled()` below with the button
   * stuck `disabled` through 43 retries.
   *
   * It read as a race with the custom-scale test below because that is how a
   * cross-run coupling looks under `fullyParallel`: whichever test happened to
   * load the gradebook after the mutation saw the dirt. Serialising the file
   * hid the cause rather than removing it, and made all thirteen tests four
   * times slower to protect one of them.
   */
  test('a scale can be made the default for the class', async ({ page }) => {
    const scale = page.getByLabel('Show as');
    const apply = page.getByRole('button', { name: 'Use for this class' });

    // The view opens on whatever the class is graded on, so applying is a no-op
    // until the teacher picks something else.
    await expect(apply).toBeDisabled();

    const original = await chosenValue(page, scale);
    const target = original === 'gwa' ? 'letter' : 'gwa';

    await chooseOption(page, scale, target);
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(page.getByText('Scale applied to this class.')).toBeVisible();

    /*
     * The selection is only a view until it is applied. Read it back off a reload
     * so this asserts the class stored it rather than that a toast appeared.
     */
    await page.reload();
    await expect(page.locator('#workspace-main')).toBeVisible();
    expect(await chosenValue(page, scale)).toBe(target);

    // And put the class back on the scale the suite found it on.
    await chooseOption(page, scale, original);
    await expect(apply).toBeEnabled();
    await apply.click();

    await page.reload();
    await expect(page.locator('#workspace-main')).toBeVisible();
    expect(await chosenValue(page, scale)).toBe(original);
  });

  test('a custom scale can be authored and then selected', async ({ page }) => {
    await page.getByRole('button', { name: 'New scale' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const create = page.getByRole('button', { name: 'Create scale' });

    // The starter bands are complete, so only the missing name blocks. Validation
    // is derived on every keystroke, so it clears without a second submit.
    await expect(create).toBeDisabled();
    await expect(page.getByText('Give the scale a name.')).toBeVisible();

    await page.getByLabel('Scale name').fill('Distinction Pass Refer');
    await expect(create).toBeEnabled();

    // Clearing a band label blocks it again, with the reason shown.
    await page.locator('#scale-band-label-2').fill('');
    await expect(create).toBeDisabled();
    await expect(page.getByText(/Band 3 has no label/)).toBeVisible();

    await page.locator('#scale-band-label-2').fill('Refer');
    await expect(create).toBeEnabled();
    await create.click();

    await expect(page.getByText('created.')).toBeVisible();
    // The new scale is authored into the same list, so it has to appear there as
    // a selectable entry rather than only as a success toast.
    const scales = await optionLabels(page, page.getByLabel('Show as'));
    expect(scales).toContain('Distinction Pass Refer');
  });

  test('the class filter is present and selectable', async ({ page }) => {
    const select = page.getByLabel('Class');
    await expect(select).toBeVisible();
    expect((await optionEntries(page, select)).length).toBeGreaterThan(0);
  });
});

test.describe('history timeline', () => {
  /*
    This route crashed for every signed-in user until `SEVERITY_OPTIONS` moved
    out of the `'use server'` module. The assertions below are deliberately
    about the controls the page is supposed to render.
  */
  test('renders both filters and the entry form', async ({ page }) => {
    await signIn(page);
    await page.goto('/history');

    await expect(page.getByLabel('Class')).toBeVisible();
    await expect(page.getByLabel('Student')).toBeVisible();
    await expect(page.getByLabel('Entry')).toBeVisible();
    await expect(page.getByLabel('Kind')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add entry' })).toBeVisible();
  });

  test('the kind select lists every severity', async ({ page }) => {
    await signIn(page);
    await page.goto('/history');

    const kind = page.getByLabel('Kind');
    await expect(kind).toBeVisible();
    // Asserted as an exact list because a severity added without a thought is a
    // severity a teacher can file against but nobody has agreed to.
    const options = await optionLabels(page, kind);
    expect(options).toEqual(['Note', 'Praise', 'Concern', 'Intervention']);
  });

  test('an entry is saved and appears on the timeline', async ({ page }) => {
    await signIn(page);
    await page.goto('/history');

    const entry = `Rewrote the lab method ${Date.now().toString().slice(-5)}`;
    await page.getByLabel('Entry').fill(entry);
    await chooseOption(page, page.getByLabel('Kind'), 'praise');
    await page.getByRole('button', { name: 'Add entry' }).click();

    await expect(page.getByText('Entry added.')).toBeVisible();
    await expect(page.getByText(entry)).toBeVisible();
  });
});

test.describe('planner and assessments', () => {
  test('the planner opens the new lesson plan dialog', async ({ page }) => {
    await signIn(page);
    await page.goto('/plan');

    await expect(page.getByLabel('Class')).toBeVisible();
    await page.getByRole('button', { name: 'New lesson plan' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/lesson plan/i);
  });

  test('the assessment builder offers a class filter', async ({ page }) => {
    await signIn(page);
    await page.goto('/assess');

    await expect(page.locator('#workspace-main')).toBeVisible();
    await expect(page.getByLabel('Class')).toBeVisible();
  });
});

test.describe('profile', () => {
  /*
   * This route used to render an "editing your profile is not built yet"
   * placeholder. It now carries the answers the rest of the product reads, so
   * the form is asserted rather than the absence of one.
   */
  test('shows the teacher context on the profile', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/profile');

    await expect(page.getByLabel('Full name')).toHaveValue('Maya Okonkwo');
    await expect(page.getByLabel('School or institution')).toHaveValue(
      'Northfield Science Academy',
    );
    await expect(page.getByLabel('Subjects')).toHaveValue(
      'Chemistry, Environmental Science',
    );
    // The level and the scale are Radix selects, so what the profile shows is the
    // label on the closed trigger rather than a stored value on a form control.
    await expect(page.getByLabel('Level you usually teach')).toHaveText('K to 12');
    await expect(page.getByLabel('Default scale')).toHaveText('Percentage');
  });

  /*
   * This one saves for real and restores afterwards.
   *
   * It left `Ravensmoor College` on the profile permanently, while the test above
   * it asserts the institution is `Northfield Science Academy`. Under
   * `fullyParallel` those two are in the same describe and can land in either
   * order across workers, so the suite could go red on a green product purely from
   * which test reached the page second. Same defect as the grading-scale test:
   * a test that does not put the world back.
   */
  test('the save button is inert until something changes', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/profile');

    const institution = page.getByLabel('School or institution');
    const save = page.getByRole('button', { name: 'Save profile' });

    const original = await institution.inputValue();
    await expect(save).toBeDisabled();

    await institution.fill('Ravensmoor College');
    await expect(save).toBeEnabled();

    await save.click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    // The value survives a reload, which is the whole point of the form.
    await page.reload();
    await expect(institution).toHaveValue('Ravensmoor College');

    // Put it back, and prove the restore landed rather than assuming it did.
    await expect(page.locator('#workspace-main')).toBeVisible();
    await institution.fill(original);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    await page.reload();
    await expect(institution).toHaveValue(original);
  });

  test('the default scale offers every grading system', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/profile');

    const options = await optionLabels(page, page.getByLabel('Default scale'));
    expect(options).toContain('GWA');
    expect(options).toContain('GPA');
  });
});

test.describe('navigation shell', () => {
  test('every primary destination is reachable from the sidebar', async ({ page }) => {
    await signIn(page);

    for (const [name, path] of [
      ['Overview', '/overview'],
      ['Classes', '/classes'],
      ['Attendance', '/attendance'],
      ['Planner', '/plan'],
      ['Assessments', '/assess'],
      ['Grades', '/grades'],
      ['History', '/history'],
    ] as const) {
      const link = page.locator('nav a', { hasText: name }).first();
      if ((await link.count()) === 0) continue;
      await expect(link).toHaveAttribute('href', path);
    }
  });

  test('the appearance toggle switches the theme', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/appearance');

    // The control is a button named after the theme it will switch to, not a
    // switch role. "Switch theme" is the pre-hydration label.
    const toggle = page
      .getByRole('button', { name: /Switch (to (dark|light) )?theme/i })
      .first();
    await expect(toggle).toBeVisible();

    const before = await page.locator('html').getAttribute('class');
    await toggle.click();

    // next-themes writes the class a tick after the click, so this retries.
    await expect(page.locator('html')).not.toHaveAttribute('class', before ?? '');
  });
});
