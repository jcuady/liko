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
 *
 * AND SCOPED TO THE DAY SECTIONS, WHICH IS THE PART THAT MATTERED.
 *
 * `main ul` is not only the week. The same page also renders the deadlines
 * beside it, the terms, and the photograph-import control, and each of those is
 * a `ul` of `li` under `main` that appears and disappears with the page's own
 * state. So the locator was counting a timetable AND whatever else the page
 * happened to be showing, and the total was right only when the page happened
 * to be showing nothing else.
 *
 * The difference is not cosmetic. The deadlines list and the terms list render
 * only when there are deadlines and terms, so the same count was fifteen in a
 * quiet moment and sixteen in a busy one. Two tests in this file create a
 * deadline and a term, and they ran concurrently with the tests that count the
 * week, so the count moved underneath the assertion.
 *
 * The week is the one thing on this page that is a `section` per day with the
 * weekday as its heading, so that is what it is scoped to.
 */
const WEEKDAY_HEADING = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;

function weekList(page: Page) {
  return page
    .locator('main section')
    .filter({ has: page.locator('h2', { hasText: WEEKDAY_HEADING }) })
    .locator('ul');
}

function weekEntries(page: Page) {
  return weekList(page).locator('li');
}

/**
 * The SEEDED entries, with every class this file creates left out.
 *
 * THIS EXISTS BECAUSE TWO TESTS IN THIS FILE SHARE ONE WEEK AND RUN AT THE
 * SAME TIME.
 *
 * `a class can be added and taken back off again` adds a class to this
 * student's own week. `a class a teacher saves reaches the student` adds a
 * different one to the same week from the teacher's side. They are in
 * different `describe` blocks, so `fullyParallel` runs them in parallel
 * workers against the one shared fixture store, and the tests that count the
 * week saw sixteen entries where they expected fifteen. It passed in two runs
 * and failed in the third, which is what a race looks like.
 *
 * The alternatives were both worse. Serialising the tests would need the
 * count readers and the mutators in the same `describe`, and they sign in as
 * different people, so it would mean moving tests between blocks and giving
 * up the file's own structure. Asserting "fifteen or sixteen" would let a
 * genuinely short week pass.
 *
 * Counting only the seeded entries is the honest version of what was being
 * asserted. `SEEDED_WEEK` is the SEEDED week: the property under test is
 * that every seeded class renders, and neither of the classes this file
 * creates is part of the seed. Both names appear nowhere in the seed or the
 * fixture store except in this file, so excluding them excludes exactly the
 * entries that are allowed to be present or absent at any moment.
 *
 * The mutating test keeps a count that includes its own class, because it is
 * deliberately looking at the total including the class it just added.
 */
function withoutScratchClasses(page: Page, names: string[]) {
  let locator = weekEntries(page);
  for (const name of names) {
    locator = locator.filter({ hasNotText: name });
  }
  return locator;
}

function seededWeekEntries(page: Page) {
  return withoutScratchClasses(page, SCRATCH_CLASSES);
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
 * The other class this file creates, in the teacher-saves-a-class test.
 *
 * It lives at file scope because the week it lands on is the SAME week the
 * scratch class lands on, and the two are created by tests that run in
 * parallel. Anything that counts that week has to know about both.
 */
const BELL_CLASS = 'Bell journey';

/**
 * Every class this file creates.
 *
 * A NEW ONE GOES HERE. The week is shared state and two of these tests write
 * to it concurrently, so a class that is missing from this list makes every
 * count of the seeded week wrong whenever the other test happens to be
 * running.
 */
const SCRATCH_CLASSES = [SCRATCH_CLASS, BELL_CLASS];

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
    //
    // SCOPED TO THE SIDEBAR, BECAUSE THE NAME MATCHES TWO ELEMENTS. The app
    // renders a sidebar link and a mobile tab-bar link to `/schedule`, and a bare
    // `getByRole('link', { name: 'Schedule' })` is not an exact match: it resolved
    // to both at once and threw a strict-mode violation, intermittently and only
    // in full-suite runs, because both are briefly present together while a slow
    // re-render is in flight. A locator that can match two elements is a latent
    // failure even on the runs where it happens to pass, so the sidebar is named
    // rather than assumed.
    await page
      .getByRole('navigation', { name: 'Workspace' })
      .getByRole('link', { name: 'Schedule' })
      .click();

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
    await expect(seededWeekEntries(page)).toHaveCount(SEEDED_WEEK);

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
    await expect(seededWeekEntries(page)).toHaveCount(SEEDED_WEEK);
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
      // The seeded week plus the class this test just added, and NOT plus the
      // other class this file creates: that one belongs to a test running in
      // parallel against the same week, and it is allowed to be there.
      await expect(withoutScratchClasses(page, [BELL_CLASS])).toHaveCount(
        SEEDED_WEEK + 1,
      );

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
    await expect(seededWeekEntries(page)).toHaveCount(SEEDED_WEEK);
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
    await expect(seededWeekEntries(page)).toHaveCount(SEEDED_WEEK);
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

/*
 * SERIAL, AND BECAUSE THESE FOUR TESTS SHARE ONE DEADLINE.
 *
 * Playwright runs `fullyParallel`, so without this they execute in parallel
 * workers against the same fixture store, and every one of them creates and then
 * deletes the same "Portfolio due" deadline. They passed 13 of 13 in isolation
 * and failed in the full suite, which is the same defect as the two slide specs
 * sharing one seeded deck, written by me two hours after fixing that one.
 */
test.describe('deadlines and dates', () => {
  // Inside the describe, deliberately. At file scope this serialised all thirteen
  // tests in this file, which is four times the protection two of them needed, and
  // it made the note above untrue.
  test.describe.configure({ mode: 'serial' });

  const SCRATCH_DEADLINE = 'Portfolio due';

  /**
   * Remove the scratch deadline if it survived an earlier run.
   *
   * The fixture store lives on the dev server's `globalThis` and outlives every
   * test, so a run that died before its cleanup would leave this deadline on the
   * calendar and every count below would be wrong for reasons that have nothing to
   * do with the product. Same reasoning as `clearScratchClass` above.
   */
  async function clearScratchDeadline(page: Page): Promise<void> {
    await page
      .getByRole('button', { name: `Remove ${SCRATCH_DEADLINE}` })
      .click({ timeout: 2_000 })
      .catch(() => {});
  }

  test.beforeEach(async ({ page }) => {
    await signIn(page, 'student@liko.test');
    await page.goto('/schedule');
    await clearScratchDeadline(page);
  });

  test('the calendar beside the week says so when it is empty', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Deadlines and dates' })).toBeVisible();
    await expect(page.getByText('Nothing due in the next few months.')).toBeVisible();
  });

  test('a deadline a student adds lands on their own calendar', async ({ page }) => {
    /*
     * The whole reason this panel exists for the student role. A student holds
     * `class:read` at scope `own`, and their own roster row is reached through
     * `students.account_id`, so "their own calendar" is the roster row while
     * "them" is the account. The guard on the write compares the two, and getting
     * that comparison wrong refuses every deadline the primary persona of this
     * page tries to add.
     */
    await page.getByRole('button', { name: 'Add a deadline' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('What is it').fill(SCRATCH_DEADLINE);
    await dialog.getByLabel('Date').fill('2026-11-14');
    await dialog.getByRole('button', { name: 'Add it' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(SCRATCH_DEADLINE)).toBeVisible();

    // Scoped to the row rather than matched exactly. The date and the kind share
    // one paragraph, so the paragraph's text is "Sat, 14 Nov, 11:59 pm · Deadline"
    // and an exact match on "Deadline" can never hit it however correct the
    // component is.
    const row = page.locator('main ul li').filter({ hasText: SCRATCH_DEADLINE });
    await expect(row.getByText('Deadline')).toBeVisible();
  });

  test('a deadline with no name is refused, and nothing is written', async ({ page }) => {
    await page.getByRole('button', { name: 'Add a deadline' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('What is it').fill('   ');
    await dialog.getByLabel('Date').fill('2026-11-14');
    await dialog.getByRole('button', { name: 'Add it' }).click();

    await expect(dialog.getByText('Give it a title.')).toBeVisible();
    await expect(page.getByText('Nothing due in the next few months.')).toBeVisible();
  });

  test('a deadline can be taken off again', async ({ page }) => {
    await page.getByRole('button', { name: 'Add a deadline' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('What is it').fill(SCRATCH_DEADLINE);
    await dialog.getByLabel('Date').fill('2026-11-14');
    await dialog.getByRole('button', { name: 'Add it' }).click();
    await expect(page.getByText(SCRATCH_DEADLINE)).toBeVisible();

    await page.getByRole('button', { name: `Remove ${SCRATCH_DEADLINE}` }).click();

    await expect(page.getByText(SCRATCH_DEADLINE)).toHaveCount(0);
    await expect(page.getByText('Nothing due in the next few months.')).toBeVisible();
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

/*
 * ACADEMIC TERMS. A TEACHER SETS ONE UP, A STUDENT CANNOT.
 *
 * These share one term record in the server's fixture store, so they are
 * serialised for the same reason the deadlines above are: several tests creating
 * and deleting the same row under `fullyParallel` is a race that has nothing to
 * do with the product.
 */
test.describe('academic terms', () => {
  test.describe.configure({ mode: 'serial' });

  const SCRATCH_TERM = 'Autumn term';

  /**
   * Take the scratch term away if an earlier run died before its cleanup.
   *
   * The store outlives the test that dirtied it, so a term left behind makes
   * every assertion here read the wrong state.
   */
  async function clearScratchTerm(page: Page): Promise<void> {
    await page
      .getByRole('button', { name: `Remove ${SCRATCH_TERM}` })
      .click({ timeout: 2_000 })
      .catch(() => {});
  }

  test.beforeEach(async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await page.goto('/schedule');
    await clearScratchTerm(page);
  });

  test('a teacher sets up a term and the calendar states it', async ({ page }) => {
    await page.getByRole('button', { name: /Set up a term|Add another term/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Name').fill(SCRATCH_TERM);
    await page.getByLabel('Starts').fill('2026-08-03');
    await page.getByLabel('Ends').fill('2026-12-18');
    await page.getByRole('button', { name: 'Save the term' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);

    /*
     * The dates are read back, not merely written, so a save that stored
     * nothing and one that stored the wrong range are told apart.
     *
     * Asserted as the YEAR rather than as "3 Aug to 18 Dec": `toLocaleDateString`
     * with no fixed locale renders this as "Aug 3" on en-US and "3 Aug" on
     * en-GB, so an assertion naming the order fails on half the machines. The
     * year is the part that must be there, because a term routinely crosses a
     * calendar year and "Aug 3 to Jan 18" does not say which years.
     */
    const termLine = page.locator('p').filter({ hasText: SCRATCH_TERM });
    await expect(termLine).toContainText('2026');
    await expect(page.getByRole('button', { name: `Remove ${SCRATCH_TERM}` })).toBeVisible();
  });

  test('a term that ends before it starts is refused, with a reason', async ({ page }) => {
    await page.getByRole('button', { name: /Set up a term|Add another term/ }).click();
    await page.getByLabel('Name').fill('Backwards');
    await page.getByLabel('Starts').fill('2026-12-18');
    await page.getByLabel('Ends').fill('2026-08-03');
    await page.getByRole('button', { name: 'Save the term' }).click();

    // The refusal names the problem. A generic "invalid" here would leave a
    // teacher guessing which of the two date boxes to change.
    await expect(page.getByText(/has to end after it starts/)).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Backwards')).toHaveCount(0);
  });

  test('the term can be taken away again', async ({ page }) => {
    await page.getByRole('button', { name: /Set up a term|Add another term/ }).click();
    await page.getByLabel('Name').fill(SCRATCH_TERM);
    await page.getByLabel('Starts').fill('2026-08-03');
    await page.getByLabel('Ends').fill('2026-12-18');
    await page.getByRole('button', { name: 'Save the term' }).click();
    await expect(page.getByText(SCRATCH_TERM)).toBeVisible();

    await page.getByRole('button', { name: `Remove ${SCRATCH_TERM}` }).click();
    await expect(page.getByText(SCRATCH_TERM)).toHaveCount(0);
  });
});

/*
 * The refusal half of the same feature, in a describe of its own for one
 * reason: a test that signs in as somebody while already signed in as somebody
 * else does not test the second role at all. `/login` will not render for an
 * authenticated session, so the second sign-in hangs on its navigation and the
 * test fails having proved nothing at all.
 */
test.describe('a student reads the term without being able to set it', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'student@liko.test');
    await page.goto('/schedule');
  });

  test('is offered no term form and no delete', async ({ page }) => {
    // Terms are gated on `class:write`, not `class:read`. A term belongs to the
    // school, and a student holding `class:read` at `own` must not be able to
    // redefine the school calendar.
    await expect(
      page.getByRole('button', { name: /Set up a term|Add another term/ }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove .+ term$/ })).toHaveCount(0);
  });
});

/*
 * THE WHOLE JOURNEY, IN ONE TEST, AND THAT IS THE POINT.
 *
 * A teacher saves a class, the student is told, reads the note, and it comes off
 * their count. Each of those is small; the thing worth proving is that they join
 * up, because the seam between them is exactly where the `demo-owner` defect was
 * hiding: `saveScheduleEntry` resolves the recipient through `getStudent`, a
 * null is a silent no-op, and the class still saves either way.
 *
 * It lives here rather than in `notifications.spec.ts` because creating a note
 * means writing to the demo student's week, and this is the file that owns that
 * week and counts it. One test, one write, removed in a `finally`.
 */
test.describe('a class a teacher saves reaches the student', () => {
  async function clearBellClass(page: Page): Promise<void> {
    await page
      .getByRole('button', { name: `Remove ${BELL_CLASS}` })
      .click({ timeout: 2_000 })
      .catch(() => {});
  }

  test('is told about it, reads it, and it comes off the count', async ({ page, browser }) => {
    await signIn(page, 'maya@liko.test');
    await page.goto(`/schedule?student=${DEMO_STUDENT_ID}`);
    await expect(page.locator('#workspace-main')).toBeVisible();
    await clearBellClass(page);

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await signIn(student, 'student@liko.test');

    try {
      await page.getByRole('button', { name: 'Add a class on Friday' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Class').fill(BELL_CLASS);
      await dialog.getByLabel('Starts').fill('16:00');
      await dialog.getByLabel('Ends').fill('17:00');
      await dialog.getByRole('button', { name: 'Add class' }).click();
      await expect(dialog).toHaveCount(0);

      // Unread, because nothing has read it yet and the row says so.
      await student.getByRole('button', { name: /^Notifications(, \d+ unread)?$/ }).click();
      const menu = student.getByRole('menu', { name: 'Notifications' });
      await expect(menu).toBeVisible();

      /*
       * THE NEWEST ROW, NOT "THE ROW".
       *
       * A locator that matches more than one element is a strict-mode
       * violation, and this one matched eight: the fixture store outlives the
       * test, so every earlier run of this file left its own "Bell journey
       * was added" note behind, and the bell opens newest first. `.first()`
       * takes the newest, which is the one this run created, and that is the
       * one the assertion is about. It is also what makes the test repeatable
       * against a server that has already run it.
       */
      const row = student
        .getByRole('menuitem', { name: new RegExp(`${BELL_CLASS} was added`) })
        .first();
      await expect(row, 'saving a class produced no note').toBeVisible();
      await expect(row).toContainText('Unread.');

      // Reading it takes it to the thing it is about, which is the reason the
      // url column on the row exists at all.
      await row.click();
      await student.waitForURL(/\/schedule/, { timeout: 30_000 });
      await expect(student.locator('#workspace-main')).toBeVisible();

      // Re-read off the server rather than trusting the optimistic update: a
      // badge that only moved in the browser is not a badge that was written.
      await student.reload();
      await student.getByRole('button', { name: /^Notifications(, \d+ unread)?$/ }).click();
      const reopened = student.getByRole('menu', { name: 'Notifications' });
      await expect(reopened).toBeVisible();

      const after = student
        .getByRole('menuitem', { name: new RegExp(`${BELL_CLASS} was added`) })
        .first();
      await expect(after).toBeVisible();
      await expect(after).not.toContainText('Unread.');
    } finally {
      await clearBellClass(page);
      await studentContext.close();
    }
  });
});