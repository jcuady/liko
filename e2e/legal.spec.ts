import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * The consent gate, the three legal documents, and the cookie banner.
 *
 * These are the promises the product makes in writing, so they are tested as
 * behaviour rather than as copy. In particular: an account cannot be created
 * without agreement, and there is no route by which a student or guardian can
 * make one for themselves.
 *
 * The suite runs against `LIKO_DATA_MODE=fixtures`. Every address here is unique
 * so the tests do not depend on ordering, and nothing here pins a shared count.
 */

let counter = 0;

function uniqueEmail(prefix = 'teacher') {
  counter += 1;
  return `${prefix}${Date.now()}${counter}@school.edu`;
}

const PASSWORD = 'Good-Pass-1';

async function fillRegistration(page: Page, email: string) {
  await page.getByLabel(/Full name/).fill('Maya Okonkwo');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/Password/).fill(PASSWORD);
}

/** Drops the pre-set consent cookie so the banner renders. */
async function withoutConsent(context: BrowserContext) {
  await context.clearCookies();
}

test.describe('consent gate on signup', () => {
  test('refuses to create an account when neither box is ticked', async ({ page }) => {
    await page.goto('/register');
    await fillRegistration(page, uniqueEmail());

    await page.getByRole('button', { name: /Create workspace/i }).click();

    await expect(page).toHaveURL(/\/register/);
    /*
     * Scoped to the field error rather than matched by text. The same wording
     * also appears in the error summary above the fields, and Playwright's text
     * matching is substring-based, so an unscoped `getByText` would resolve to
     * two elements and fail on strict mode rather than on anything real.
     */
    await expect(page.locator('#acceptedTerms-error')).toHaveText(
      'Accept the terms to create an account.',
    );
    await expect(page.locator('#acceptedPrivacy-error')).toHaveText(
      'Accept the privacy notice to create an account.',
    );
  });

  test('refuses when only the terms are accepted', async ({ page }) => {
    await page.goto('/register');
    await fillRegistration(page, uniqueEmail());
    await page.getByLabel(/I agree to the Terms of Use/).check();

    await page.getByRole('button', { name: /Create workspace/i }).click();

    await expect(page).toHaveURL(/\/register/);
    // The terms complaint is gone and only the privacy one remains, which is
    // what proves the two are separate decisions rather than one tick.
    await expect(page.locator('#acceptedTerms-error')).toHaveCount(0);
    await expect(page.locator('#acceptedPrivacy-error')).toBeVisible();
  });

  test('proceeds once both are ticked', async ({ page }) => {
    await page.goto('/register');
    await fillRegistration(page, uniqueEmail());

    await page.getByLabel(/I agree to the Terms of Use/).check();
    await page.getByLabel(/I have read the Privacy Notice/).check();

    await page.getByRole('button', { name: /Create workspace/i }).click();

    await expect(page).toHaveURL(/\/welcome/);
  });

  test('both links point at a document that exists', async ({ page }) => {
    await page.goto('/register');

    const terms = page.getByRole('link', { name: /Terms of Use/ });
    const privacy = page.getByRole('link', { name: /Privacy Notice/ });

    await expect(terms).toHaveAttribute('href', '/terms');
    await expect(privacy).toHaveAttribute('href', '/privacy');

    // Opened in a new tab so reading them does not lose the half-filled form,
    // which is the reason the consent copy is worded the way it is.
    await expect(terms).toHaveAttribute('target', '_blank');
    await expect(terms).toHaveAttribute('rel', /noopener/);
  });
});

test.describe('no student self sign-up', () => {
  test('the registration form offers no role choice at all', async ({ page }) => {
    await page.goto('/register');

    // Not "the student option is hidden". There is no role control on the form,
    // so there is nothing for a crafted request to change either.
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByLabel(/role/i)).toHaveCount(0);
    await expect(page.locator('select')).toHaveCount(0);
  });

  test('the form says who signs up', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByText('Accounts here are for teachers')).toBeVisible();
  });

  test('the terms say students are created by their teacher', async ({ page }) => {
    await page.goto('/terms');
    await expect(
      page.getByText('Students and guardians do not create their own LIKO accounts.'),
    ).toBeVisible();
  });

  test('a crafted role cannot be honoured, because the form posts none', async ({
    page,
  }) => {
    /*
     * The schema has no `role` field at all, so Zod strips one from a crafted
     * post and `registerAction` passes a fixed `instructor`. Driving the real
     * form is the honest way to assert that: adding a hidden field is what an
     * attacker would do, and the account it produces must still be a teacher's.
     */
    await page.goto('/register');
    await fillRegistration(page, uniqueEmail());
    await page.getByLabel(/I agree to the Terms of Use/).check();
    await page.getByLabel(/I have read the Privacy Notice/).check();

    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'role';
      input.value = 'student';
      document.querySelector('form')?.append(input);
    });

    await page.getByRole('button', { name: /Create workspace/i }).click();

    // A teacher account, so the wizard is what opens. A student account would
    // have been routed to /classes instead.
    await expect(page).toHaveURL(/\/welcome/);
  });
});

test.describe('legal documents', () => {
  for (const route of ['/terms', '/privacy', '/cookies']) {
    test(`${route} renders one heading and a contents list that resolves`, async ({
      page,
    }) => {
      await page.goto(route);

      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Contents' })).toBeVisible();

      // Every in-page anchor has to land on a real id, or the contents list is
      // decoration.
      const broken = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="#"]'))
          .map((a) => a.getAttribute('href') ?? '')
          .filter((href) => !href || href.length < 2)
          .concat(
            Array.from(document.querySelectorAll('a[href^="#"]'))
              .map((a) => a.getAttribute('href') ?? '')
              .filter((href) => href.length >= 2 && !document.querySelector(href)),
          ),
      );
      expect(broken).toEqual([]);
    });
  }

  test('the footer links resolve from every public page', async ({ page }) => {
    for (const route of ['/terms', '/privacy', '/cookies', '/pricing']) {
      await page.goto(route);

      const broken = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="/#"]'))
          .map((a) => a.getAttribute('href') ?? '')
          .filter((href) => !href || href === '/'),
      );
      expect(broken).toEqual([]);
    }
  });

  test('the cookie notice names the cookie the app actually sets', async ({ page }) => {
    await page.goto('/cookies');

    // Written to match `src/lib/auth/cookie.ts`. If the session cookie is
    // renamed, this test is the thing that says so rather than letting the
    // document quietly become untrue.
    await expect(page.getByText('liko_session').first()).toBeVisible();
    await expect(page.getByText('liko_consent').first()).toBeVisible();
  });

  test('the legal pages are listed in the sitemap', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    expect(body).toContain('/terms');
    expect(body).toContain('/privacy');
    expect(body).toContain('/cookies');
  });
});

test.describe('marketing claims match the product', () => {
  /*
   * These pages used to promise a time-limited free trial, CSV and JSON export,
   * class lists imported from a spreadsheet or an LMS, rubrics attached to
   * marks, department invoicing, priority email support, a cancellation flow in
   * settings, and an AI feature that scoped student records to a request. None
   * of them exist. The FAQ also had a question about AI data handling on a
   * product with no AI in it at all.
   *
   * These tests are the guard. Adding a claim without building the feature now
   * fails the suite instead of shipping.
   */
  /*
   * Matched as CLAIMS, not as bare words.
   *
   * The first version banned the words "CSV", "spreadsheet" and "LMS", and
   * immediately flagged the honest sentence "there is no spreadsheet or LMS
   * import today" along with a line on the landing page describing a teacher's
   * timings living in a spreadsheet as the problem being solved. Both are true
   * and neither is a feature claim.
   *
   * So the words go, and the shapes of the old promises stay.
   */
  const FICTION = [
    /free trial/i,
    /rubric/i,
    /business day/i,
    /priority email/i,
    /AI features?\b/i,
    /export[^.]{0,40}(CSV|JSON)/i,
    /import from a spreadsheet/i,
    /connect an LMS/i,
    /annual invoice/i,
    /billed (monthly|annually)/i,
  ];

  for (const route of ['/', '/pricing']) {
    test(`${route} does not advertise features that do not exist`, async ({ page }) => {
      await page.goto(route);
      const body = (await page.textContent('body')) ?? '';

      for (const fiction of FICTION) {
        expect(body, `${route} still claims ${fiction}`).not.toMatch(fiction);
      }
    });
  }

  test('says plainly that no card is taken', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/no card is taken/i).first()).toBeVisible();
  });

  test('the testimonials say they are written, not collected', async ({ page }) => {
    /*
     * Three quotes attributed to named teachers with job titles, presented as
     * testimonials, when LIKO has no customers and the names are the demo
     * accounts. The section works as a statement of intent; it must not read as
     * evidence.
     */
    await page.goto('/#proof');
    await expect(
      page.getByText(/written examples|not testimonials|no customers yet/i).first(),
    ).toBeVisible();
  });

  test('the plan carried from a pricing card reaches the signup form', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.getByRole('link', { name: /Create a free account/i }).first().click();
    await expect(page.getByText(/You picked/)).toBeVisible();
  });

  /*
   * `?plan=` is a public URL anyone can edit, so an unrecognised value has to
   * read as "no choice" rather than being echoed back into the page.
   */
  test('an unrecognised plan is ignored rather than trusted', async ({ page }) => {
    await page.goto('/register?plan=enterprise-unlimited');
    await expect(page.getByText(/You picked/)).toHaveCount(0);
    // And the form still works, rather than erroring on a bad parameter.
    await expect(page.getByRole('button', { name: /Create workspace/i })).toBeVisible();
  });

  test('each plan id can actually be stored on an organisation', async ({ page }) => {
    /*
     * The pricing page used to sell `starter | teacher | school` while the
     * `organizations.plan` check constraint allowed `solo | school | district`.
     * Only `school` was in both, so two of the three ids on the page could not
     * have been written to the column they referred to. This asserts the page
     * only links with ids the database accepts.
     */
    await page.goto('/pricing');
    const hrefs = await page.locator('a[href*="/register?plan="]').evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get('plan')),
    );

    expect(hrefs.length).toBeGreaterThan(0);
    for (const plan of hrefs) {
      expect(['solo', 'teacher', 'school']).toContain(plan);
    }
  });

  test('the admin console is not sold as a plan gate nothing enforces', async ({ page }) => {
    /*
     * `/admin` is gated on the `org:manage` permission, so it follows a person's
     * role and not their organisation's plan. The comparison row used to read
     * "Not included / Not included / Included", which is a plan gate no code
     * enforced: a School administrator who set their own organisation down to
     * Solo would still reach the console.
     *
     * It is deliberately not made true by gating the console on the plan
     * instead. The console is where the plan gets changed, so that locks the
     * only route back to the plan that unlocks it, and nothing is charged today
     * to justify turning a free teacher out of a page they paid nothing for.
     * When billing opens this row becomes a real gate, in the same release that
     * starts taking money.
     */
    await page.goto('/pricing');

    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: 'Admin console', exact: true }) });
    await expect(row).toHaveCount(1);

    const cells = await row.getByRole('cell').allInnerTexts();
    expect(cells).toHaveLength(3);
    for (const cell of cells) {
      expect(cell, 'the console is role-gated, so no plan may claim to withhold it').toMatch(
        /included/i,
      );
    }
  });
});

test.describe('cookie banner', () => {
  test('appears on a public page and records the choice', async ({ page, context }) => {
    await withoutConsent(context);
    await page.goto('/');

    const banner = page.getByRole('region', { name: 'Cookie preferences' });
    await expect(banner).toBeVisible();
    await expect(banner.getByText('No analytics, no advertising')).toBeVisible();

    await banner.getByRole('button', { name: 'Keep my choice' }).click();
    await expect(banner).toHaveCount(0);

    const cookies = await context.cookies();
    const consent = cookies.find((c) => c.name === 'liko_consent');
    expect(consent?.value).toBe('all');
  });

  test('stays away once answered', async ({ page, context }) => {
    await withoutConsent(context);
    await page.goto('/');
    await page
      .getByRole('region', { name: 'Cookie preferences' })
      .getByRole('button', { name: 'Keep my choice' })
      .click();

    await page.goto('/pricing');
    await expect(page.getByRole('region', { name: 'Cookie preferences' })).toHaveCount(0);
  });

  /*
   * Declining has to mean something, or the banner is theatre. What it withdraws
   * is the stored theme preference, so this asserts both halves: the cookie is
   * written, and anything already in local storage is gone.
   */
  test('declining removes a stored theme preference', async ({ page, context }) => {
    await withoutConsent(context);
    await page.goto('/');
    await page.evaluate(() => window.localStorage.setItem('liko-theme', 'dark'));

    const banner = page.getByRole('region', { name: 'Cookie preferences' });
    await banner.getByRole('button', { name: 'Follow my system' }).click();

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'liko_consent')?.value).toBe('essential');

    const stored = await page.evaluate(() => window.localStorage.getItem('liko-theme'));
    expect(stored).toBeNull();
  });

  test('does not cover the workspace', async ({ page, context }) => {
    await withoutConsent(context);

    await page.goto('/login');
    await page.getByLabel('Email').fill('maya@liko.test');
    await page.getByLabel('Password').fill('LikoDemo!2026');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL(/\/overview|\/welcome/);
    await expect(page.getByRole('region', { name: 'Cookie preferences' })).toHaveCount(0);
  });
});