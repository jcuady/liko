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