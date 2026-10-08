import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MIN_SESSION_SECRET_BYTES,
  sessionSecretByteLength,
  signSession,
  type SessionPayload,
} from './session';

/**
 * A production secret must be a key, not a token.
 *
 * The rule that mattered was the one that was missing: `LIKO_SESSION_SECRET=a`
 * was accepted, and a one-character HS256 key is recovered from a couple of
 * observed signatures. These tests pin both halves of the fix, the measurement
 * and the refusal, because a measurement that silently starts accepting short
 * strings would reopen the hole while still looking correct.
 */

const payload: SessionPayload = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'teacher@example.com',
  role: 'instructor',
  emailVerified: true,
};

/** The exact string `openssl rand -base64 32` prints: 44 characters, 32 bytes. */
const base64Secret = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64');

describe('sessionSecretByteLength', () => {
  it('measures a base64 secret decoded, not as the printed characters', () => {
    const secret = base64Secret(32);

    // The trap: the string is 44 characters long, so a naive length check would
    // call this secret "comfortably over the bar" at 26 bytes too.
    expect(secret.length).toBe(44);
    expect(sessionSecretByteLength(secret)).toBe(32);
    expect(sessionSecretByteLength(base64Secret(26))).toBe(26);
    expect(sessionSecretByteLength(base64Secret(16))).toBe(16);
  });

  it('measures a raw secret as its UTF-8 bytes', () => {
    expect(sessionSecretByteLength('nope')).toBe(3); // valid base64, 3 decoded bytes
    expect(sessionSecretByteLength('a')).toBe(1);
    expect(sessionSecretByteLength('')).toBe(0);
    // A 40-character secret that is not valid base64 is measured as written.
    expect(sessionSecretByteLength(`${'a'.repeat(39)}.`)).toBe(40);
  });

  it('accepts the other documented generator, rand -hex 32', () => {
    // 64 hex characters is 32 bytes of entropy and must not be rejected. It also
    // happens to be well-formed base64, which decodes to 48 bytes; either way it
    // clears the bar.
    expect(sessionSecretByteLength('a'.repeat(64))).toBeGreaterThanOrEqual(
      MIN_SESSION_SECRET_BYTES,
    );
  });

  it('agrees with jose about what 32 bytes means', () => {
    expect(MIN_SESSION_SECRET_BYTES).toBe(32);
  });
});

describe('signSession in production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const inProduction = (secret: string | undefined) => {
    vi.stubEnv('NODE_ENV', 'production');
    if (secret === undefined) vi.stubEnv('LIKO_SESSION_SECRET', undefined);
    else vi.stubEnv('LIKO_SESSION_SECRET', secret);
  };

  it('refuses an empty secret, as it always did', async () => {
    inProduction(undefined);

    await expect(signSession(payload)).rejects.toThrow(/LIKO_SESSION_SECRET is required/);
  });

  it('refuses a secret shorter than 32 bytes', async () => {
    inProduction('a');

    await expect(signSession(payload)).rejects.toThrow(/at least 32 bytes/);
  });

  it('refuses a base64 secret whose decoded form is too short, whatever it prints as', async () => {
    inProduction(base64Secret(16)); // 24 characters, 16 real bytes

    await expect(signSession(payload)).rejects.toThrow(/at least 32 bytes/);
  });

  it('states the requirement without echoing the secret', async () => {
    inProduction('correct-horse');

    const error = await signSession(payload).then(
      () => null,
      (thrown: Error) => thrown,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain('correct-horse');
    expect(error?.message).toContain('openssl rand -base64 32');
  });

  it('signs normally with a 32-byte secret', async () => {
    inProduction(base64Secret(32));

    await expect(signSession(payload)).resolves.toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});

describe('signSession outside production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('leaves development behaviour alone, fallback included', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LIKO_SESSION_SECRET', undefined);

    await expect(signSession(payload)).resolves.toEqual(expect.any(String));
  });

  it('does not apply the length rule outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LIKO_SESSION_SECRET', 'a');

    // jose itself may refuse a one-byte HS256 key. What must not happen is the
    // production guard firing, because a short dev secret is a local default and
    // not a deployment to break.
    const error = await signSession(payload).then(
      () => null,
      (thrown: Error) => thrown,
    );

    if (error) expect(error.message).not.toContain('LIKO_SESSION_SECRET');
  });
});