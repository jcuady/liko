import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE, verifySession, type SessionPayload } from './session';
import { can, type Permission } from './rbac';

/**
 * Server-side authorisation.
 *
 * `src/proxy.ts` runs before render, but anything reachable without going
 * through the proxy (a server action invoked directly, a route handler, a
 * revalidation) still has to check permission itself. These helpers are the
 * inner gate.
 */

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/**
 * Throws rather than redirecting, because a server action must not silently
 * bounce the user; it should surface a failure the caller can report.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionPayload> {
  const session = await getSession();

  if (!session) {
    throw new Error('UNAUTHENTICATED');
  }
  if (!can(session.role, permission)) {
    throw new Error('FORBIDDEN');
  }

  return session;
}