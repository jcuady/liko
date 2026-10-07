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
 * A local secret is fine for development. In production the secret must be
 * supplied by the environment; throwing at first use keeps a misconfigured
 * deploy from silently signing sessions with a guessable key.
 *
 * The emptiness check is explicit rather than `??`. `LIKO_SESSION_SECRET=` in a
 * `.env.local` sets the variable to an empty string, which `??` treats as a
 * present value. That handed jose a zero-length key and every sign-in failed
 * deep inside the crypto layer with "Zero-length key is not supported", which
 * pointed nowhere near the actual cause.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.LIKO_SESSION_SECRET?.trim();

  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error(
      'LIKO_SESSION_SECRET is required in production. Generate one with: openssl rand -base64 32',
    );
  }

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