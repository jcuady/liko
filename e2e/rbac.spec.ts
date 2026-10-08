import { expect, test, type Page } from '@playwright/test';

/**
 * The RBAC matrix, exercised through the real login form.
 *
 * WHY THIS FILE EXISTS. The matrix in `src/lib/auth/rbac.ts` had four roles and
 * eleven permissions, but no account could reach three of them: the fixture user
 * store started empty, so the only way in was to register, and registering
 * always produced an `instructor`. The `student` and `guardian` columns were
 * therefore unreachable except by hand-editing a session cookie, which is not a
 * test. `store.ts` now seeds the same demo accounts `scripts/seed.mjs` creates,
 * so every role is reachable and this file pins the behaviour down.
 *
 * Two layers are in play and this suite covers the user-visible result of both:
 * `src/proxy.ts` rewrites a refused request to `/forbidden` before render, and
 * `requirePagePermission` redirects from inside the page if the proxy is ever
 * bypassed. Either way the outcome asserted here is the same, which is the
 * point: a refusal must never surface as a crashed page.
 */

const PASSWORD = 'LikoDemo!2026';

const ACCOUNTS = {
  instructor: { email: 'maya@liko.test', landing: '/overview' },
  admin: { email: 'dev@liko.test', landing: '/overview' },
  student: { email: 'student@liko.test', landing: '/classes' },
  guardian: { email: 'guardian@liko.test', landing: '/classes' },
} as const;

type RoleName = keyof typeof ACCOUNTS;

/**
 * Routes and who may open them, mirroring `ROUTE_PERMISSIONS`.
 *
 * `can()` treats an ownership scope as permitted and defers the ownership check
 * to the record, so a student and a guardian both pass `class:read`, `grade:read`
 * and `history:read`. The four routes below are the ones neither role holds.
 */
const ROUTES: { path: string; blocked: RoleName[] }[] = [
  { path: '/overview', blocked: ['student', 'guardian'] },
  { path: '/classes', blocked: [] },
  { path: '/grades', blocked: [] },
  { path: '/history', blocked: [] },
  { path: '/settings/profile', blocked: [] },
  { path: '/attendance', blocked: ['student', 'guardian'] },
  { path: '/plan', blocked: ['student', 'guardian'] },
  { path: '/assess', blocked: ['student', 'guardian'] },
  // Administration is gated on `org:manage`, which only the admin role holds.
  // Adding it here is what proves the nav filter and the route gate agree: a
  // teacher who cannot see the link must also be refused the URL.
  { path: '/admin', blocked: ['instructor', 'student', 'guardian'] },
];

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait on the navigation rather than asserting immediately: the password hash
  // is memory hard, so a sign-in is legitimately slow and the form stays in its
  // pending state while the server verifies.
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

test.describe('demo accounts', () => {
  test('every documented test user can sign in', async ({ page }) => {
    for (const account of Object.values(ACCOUNTS)) {
      await signIn(page, account.email);
      await expect(page.locator('#workspace-main')).toBeVisible();
      await page.request.post('/api/auth/sign-out');
    }
  });

  test('a wrong password is refused for a demo account', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('maya@liko.test');
    await page.getByLabel('Password').fill('Not-The-Demo-Password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert').first()).toContainText(
      'That email or password is not right.',
    );
    await expect(page.locator('#workspace-main')).toHaveCount(0);
  });
});

test.describe('landing destination', () => {
  test('staff land on the overview', async ({ page }) => {
    await signIn(page, ACCOUNTS.instructor.email);
    await expect(page).toHaveURL(/\/overview/);
  });

  /*
    `/overview` is gated on `analytics:read`, which only instructors and admins
    hold. Sending a student or guardian there showed them the forbidden screen as
    the very first page after signing in, which reads as a broken product rather
    than as a permission boundary.
  */
  test('a student lands on the one workspace route their role opens', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.student.email);
    await expect(page).toHaveURL(/\/classes/);
    await expect(page.locator('#workspace-main')).toBeVisible();
  });

  test('a guardian lands on the one workspace route their role opens', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.guardian.email);
    await expect(page).toHaveURL(/\/classes/);
    await expect(page.locator('#workspace-main')).toBeVisible();
  });
});

test.describe('route permissions', () => {
  for (const role of Object.keys(ACCOUNTS) as RoleName[]) {
    test(`${role} gets exactly the routes the matrix grants`, async ({ page }) => {
      await signIn(page, ACCOUNTS[role].email);
      await expect(page.locator('#workspace-main')).toBeVisible();

      for (const route of ROUTES) {
        await page.goto(route.path);

        if (route.blocked.includes(role)) {
          // An explicit refusal. The proxy rewrites to /forbidden, so the URL is
          // still the requested one and the assertion is on the rendered page.
          await expect(
            page.getByRole('heading', { name: 'You do not have access to this area' }),
          ).toBeVisible();
        } else {
          await expect(
            page.getByRole('heading', { name: 'You do not have access to this area' }),
          ).toHaveCount(0);
          // The shell rendered, which also proves the page did not throw into the
          // error boundary on its way past the inner gate.
          await expect(page.locator('#workspace-main')).toBeVisible();
        }
      }
    });
  }
});

test.describe('refusals are explicit', () => {
  /*
    `requirePermission` throws on purpose, because a server action must report a
    failure rather than silently bounce the user. A page calling it directly
    inherited that failure mode and unwound into the error boundary, so a denied
    role met a crashed page instead of `/forbidden`.
  */
  test('a refused route renders the refusal, never the error boundary', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.student.email);
    await expect(page).toHaveURL(/\/classes/);

    await page.goto('/attendance');

    await expect(
      page.getByRole('heading', { name: 'You do not have access to this area' }),
    ).toBeVisible();
    await expect(page.getByText(/Application error/i)).toHaveCount(0);
    await expect(page.locator('#workspace-main')).toBeVisible();
  });

  test('every workspace route refuses a student without crashing', async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email);
    await expect(page).toHaveURL(/\/classes/);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    for (const route of ROUTES) {
      await page.goto(route.path);
      await expect(page.locator('#workspace-main')).toBeVisible();
    }

    expect(errors).toEqual([]);
  });
});

test.describe('no route crashes', () => {
  /*
    The single most valuable test in the file.

    `/settings/profile` returned 500 for every signed-in user because
    `EmptyState` lived in a `'use client'` module and its `icon` prop is a
    component reference, which React refuses to pass across the boundary.
    `/history` had the same shape of defect via `SEVERITY_OPTIONS`. Neither was
    visible to any earlier test, because nothing had ever walked every route with
    a session and looked at what came back.
  */
  for (const role of ['instructor', 'admin'] as const) {
    test(`${role} can open every route they are granted`, async ({ page }) => {
      await signIn(page, ACCOUNTS[role].email);
      await expect(page.locator('#workspace-main')).toBeVisible();

      const crashes: string[] = [];
      page.on('pageerror', (error) => crashes.push(error.message));

      for (const route of ROUTES.filter((item) => !item.blocked.includes(role))) {
        const response = await page.goto(route.path);

        expect(response?.status(), `${route.path} returned an error status`).toBeLessThan(400);
        await expect(
          page.getByRole('heading', { name: 'Something went wrong' }),
          `${route.path} rendered the error boundary`,
        ).toHaveCount(0);
        await expect(page.locator('#workspace-main'), `${route.path} has no shell`).toBeVisible();
      }

      expect(crashes).toEqual([]);
    });
  }
});

test.describe('ghost routes', () => {
  /*
    `/analytics` was listed in both `ROUTE_PERMISSIONS` and `PROTECTED_PREFIXES`
    while no such page existed, so the proxy admitted the request and the user
    met a 404 from a URL the app's own config claimed to serve. The analytics
    surface lives inside `/overview`.
  */
  test('the removed analytics route is not advertised by the permission map', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.instructor.email);
    await expect(page.locator('#workspace-main')).toBeVisible();

    await page.goto('/analytics');
    await expect(
      page.getByRole('heading', { name: 'That page does not exist' }),
    ).toBeVisible();
  });
});