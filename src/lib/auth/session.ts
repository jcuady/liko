import { SignJWT, jwtVerify } from 'jose';

import { isRole, type Role } from './rbac';

/**
 * Session tokens.
 *
 * The session lives in a JWS inside an httpOnly cookie. Nothing sensitive is
 * ever written to localStorage or read from it, so an XSS payload cannot
 * exfiltrate the session directly.
 */

export const SESSION_COOKIE = 'liko_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  userId: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

/**
 * The shortest key we will sign a session with in production.
 *
 * HS256's security is the size of the shared secret. 32 bytes is 256 bits, which
 * is the usual floor and what `openssl rand -base64 32` and `openssl rand -hex
 * 32` both produce. Anything shorter is not a deployment mistake, it is a key
 * that can be recovered from a handful of observed signatures.
 */
export const MIN_SESSION_SECRET_BYTES = 32;

/**
 * The byte length of the key jose would actually sign with.
 *
 * `openssl rand -base64 32` is what the README tells an operator to run, and it
 * prints 44 characters of base64 wrapping 32 random bytes. That is the form that
 * matters: measuring the printed string would call it 44 bytes and accept a
 * 26-byte base64 secret as comfortably strong. So a well-formed base64 value is
 * measured decoded, and anything else is measured as the raw UTF-8 string,
 * because that is what gets handed to `new TextEncoder()` below.
 *
 * The base64 test is strict on purpose. `Buffer.from(x, 'base64')` and `atob`
 * both ignore characters outside the alphabet instead of failing, so a loose
 * decode would quietly measure the wrong thing.
 */
export function sessionSecretByteLength(secret: string): number {
  const trimmed = secret.trim();

  const isBase64 =
    trimmed.length > 0 &&
    trimmed.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed);

  if (isBase64) {
    try {
      // `atob` and not `Buffer`: this module is imported by `proxy.ts`, which
      // must keep working on runtimes where `Buffer` is not defined.
      const decoded = atob(trimmed).length;
      if (decoded > 0) return decoded;
    } catch {
      // Fall through to the raw measurement.
    }
  }

  return new TextEncoder().encode(trimmed).length;
}

/**
 * A local secret is fine for development. In production the secret must be
 * supplied by the environment AND must be long enough to be a key; throwing at
 * first use keeps a misconfigured deploy from signing sessions with something
 * guessable.
 *
 * Emptiness is checked explicitly rather than with `??`. `LIKO_SESSION_SECRET=`
 * in a `.env.local` sets the variable to an empty string, which `??` treats as a
 * present value. That handed jose a zero-length key and every sign-in failed
 * deep inside the crypto layer with "Zero-length key is not supported", which
 * pointed nowhere near the actual cause.
 *
 * Length is the same story one notch down. `LIKO_SESSION_SECRET=a` was accepted,
 * and a one-character HS256 key is not a deployment that can be defended: it is
 * one guess, and it signs every session for every user. The message reports the
 * byte count and the fix, and never echoes the secret itself, so it is safe to
 * let reach a log.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.LIKO_SESSION_SECRET?.trim();

  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error(
        'LIKO_SESSION_SECRET is required in production. Generate one with: openssl rand -base64 32',
      );
    }

    const bytes = sessionSecretByteLength(secret);

    if (bytes < MIN_SESSION_SECRET_BYTES) {
      throw new Error(
        `LIKO_SESSION_SECRET must carry at least ${MIN_SESSION_SECRET_BYTES} bytes of key ` +
          `material in production; this one is ${bytes} byte${bytes === 1 ? '' : 's'}. ` +
          'Generate a replacement with: openssl rand -base64 32',
      );
    }
  }

  /*
   * NEVER FOR PRODUCTION. This fallback is reached only when NODE_ENV is not
   * "production", because the branch above throws first there. It is public
   * knowledge: anyone who reads the source can sign their own session, so it
   * protects nothing and must never be relied on.
   */
  const value = secret || 'liko-development-secret-do-not-use-in-production';
  return new TextEncoder().encode(value);
}

export async function signSession(session: SessionPayload): Promise<string> {
  return new SignJWT({
    email: session.email,
    role: session.role,
    emailVerified: session.emailVerified,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.userId)
    .setIssuedAt()
    .setIssuer('liko')
    .setAudience('liko-app')
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Verifies signature, issuer, audience, and expiry. Any failure returns null
 * rather than throwing, because a bad cookie must degrade to "signed out",
 * never to a 500.
 */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: 'liko',
      audience: 'liko-app',
      algorithms: ['HS256'],
    });

    const userId = payload.sub;
    const email = payload.email;
    const role = payload.role;

    if (typeof userId !== 'string' || typeof email !== 'string' || !isRole(role)) {
      return null;
    }

    return {
      userId,
      email,
      role,
      emailVerified: payload.emailVerified === true,
    };
  } catch {
    return null;
  }
}

/** Cookie attributes shared by every set and clear of the session cookie. */
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const;

export function toHeaders(token: string): Record<string, string> {
  return {
    'Set-Cookie': `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  };
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}