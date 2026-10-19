import { expect, test, type Page } from '@playwright/test';

import { expectToast } from './helpers/toast';

/**
 * The slide editor.
 *
 * Walks the module the way a teacher building a lesson does, and asserts the
 * parts that are easy to get wrong and invisible until they bite: that a new
 * deck opens with something in it, that an edit survives a reload, that reordering
 * puts a slide where it was asked to go, and that the keyboard drives present
 * mode because that is how it is actually used, standing up.
 */

/*
 * THIS FILE IS NOT PARALLEL WITH ITSELF, AND THAT IS DELIBERATE.
 *
 * The fixture workspace is one shared mutable store, so every test in here sees
 * the same decks and the same slides. "Reordering puts a slide where it was asked
 * to go" genuinely swaps slide 1 for slide 2 and then swaps it back; between
 * those two clicks, slide 1 is a different slide. A present-mode test reading
 * that deck at that moment fails, and it fails intermittently: three passes in
 * isolation, one failure in a full run, which is the signature of a race and
 * nothing else.
 *
 * Restoring the mutation is not enough, because the restore is itself a window.
 * Building each test its own deck was tried and is worse: driving the editor to
 * populate a fixture depends on the editor's per-field blur-to-save, which is
 * the thing under test elsewhere in this file.
 *
 * So the file is serial. The suite still runs four workers across ten spec files;
 * only this one stops racing itself.
 */
test.describe.configure({ mode: 'serial' });

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

    /*
     * Scoped through the toast helper, and the reason is not obvious from the
     * line above it. An error toast is mirrored into `#liko-assertive-toasts` so
     * a screen reader is told about it immediately (`src/lib/toast.ts`), which
     * puts the same sentence in the DOM twice. A bare `getByText` then matches
     * both and fails with a strict mode violation that reads exactly like a
     * product fault. It failed here in the 2026-10-19 gate run, which ran e2e
     * straight after a build - the busiest moment - and passed minutes earlier on
     * its own.
     *
     * This is one of five call sites the first pass at that fix missed; the
     * message text is the join key, not the call site.
     */
    await expectToast(page, 'Give the deck a title.');
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
    await page.getByRole('button', { name: /^Slide 2:/ }).click();
    await page.getByLabel('Title', { exact: true }).fill('What the collision theory says, revised');
    await page.getByLabel('Points', { exact: true }).fill('Collide with enough energy\nFace the right way');

    /*
     * The details form still saves on a button. What was removed is the
     * element-level "Save slide": elements, themes and typography autosave, so
     * the button that remains covers exactly the fields that do not. It is
     * named "Save details" and lives in the slide details card, and the
     * assertion is on what the editor confirms and what survives a reload,
     * which is the property the button exists to guarantee.
     */
    await page.getByRole('button', { name: 'Save details' }).click();
    await expect(page.getByText('Slide saved.')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: /^Slide 2:/ }).click();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('What the collision theory says, revised');
    await expect(page.getByLabel('Points', { exact: true })).toHaveValue(
      'Collide with enough energy\nFace the right way',
    );
  });

  test('the points render as bullets on the slide', async ({ page }) => {
    await page.getByRole('button', { name: /^Slide 3:/ }).click();

    /*
     * Scoped to the stage canvas. The rail draws every slide through the same
     * renderer, so a page-wide lookup finds "Temperature" twice: once on the
     * slide being edited and once in that slide's own thumbnail. That comes
     * back as a strict mode violation, which reads as a broken bullet list and
     * is really a locator that was not specific enough.
     */
    const stage = page.locator('[data-slide-canvas]:not([aria-hidden="true"])');

    // The preview is the same component present mode renders, so what the
    // teacher sees while editing is what the class will see.
    await expect(stage.getByText('Temperature', { exact: true })).toBeVisible();
    await expect(stage.getByText('A catalyst', { exact: true })).toBeVisible();
  });

  test('a slide with neither a title nor points is refused', async ({ page }) => {
    await page.getByRole('button', { name: 'Add slide' }).click();
    // Exact, because the details card below it is headed "Slide 6 details" and a
    // substring lookup matches both. Two headings for one slide is right; two
    // locators for one heading is not.
    await expect(page.getByRole('heading', { name: 'Slide 6', exact: true })).toBeVisible();

    /*
     * Exact, and the reason is the rail. An untitled slide's thumbnail button
     * is labelled "Slide 6: Untitled slide", and a substring lookup for "Title"
     * matches that button as readily as the textbox. Addressing the exact label
     * is the difference between filling the field and strict mode complaining
     * about a thumbnail.
     */
    await page.getByLabel('Title', { exact: true }).fill('');
    await page.getByLabel('Points', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save details' }).click();

    await expect(page.getByText('Give the slide a title or some points.')).toBeVisible();
  });

  test('reordering puts a slide where it was asked to go', async ({ page }) => {
    /*
     * THE SLIDE'S WORDS ARE ITS ACCESSIBLE NAME, NOT ITS TEXT.
     *
     * The thumbnail is a decorative canvas with a button laid over it, and the
     * button's only text is an sr-only "Select slide N". `toContainText` was
     * therefore reading the string "Select slide 1" and reporting on the wrong
     * thing entirely, which is how a reorder can pass or fail for reasons that
     * have nothing to do with the order.
     */
    const MOVED = 'What the collision theory says';
    const first = page.getByRole('button', { name: /^Slide 1:/ });
    const second = page.getByRole('button', { name: /^Slide 2:/ });

    // Slide 2 is the collision theory slide. An earlier test in this file
    // renames it, so the match is on the prefix rather than the whole name.
    await page.getByRole('button', { name: 'Move slide 2 up' }).click();

    await expect(first).toHaveAccessibleName(new RegExp(`^Slide 1: ${MOVED}`));

    await page.reload();
    await expect(first).toHaveAccessibleName(new RegExp(`^Slide 1: ${MOVED}`));

    // Put it back so the run does not depend on its own earlier mutation.
    await page.getByRole('button', { name: 'Move slide 1 down' }).click();
    await expect(second).toHaveAccessibleName(new RegExp(`^Slide 2: ${MOVED}`));
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
    await page.getByRole('button', { name: /^Slide 1:/ }).click();

    await page.getByRole('button', { name: 'Present' }).click();

    /*
     * The slide count is read rather than assumed, so this holds even if another
     * spec file added a slide to the shared deck. What matters is that the keys
     * move the position, not what the total happens to be.
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
    await page.getByRole('button', { name: /^Slide 1:/ }).click();
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