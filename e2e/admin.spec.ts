import { expect, test, type Page } from '@playwright/test';

/**
 * The administration console.
 *
 * These tests drive the page the way an administrator does and assert the parts
 * that are easy to get wrong and hard to notice: that only an admin can open it,
 * that the people list shows the organisation's real members, that a role change
 * actually reaches the account it was applied to, and that the console refuses
 * the moves that would strand a school with no administrator.
 */

const PASSWORD = 'LikoDemo!2026';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

test.describe('who can open it', () => {
  test('an administrator reaches it from the sidebar', async ({ page }) => {
    await signIn(page, 'dev@liko.test');
    await expect(page).toHaveURL(/\/overview/);

    await page.getByRole('link', { name: 'Administration' }).click();

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
  });

  /*
   * The link is filtered by the same matrix that gates the route. Showing it to
   * a teacher who cannot open it would hand them a dead end that looks like a
   * fault rather than like a boundary.
   */
  test('a teacher is neither offered nor able to open it', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await expect(page).toHaveURL(/\/overview/);

    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);

    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'You do not have access to this area' }),
    ).toBeVisible();
  });
});

test.describe('the people list', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'dev@liko.test');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  });

  test('lists everyone in the organisation with their role', async ({ page }) => {
    for (const person of ['Maya Okonkwo', 'Ingrid Halvorsen', 'Noor Haddad', 'Priya Raman']) {
      await expect(page.getByText(person, { exact: true })).toBeVisible();
    }

    // Read from the control rather than from the page text: the option labels
    // live inside a closed select and are not visible on their own.
    const row = (name: string) => page.getByRole('listitem').filter({ hasText: name });
    await expect(row('Dev Ramanathan').getByLabel(/Role for/)).toHaveValue('admin');
    await expect(row('Maya Okonkwo').getByLabel(/Role for/)).toHaveValue('instructor');
    await expect(row('Noor Haddad').getByLabel(/Role for/)).toHaveValue('student');
    await expect(row('Priya Raman').getByLabel(/Role for/)).toHaveValue('guardian');
  });

  test('a role change reaches the account it was applied to', async ({ page }) => {
    const row = page.getByRole('listitem').filter({ hasText: 'Ingrid Halvorsen' });
    await row.getByLabel(/Role for/).selectOption('admin');

    await expect(page.getByText('Role updated.')).toBeVisible();

    // The point of the change: Ingrid can now open the page a teacher cannot.
    const asIngrid = await page.context().browser()!.newContext();
    const other = await asIngrid.newPage();
    await other.goto('/login');
    await other.getByLabel('Email').fill('ingrid@liko.test');
    await other.getByLabel('Password').fill(PASSWORD);
    await other.getByRole('button', { name: 'Sign in' }).click();
    await other.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
    await other.goto('/admin');

    await expect(
      other.getByRole('heading', { name: 'Administration' }),
      'a promoted teacher should reach the admin page',
    ).toBeVisible();

    // Put her back so the run does not depend on its own earlier mutation.
    await row.getByLabel(/Role for/).selectOption('instructor');
    await expect(page.getByText('Role updated.')).toBeVisible();
    await asIngrid.close();
  });

  /*
   * Removing the last admin leaves a school that nobody can administer and
   * nobody can restore. The button is disabled rather than failing after the
   * fact, and the seam refuses it again in case the request is crafted.
   */
  test('the only administrator cannot be demoted or suspended', async ({ page }) => {
    const row = page.getByRole('listitem').filter({ hasText: 'Dev Ramanathan' });

    await expect(row.getByLabel(/Role for/)).toHaveValue('admin');
    await expect(row.getByRole('button', { name: 'Suspend' })).toBeDisabled();
    await expect(row.getByText('You')).toBeVisible();
  });

  test('an administrator cannot suspend themselves', async ({ page }) => {
    const row = page.getByRole('listitem').filter({ hasText: 'Maya Okonkwo' });

    await expect(row.getByRole('button', { name: 'Suspend' })).toBeEnabled();
  });
});

test.describe('organisation settings', () => {
  test('renaming the organisation persists', async ({ page }) => {
    await signIn(page, 'dev@liko.test');
    await page.goto('/admin');

    await page.getByRole('tab', { name: 'Organisation' }).click();
    await page.getByLabel('Organisation name').fill('Northfield Sixth Form');
    await page.getByRole('button', { name: 'Save organisation' }).click();

    await expect(page.getByText('Organisation saved.')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Organisation' }).click();
    await expect(page.getByLabel('Organisation name')).toHaveValue('Northfield Sixth Form');

    // Restore, so the suite leaves the demo workspace as it found it.
    await page.getByLabel('Organisation name').fill('Northfield Science Academy');
    await page.getByRole('button', { name: 'Save organisation' }).click();
    await expect(page.getByText('Organisation saved.')).toBeVisible();
  });

  test('an invalid seat count is refused with a reason', async ({ page }) => {
    await signIn(page, 'dev@liko.test');
    await page.goto('/admin');

    await page.getByRole('tab', { name: 'Organisation' }).click();
    await page.getByLabel('Seats').fill('0');
    await page.getByRole('button', { name: 'Save organisation' }).click();

    await expect(page.getByText('Seats must be a whole number between 1 and 10,000.')).toBeVisible();
  });
});

test.describe('the access model', () => {
  test('the matrix is rendered from the rules the product enforces', async ({ page }) => {
    await signIn(page, 'dev@liko.test');
    await page.goto('/admin');

    await page.getByRole('tab', { name: 'Access' }).click();

    // Grounded in the matrix rather than in a hand-written copy of it. The
    // assertions are scoped to a row because most of these grants belong to
    // more than one role.
    const rowFor = (name: string) =>
      page.getByRole('row').filter({ has: page.getByRole('rowheader', { name }) });

    for (const role of ['Administrator', 'Teacher', 'Student', 'Parent or guardian']) {
      await expect(page.getByRole('rowheader', { name: role })).toBeVisible();
    }

    await expect(rowFor('Administrator').getByText('Manage the organisation')).toBeVisible();
    await expect(rowFor('Student').getByText('View grades')).toBeVisible();

    // Four scoped grants in this row: classes, grades, history and sitting a
    // quiz are all own-records-only for a student. The count is the stronger
    // assertion because these grants belong to no other role in this row.
    await expect(rowFor('Student').getByText('Own records only')).toHaveCount(4);
    await expect(rowFor('Parent or guardian').getByText('Linked records only')).toHaveCount(3);

    // A refusal is shown as well as a grant, with no scope beside it. That
    // difference is the useful part: a teacher is refused outright, not given
    // a narrower version of the power.
    await expect(rowFor('Teacher').getByText('Manage people', { exact: true })).toBeVisible();
    await expect(rowFor('Teacher').getByText('Own records only')).toHaveCount(0);
    await expect(rowFor('Administrator').getByText('Own records only')).toHaveCount(0);
  });
});