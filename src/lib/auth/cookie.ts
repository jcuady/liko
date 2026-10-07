import { cookies } from 'next/headers';

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSession,
  type SessionPayload,
} from './session';

/**
 * Session cookie writes.
 *
 * Every place that signs a user in goes through here, so the attribute set is
 * identical in all of them. `httpOnly` is the load-bearing one: it is what
 * keeps the token out of reach of an XSS payload and out of localStorage, which
 * an existing Playwright test asserts.
 */

export async function setSessionCookie(
  session: SessionPayload,
  options?: { remember?: boolean },
): Promise<void> {
  const token = await signSession(session);
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // "Keep me signed in" only stretches the window. Without it the session
    // still lives for the day, so a shared machine is not left open for a week.
    maxAge: options?.remember ? SESSION_MAX_AGE_SECONDS : 60 * 60 * 24,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}