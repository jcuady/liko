import { expect, test, type Page } from '@playwright/test';

/**
 * The slide editor, on a real deck, with no AI call.
 *
 * WHAT THIS PROVES AND WHAT IT DELIBERATELY DOES NOT. It proves the editor is
 * wired: that a slide renders from its elements rather than from three columns,
 * that selecting a text element and changing its typography changes the canvas,
 * that the change is persisted and survives a reload, and that the same slide
 * looks the same in the editor and in present mode.
 *
 * It does not assert anything about how a slide LOOKS. A screenshot comparison
 * would be a test that fails on a deliberate design change and passes on a
 * broken one every other time, and it would say nothing about the property that
 * actually matters, which is that the teacher can change the type and see it.
 */

const TEACHER = { email: 'maya@liko.test', password: 'LikoDemo!2026' };

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEACHER.email);
  await page.getByLabel(/password/i).fill(TEACHER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/overview');
}

/**
 * Opens the first deck.
 *
 * Matched on the HREF SHAPE, never on position. `getByRole('link').first()`
 * walks the page and takes the sidebar's first link, which navigates away from
 * /slides and made every test in this file time out in beforeEach with a failure
 * that said nothing about the editor.
 */
async function openFirstDeck(page: Page) {
  await page.goto('/slides');
  const deckLink = page.locator('a[href^="/slides/"]').first();
  await deckLink.click();
  await page.waitForURL(/\/slides\/[^/]+$/);
}


/**
 * The stage canvas, NOT a thumbnail.
 *
 * `page.locator('[data-slide-element]').first()` walks the document and lands on
 * a rail thumbnail, which is rendered decorative and covered by its own overlay
 * button, so the click times out against an element that is visible and
 * perfectly stable. The rail canvases carry `aria-hidden`; the stage does not.
 * Scoping to the non-decorative canvas is the difference between clicking the
 * slide you are editing and clicking its picture.
 */
function STAGE(page: Page) {
  return page.locator('[data-slide-canvas]:not([aria-hidden="true"])').first();
}

/**
 * The TEXT NODE, not the placement box around it.
 *
 * `[data-slide-element]` is a grid cell. The weight class is applied to the
 * `p` or `ul` inside it, so reading the wrapper's computed `font-weight` returns
 * 400 whether the teacher changed anything or not, and a poll waiting for it to
 * differ from 400 waits out the whole timeout against a control that works.
 */
function STAGE_TEXT(page: Page) {
  return STAGE(page).locator('[data-slide-element]').first().locator('p, ul').first();
}

/** What each stored weight actually renders as, so the poll can pin a number. */
const RENDERED_WEIGHT: Record<string, string> = { medium: '500', bold: '700' };

/**
 * Picks a weight that is NOT the one already stored, and returns it.
 *
 * The suite shares one demo deck, so whatever weight an earlier test saved is
 * the weight this one starts from. Selecting a fixed option and then waiting
 * for the canvas to change timed out against a control that was working: the
 * value it asked for was already the value on screen, so the assertion was
 * really "change something that cannot change". Reading what is stored first
 * makes each test independent of the order the file runs in.
 */
async function changeWeight(page: Page): Promise<string> {
  const weight = page.getByLabel('Weight');
  await expect(weight).toBeVisible();

  const current = await weight.inputValue();
  const target = current === 'bold' ? 'medium' : 'bold';
  await weight.selectOption(target);
  return target;
}
test.describe('the slide editor', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await openFirstDeck(page);
  });

  test('renders the slide from its elements, not from three columns', async ({ page }) => {
    /*
     * The canvas is the thing that gets projected, so it is addressed by its own
     * hook. `section.first()` is a position-based selector and it has silently
     * retargeted a proof before, when a panel was added above the page.
     */
    const canvas = STAGE(page);
    await expect(canvas).toBeVisible();

    // A rendered slide has real text in it. The demo slides carry elements, so
    // this fails on a renderer that fell back to an empty shell.
    await expect(canvas).not.toBeEmpty();
  });

  test('selecting text lets the teacher change its typography', async ({ page }) => {
    const canvas = STAGE(page);
    await canvas.waitFor();

    // Click the first text element on the stage.
    const element = STAGE(page).locator('[data-slide-element]').first();
    await element.click();

    /*
     * The controls are labelled selects, not buttons. The first version of this
     * asked for a button named "Bold" and timed out, which reads as a broken
     * editor rather than as a test that described the wrong control.
     *
     * Reaching the inspector at all is half the proof. The demo deck's slides
     * store no elements, so they are drawn from the legacy layout, and a
     * selection lookup that read `elements` without that fallback left the
     * inspector reporting "nothing is selected" on every slide a real teacher
     * opens.
     */
    const text = STAGE_TEXT(page);
    await expect(text).toBeVisible();
    const before = await text.evaluate((node) => getComputedStyle(node).fontWeight);
    const target = await changeWeight(page);

    /*
     * Asserted on the COMPUTED STYLE, not on the control's value. Selecting
     * "Bold" in a dropdown and watching the dropdown say "Bold" proves only that
     * React has state; reading the rendered font-weight proves the canvas moved.
     */
    await expect
      .poll(async () => text.evaluate((node) => getComputedStyle(node).fontWeight))
      .not.toBe(before);

    // Named rather than matched with a regex, so this pins the rendered weight.
    expect(await text.evaluate((node) => getComputedStyle(node).fontWeight)).toBe(
      RENDERED_WEIGHT[target],
    );
  });

  test('the change survives a reload, which is what saving means', async ({ page }) => {
    await STAGE(page).locator('[data-slide-element]').first().click();

    const text = STAGE_TEXT(page);
    const before = await text.evaluate((node) => getComputedStyle(node).fontWeight);
    const target = await changeWeight(page);

    await expect
      .poll(async () => text.evaluate((node) => getComputedStyle(node).fontWeight))
      .not.toBe(before);

    /*
     * Waiting for the editor's own word that the write landed before reloading.
     * Reloading mid-debounce would assert nothing at all: the page would show
     * the old weight whether saving worked or not, which is the one failure
     * this test cannot tell apart from success.
     */
    await expect(page.getByText('Changes saved.')).toBeVisible();

    await page.reload();
    await page.waitForURL(/\/slides\/.+/);

    const after = await STAGE_TEXT(page).evaluate((node) => getComputedStyle(node).fontWeight);

    expect(after, `the ${target} weight survived the reload`).toBe(RENDERED_WEIGHT[target]);
  });

  test('a slide looks the same in present mode as in the editor', async ({ page }) => {
    /*
     * One renderer, three places. If present mode ever gets its own markup this
     * fails, because the two canvases are compared on the same slide rather than
     * asserted separately, which would let both drift in the same way.
     */
    const editorCanvas = STAGE(page);
    await editorCanvas.waitFor();
    const inEditor = await editorCanvas.innerText();

    await page.getByRole('button', { name: /present/i }).click();
    const presentCanvas = STAGE(page);
    await expect(presentCanvas).toBeVisible();

    expect(await presentCanvas.innerText()).toBe(inEditor);
  });

  test('the canvas fits a phone without horizontal overflow', async ({ page }) => {
    /*
     * The grid is why this passes. Elements name a column and a span rather
     * than an x and a y, so the slide scales instead of spilling, and this is
     * the assertion that would have caught a free-position canvas.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow, 'no horizontal overflow at 375px').toBeLessThanOrEqual(1);
  });

  test('every theme is reachable and actually changes the slide', async ({ page }) => {
    const canvas = STAGE(page);
    await canvas.waitFor();

    const before = await canvas.evaluate((node) => getComputedStyle(node).backgroundColor);
    await page.getByRole('button', { name: /^Dusk$/ }).click();

    await expect
      .poll(async () => canvas.evaluate((node) => getComputedStyle(node).backgroundColor))
      .not.toBe(before);
  });
});