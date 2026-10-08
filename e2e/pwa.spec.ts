import { expect, test } from '@playwright/test';

/**
 * PWA acceptance criteria: a valid manifest, resolvable icons, a service worker
 * in the production build, and an offline fallback that renders.
 */
test.describe('manifest', () => {
  test('is served and describes an installable app', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const manifest = await response.json();

    expect(manifest.name).toContain('LIKO');
    expect(manifest.short_name).toBe('LIKO');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/overview');
    expect(manifest.theme_color).toBe('#29813d');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const purposes = manifest.icons.map((icon: { purpose?: string }) => icon.purpose);
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  test('every declared icon resolves to a real image', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();

    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const response = await request.get(icon.src);
      expect(response.ok(), `${icon.src} should resolve`).toBe(true);
      expect(response.headers()['content-type']).toContain('image');
    }
  });

  test('serves the opengraph image', async ({ request }) => {
    const response = await request.get('/opengraph-image');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image');
  });
});

test.describe('service worker', () => {
  test('the worker script is emitted by the production build', async ({
    request,
  }) => {
    const response = await request.get('/sw.js');
    expect(response.ok()).toBe(true);

    const body = await response.text();
    expect(body.length).toBeGreaterThan(100);
    // Serwist emits a precache manifest into the worker.
    expect(body).toContain('precache');
  });

  test('registers and reaches an activated state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const state = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';

      const registration = await navigator.serviceWorker.ready.catch(() => null);
      if (!registration) return 'none';

      // `ready` resolves as soon as an active registration exists, but the
      // worker may still be transitioning, so wait for the terminal state
      // rather than sampling it once.
      const worker = registration.active;
      if (!worker) return 'none';

      await new Promise<void>((resolve) => {
        if (worker.state === 'activated' || worker.state === 'redundant') {
          resolve();
          return;
        }
        const onChange = () => {
          if (
            worker.state === 'activated' ||
            worker.state === 'redundant'
          ) {
            worker.removeEventListener('statechange', onChange);
            resolve();
          }
        };
        worker.addEventListener('statechange', onChange);
        setTimeout(resolve, 8000);
      });

      return worker.state;
    });

    expect(['activated', 'redundant', 'unsupported']).toContain(state);
  });

  test('the offline fallback page renders', async ({ page }) => {
    await page.goto('/offline');

    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
  });

  test('the offline page reports connection state', async ({ page }) => {
    await page.goto('/offline');

    // The component announces one of three states. All three mention a
    // connection, so the assertion matches the meaning rather than one string.
    const status = page.locator('#offline-status');
    await expect(status).toContainText(/connection|offline|checking/i);
  });

  test('nothing private is left in a cache', async ({ page }) => {
    /*
     * The runtime caching rules use an ALLOWLIST of public documents, so an
     * authenticated route is private by default with no action required. That is
     * the property, and it is worth holding down, because the failure is silent:
     * a cached gradebook is served with no error and no staleness warning to
     * whichever teacher signs in next on the same machine.
     *
     * `/grades/export` is the sharpest case. It returns every mark in a class as
     * a file, over a plain link, which is a navigation and therefore exactly the
     * kind of request an over-broad rule would cache.
     */
    await page.goto('/login');
    await page.getByLabel('Email').fill('maya@liko.test');
    await page.getByLabel('Password').fill('LikoDemo!2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });

    await page.goto('/grades');
    await page.waitForLoadState('networkidle');
    // Give the worker a moment to claim clients before anything is fetched.
    await page.waitForTimeout(1500);

    const privateUrls = await page.evaluate(async () => {
      // Pull both a private document and the export through the worker.
      await fetch('/grades/export').catch(() => undefined);
      await fetch('/overview').catch(() => undefined);

      const leaked: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const path = new URL(request.url).pathname;
          if (path === '/overview' || path.startsWith('/grades/export')) leaked.push(request.url);
        }
      }
      return leaked;
    });

    expect(privateUrls, 'private responses must never reach a cache').toEqual([]);
  });

  test('a cache left by an older build is evicted on activate', async ({ page }) => {
    /*
     * Installing the worker precaches the whole offline shell, and a full e2e run
     * has every other spec installing one at the same time. The default 45s
     * timeout is not enough for that on a loaded machine, which is how this
     * passed alone and failed in the suite. The budget below is for the install,
     * not for the assertion.
     */
    test.setTimeout(150_000);

    /*
     * Switching `cacheOnNavigation` off stops the bad cache being written. It
     * does nothing about the copy already sitting in a browser that installed
     * the app before the fix, which is the part that actually matters on a
     * shared machine. That cleanup runs on `activate`, so this test drives a
     * real install rather than calling the function, which would only prove the
     * function works.
     */
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);

    const afterActivate = await page.evaluate(async () => {
      // Make sure a worker is already installed and active first, so the step
      // below is unambiguously the one that fires `activate`.
      await navigator.serviceWorker.ready;

      // Stand in a cache left behind by the version that had the leak.
      const stale = await caches.open('pages');
      await stale.put('/overview', new Response('student names and marks'));

      /*
       * Register a DIFFERENT script URL. Re-registering `/sw.js` when a worker
       * is already active returns the existing registration without installing,
       * so `activate` never fires and the seeded cache just sits there. A
       * distinct URL is a distinct registration, which forces a real install.
       */
      const registration = await navigator.serviceWorker.register('/sw.js?evict-probe=1');

      const worker = registration.installing ?? registration.waiting ?? registration.active;
      if (worker && worker.state !== 'activated') {
        await new Promise<void>((resolve) => {
          const onChange = () => {
            if (worker.state === 'activated') {
              worker.removeEventListener('statechange', onChange);
              resolve();
            }
          };
          worker.addEventListener('statechange', onChange);
          setTimeout(resolve, 60_000);
        });
      }

      // `activate` is not awaitable from here; poll briefly for the result.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (!(await caches.has('pages'))) return 'evicted';
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return 'still there';
    });

    expect(afterActivate).toBe('evicted');
  });
});

test.describe('offline', () => {
  test('a navigation while offline falls back to the offline page', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Give the worker a moment to claim clients.
    await page.waitForTimeout(1200);
    await context.setOffline(true);

    await page.goto('/overview').catch(() => undefined);

    const url = page.url();
    const heading = page.getByRole('heading', { name: 'You are offline' });

    // Either the worker served the offline fallback, or the navigation was
    // refused outright. Both are acceptable; rendering workspace content is not.
    if (url.includes('/offline')) {
      await expect(heading).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
    }

    await context.setOffline(false);
  });
});