import { expect, test, type Page } from '@playwright/test';

/**
 * Sitting a quiz online, end to end.
 *
 * The unit tests hold the scoring and the e2e sheet proof holds the print
 * layout. Neither of those touches the half this file is about: that a student
 * can reach their quiz, answer it, submit it, and that the mark lands in the
 * teacher's gradebook without ever appearing on the student's own screen.
 *
 * The security assertions here are the point. A quiz runner is a page that
 * renders the questions of an assessment whose answer key is in the database
 * next door, and the only thing standing between a student and every answer in
 * the class is which columns the server happened to select.
 */

const KEY = [
  ['B'],
  ['B'],
  ['A', 'C'],
  ['B'],
  ['A', 'B'],
  ['B'],
  ['B'],
  ['A', 'B', 'D'],
];

const POINTS = [1, 1, 2, 1, 2, 1, 1, 2];
const TOTAL = POINTS.reduce((a, b) => a + b, 0);

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  const consent = page.getByRole('button', { name: /Follow my system|Keep my choice/i }).first();
  if (await consent.count()) await consent.click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('LikoDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes|quiz)/, { timeout: 30_000 });
}

/**
 * Opens the Bonding Quiz card specifically.
 *
 * Not `.first()`. The demo class also holds "Unit 3 Quiz: Bonding", and the list
 * is ordered by due date, so the first card is whichever one is due first and
 * that changes as soon as another spec touches an assessment. Picking by
 * position is how a test ends up asserting against a one-question quiz and
 * failing on a missing "Next question" rather than saying which quiz it meant.
 */
async function openBondingQuiz(page: Page) {
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Bonding Quiz', exact: true }) });

  await expect(card).toBeVisible();
  await card.getByRole('button').click();
  await page.waitForURL(/\/quiz\/[A-Za-z0-9_-]+/, { timeout: 30_000 });
  await expect(page.getByText('Question 1 of 8')).toBeVisible();
}

test.describe('sitting a quiz online', () => {
  test('the answer key never reaches the student device', async ({ page }) => {
    await signIn(page, 'student@liko.test');
    await page.goto('/quiz');

    await openBondingQuiz(page);

    /*
     * Server Components serialise their props into the flight payload embedded in
     * the HTML, so a field that reached the page at all would be readable here
     * even though no component renders it. Checking the markup rather than the
     * visible text is what makes this an assertion about the payload.
     */
    const html = await page.content();
    expect(html, 'no answer key in the payload').not.toContain('answerKey');
    expect(html, 'no correct flags in the payload').not.toContain('correct');
  });

  test('a student answers, submits and is told nothing but that it went through', async ({ page }) => {
    await signIn(page, 'student@liko.test');
    await page.goto('/quiz');

    await openBondingQuiz(page);

    // Answer every question correctly, so the mark that lands is the full
    // score. Nothing is asserted about that number on this screen, which is the
    // whole point: it is the teacher's to see.
    for (const [index, keys] of KEY.entries()) {
      if (index > 0) await page.getByRole('button', { name: 'Next question' }).click();
      await expect(page.getByText(`Question ${index + 1} of 8`)).toBeVisible();

      for (const key of keys) {
        await page.locator(`input[value="${key}"]`).check();
      }
    }

    await page.getByRole('button', { name: 'Review and submit' }).click();
    await expect(page.getByText('8 of 8 answered')).toBeVisible();

    await page.getByRole('button', { name: 'Submit quiz' }).click();
    await expect(page.getByRole('heading', { name: 'Submitted' })).toBeVisible();

    // Not the score, not the percentage, not the word "correct". A student is
    // told the attempt went through and is sent back to their own list.
    const done = await page.locator('main').innerText();
    expect(done).not.toContain(String(TOTAL));
    expect(done.toLowerCase()).not.toContain('correct');
    expect(done.toLowerCase()).not.toContain('score');
  });

  test('a teacher cannot open the student quiz route', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await page.goto('/quiz');
    await expect(page.getByText('You do not have access to this area')).toBeVisible();
  });

  test('the mark lands in the teacher gradebook', async ({ page }) => {
    await signIn(page, 'student@liko.test');
    await page.goto('/quiz');

    await openBondingQuiz(page);

    // Leave it blank rather than answering: a blank sheet still produces a mark,
    // and a mark of zero that was actually recorded is easier to be certain
    // about than a perfect one that could have come from a stale row. The review
    // button is only offered on the last question, so walk to the end first.
    for (let step = 1; step < 8; step += 1) {
      await page.getByRole('button', { name: 'Next question' }).click();
    }
    await page.getByRole('button', { name: 'Review and submit' }).click();
    await expect(page.getByText('0 of 8 answered')).toBeVisible();
    await page.getByRole('button', { name: 'Submit quiz' }).click();
    await expect(page.getByRole('heading', { name: 'Submitted' })).toBeVisible();

    // Sign out before the teacher signs in. A signed-in account that opens
    // /login is sent straight to its own landing page, so filling a form that is
    // not there fails on a locator rather than saying what actually went wrong.
    await page.request.post('/api/auth/sign-out');
    await page.goto('/login');

    await signIn(page, 'maya@liko.test');
    await page.goto('/grades');

    const grid = page.locator('#workspace-main');
    await expect(grid).toContainText('Ana Ferreira');
    await expect(grid).toContainText('Bonding Quiz');
  });
});