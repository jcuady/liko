import { expect, test, type Page } from '@playwright/test';

import { chooseOption, chosenValue, openSelect } from './select';

/**
 * The select helper itself.
 *
 * WHY THIS FILE EXISTS. When the dashboard moved from native `<select>` elements
 * to Radix, the suite kept calling Playwright's `selectOption()`. Against a
 * Radix select that call does not fail: it waits for a native element that will
 * never arrive, so nine of them across five specs timed out one after another
 * and the e2e gate took 346s instead of 185s before reporting one failure.
 *
 * A helper that silently hangs is the same defect wearing a new hat, so the
 * failure mode is pinned here: a value the control does not offer must be
 * rejected in seconds, and the message must name the value that was not found.
 * That is what distinguishes "the slug in this test is stale" from "this control
 * is broken", which are very different bugs to go looking for.
 */

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('maya@liko.test');
  await page.getByLabel('Password').fill('LikoDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

test.describe('driving a Radix select', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/grades');
    await expect(page.locator('#workspace-main')).toBeVisible();
  });

  test('a value the control does not offer fails at once and names it', async ({ page }) => {
    await expect(
      chooseOption(page, page.getByLabel('Show as'), 'not-a-real-scale'),
      'a stale slug must be rejected, not waited on',
    ).rejects.toThrow(/not-a-real-scale/);
  });

  /*
   * The counterweight to the test above: a helper that refuses everything would
   * satisfy it too. So the same helper is shown working on the same control,
   * immediately, and the selection is confirmed from the control's own state
   * rather than from a downstream toast that some other write could produce.
   */
  test('a real value is chosen and the selection is observable', async ({ page }) => {
    const scale = page.getByLabel('Show as');

    expect(await chosenValue(page, scale)).toBe('percentage');

    await chooseOption(page, scale, 'gwa');

    expect(await chosenValue(page, scale)).toBe('gwa');
    await expect(scale).toHaveText('GWA');
  });

  /*
   * Reading the list must not change it. `optionEntries` opens and closes, and if
   * the close were ever lost then every caller that reads a list before choosing
   * would be choosing against an already-open control.
   */
  test('reading the options leaves the control closed and unchanged', async ({ page }) => {
    const scale = page.getByLabel('Show as');

    const content = await openSelect(page, scale);
    await expect(content.locator('[data-slot="select-item"]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-slot="select-content"]')).toHaveCount(0);

    expect(await chosenValue(page, scale)).toBe('percentage');
  });

  /*
   * WHY A POINTERUP ALONE CANNOT CHOOSE, PROVEN RATHER THAN ASSUMED.
   *
   * `chooseOption` has failed intermittently for a whole round with "select
   * stayed open after choosing an option", four full runs, and the cause was
   * never established because Playwright cleared `test-results/` at the start of
   * every run and destroyed the trace before anyone read it.
   *
   * So the cause is established here instead, by construction. Reading the
   * installed `@radix-ui/react-select` (dist/index.mjs, SelectItem) gives:
   *
   *   const pointerTypeRef = React.useRef("touch");
   *   onPointerDown: pointerTypeRef.current = event.pointerType;
   *   onPointerUp:   if (pointerTypeRef.current === "mouse") handleSelect();
   *   onClick:       if (pointerTypeRef.current !== "mouse") handleSelect();
   *
   * Two consequences, and this test pins both:
   *
   *   1. A MOUSE SELECTION IS PRIMED BY `pointerdown`, ON THAT ITEM INSTANCE.
   *      `pointerTypeRef` starts as the string "touch", so an item that never saw
   *      a pointerdown rejects the pointerup and does not select. If the item's
   *      DOM node is replaced between down and up, the pointerup lands on a
   *      fresh instance whose ref is still "touch", `handleSelect` is never
   *      called, `onOpenChange(false)` never runs, and the control stays open
   *      indefinitely - not briefly, forever, because nothing retries it.
   *
   *   2. THE CONTROL SELECTS. Same two events in order, and it closes. So the
   *      difference between the two halves is the ORDERING of a pair of events
   *      and nothing else, which is what makes this a mechanism and not a
   *      coincidence.
   *
   * This does NOT claim to be the cause of the four-run flake; that is still not
   * established, and a plausible mechanism with evidence-shaped support is more
   * dangerous than a guess because nobody re-derives it. What it establishes is
   * that the exact condition the failure describes - open, item present, nothing
   * selected - is reachable, and how it is reached.
   */
  test('a pointerup with no pointerdown behind it cannot choose, and the pair can', async ({ page }) => {
    const scale = page.getByLabel('Show as');
    const CONTENT = '[data-slot="select-content"]';
    const TARGET = '[data-slot="select-item"][data-value="gwa"]';
    const mouse = { pointerType: 'mouse', button: 0, isPrimary: true };

    // ---- half one: the pointerup arrives with nothing to prime it ----------
    const content = await openSelect(page, scale);
    const target = content.locator(TARGET);
    await expect(target).toBeVisible();

    await target.dispatchEvent('pointerup', mouse);
    await page.waitForTimeout(500);

    await expect(
      page.locator(CONTENT),
      'a bare pointerup must not select, because nothing primed pointerTypeRef',
    ).toHaveCount(1);
    await expect(scale, 'and the control must still show its old value').toHaveText('Percentage');

    await page.keyboard.press('Escape');
    await expect(page.locator(CONTENT)).toHaveCount(0);

    // ---- half two: the same pair, in order, does choose --------------------
    const again = await openSelect(page, scale);
    const retried = again.locator(TARGET);
    await retried.dispatchEvent('pointerdown', mouse);
    await retried.dispatchEvent('pointerup', mouse);
    await page.waitForTimeout(500);

    await expect(
      page.locator(CONTENT),
      'the ordered pair must select and close, or the first half proved nothing',
    ).toHaveCount(0);
    await expect(scale).toHaveText('GWA');
  });
});