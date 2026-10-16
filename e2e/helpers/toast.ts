import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Reading a toast out of the page.
 *
 * WHY THIS EXISTS. Error toasts are mirrored into an assertive live region so a
 * screen reader is told about them immediately (see `src/lib/toast`). That means
 * the same sentence is legitimately in the DOM twice: once in the visible toast
 * and once in `#liko-assertive-toasts`.
 *
 * A bare `getByText(message)` therefore matches both and fails with a strict
 * mode violation, which is not a product fault and reads like one. It surfaced
 * in `admin.spec.ts` on the seats validation, which is an error toast.
 *
 * Every assertion about a toast goes through here so the scoping is stated once.
 * Assertions that are NOT about a toast should keep using `getByText` directly,
 * because the duplicated text only exists for the duration of an error toast.
 */
const TOAST_REGION = /Notifications/;

export function toastText(page: Page, text: string | RegExp): Locator {
  return page.getByRole('region', { name: TOAST_REGION }).getByText(text);
}

/** Assert a toast carrying `text` is on screen, scoped away from the live region. */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(toastText(page, text)).toBeVisible();
}

/** Assert no toast carrying `text` is on screen. */
export async function expectNoToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(toastText(page, text)).toHaveCount(0);
}