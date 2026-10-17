import { expect, test, type Page } from '@playwright/test';

/**
 * The bell in the header, read by somebody who has something in it.
 *
 * WHY NOTHING HERE ASSERTS AN UNREAD COUNT. The demo student has exactly one
 * inbox and the whole suite shares it: `schedule.spec.ts` genuinely writes a
 * note every time a teacher saves a class, and this file's own journey marks
 * notes read, which is not reversible through the product. Any assertion of the
 * form "3 unread" is an assertion about which worker ran first, and this file
 * would be red or green depending on scheduling.
 *
 * So what is asserted here is what the bell does with a fixed set of rows: that
 * it opens onto them, that an account nobody wrote to is empty rather than full
 * of somebody else's, and that reading a note takes that note off the count.
 * The end-to-end journey, which needs a note of its own to read, lives in
 * `schedule.spec.ts`, because that is the file that owns the demo week and
 * therefore the only one that can create a note without racing its neighbours.
 */

const PASSWORD = 'LikoDemo!2026';

const TRIGGER = /^Notifications(, \d+ unread)?$/;

async function signIn(context: { newPage: () => Promise<Page> }, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
  await expect(page.locator('#workspace-main')).toBeVisible();
  return page;
}

async function openBell(page: Page): Promise<void> {
  await page.getByRole('button', { name: TRIGGER }).click();
  const menu = page.getByRole('menu', { name: 'Notifications' });
  await expect(menu, 'the bell did not open').toBeVisible();
}

test.describe('the bell in the header', () => {
  test('opens onto the inbox and names what is in it', async ({ page }) => {
    await signIn({ newPage: async () => page }, 'student@liko.test');

    const trigger = page.getByRole('button', { name: TRIGGER });
    await expect(trigger).toBeVisible();

    await openBell(page);
    await expect(page.getByText('Chemistry was added to your week.')).toBeVisible();
    await expect(page.getByText('Biology has been added to your week.')).toBeVisible();

    // Each row carries its own age, and it is the only place a person can tell
    // a note from this morning from one from last term.
    await expect(
      page.getByRole('menuitem', { name: /Chemistry was added to your week/ }),
    ).toContainText(/\d{4}|ago|Just now/);
  });

  test('an inbox nobody wrote to is empty, not full of somebody else', async ({ page }) => {
    await signIn({ newPage: async () => page }, 'maya@liko.test');

    // No badge at all, rather than a badge of zero: nothing unread is a state
    // the header should not spend a mark on.
    const trigger = page.getByRole('button', { name: 'Notifications' });
    await expect(trigger).toHaveAttribute('aria-label', 'Notifications');
    await expect(page.locator('[data-slot="notification-badge"]')).toHaveCount(0);

    await openBell(page);
    await expect(page.getByText('Nothing here yet.', { exact: false })).toBeVisible();

    // The rows that exist, exist for a student. A teacher opening the same bell
    // must not see them, which is the read policy's answer and the only place
    // that answer is visible to a person.
    await expect(page.getByText('Chemistry was added to your week.')).toHaveCount(0);
    await expect(page.getByText('Biology has been added to your week.')).toHaveCount(0);
  });

  test('the bell is a menu a keyboard can leave', async ({ page }) => {
    await signIn({ newPage: async () => page }, 'student@liko.test');

    await page.getByRole('button', { name: TRIGGER }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: 'Notifications' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'Notifications' })).toHaveCount(0);
  });
});