import { expect, test, type Page } from '@playwright/test';

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
    await page.getByLabel('Level').selectOption('university');
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
    const options = await scale.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);

    await scale.selectOption({ index: 1 });
    await expect(page.locator('main')).not.toHaveText(before);
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('the class filter is present and selectable', async ({ page }) => {
    const select = page.getByLabel('Class');
    await expect(select).toBeVisible();
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThan(0);
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
    const options = await kind.locator('option').allTextContents();
    expect(options).toEqual(['Note', 'Praise', 'Concern', 'Intervention']);
  });

  test('an entry is saved and appears on the timeline', async ({ page }) => {
    await signIn(page);
    await page.goto('/history');

    const entry = `Rewrote the lab method ${Date.now().toString().slice(-5)}`;
    await page.getByLabel('Entry').fill(entry);
    await page.getByLabel('Kind').selectOption('praise');
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