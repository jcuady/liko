import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE, isRealSupabaseUserId, verifySession, type SessionPayload } from './session';
import { findUserById } from './store';
import { isSupabaseMode } from '@/lib/data-mode';
import { can, type Permission } from './rbac';

/**
 * Server-side authorisation.
 *
 * `src/proxy.ts` runs before render, but anything reachable without going
 * through the proxy (a server action invoked directly, a route handler, a
 * revalidation) still has to check permission itself. These helpers are the
 * inner gate.
 */

/** A Supabase `auth.users.id` is a uuid, and nothing else in `supabase` mode is. */

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  /*
   * The role in the cookie is a copy taken when it was signed. An administrator
   * who promotes a colleague or suspends them has changed what that person may
   * do, and a change that only takes effect at their next sign-in is not a
   * change.
   *
   * Scoped to fixture mode on purpose. `findUserById` in `supabase` mode calls
   * the Auth admin API, which would turn this into an extra network round trip
   * on every page load. In production the same effect comes from Supabase
   * refreshing the token, which is the correct place for it.
   *
   * WHICH IS WHY THE SUPABASE BRANCH REFUSES AN ID THAT CANNOT BE REAL. It is
   * the one place a cookie is read without a second source to check it against.
   * A `fixtures` session carries a fixed string like `usr_demo_noor`, signed with
   * the same `LIKO_SESSION_SECRET`, so a cookie minted while the app ran in demo
   * mode stays cryptographically valid after a switch to `supabase` — and it was
   * then carried into Postgres, which rejected `usr_demo_noor` for a uuid column
   * and took every data page to the error boundary with HTTP 200. Not one row was
   * missing and RLS admitted them all; the identity was fiction.
   *
   * Shape rather than existence, on purpose: existence would cost a round trip
   * on every page load, which is exactly what the comment above rules out. A
   * Supabase user id is a uuid, so a non-uuid id cannot name an account in this
   * deployment, and sending the person to `/login` is both correct and cheaper
   * than rendering a page that is about to throw.
   */
  if (isSupabaseMode()) {
    return isRealSupabaseUserId(session.userId) ? session : null;
  }

  const account = await findUserById(session.userId);
  if (!account || account.role === session.role) return session;

  return { ...session, role: account.role };
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

/**
 * The page-level counterpart to `requirePermission`.
 *
 * Same check, different failure mode. A server action wants a thrown error it
 * can report back to the caller, but a page does not: throwing there unwinds
 * into the error boundary, so an under-privileged role met the error page
 * instead of the `/forbidden` screen the app already ships for exactly this.
 * This redirects there and never returns.
 *
 * Used by every dashboard page. The proxy enforces the same matrix before
 * render, so this is the second layer catching a proxy bypass, a tampered
 * session cookie, or a page whose route entry was missing.
 */
export async function requirePagePermission(
  permission: Permission,
): Promise<SessionPayload> {
  const session = await requireSession();

  if (!can(session.role, permission)) {
    redirect('/forbidden');
  }

  return session;
}