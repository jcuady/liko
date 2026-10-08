import { expect, test, type Page } from '@playwright/test';

/**
 * Class list import.
 *
 * This is the one write in the product that can create thirty students from a
 * single click, so the tests are about what it refuses and what it tells the
 * teacher rather than about the happy path alone.
 *
 * IT MUTATES THE SHARED FIXTURE ROSTER. The fixture workspace is one store on
 * `globalThis` and every spec in a run talks to the same server, so these names
 * stay on the class for whoever runs after. They are therefore distinctive
 * enough that nothing else can collide with them, and no assertion here pins a
 * roster size, because the size is not this suite's to decide.
 */

const PASSWORD = 'LikoDemo!2026';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

async function openImport(page: Page) {
  await page.goto('/classes');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('class list import', () => {
  test('previews what it read before anything is written', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await openImport(page);

    await page.getByLabel('Or paste rows').fill('Name,Guardian Email\nPreview One,preview1@example.com\n');

    // The preview is a claim about what will happen, shown before it happens.
    await expect(page.getByText('1 student ready to add.')).toBeVisible();
    // Twice on screen: the name in the preview line and the same text in the box
    // it was typed into.
    await expect(page.getByText('Preview One').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Add 1 student$/ })).toBeEnabled();
  });

  test('says plainly that no logins are created', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await openImport(page);

    await page.getByLabel('Or paste rows').fill('Name\nLogin Check Row\n');

    await expect(
      page.getByText(/No student logins are created by an import/i),
    ).toBeVisible();
  });

  test('adds the students and reports the rows it left out', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await openImport(page);

    await page.getByLabel('Or paste rows').fill(
      ['Name,Guardian Email', 'Imported Alpha,alpha@example.com', 'Imported Bravo,not-an-email'].join('\n'),
    );

    // One row is refused before anything is sent, and the row number is given.
    await expect(page.getByText(/1 row will be left out/i)).toBeVisible();
    await expect(page.getByText(/row 3/)).toBeVisible();

    await page.getByRole('button', { name: /Add 1 student$/ }).click();

    await expect(page.getByText('1 added, 1 left out.')).toBeVisible();
    await expect(page.getByText('"not-an-email" is not an email address.')).toBeVisible();

    await page.getByRole('button', { name: 'Done' }).click();
    // Twice: the roster cell and the screen-reader label on its archive button.
    await expect(page.getByText('Imported Alpha').first()).toBeVisible();
  });

  test('reads a file with no heading row as one column of names', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await openImport(page);

    await page.getByLabel('Or paste rows').fill('Headerless One\nHeaderless Two\n');

    await expect(page.getByText('2 students ready to add.')).toBeVisible();
    await expect(page.getByText(/No heading row found/)).toBeVisible();
  });

  test('refuses a file with nothing readable in it', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await openImport(page);

    await page.getByLabel('Or paste rows').fill('Name,Guardian Email\n,someone@example.com\n');

    await expect(page.getByText('No students could be read from this.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Add 0 students/ })).toBeDisabled();
  });

  /*
   * NOT COVERED HERE, ON PURPOSE.
   *
   * The action refuses a class id that this teacher cannot read, by resolving it
   * against `listClasses` rather than trusting the string. That cannot be driven
   * from a browser: a server action is addressed by its own generated id, so a
   * test cannot post a forged classId without already knowing that id, and a
   * test that posts a made-up one would be asserting that Next.js rejects a bad
   * action id, which is true and proves nothing about this code. The guarantee
   * therefore rests on the resolution being visible in `importRoster`, with the
   * tenant boundary beneath it carried by RLS.
   */
});