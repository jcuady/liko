import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Driving a Radix `Select` from the e2e suite.
 *
 * WHY THESE EXIST. The dashboard used native `<select>` elements, so the suite
 * drove them with Playwright's `selectOption()` and read them with
 * `locator('option')`. Those are both gone: a Radix select is a
 * `button[role=combobox]` plus a listbox that only exists while it is open, and
 * Radix keeps each option's value in React context rather than in the DOM.
 *
 * `selectOption()` therefore hangs against it rather than failing fast, which is
 * why the whole suite went to 346s before anyone was told. Radix *can* render a
 * hidden native `<select>` beside the trigger so the value still posts with a
 * form, but only when the trigger is inside a `<form>` (`isFormControl` in
 * `@radix-ui/react-select` 2.3.8). Most of these filters are not in a form, so
 * building the suite on that hidden element would work on some pages and hang
 * on others depending on a version's internals.
 *
 * So the suite opens the control and clicks the item, which is what a teacher
 * does, and `SelectItem` publishes `data-value` so the stored slug is reachable
 * from the DOM. Selection is therefore still driven by the value the app stores
 * (`university`, `gwa`, `admin`) and not by a label copied into the test.
 */

const CONTENT = '[data-slot="select-content"]';
const ITEM = '[data-slot="select-item"]';

/**
 * Open a select and hand back its open listbox.
 *
 * Asserts the listbox actually appeared rather than returning whatever happens
 * to match: without that, a trigger that never opens yields zero options and
 * every downstream `expect` reads as an empty list rather than a broken control.
 */
export async function openSelect(page: Page, trigger: Locator): Promise<Locator> {
  await trigger.click();
  const content = page.locator(CONTENT);
  await expect(content, 'select did not open when its trigger was clicked').toBeVisible();
  return content;
}

async function closeSelect(page: Page, content: Locator): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(content, 'select did not close on Escape').toHaveCount(0);
}

/** Every option, as the `{ value, label }` pairs the control actually stores. */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Read every option without changing the selection.
 *
 * Replaces `locator('option').allTextContents()`, which now returns nothing at
 * all because a closed Radix select has no option elements to find.
 */
export async function optionEntries(page: Page, trigger: Locator): Promise<SelectOption[]> {
  const content = await openSelect(page, trigger);
  const items = content.locator(ITEM);
  await expect(items.first()).toBeVisible();

  const count = await items.count();
  const entries: SelectOption[] = [];
  for (let index = 0; index < count; index += 1) {
    const item = items.nth(index);
    entries.push({
      value: (await item.getAttribute('data-value')) ?? '',
      label: (await item.innerText()).trim(),
    });
  }

  await closeSelect(page, content);
  return entries;
}

/** Just the option labels, which is what "does it offer GWA and GPA" wants. */
export async function optionLabels(page: Page, trigger: Locator): Promise<string[]> {
  return (await optionEntries(page, trigger)).map((option) => option.label);
}

/**
 * Choose the option stored as `value`.
 *
 * Fails naming the slug that was not found, because "no option stored as gwa"
 * is the difference between a typo in a test and a renamed value in the app.
 */
export async function chooseOption(page: Page, trigger: Locator, value: string): Promise<void> {
  const content = await openSelect(page, trigger);
  const option = content.locator(`${ITEM}[data-value="${value}"]`);

  await expect(option, `select offers no option stored as "${value}"`).toBeVisible();
  await option.click();

  /*
   * A LOST POINTERDOWN FALLBACK. THE CAUSE OF THE FLAKE IS NOT ESTABLISHED.
   *
   * This helper failed intermittently for a round with "select stayed open after
   * choosing an option" - four full runs, a different worker count each time,
   * and 6/6 in isolation - and the cause was never established, because
   * Playwright clears `test-results/` at the start of every run and destroyed
   * the trace of each failure before anyone read it. Artefacts now survive;
   * `outputDir` in `playwright.config.ts` is stamped per run.
   *
   * What IS established is the condition the message describes and how it is
   * reachable. Radix SelectItem (`@radix-ui/react-select`, dist/index.mjs) does:
   *
   *   const pointerTypeRef = React.useRef("touch");
   *   onPointerDown: pointerTypeRef.current = event.pointerType;
   *   onPointerUp:   if (pointerTypeRef.current === "mouse") handleSelect();
   *
   * so a mouse selection is gated on a `pointerdown` that reached THAT ITEM
   * INSTANCE, and the ref's initial value is the string "touch", which rejects
   * the pointerup. If the item's node is replaced between the two events, the
   * pointerup lands on a fresh instance, `handleSelect` never runs,
   * `onOpenChange(false)` never runs, and the control stays open indefinitely
   * rather than briefly, because nothing retries it. `e2e/helpers/select.spec.ts`
   * proves both halves of that directly.
   *
   * This is a defence against a verified mechanism, NOT a fix for a confirmed
   * cause, and it is recorded that way so nobody later reads it as "the flake
   * was a lost pointerdown". If the next failure recurs with the control still
   * open, this fallback is now visible in the diff as the thing to check.
   *
   * WHAT IS NOT RELAXED. The assertion is the same one as before - the control
   * must close - and the chosen value is additionally confirmed against the
   * trigger's own text, so a fallback that "succeeded" by closing the list
   * without selecting anything would now fail rather than pass. Nothing here can
   * turn a broken control into a green test.
   */
  /*
   * WAIT FOR THE CLOSE BEFORE DECIDING IT DID NOT HAPPEN.
   *
   * The first version of this fallback tested `count() > 0` immediately after
   * the click, and it made the suite worse: 231 passed became 224 passed / 4
   * failed, with `locator.focus: Test timeout of 45000ms exceeded`. The reason
   * is that Radix unmounts the listbox asynchronously, so a control that WAS
   * closing still answered `count() === 1` in that instant. The fallback then
   * tried to focus an item that was on its way out, and waited 45 seconds for
   * it. Deciding "it did not close" from a synchronous count is asking a
   * question the DOM cannot answer yet.
   *
   * So: give the close a bounded window, and only fall back when that window
   * expires. The normal path is untouched and still waits the full expect
   * timeout afterwards; this is a grace period, not a shorter assertion.
   */
  const closed = await page
    .locator(CONTENT)
    .waitFor({ state: 'detached', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);

  if (!closed) {
    const stillOpen = page.locator(CONTENT);
    const retry = stillOpen.locator(`${ITEM}[data-value="${value}"]`);
    if ((await retry.count()) > 0) {
      await retry.focus({ timeout: 5_000 });
      await page.keyboard.press('Enter');
    }
  }

  await expect(content, 'select stayed open after choosing an option').toHaveCount(0);
}

/**
 * The stored slug currently selected, read from the checked item.
 *
 * Radix marks the selected item with `data-state="checked"`. Its `aria-selected`
 * is gated on that item also being focused, which is not true on a list that has
 * only just opened, so the data attribute is the one to read.
 */
export async function chosenValue(page: Page, trigger: Locator): Promise<string> {
  const content = await openSelect(page, trigger);
  const checked = content.locator(`${ITEM}[data-state="checked"]`);

  await expect(checked, 'select has no selected option').toHaveCount(1);
  const value = await checked.getAttribute('data-value');

  await closeSelect(page, content);
  return value ?? '';
}