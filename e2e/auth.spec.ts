import { expect, test, type Page } from '@playwright/test';

/**
 * Auth and access-control behaviour.
 *
 * The registration flow depends on the in-memory development store, so each test
 * uses a unique address to stay independent of test ordering.
 */

let counter = 0;

function uniqueEmail() {
  counter += 1;
  return `teacher${Date.now()}${counter}@school.edu`;
}

const PASSWORD = 'Good-Pass-1';

/**
 * Ticks both consent boxes.
 *
 * Every test that gets past the form has to call this. That is the point of the
 * gate: there is no path into the product that does not pass through it.
 */
async function acceptConsent(page: Page) {
  await page.getByLabel(/I agree to the Terms of Use/).check();
  await page.getByLabel(/I have read the Privacy Notice/).check();
}

test.describe('protected routes', () => {
  test('an anonymous visitor is redirected to sign in', async ({ page }) => {
    await page.goto('/overview');
    await expect(page).toHaveURL(/\/login\?next=%2Foverview/);
  });

  test('the redirect survives the round trip back to the target', async ({
    page,
  }) => {
    await page.goto('/grades');
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // The address is not registered, so sign-in fails. The point is that the
    // form still renders and no workspace content leaked into the response.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Gradebook/i })).toHaveCount(0);
  });

  test('the workspace never renders for an anonymous visitor', async ({
    page,
  }) => {
    await page.goto('/overview');
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
  });
});

test.describe('registration', () => {
  test('creates an account and reaches onboarding', async ({ page }) => {
    await page.goto('/register');

    await page.getByLabel(/Full name/).fill('Maya Okonkwo');
    await page.getByLabel(/^Email/).fill(uniqueEmail());
    await page.getByLabel(/Password/).fill(PASSWORD);
    await acceptConsent(page);

    await page.getByRole('button', { name: /Create workspace/i }).click();

    /*
      The suite runs against `LIKO_DATA_MODE=fixtures`. A fixture adapter cannot
      send a confirmation email, so gating an account behind a verification step
      that can never be completed would reproduce the exact dead end this
      replaces: `proxy.ts` refuses unverified sessions and /verify-email had no
      way to flip the flag. Fixture accounts are therefore verified at signup.

      Under `LIKO_DATA_MODE=supabase` the same form routes to /verify-email
      instead, and /auth/callback completes verification from the emailed link.

      A new teacher then lands on /welcome rather than the workspace. An empty
      overview answers none of the questions a teacher has, and every later
      screen has to guess. The wizard asks them once.
    */
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole('heading', { name: 'What do you teach?' })).toBeVisible();
    // `main`, not the workspace nav: both the desktop sidebar and the mobile
    // tab bar are labelled "Workspace", and only one of them renders at any
    // given width, so that locator is ambiguous.
    await expect(page.locator('#workspace-main')).toBeVisible();
  });

  test('reports field errors without a full page error', async ({ page }) => {
    await page.goto('/register');

    await page.getByLabel(/Full name/).fill('M');
    await page.getByLabel(/^Email/).fill('not-an-email');
    await page.getByLabel(/Password/).fill('weak');

    await page.getByRole('button', { name: /Create workspace/i }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test('the password checklist is visible before submitting', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByText('At least 10 characters')).toBeVisible();
    await expect(page.getByText('A lowercase letter')).toBeVisible();
    await expect(page.getByText('An uppercase letter')).toBeVisible();
    await expect(page.getByText('A number')).toBeVisible();
  });
});

test.describe('sign in', () => {
  test('returns one message for a wrong password and for an unknown account', async ({
    page,
  }) => {
    const email = uniqueEmail();

    await page.goto('/register');
    await page.getByLabel(/Full name/).fill('Maya Okonkwo');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(PASSWORD);
    await acceptConsent(page);
    await page.getByRole('button', { name: /Create workspace/i }).click();
    // Fixture mode verifies at signup, so registration goes straight through to
    // onboarding rather than the verification dead end.
    await expect(page).toHaveURL(/\/welcome/);

    // Registering leaves a session, and the proxy redirects a signed-in
    // visitor away from /login. Sign out before exercising the sign-in form.
    await page.request.post('/api/auth/sign-out');

    // Wrong password against a real account.
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Wrong-Pass-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const wrongPassword = await page
      .locator('main')
      .getByRole('alert')
      .first()
      .innerText();

    // Unknown account, with a well-formed password.
    await page.goto('/login');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const unknownAccount = await page
      .locator('main')
      .getByRole('alert')
      .first()
      .innerText();

    // Identical responses, so the form cannot be used to enumerate accounts.
    expect(wrongPassword).toBe(unknownAccount);
    expect(wrongPassword).toContain('That email or password is not right.');
  });
});

test.describe('session storage', () => {
  test('no token is written to localStorage or sessionStorage', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForLoadState('networkidle');

    const stored = await page.evaluate(() => ({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    }));

    const serialised = JSON.stringify(stored).toLowerCase();
    expect(serialised).not.toContain('token');
    expect(serialised).not.toContain('liko_session');
    expect(serialised).not.toContain('jwt');
  });
});
