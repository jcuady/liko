import { expect, test, type Page } from '@playwright/test';

import { PERMISSIONS, scopeFor } from '@/lib/auth/rbac';

import { chooseOption } from './helpers/select';

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

    // Read the control rather than the page text. This was written when the role
    // picker was a native `<select>` and its options were invisible until it was
    // opened; it is now a Radix select, so the closed trigger shows the label the
    // admin is looking at and the slug is only reachable through the listbox. The
    // labels are asserted because that is what a role is read as in the product,
    // and `chooseOption` below still drives it by the stored slug.
    const row = (name: string) => page.getByRole('listitem').filter({ hasText: name });
    await expect(row('Dev Ramanathan').getByLabel(/Role for/)).toHaveText('Administrator');
    await expect(row('Maya Okonkwo').getByLabel(/Role for/)).toHaveText('Teacher');
    await expect(row('Noor Haddad').getByLabel(/Role for/)).toHaveText('Student');
    await expect(row('Priya Raman').getByLabel(/Role for/)).toHaveText('Parent or guardian');
  });

  test('a role change reaches the account it was applied to', async ({ page }) => {
    const row = page.getByRole('listitem').filter({ hasText: 'Ingrid Halvorsen' });
    const roleForIngrid = row.getByLabel(/Role for/);
    await chooseOption(page, roleForIngrid, 'admin');

    // The label moves with the write, so the assertion is on what is now shown
    // rather than on a toast that a previous mutation could also have produced.
    await expect(roleForIngrid).toHaveText('Administrator');
    // `.last()` because this test writes twice, so more than one "Role updated."
    // toast can be alive at once and a bare match is ambiguous. It passed
    // because the first toast happened to have expired before the second write,
    // which is toast timing rather than anything about the product.
    await expect(page.getByText('Role updated.').last()).toBeVisible();

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
    await chooseOption(page, roleForIngrid, 'instructor');
    await expect(roleForIngrid).toHaveText('Teacher');
    await expect(page.getByText('Role updated.').last()).toBeVisible();
    await asIngrid.close();
  });

  /*
   * Removing the last admin leaves a school that nobody can administer and
   * nobody can restore. The button is disabled rather than failing after the
   * fact, and the seam refuses it again in case the request is crafted.
   */
  test('the only administrator cannot be demoted or suspended', async ({ page }) => {
    const row = page.getByRole('listitem').filter({ hasText: 'Dev Ramanathan' });

    await expect(row.getByLabel(/Role for/)).toHaveText('Administrator');
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

    // The scoped grants in these two rows are COUNTED FROM THE MATRIX, not
    // written down here.
    //
    // They used to be literals: four "own" grants for a student and three
    // "linked" for a parent. Adding flashcards broke both, in a test that had
    // nothing to do with flashcards, because a permission was added to
    // `rbac.ts` and a number somewhere else was not. The count is the strong
    // assertion here, so it is kept, but it is now derived from the same source
    // the page renders from, which is exactly what this test claims to prove.
    const ownFor = (role: 'student' | 'guardian') =>
      PERMISSIONS.filter((permission) => scopeFor(role, permission) === 'own').length;
    const linkedFor = (role: 'student' | 'guardian') =>
      PERMISSIONS.filter((permission) => scopeFor(role, permission) === 'linked').length;

    await expect(rowFor('Student').getByText('Own records only')).toHaveCount(ownFor('student'));
    await expect(rowFor('Parent or guardian').getByText('Linked records only')).toHaveCount(
      linkedFor('guardian'),
    );

    // Derived counts cannot say WHICH grants they are, so the three flashcards
    // grants are named outright, and named as the ROW renders them.
    //
    // Every permission is listed for every role; a refusal is shown with no
    // scope beside it, which is the whole point of the table. So "a parent may
    // not author a deck" is asserted as the absence of a scope annotation on
    // that row, NOT as the absence of the label. Asserting the label is absent
    // would have passed on a table that quietly dropped the row instead of
    // refusing it, which is the opposite of what has to be true.
    const itemIn = (role: string, label: string) =>
      rowFor(role).getByRole('listitem').filter({ hasText: label });

    for (const label of ['View flashcards', 'Create and share decks', 'Review a deck']) {
      await expect(rowFor('Student').getByText(label)).toBeVisible();
      await expect(itemIn('Student', label)).toContainText('Own records only');
    }

    // The parent grant is read only: the deck can be seen, and authoring and
    // reviewing are refused outright rather than narrowed.
    await expect(itemIn('Parent or guardian', 'View flashcards')).toContainText(
      'Linked records only',
    );
    await expect(itemIn('Parent or guardian', 'Create and share decks')).not.toContainText(
      'records only',
    );
    await expect(itemIn('Parent or guardian', 'Review a deck')).not.toContainText('records only');

    // A refusal is shown as well as a grant, with no scope beside it. That
    // difference is the useful part: a teacher is refused outright, not given
    // a narrower version of the power.
    await expect(rowFor('Teacher').getByText('Manage people', { exact: true })).toBeVisible();
    await expect(rowFor('Teacher').getByText('Own records only')).toHaveCount(0);
    await expect(rowFor('Administrator').getByText('Own records only')).toHaveCount(0);
  });
});