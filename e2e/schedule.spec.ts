import { expect, test, type Page } from '@playwright/test';

import { chooseOption } from './helpers/select';

/**
 * The weekly timetable.
 *
 * These tests drive `/schedule` the way each role actually reaches it and assert
 * the parts that are easy to get wrong and hard to notice: that a student sees
 * their own week and not an empty grid, that a teacher picks a subject rather
 * than inheriting one, that a crafted id in the query string resolves to nobody,
 * and that the words on an empty state are addressed to the person reading them.
 */

const PASSWORD = 'LikoDemo!2026';

/** The one roster row in the demo with a linked account. */
const DEMO_STUDENT_ID = 'stu_001';
const DEMO_STUDENT_NAME = 'Ana Ferreira';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

/**
 * The linear reading of the week, which is the list a person actually scans.
 *
 * Scoped to `main` on purpose. The workspace navigation renders its own
 * `ul li` pairs, twice over: a desktop primary list, a desktop secondary list and
 * a mobile tab bar. An unscoped `ul li` counts navigation, not timetable, and a
 * count of 14 would have been a count of sidebar links.
 */
function weekList(page: Page) {
  return page.locator('main ul');
}

function weekEntries(page: Page) {
  return weekList(page).locator('li');
}

/**
 * The seeded week, in full.
 *
 * Fourteen classes plus the one deliberate double booking. Named rather than
 * recomputed so a change to the seed shows up as a deliberate edit here instead
 * of as a number that quietly drifts.
 */
const SEEDED_WEEK = 15;

/** The one class this file creates, so it can always be taken back off. */
const SCRATCH_CLASS = 'Astronomy';

/**
 * Remove the scratch class if it is there, and do not complain if it is not.
 *
 * The fixture store lives on `globalThis` in the dev server process and outlives
 * every test and every run, so a run that died between creating this class and
 * removing it would leave the week one class too long for the rest of the file.
 * Calling this first as well as last means the suite heals its own store instead
 * of needing a server restart to become trustworthy again. Two seconds is plenty
 * for a button that is normally absent, and short enough not to be noticed.
 */
async function clearScratchClass(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: `Remove ${SCRATCH_CLASS}` })
    .click({ timeout: 2_000 })
    .catch(() => {});
}

test.describe('a student reads their own week', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'student@liko.test');
  });

  test('the week is reachable from the sidebar and names its owner', async ({ page }) => {
    // Offered to a student because they hold `class:read` at scope `own`, and
    // `can()` counts an ownership scope as permitted. If this link disappears the
    // route gate moved, not the navigation.
    await page.getByRole('link', { name: 'Schedule' }).click();

    await expect(page).toHaveURL(/\/schedule$/);
    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();

    // The subject is resolved server side from `students.account_id` and named in
    // the header. A student who saw a blank grid here had no way to tell an empty
    // week from a broken one.
    await expect(page.getByText(`${DEMO_STUDENT_NAME}.`, { exact: false })).toBeVisible();
    await expect(weekList(page).getByText('Filipino').first()).toBeVisible();
  });

  /*
   * The photograph control, asserted only as far as it can honestly be asserted
   * without spending a real generation: that it is offered, that it says a human
   * checks the result before anything is written, and that it is scoped to the
   * image types the server accepts.
   *
   * What it does with a photograph is covered by `lib/schedule/extract.test.ts` and
   * `lib/schemas/schedule.test.ts`, which test the parser and the rules that stand
   * between a model's answer and a written week. Dragging a JPEG through this page
   * would prove the wiring and cost an API call per run.
   */
  test('the timetable can be photographed, and says it is checked first', async ({ page }) => {
    await page.goto('/schedule');

    await expect(
      page.getByRole('heading', { name: 'Photograph your timetable' }),
    ).toBeVisible();

    // The promise of a review step, made before the student commits to anything.
    await expect(
      page.getByText('You get to look at what I read before it changes anything.'),
    ).toBeVisible();

    const picker = page.getByLabel('Timetable photo');
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');

    await expect(page.getByRole('button', { name: 'Read my timetable' })).toBeVisible();
  });

  test('every class on the week renders with its time, teacher and room', async ({ page }) => {
    await page.goto('/schedule');

    // The whole seeded week. Asserted as a count rather than a sample because the
    // earlier bug in this area was a read that returned the right shape and the
    // wrong rows.
    await expect(weekEntries(page)).toHaveCount(SEEDED_WEEK);

    /*
     * Minutes from midnight, formatted on a 24-hour clock by `formatMinute`.
     *
     * Each time is asserted against the row that carries it rather than against
     * the page. A bare `getByText('10:00 to 11:00')` matches two rows on this
     * week, Monday's English and Friday's Values Education, so it would have
     * proved that some class runs for an hour and nothing about which. Binding the
     * clock to its class is the assertion that would catch a row rendering the
     * wrong time, which is the failure that matters.
     */
    const mondayFilipino = weekEntries(page).filter({ hasText: 'Filipino' }).first();
    await expect(mondayFilipino.getByText('Filipino')).toBeVisible();
    await expect(mondayFilipino.getByText('07:00 to 08:00')).toBeVisible();

    const fridayValues = weekEntries(page).filter({ hasText: 'Values Education' });
    await expect(fridayValues.getByText('Values Education')).toBeVisible();
    await expect(fridayValues.getByText('10:00 to 11:00')).toBeVisible();

    // The week really does teach Filipino twice, on Monday and on Thursday, and a
    // grid that collapsed the repeats would hide a duplicated class.
    await expect(weekEntries(page).filter({ hasText: 'Filipino' })).toHaveCount(2);

    /*
     * THE SEPARATOR IS A MIDDLE DOT, NOT "Â·".
     *
     * The separator was committed as the two code points U+00C2 U+00B7, which is
     * a UTF-8 middle dot that had been decoded as Latin-1 once and written back
     * out. It rendered as "Â· Dela Cruz · Room 201": a stray letter A before every
     * dot in the week. Nothing caught it because `tsc`, `eslint` and 379 unit
     * tests are all blind to an encoding fault, and no test asserted on the
     * assembled string.
     *
     * Asserting the real separator positively is what makes it observable at all;
     * the negative assertion below is what stops it coming back. Both are scoped
     * to a row, because the same teacher and room appear on both Filipino rows.
     */
    await expect(mondayFilipino.getByText('07:00 to 08:00 · Dela Cruz · Room 201')).toBeVisible();
    await expect(page.getByText('Â·')).toHaveCount(0);
  });

  test('a clash is reported rather than hidden', async ({ page }) => {
    await page.goto('/schedule');

    /*
     * The demo week carries one genuine overlap, Clinic over Technology on
     * Wednesday. The banner is a `role="status"` because a double booking is
     * information, not an error, and the product's position is that only the
     * student can know whether it is real or a misread photo.
     */
    await expect(
      page.getByText('Two classes overlap on Wednesday. Check the times before relying on them.'),
    ).toBeVisible();

    // Both sides of the clash survive. Nothing was dropped to make the warning go
    // away, which is the behaviour the banner exists to protect.
    await expect(weekList(page).getByText('Technology')).toBeVisible();
    await expect(weekList(page).getByText('Clinic')).toBeVisible();
  });

  test('the empty and the invalid states say different things', async ({ page }) => {
    await page.goto('/schedule');

    await page.getByRole('button', { name: 'Add a class on Friday' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Add a class on Friday' })).toBeVisible();

    // A nameless class is refused in the action, not by the database alone, so
    // fixture mode cannot accept what production would reject.
    await dialog.getByLabel('Class').fill('   ');
    await dialog.getByLabel('Starts').fill('09:00');
    await dialog.getByLabel('Ends').fill('10:00');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(dialog.getByText('Give the class a name.')).toBeVisible();

    // An end at or before its start is the other half of the same rule. The
    // message quotes both times back so the mistake is obvious rather than
    // merely refused.
    await dialog.getByLabel('Class').fill('Astronomy');
    await dialog.getByLabel('Starts').fill('09:00');
    await dialog.getByLabel('Ends').fill('08:00');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(
      dialog.getByText('A class has to end after it starts. 09:00 to 08:00 does not.'),
    ).toBeVisible();

    // Nothing was written by either refusal.
    await expect(weekEntries(page)).toHaveCount(SEEDED_WEEK);
  });

  test('a class can be added and taken back off again', async ({ page }) => {
    await page.goto('/schedule');
    await clearScratchClass(page);

    try {
      await page.getByRole('button', { name: 'Add a class on Friday' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Class').fill(SCRATCH_CLASS);
      await dialog.getByLabel('Starts').fill('14:00');
      await dialog.getByLabel('Ends').fill('15:00');
      await dialog.getByLabel('Room').fill('Observatory');
      await dialog.getByRole('button', { name: 'Add class' }).click();

      await expect(dialog).toHaveCount(0);
      await expect(weekList(page).getByText(SCRATCH_CLASS)).toBeVisible();
      await expect(weekList(page).getByText('14:00 to 15:00')).toBeVisible();
      await expect(weekEntries(page)).toHaveCount(SEEDED_WEEK + 1);

      /*
       * Removed through the control, and the button is named after the class it
       * removes. "Remove Astronomy" beats a row of identical trash icons both for
       * a screen reader and for this assertion, which could otherwise pass by
       * clicking the wrong row's button.
       */
      await page.getByRole('button', { name: `Remove ${SCRATCH_CLASS}` }).click();
    } finally {
      // Runs even when the block above threw, which is the whole point: a test
      // that fails midway must not leave the store altered for its successors.
      await clearScratchClass(page);
    }

    await expect(weekList(page).getByText(SCRATCH_CLASS)).toHaveCount(0);
    await expect(weekEntries(page)).toHaveCount(SEEDED_WEEK);
  });
});

test.describe('a teacher opens a week by picking a subject', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'maya@liko.test');
  });

  test('the picker is shown instead of an assumed subject', async ({ page }) => {
    await page.goto('/schedule');

    // A teacher's own week is not the point of this page, so nothing is shown
    // until a subject is chosen. Landing on somebody else's week by default would
    // be a privacy accident.
    await expect(page.getByText('Pick a student to see their week.')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Student' })).toBeVisible();
    await expect(weekList(page)).toHaveCount(0);
    // Nothing to read a photograph into, so the control is not offered at all
    // rather than offered and then unable to say what it would replace.
    await expect(
      page.getByRole('heading', { name: 'Photograph your timetable' }),
    ).toHaveCount(0);

    await chooseOption(page, page.getByRole('combobox', { name: 'Student' }), DEMO_STUDENT_ID);

    await expect(page).toHaveURL(new RegExp(`/schedule\\?student=${DEMO_STUDENT_ID}`));
    await expect(page.getByText(`${DEMO_STUDENT_NAME}.`, { exact: false })).toBeVisible();
    await expect(weekEntries(page)).toHaveCount(SEEDED_WEEK);
    await expect(weekList(page).getByText('Filipino').first()).toBeVisible();
  });

  test('an id outside the roster resolves to nobody', async ({ page }) => {
    await page.goto('/schedule?student=stu_999');

    /*
     * The subject is not read from the URL. A crafted id that is not in the
     * picker's own list falls back to the picker rather than being looked up, so
     * there is no query parameter that can name a student this teacher may not
     * open. The denial is asserted by the absence of a week, not by a message:
     * a crafted id that produced a 404-shaped page would confirm the id exists.
     */
    await expect(page.getByText('Pick a student to see their week.')).toBeVisible();
    await expect(weekEntries(page)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Student' })).toBeVisible();
  });
});

test.describe('a guardian is not told to ask a teacher', () => {
  test('the empty state is addressed to a parent', async ({ page }) => {
    await signIn(page, 'guardian@liko.test');
    await page.goto('/schedule');

    /*
     * A guardian holds `class:read` at scope `linked`, so the route admits them,
     * but there is no link from a guardian login to a child anywhere in the
     * schema: the roster stores a guardian's email and phone as plain text and
     * nothing joins those to an account. So the week cannot resolve, and the
     * screen has to say why in words that fit the reader.
     *
     * It used to say "Your teacher links you from the class roster", which asks a
     * parent to go and negotiate with their child's teacher, and it did so for a
     * teacher with an empty roster too, because the page inferred staff from the
     * length of the student list.
     */
    await expect(page.getByText('No child is linked to you yet')).toBeVisible();
    await expect(page.getByText('Ask the school to link your child')).toBeVisible();

    // The student-facing copy belongs to a student. Its absence is the assertion.
    await expect(page.getByText('You are not on a class yet')).toHaveCount(0);
    await expect(page.getByText('Your teacher links you from the class roster')).toHaveCount(0);
  });
});