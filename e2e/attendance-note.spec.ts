import { expect, test, type Locator, type Page } from '@playwright/test';

import { openSelect, optionLabels } from './helpers/select';

/**
 * Recording why a student is marked the way they are.
 *
 * `addAttendanceNote` existed on the server from the day the register was built,
 * with the behaviour log behind it and nothing in front of it. A teacher could
 * mark a student absent and had nowhere to record why, which is the half of the
 * workflow the mark exists for. These tests drive the control that finally calls
 * it, and they drive the refusal too, because a write control nobody is stopped
 * from using is worse than no control at all.
 *
 * THE ROW IS NOT ASSERTED HERE. `revalidatePath` puts a note on screen whether
 * or not it was stored, so the only honest reader is one outside the
 * application. That belongs in the live verifier, which runs against Postgres;
 * asserting it here would prove nothing in fixture mode.
 */

const PASSWORD = 'LikoDemo!2026';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

/** The first option a control offers, chosen by what it says. */
async function chooseFirst(page: Page, trigger: Locator): Promise<void> {
  const content = await openSelect(page, trigger);
  await content.locator('[role="option"]').first().click();
}

test.describe('attendance notes', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await page.goto('/attendance');
    await page.waitForLoadState('networkidle');
  });

  test('the register offers a control for notes', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add note' })).toHaveCount(1);
  });

  test('the dialog opens and closes without writing anything', async ({ page }) => {
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  /*
   * The negative that matters most, and the one a happy path never reaches. The
   * action refuses an empty note, so the dialog has to stay open and say so. A
   * dialog that closed on an empty note would be reporting success for a row
   * that was never written.
   */
  test('an empty note is refused rather than saved', async ({ page }) => {
    await page.getByRole('button', { name: 'Add note' }).click();
    const dialog = page.getByRole('dialog');

    await chooseFirst(page, dialog.locator('#note-student'));
    await dialog.getByRole('button', { name: 'Save note' }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Write the note before saving it.')).toBeVisible();
  });

  test('the field ceiling is the server ceiling, not a second number', async ({ page }) => {
    await page.getByRole('button', { name: 'Add note' }).click();
    const dialog = page.getByRole('dialog');

    // Both read note-craft, so this cannot drift without the server drifting.
    await expect(dialog.locator('#note-entry')).toHaveAttribute('maxlength', '500');
  });

  test('the four kinds are offered in order of escalation', async ({ page }) => {
    await page.getByRole('button', { name: 'Add note' }).click();
    const dialog = page.getByRole('dialog');

    const labels = await optionLabels(page, dialog.locator('#note-kind'));
    expect(labels).toEqual(['Note', 'Praise', 'Concern', 'Intervention']);
  });

  test('closing the dialog discards a half written note', async ({ page }) => {
    await page.getByRole('button', { name: 'Add note' }).click();
    const dialog = page.getByRole('dialog');

    await dialog.locator('#note-entry').fill('half a thought');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByRole('dialog').locator('#note-entry')).toHaveValue('');
  });
});

test.describe('attendance notes are a teacher capability', () => {
  for (const email of ['student@liko.test', 'guardian@liko.test']) {
    test(`${email} is refused the register and offered no control`, async ({ page }) => {
      await signIn(page, email);
      await page.goto('/attendance');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: 'Add note' })).toHaveCount(0);
      /*
       * Asserted as copy, not as a URL. The application refuses a role by
       * rendering the refusal at the address that was asked for. A first version
       * of this test asserted a redirect and failed against an application that
       * was refusing correctly, which is how the convention got written down.
       */
      await expect(page.locator('main')).toContainText('You do not have access to this area');
    });
  }
});