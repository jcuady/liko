import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The email-verification bypass must not work from one stray variable.
 *
 * This mirrors `rate-limit.kill-switch.test.ts` deliberately. That file exists
 * because a single `LIKO_RATE_LIMIT_DISABLED` in a deploy dashboard is enough to
 * turn off every rate limit, and nobody reads the diff that sets one. The same
 * reasoning applies here and with more at stake: one stray variable would mean
 * anybody can register using an address they do not own.
 *
 * So production takes two variables, and this file is what stops the first one
 * quietly becoming enough.
 */

type Env = {
  NODE_ENV?: string;
  LIKO_SKIP_EMAIL_VERIFICATION?: string;
  LIKO_ALLOW_UNVERIFIED_SIGNUP?: string;
};

async function loadFlag(env: Env) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) vi.stubEnv(key, value);
  }
  return await import('./email-verification');
}

/** Installed after the module loads and before the flag is read. */
function captureWarnings() {
  const messages: string[] = [];
  vi.spyOn(process, 'emitWarning').mockImplementation((message: string | Error) => {
    messages.push(String(message));
  });
  return messages;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('LIKO_SKIP_EMAIL_VERIFICATION', () => {
  it('is ignored in production on its own, so verification stays on', async () => {
    const { emailVerificationSkipped } = await loadFlag({
      NODE_ENV: 'production',
      LIKO_SKIP_EMAIL_VERIFICATION: 'true',
    });

    expect(emailVerificationSkipped()).toBe(false);
  });

  it('works in production only alongside LIKO_ALLOW_UNVERIFIED_SIGNUP', async () => {
    const { emailVerificationSkipped } = await loadFlag({
      NODE_ENV: 'production',
      LIKO_SKIP_EMAIL_VERIFICATION: 'true',
      LIKO_ALLOW_UNVERIFIED_SIGNUP: 'true',
    });

    expect(emailVerificationSkipped()).toBe(true);
  });

  it('does not let the second variable work without the first', async () => {
    const { emailVerificationSkipped } = await loadFlag({
      NODE_ENV: 'production',
      LIKO_ALLOW_UNVERIFIED_SIGNUP: 'true',
    });

    expect(emailVerificationSkipped()).toBe(false);
  });

  it('works in development on one variable, which is where it is useful', async () => {
    const { emailVerificationSkipped } = await loadFlag({
      NODE_ENV: 'development',
      LIKO_SKIP_EMAIL_VERIFICATION: 'true',
    });

    expect(emailVerificationSkipped()).toBe(true);
  });

  it('leaves verification on when the flag is unset', async () => {
    const { emailVerificationSkipped } = await loadFlag({ NODE_ENV: 'production' });

    expect(emailVerificationSkipped()).toBe(false);
  });

  /*
   * `=== 'true'` and nothing looser. A flag that reads "1", "yes" or "TRUE" as
   * true is a flag that turns on by accident, and this one controls who may
   * create an account under a name of their choosing.
   */
  it('ignores anything that is not exactly the string true', async () => {
    for (const value of ['false', '1', 'yes', 'TRUE', 'on']) {
      const { emailVerificationSkipped } = await loadFlag({
        NODE_ENV: 'production',
        LIKO_SKIP_EMAIL_VERIFICATION: value,
        LIKO_ALLOW_UNVERIFIED_SIGNUP: 'true',
      });

      expect(emailVerificationSkipped(), `${value} must not enable it`).toBe(false);
    }
  });

  it('says loudly when it declines to honour a single flag in production', async () => {
    const { emailVerificationSkipped, resetEmailVerificationWarnings } = await loadFlag({
      NODE_ENV: 'production',
      LIKO_SKIP_EMAIL_VERIFICATION: 'true',
    });
    const warnings = captureWarnings();
    resetEmailVerificationWarnings();

    expect(emailVerificationSkipped()).toBe(false);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(' ')).toMatch(/IGNORED/);
    expect(warnings.join(' ')).toMatch(/production/);
  });

  it('says loudly when it IS honouring the flag in production', async () => {
    const { emailVerificationSkipped, resetEmailVerificationWarnings } = await loadFlag({
      NODE_ENV: 'production',
      LIKO_SKIP_EMAIL_VERIFICATION: 'true',
      LIKO_ALLOW_UNVERIFIED_SIGNUP: 'true',
    });
    const warnings = captureWarnings();
    resetEmailVerificationWarnings();

    expect(emailVerificationSkipped()).toBe(true);
    expect(warnings.join(' ')).toMatch(/DISABLED/);
    expect(warnings.join(' ')).toMatch(/student data/);
  });
});