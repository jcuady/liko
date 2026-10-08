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
  reporter: [['list']],
  /*
   * Sign-in costs roughly half a second because the password hash is deliberately
   * memory hard. With one worker per core, a run that signs in for every spec
   * stacks enough of those behind each other to blow the default 10s assertion
   * timeout and report a hung form as a failure. The bound below keeps the burst
   * small, and the longer assertion timeout absorbs a legitimately slow sign-in
   * without hiding a real hang.
   */
  workers: process.env.CI ? 1 : 4,
  timeout: 45_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL,
    /*
     * The consent cookie is pre-set for every test. The banner it suppresses is a
     * fixed overlay at the foot of every public page, so leaving it unanswered
     * would have it intercept clicks in specs written before it existed. The
     * specs that test the banner clear the cookie themselves.
     */
    storageState: './e2e/storage-state.json',
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
      /*
       * The suite signs in as the same demo accounts dozens of times from one
       * address, which trips the credential limiter that protects production.
       * Throttling is a deployed control, so it is lifted for this server only.
       *
       * `next start` runs with NODE_ENV=production, and the limiter ignores a
       * bare bypass flag in production on purpose. That is why BOTH variables are
       * set here: the combination is the deliberate two-key override the limiter
       * documents, not a re-opening of the single-flag hole.
       */
      LIKO_RATE_LIMIT_DISABLED: 'true',
      LIKO_E2E: 'true',
    },
  },
});