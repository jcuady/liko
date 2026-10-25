import { expect, test, type Page } from '@playwright/test';

/*
  A CONTROL IS OFFERED ONLY TO A ROLE THAT CAN USE IT.

  This is the third file in the series, and the other two are the two halves of
  the same property. `verify:empty-states` reads the source and asserts that no
  page tells a reader to create a class their role cannot create. The
  `rbac.spec.ts` block asserts that the controls on the classes page are shown
  only where the action succeeds. This one covers the rest of the pages a
  linked account lands on.

  WHY THE THREE PAGES ARE THE SAME DEFECT. Each of them has a read permission
  that a student or a guardian holds at `own` or `linked`, and a separate write
  permission that the same role holds at `no`. The split is deliberate and old:
  `rbac.ts` records that "writing a behaviour note is not reading history" and
  that a student once reached a handler that appended a behaviour log against
  any student id they named.

  THE SERVER WAS FIXED AND THE INTERFACE WAS NOT. Every one of these actions
  calls `requirePermission` on the write permission, so the refusal was
  already there and total. What was left was an interface that still offered
  the control, so the refusal arrived as a toast that reads like a broken
  product rather than like a boundary.

  THE THREE PAGES AND WHAT EACH WAS OFFERING.

  - /grades offered an editable cell for every mark, a "Use for this class"
    button that decides the scale the whole class is reported on, a "New scale"
    button and a "New assessment" button.
  - /history offered a free-text field, a severity picker with "praise" and
    "concern" on it, and an "Add entry" button, on a record of a child's
    behaviour.
  - /flashcards offered a "New deck" button to a guardian, whose
    `flashcard:write` is `no`, with an empty class picker behind it because the
    list of publishable classes needs the same permission.

  THE POSITIVE CONTROL COMES FIRST IN EVERY ONE OF THEM. A count of zero for a
  locator that matches nothing is a pass that means nothing, so the role that
  CAN use each control is asserted to be offered it, on the same page, in the
  same file. A student is still offered "New deck", because a student holds
  `flashcard:write` at `own`, and hiding it from everybody would have taken
  away the one thing that page offers a student who is not waiting for a
  teacher to share a deck.
*/

const PASSWORD = 'LikoDemo!2026';

const ACCOUNTS = {
  instructor: { email: 'maya@liko.test' },
  admin: { email: 'dev@liko.test' },
  student: { email: 'student@liko.test' },
  guardian: { email: 'guardian@liko.test' },
};

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait on the navigation rather than asserting immediately: the password hash
  // is memory hard, so a sign-in is legitimately slow and the form stays in its
  // pending state while the server verifies.
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

/**
 * The editable cells of the gradebook grid.
 *
 * The grid marks the cells it wants edited with an explicit `role="gridcell"`,
 * and the cells it does not are plain table cells with no role at all, so the
 * marking is the thing under test and the two are told apart by it.
 *
 * The assertions below ask about `.first()` rather than about the whole set.
 * A count over a set that matches many elements reports back a number
 * Playwright does not render in the failure message, and a failure message
 * that does not say what was found is a failure message nobody can act on.
 * `.first()` matches at most one element, so the answer is always 0 or 1 and
 * the message always says which. The teacher's positive control is on the
 * same locator and is what proves the engine resolves the explicit role: if it
 * ever stopped, that control would fail rather than quietly make the
 * negative assertion vacuous.
 */
function editableCells(page: Page) {
  return page.getByRole('gridcell');
}

/*
  WHY THE FORBIDDEN-CONTROL ASSERTIONS ARE SOFT, AND WHY THEY CARRY THEIR OWN
  TIMEOUT.
  A hard assertion stops the test at the first failure, so one mutation run
  would only ever prove the first control on the list and the rest would stay
  unexercised. A soft assertion records the failure and carries on, so a
  single run against a reverted gate reports every forbidden control at once,
  and the test still fails at the end of it. The point of these assertions is
  to enumerate, and an enumeration that stops at the first entry is not one.

  The timeout is the other half of that, and it was found by running it. Each
  of these assertions waits for a count of zero, so a control that is
  present makes it wait out the full timeout before it gives up. At the
  default twenty seconds, three of them in one test outlived the test's own
  forty-five second limit: the test was killed mid-way, the last assertion on
  the list was never evaluated, and it reported a failure with no count in it
  rather than the count it had. The page snapshot behind that failure showed
  the student looking at thirty-two editable cells, so the defect was there
  and the instrument simply stopped before it could say so.

  Four seconds is long enough for a page that has already finished loading
  and short enough that four assertions fit inside the test's limit. The
  green run is what says the number is enough: these assertions pass in
  milliseconds when the gate is in place, and a page that is still loading
  fails the test for a different and louder reason.
*/
test.describe('the gradebook offers its writing controls only to a role that can write', () => {
  for (const role of ['student', 'guardian'] as const) {
    test(`${role} is offered no mark to write and no scale to change`, async ({ page }) => {
      await signIn(page, ACCOUNTS[role].email);
      await page.goto('/grades');
      await expect(page.locator('#workspace-main')).toBeVisible();

      await expect.soft(
        page.getByRole('button', { name: 'Use for this class' }),
        `${role} holds grade:write at no, so the scale of the class is not theirs to change`,
      ).toHaveCount(0, { timeout: 4000 });
      await expect.soft(
        page.getByRole('button', { name: 'New scale' }),
        `${role} holds grade:write at no, so no new scale can be created`,
      ).toHaveCount(0, { timeout: 4000 });
      await expect.soft(
        page.getByRole('button', { name: 'New assessment' }),
        `${role} holds assess:write at no, so no new assessment can be created`,
      ).toHaveCount(0, { timeout: 4000 });
      await expect.soft(
        editableCells(page).first(),
        `${role} holds grade:write at no, so no mark on the grid may be edited`,
      ).toHaveCount(0, { timeout: 4000 });
    });
  }

  test('a teacher is still offered the whole gradebook', async ({ page }) => {
    await signIn(page, ACCOUNTS.instructor.email);
    await page.goto('/grades');
    await expect(page.locator('#workspace-main')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Use for this class' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New scale' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New assessment' })).toBeVisible();
    await expect(
      editableCells(page).first(),
      'a teacher must be offered editable marks, or the two assertions above prove nothing',
    ).toHaveCount(1);
  });
});

test.describe('the history page offers the entry form only to a role that can write', () => {
  for (const role of ['student', 'guardian'] as const) {
    test(`${role} is offered no form to write on a child's record`, async ({ page }) => {
      await signIn(page, ACCOUNTS[role].email);
      await page.goto('/history');
      await expect(page.locator('#workspace-main')).toBeVisible();

      await expect.soft(
        page.getByRole('button', { name: 'Add entry' }),
        `${role} holds history:write at no, so no behaviour note can be written`,
      ).toHaveCount(0, { timeout: 4000 });
      await expect.soft(
        page.getByRole('heading', { name: 'Add an entry' }),
        `${role} holds history:write at no, so the form itself is not offered`,
      ).toHaveCount(0, { timeout: 4000 });
    });
  }

  test('a teacher is still offered the entry form', async ({ page }) => {
    await signIn(page, ACCOUNTS.instructor.email);
    await page.goto('/history');
    await expect(page.locator('#workspace-main')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Add entry' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add an entry' })).toBeVisible();
  });
});

test.describe('the flashcards page offers a new deck only to a role that can write one', () => {
  test('a guardian is offered no new deck', async ({ page }) => {
    await signIn(page, ACCOUNTS.guardian.email);
    await page.goto('/flashcards');
    await expect(page.locator('#workspace-main')).toBeVisible();

    await expect(
      page.getByRole('button', { name: 'New deck' }),
      'a guardian holds flashcard:write at no, so no deck can be created',
    ).toHaveCount(0, { timeout: 4000 });
  });

  test('a student is still offered a new deck, which they own', async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email);
    await page.goto('/flashcards');
    await expect(page.locator('#workspace-main')).toBeVisible();

    await expect(page.getByRole('button', { name: 'New deck' })).toBeVisible();
  });

  test('a teacher is still offered a new deck', async ({ page }) => {
    await signIn(page, ACCOUNTS.instructor.email);
    await page.goto('/flashcards');
    await expect(page.locator('#workspace-main')).toBeVisible();

    await expect(page.getByRole('button', { name: 'New deck' })).toBeVisible();
  });
});

/*
  THE DECK PAGE, WHICH DECIDES BY TWO THINGS AT ONCE.

  The deck page offers a card form and a review session, and they are gated by
  different grants. The card form needs the ownership of the deck AND the
  permission to write a deck; the review session needs the permission to review
  and a deck with something in it.

  This block exists because the page was changed to ask the matrix for its
  grants rather than to infer them from ownership, and a change that narrows a
  control can also hide one that was correct. So both halves are asserted, and
  the positive control comes first: a student is still offered the card form on
  the deck they own, and is still offered the review session on the deck their
  teacher shared.
*/
test.describe('the deck page offers its controls to the account the grants allow', () => {
  test('a student is offered the card form on the deck they own', async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email);
    await page.goto('/flashcards/deck_fc_own_revision');
    await expect(page.locator('#workspace-main')).toBeVisible();

    await expect(
      page.getByRole('button', { name: 'Add card' }),
      'the student owns this deck and holds flashcard:write at own, so the form is theirs',
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Review session' }),
      'a student holds flashcard:review at own, so the session is theirs',
    ).toBeVisible();
  });

  test('a student is offered no card form on the deck their teacher shared', async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email);
    await page.goto('/flashcards/deck_fc_chem_terms');
    await expect(page.locator('#workspace-main')).toBeVisible();

    await expect.soft(
      page.getByRole('button', { name: 'Add card' }),
      'the student holds flashcard:write at own but does not own this deck, so no card is theirs to add',
    ).toHaveCount(0, { timeout: 4000 });
    await expect(
      page.getByRole('region', { name: 'Review session' }),
      'the deck is shared into their class, so the session is still theirs to take',
    ).toBeVisible();
  });
});
