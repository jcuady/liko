import { describe, expect, it } from 'vitest';

import { RATE_LIMITS, consume, isSameOrigin } from './rate-limit';

describe('consume', () => {
  it('allows requests up to the limit, then refuses', () => {
    const key = 'test:allow-then-refuse';
    const config = { limit: 3, windowMs: 60_000 };

    expect(consume(key, config).allowed).toBe(true);
    expect(consume(key, config).allowed).toBe(true);
    expect(consume(key, config).allowed).toBe(true);

    const blocked = consume(key, config);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('tracks each key separately, so one client cannot exhaust another', () => {
    const config = { limit: 1, windowMs: 60_000 };
    expect(consume('test:alice', config).allowed).toBe(true);
    expect(consume('test:alice', config).allowed).toBe(false);
    expect(consume('test:bob', config).allowed).toBe(true);
  });

  it('reports the auth limit as 10 attempts per 5 minutes', () => {
    expect(RATE_LIMITS.auth).toEqual({ limit: 10, windowMs: 5 * 60 * 1000 });
  });

  it('reports a longer window for password reset than for login', () => {
    expect(RATE_LIMITS.passwordReset.windowMs).toBeGreaterThan(RATE_LIMITS.auth.windowMs);
    expect(RATE_LIMITS.passwordReset.limit).toBeLessThan(RATE_LIMITS.auth.limit);
  });
});

describe('isSameOrigin', () => {
  const build = (init: RequestInit & { url?: string }) =>
    new Request(init.url ?? 'https://liko.app/api/attendance', init);

  it('allows safe methods regardless of origin', () => {
    expect(isSameOrigin(build({ method: 'GET' }))).toBe(true);
    expect(isSameOrigin(build({ method: 'HEAD' }))).toBe(true);
    expect(isSameOrigin(build({ method: 'OPTIONS' }))).toBe(true);
  });

  it('allows a same-origin POST with a matching Origin header', () => {
    const request = build({
      method: 'POST',
      headers: { origin: 'https://liko.app', host: 'liko.app' },
    });
    expect(isSameOrigin(request)).toBe(true);
  });

  it('refuses a cross-origin POST', () => {
    const request = build({
      method: 'POST',
      headers: { origin: 'https://evil.example', host: 'liko.app' },
    });
    expect(isSameOrigin(request)).toBe(false);
  });

  it('refuses a same-site but cross-origin POST, which Sec-Fetch-Site catches', () => {
    const request = build({
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-site', host: 'liko.app' },
    });
    expect(isSameOrigin(request)).toBe(false);
  });

  it('refuses an explicit cross-site signal even without an Origin header', () => {
    const request = build({
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(isSameOrigin(request)).toBe(false);
  });
});