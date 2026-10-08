import { expect, test, type Page } from '@playwright/test';

/**
 * The slide editor.
 *
 * Walks the module the way a teacher building a lesson does, and asserts the
 * parts that are easy to get wrong and invisible until they bite: that a new
 * deck opens with something in it, that an edit survives a reload, that reordering
 * puts a slide where it was asked to go, and that the keyboard drives present
 * mode because that is how it is actually used, standing up.
 */

const PASSWORD = 'LikoDemo!2026';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('maya@liko.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

test.describe('decks', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/slides');
    await expect(page.getByRole('heading', { name: 'Slides' })).toBeVisible();
  });

  test('the demo workspace ships with a real deck, not an empty screen', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Reaction rates' })).toBeVisible();
    await expect(page.getByText('5 slides').first()).toBeVisible();
  });

  test('a new deck opens straight into its editor with a slide in it', async ({ page }) => {
    await page.getByRole('button', { name: 'New deck' }).click();
    await page.getByLabel('Title').fill('Titration walkthrough');
    await page.getByRole('button', { name: 'Create deck' }).click();

    // Landing in the editor rather than back on the list is the difference
    // between "created" and "ready to use".
    await expect(page).toHaveURL(/\/slides\/deck_/);
    // Level 1 specifically: the deck title is an h1 and the title slide's
    // canvas repeats it as an h2, so an unlevelled lookup matches both.
    await expect(page.getByRole('heading', { level: 1, name: 'Titration walkthrough' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Slides' })).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Titration walkthrough');
  });

  test('a deck with no title is refused', async ({ page }) => {
    await page.getByRole('button', { name: 'New deck' }).click();
    await page.getByRole('button', { name: 'Create deck' }).click();

    await expect(page.getByText('Give the deck a title.')).toBeVisible();
  });
});

test.describe('editing a slide', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/slides');
    await page.getByRole('link', { name: 'Reaction rates' }).click();
    await expect(page.getByRole('heading', { name: 'Slides' })).toBeVisible();
  });

  test('an edit survives a reload', async ({ page }) => {
    await page.getByRole('button', { name: /Select slide 2/ }).click();
    await page.getByLabel('Title').fill('What the collision theory says, revised');
    await page.getByLabel('Points').fill('Collide with enough energy\nFace the right way');
    await page.getByRole('button', { name: 'Save slide' }).click();

    await expect(page.getByText('Slide saved.')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: /Select slide 2/ }).click();
    await expect(page.getByLabel('Title')).toHaveValue('What the collision theory says, revised');
    await expect(page.getByLabel('Points')).toHaveValue(
      'Collide with enough energy\nFace the right way',
    );
  });

  test('the points render as bullets on the slide', async ({ page }) => {
    await page.getByRole('button', { name: /Select slide 3/ }).click();

    // The preview is the same component present mode renders, so what the
    // teacher sees while editing is what the class will see.
    await expect(page.getByText('Temperature', { exact: true })).toBeVisible();
    await expect(page.getByText('A catalyst', { exact: true })).toBeVisible();
  });

  test('a slide with neither a title nor points is refused', async ({ page }) => {
    await page.getByRole('button', { name: 'Add slide' }).click();
    await expect(page.getByRole('heading', { name: 'Slide 6' })).toBeVisible();

    await page.getByLabel('Title').fill('');
    await page.getByLabel('Points').fill('');
    await page.getByRole('button', { name: 'Save slide' }).click();

    await expect(page.getByText('Give the slide a title or some points.')).toBeVisible();
  });

  test('reordering puts a slide where it was asked to go', async ({ page }) => {
    // Slide 2 is "What the collision theory says". Pushing it to first place
    // has to be visible in the rail, not just reported as done.
    await page.getByRole('button', { name: 'Move slide 2 up' }).click();

    await expect(page.getByRole('button', { name: /Select slide 1/ })).toContainText(
      'What the collision theory says',
    );

    await page.reload();
    await expect(page.getByRole('button', { name: /Select slide 1/ })).toContainText(
      'What the collision theory says',
    );

    // Put it back so the run does not depend on its own earlier mutation.
    await page.getByRole('button', { name: 'Move slide 1 down' }).click();
    await expect(page.getByRole('button', { name: /Select slide 2/ })).toContainText(
      'What the collision theory says',
    );
  });

  test('deleting the only remaining slide archives the deck rather than stranding it', async ({
    page,
  }) => {
    await page.goto('/slides');
    await page.getByRole('button', { name: 'New deck' }).click();
    await page.getByLabel('Title').fill('Throwaway');
    await page.getByRole('button', { name: 'Create deck' }).click();
    await expect(page).toHaveURL(/\/slides\/deck_/);

    await page.getByRole('button', { name: 'Delete slide 1' }).click();

    await expect(page.getByText(/the last slide, so the deck was archived/)).toBeVisible();
    await page.goto('/slides');
    await expect(page.getByRole('link', { name: 'Throwaway' })).toHaveCount(0);
  });
});

test.describe('present mode', () => {
  test('the keyboard moves between slides', async ({ page }) => {
    await signIn(page);
    await page.goto('/slides');
    await page.getByRole('link', { name: 'Reaction rates' }).click();
    await page.getByRole('button', { name: /Select slide 1/ }).click();

    await page.getByRole('button', { name: 'Present' }).click();

    /*
     * The slide count is read rather than assumed. Every test in this file runs
     * against one shared demo workspace in parallel, so a sibling adding or
     * reordering a slide changes the total underneath this one. What matters is
     * that the keys move the position, not what the total happens to be.
     */
    const counter = page.getByText(/\d+ of \d+/).first();
    await expect(counter).toBeVisible();
    const start = (await counter.textContent())?.trim() ?? '';
    const [startAt, total] = start.split(' of ').map((part) => Number(part.trim()));
    expect(Number.isNaN(startAt) || Number.isNaN(total)).toBe(false);

    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText(`${startAt + 1} of ${total}`);

    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText(`${startAt + 2} of ${total}`);

    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText(`${startAt + 1} of ${total}`);
  });

  test('notes are hidden until asked for', async ({ page }) => {
    await signIn(page);
    await page.goto('/slides');
    await page.getByRole('link', { name: 'Reaction rates' }).click();
    await page.getByRole('button', { name: 'Select slide 1' }).click();
    await page.getByRole('button', { name: 'Present' }).click();

    await expect(page.getByText(/Two minutes on why this matters/)).toHaveCount(0);

    await page.keyboard.press('n');
    await expect(page.getByText(/Two minutes on why this matters/)).toBeVisible();
  });

  test('escape leaves present mode', async ({ page }) => {
    await signIn(page);
    await page.goto('/slides');
    await page.getByRole('link', { name: 'Reaction rates' }).click();
    await page.getByRole('button', { name: 'Present' }).click();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
  });
});

test.describe('access', () => {
  /*
   * Slides share the planner's gate because they are the same job. A student is
   * neither offered the link nor able to reach the route, which is the same
   * boundary the planner draws.
   */
  test('a student is neither offered nor able to open it', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('student@liko.test');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });

    await expect(page.getByRole('link', { name: 'Slides' })).toHaveCount(0);

    await page.goto('/slides');
    await expect(
      page.getByRole('heading', { name: 'You do not have access to this area' }),
    ).toBeVisible();
  });
});