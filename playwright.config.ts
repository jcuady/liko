import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright drives a production build, because the service worker and the
 * cache strategies under test do not exist in dev (the worker is disabled there
 * so HMR is not shadowed by a stale shell).
 */
const PORT = Number(process.env.PORT ?? 3311);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: `pnpm run build && pnpm run start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
    /*
     * `next start` runs with NODE_ENV=production, where the session signer
     * refuses to fall back to a development key. The e2e suite therefore
     * supplies its own throwaway secret rather than depending on a developer's
     * local `.env.local`.
     */
    env: {
      LIKO_SESSION_SECRET:
        process.env.LIKO_SESSION_SECRET ??
        'e2e-only-secret-0000000000000000000000000000',
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
  },
});