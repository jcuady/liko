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
});