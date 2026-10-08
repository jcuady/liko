import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RateLimitConfig } from './rate-limit';

/**
 * The kill switch must not work in production.
 *
 * `LIKO_RATE_LIMIT_DISABLED=true` used to switch off every limit in the product.
 * An environment variable is not a security boundary: nobody reviews the diff
 * that sets one, and a `.env.local` copied into production is exactly the
 * accident that turns "we rate limit logins" into "we do not".
 *
 * Each test reloads the module so the once-per-process warning flag starts
 * clean, which is what lets the warning itself be asserted.
 */

const CONFIG: RateLimitConfig = { limit: 2, windowMs: 60_000 };

type Env = { NODE_ENV?: string; LIKO_RATE_LIMIT_DISABLED?: string };

async function loadLimiter(env: Env) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value as string);
  }
  return await import('./rate-limit');
}

/** Installed after the module loads and before the first `consume`. */
function captureWarnings() {
  const messages: string[] = [];
  vi.spyOn(process, 'emitWarning').mockImplementation((message: string | Error) => {
    messages.push(String(message));
  });
  return messages;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('LIKO_RATE_LIMIT_DISABLED', () => {
  it('is ignored in production, so the limits still apply', async () => {
    const { consume } = await loadLimiter({
      NODE_ENV: 'production',
      LIKO_RATE_LIMIT_DISABLED: 'true',
    });

    expect(consume('prod:kill-switch', CONFIG).allowed).toBe(true);
    expect(consume('prod:kill-switch', CONFIG).allowed).toBe(true);
    expect(consume('prod:kill-switch', CONFIG).allowed).toBe(false);
  });

  it('says so loudly when it declines to honour the flag in production', async () => {
    const { consume } = await loadLimiter({
      NODE_ENV: 'production',
      LIKO_RATE_LIMIT_DISABLED: 'true',
    });
    const warnings = captureWarnings();

    consume('prod:warned', CONFIG);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(' ')).toMatch(/IGNORED/);
    expect(warnings.join(' ')).toMatch(/production/);
  });

  it('still works in test, where it exists to unblock an end-to-end run', async () => {
    const { consume } = await loadLimiter({
      NODE_ENV: 'test',
      LIKO_RATE_LIMIT_DISABLED: 'true',
    });
    const warnings = captureWarnings();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(consume('test:kill-switch', CONFIG).allowed).toBe(true);
    }

    expect(warnings.join(' ')).toMatch(/DISABLED/);
    expect(warnings.join(' ')).toMatch(/"test"/);
  });

  it('leaves the limiter alone when the flag is unset or anything but true', async () => {
    for (const value of [undefined, 'false', '1', 'yes']) {
      const { consume } = await loadLimiter({
        NODE_ENV: 'production',
        LIKO_RATE_LIMIT_DISABLED: value,
      });

      expect(consume(`prod:unset-${String(value)}`, CONFIG).allowed).toBe(true);
      expect(consume(`prod:unset-${String(value)}`, CONFIG).allowed).toBe(true);
      expect(consume(`prod:unset-${String(value)}`, CONFIG).allowed).toBe(false);
    }
  });
});