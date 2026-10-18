import { expect, test, type Page } from '@playwright/test';

import { chooseOption } from './helpers/select';

/**
 * Flashcards, driven by the two people who actually use them.
 *
 * WHY THIS FILE EXISTS. The feature shipped with fifty-odd unit tests and no
 * browser test at all. Every gate was green while nothing had ever opened the
 * deck list, picked the four answers, or checked that a student and a teacher
 * see different things on the same URL. That is the same gap `/history` came
 * through, and the reason this file exists rather than a longer unit suite.
 *
 * The interesting claim about this feature is not that a deck can be made. It
 * is that ONE deck is legible to two roles at once: the teacher authors it, the
 * student studies it, and neither can do the other's half. Those are different
 * sessions with different sessions in the browser, so the test that proves it
 * drives two contexts rather than signing out and back in.
 *
 * Fixture mode keeps its store in server memory for the life of the process, so
 * these tests create their own decks rather than relying on one being seeded,
 * and they name what they created instead of counting decks.
 */

const PASSWORD = 'LikoDemo!2026';

const CLASS_NAME = 'Chemistry, Period 2';

async function signIn(context: BrowserContextLike, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Sign-in is memory hard by design, so the form stays pending while the
  // server verifies. Wait on the navigation rather than asserting immediately.
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
  await expect(page.locator('#workspace-main')).toBeVisible();
  return page;
}

// Imported structurally so the helper above reads as one argument.
type BrowserContextLike = { newPage: () => Promise<Page> };

test.describe('a teacher authoring a deck', () => {
  test.beforeEach(async ({ page }) => {
    await signIn({ newPage: () => page as unknown as Promise<Page> }, 'maya@liko.test');
    await page.goto('/flashcards');
    await expect(page.locator('#workspace-main')).toBeVisible();
  });

  test('a new deck opens straight onto its own page', async ({ page }) => {
    const title = `Catalysis ${Date.now().toString().slice(-5)}`;

    await page.getByRole('button', { name: 'New deck' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Create deck' }).click();

    // It routes to the deck rather than staying on the list, so the next action
    // is always the one the person came here to take.
    await page.waitForURL(/\/flashcards\/.+/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });

  test('a deck created with no class is not shared with anyone', async ({ page }) => {
    const title = `Private ${Date.now().toString().slice(-5)}`;

    await page.getByRole('button', { name: 'New deck' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Create deck' }).click();
    await page.waitForURL(/\/flashcards\/.+/, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    // The author owns it, which is the reason the page does not offer a session.
    await expect(page.getByText('Only students can review a deck.')).toBeVisible();
  });

  test('a card cannot be saved with no answer to reveal', async ({ page }) => {
    const title = `Half a card ${Date.now().toString().slice(-5)}`;
    await page.getByRole('button', { name: 'New deck' }).click();
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Create deck' }).click();
    await page.waitForURL(/\/flashcards\/.+/, { timeout: 15_000 });

    const add = page.getByRole('button', { name: 'Add card' });
    await expect(add).toBeDisabled();

    await page.getByLabel('Front').fill('What is a catalyst?');
    // A card with a front and no back is the one artefact a review session
    // cannot repair: it reveals nothing and the student has to guess.
    await expect(add).toBeDisabled();

    await page.getByLabel('Back').fill('It changes the rate without being used up.');
    await expect(add).toBeEnabled();
    await add.click();

    await expect(page.getByText('What is a catalyst?')).toBeVisible();
  });

  test('a teacher is offered the deck but not the review session', async ({ page }) => {
    const title = `Not reviewable ${Date.now().toString().slice(-5)}`;
    await page.getByRole('button', { name: 'New deck' }).click();
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Create deck' }).click();
    await page.waitForURL(/\/flashcards\/.+/, { timeout: 15_000 });

    // The page says why, rather than hiding the whole half of the feature. A
    // teacher owns no roster row, so every review save would be refused, and a
    // session with no way to answer is worse than an explained absence.
    await expect(page.getByText('Only students can review a deck.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show answer' })).toHaveCount(0);
  });
});

test.describe('a teacher and a student on one deck', () => {
  test('the same deck is editable for one and studyable for the other', async ({
    browser,
  }) => {
    const teacherContext = await browser.newContext();
    const teacher = await signIn(teacherContext, 'maya@liko.test');
    const title = `Shared ${Date.now().toString().slice(-5)}`;

    await teacher.goto('/flashcards');
    await teacher.getByRole('button', { name: 'New deck' }).click();
    await teacher.getByLabel('Title').fill(title);
    await teacher.getByLabel('Subject').fill('Chemistry');

    const share = teacher.getByLabel('Share with');
    await chooseOption(teacher, share, await classValue(teacher, share));
    await teacher.getByRole('button', { name: 'Create deck' }).click();
    await teacher.waitForURL(/\/flashcards\/.+/, { timeout: 15_000 });
    const deckUrl = teacher.url();

    await teacher.getByLabel('Front').fill('Define a catalyst.');
    await teacher.getByLabel('Back').fill('A substance that speeds a reaction and is unchanged.');
    await teacher.getByRole('button', { name: 'Add card' }).click();
    await expect(teacher.getByText('Define a catalyst.')).toBeVisible();

    // The student's half of the same object.
    const studentContext = await browser.newContext();
    const student = await signIn(studentContext, 'student@liko.test');
    await student.goto(deckUrl);

    // Shared, and therefore not the student's to edit. The deck says so in its
    // description rather than in the meta row: a student CAN review, so the
    // meta row is spent on what is due and the ownership of the deck is the
    // header's job.
    await expect(student.getByText('Shared into your class by your teacher.')).toBeVisible();
    await expect(student.getByRole('heading', { name: 'Add a card' })).toHaveCount(0);
    await expect(student.getByText('1 to review')).toBeVisible();

    // And the half that is theirs: a real card, revealed and answered.
    await expect(student.getByRole('button', { name: 'Show answer' })).toBeVisible();
    await student.getByRole('button', { name: 'Show answer' }).click();
    // Scoped to the session, because the answer is on the page twice: once
    // revealed here and once in the deck's own card list underneath. An
    // unscoped match would resolve to both and fail in strict mode, and
    // narrowing it by index would keep passing if the session stopped rendering.
    const session = student.getByRole('region', { name: 'Review session' });
    await expect(
      session.getByText('A substance that speeds a reaction and is unchanged.'),
    ).toBeVisible();

    // Each button states the interval it will actually schedule, computed from
    // the same scheduler the server writes with.
    //
    // THIS ASSERTED "10m" AND THAT WAS THE BUG IT WAS ENCODING. The old ladder
    // put a first sighting on the same rung for hard, good and easy, so all
    // three buttons read "10m" and a student choosing between them was choosing
    // at random. The ladder now separates them (again 1m, hard 10m, good 1d,
    // easy 3d) and this line was left behind still asking for 10m, which made a
    // working page fail.
    //
    // A test that pins behaviour the product deliberately moved off from is a
    // specification of the old defect. It is worth noticing that this one is
    // also the only assertion here that could tell the two rungs apart, so the
    // fix asserts the GOOD rung specifically rather than loosening it.
    const good = student.getByRole('button', { name: /Good/ });
    await expect(good).toContainText('1d');
    await good.click();

    await expect(student.getByText(/You reviewed 1 card/)).toBeVisible();

    // And it is remembered: the deck is caught up on the next visit.
    await student.goto('/flashcards');
    await expect(student.getByRole('link', { name: new RegExp(title) })).toContainText(
      'All caught up',
    );

    await teacherContext.close();
    await studentContext.close();
  });
});

/** The stored id of the demo class the student sits in. */
async function classValue(page: Page, share: ReturnType<Page['getByLabel']>): Promise<string> {
  const content = page.locator('[data-slot="select-content"]');
  await share.click();
  await expect(content).toBeVisible();
  const item = content.locator('[data-slot="select-item"]', { hasText: CLASS_NAME }).first();
  await expect(item).toBeVisible();
  const value = (await item.getAttribute('data-value')) ?? '';
  await page.keyboard.press('Escape');
  await expect(content).toHaveCount(0);
  return value;
}