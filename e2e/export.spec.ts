import { expect, test, type Page } from '@playwright/test';

/**
 * The gradebook CSV export.
 *
 * An export endpoint is the easiest place in a product to leak somebody else's
 * data, because it is a machine readable view of a whole class and it is
 * reachable by URL. So the tests here are weighted towards what it refuses to
 * hand over rather than towards the shape of the file, which the unit tests in
 * `src/lib/export/csv.test.ts` already pin down precisely.
 *
 * The route resolves the class from what `listClasses` returns for the signed-in
 * user, never from the id in the query string on its own. That is the property
 * worth defending, and it is asserted here from the outside: an id that belongs
 * to nobody this teacher can read produces a 404 and no marks.
 *
 * REQUESTS ARE MADE FROM INSIDE THE PAGE, not with `page.request`. The session
 * cookie is issued with the secure flag, and Playwright's API request context
 * does not apply the localhost secure-context exception that the browser does.
 * Using it therefore looks like an unauthenticated request even while signed in,
 * and every test here fails against a route that is working perfectly.
 */

const PASSWORD = 'LikoDemo!2026';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

type Fetched = { status: number; contentType: string; disposition: string | null; body: string };

async function fetchExport(page: Page, url: string): Promise<Fetched> {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { redirect: 'follow' });
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      disposition: response.headers.get('content-disposition'),
      body: await response.text(),
    };
  }, url);
}

test.describe('gradebook export', () => {
  test('an anonymous request gets no file', async ({ page }) => {
    /*
     * The proxy answers before the handler runs, by redirecting to the sign-in
     * page exactly as it does for every other dashboard route. So the assertion
     * is not a particular status code, it is that no spreadsheet comes back.
     */
    // A document has to exist before a relative URL can be resolved.
    await page.goto('/login');

    const response = await page.evaluate(async () => {
      const res = await fetch('/grades/export', { redirect: 'follow' });
      return { contentType: res.headers.get('content-type') ?? '', body: await res.text() };
    });

    expect(response.contentType).not.toContain('text/csv');
    expect(response.body).not.toContain('Weighted total');
  });

  test('returns a spreadsheet attachment for a teacher', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    const response = await fetchExport(page, '/grades/export');

    expect(response.status).toBe(200);
    expect(response.contentType).toContain('text/csv');
    expect(response.disposition).toContain('attachment');

    const lines = response.body.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toContain('Student');
    expect(lines[0]).toContain('Weighted total');
    // The seeded class has students, so there is at least one data row.
    expect(lines.length).toBeGreaterThan(1);
  });

  test('a class id this teacher cannot read exports nothing', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    const response = await fetchExport(page, '/grades/export?class=cls_someone_elses');

    expect(response.status).toBe(404);
    expect(response.body).not.toContain('Student');
    expect(response.body).not.toContain('Weighted total');
  });

  test('the gradebook offers the download for the selected class', async ({ page }) => {
    await signIn(page, 'maya@liko.test');
    await page.goto('/grades');

    const link = page.getByRole('link', { name: 'Export CSV' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/grades\/export\?class=/);
  });
});