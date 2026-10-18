import { NextResponse, type NextRequest } from 'next/server';

import {
  SESSION_COOKIE,
  isRealSupabaseUserId,
  verifySession,
} from '@/lib/auth/session';
import {
  AUTH_PATHS,
  can,
  isProtectedPath,
  landingPathFor,
  permissionForPath,
} from '@/lib/auth/rbac';
import { isSameOrigin } from '@/lib/security/rate-limit';
import { isSupabaseMode } from '@/lib/data-mode';
import { safeNextPath } from '@/lib/security/redirect';

/**
 * RBAC route gate.
 *
 * Next.js 16 renamed the middleware convention: this file is `proxy.ts` and the
 * exported function is `proxy`. It runs on the Node.js runtime and cannot be
 * moved to the Edge runtime.
 *
 * This is a routing optimisation, NOT the security boundary. It stops an
 * unauthenticated request from ever rendering an app shell. Every server action
 * and API route independently re-checks permission via `requirePermission()`, so
 * bypassing this file grants nothing.
 */

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Reject cross-site state-changing requests before anything else runs.
  if (!isSameOrigin(request)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const verified = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const needsSession = isProtectedPath(pathname);
  const isAuthPage = AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  /*
   * A COOKIE CAN BE PERFECTLY SIGNED AND STILL NAME NOTHING.
   *
   * A session minted while the app ran in `fixtures` mode carries a fixed id like
   * `usr_demo_noor`, signed with the same `LIKO_SESSION_SECRET`, so it verifies
   * here after a switch to `supabase` while naming an account that cannot exist.
   * Carried into Postgres it was rejected for a uuid column and every data page
   * went to the error boundary with HTTP 200, which reads exactly like a data
   * problem and is not one.
   *
   * WHY THIS IS HERE AND NOT ONLY IN THE GUARD. The guard already refuses such a
   * session, and doing it there alone was worse than the bug: the page redirected
   * to `/login`, this proxy still read the cookie as a live session, `/login`
   * redirected back to the landing page, and the browser looped between the two
   * forever. A Server Component cannot delete a cookie during a render, so the
   * layer that CAN drop it has to be the one that decides.
   *
   * So the two gates are made to agree, and the stale cookie is deleted here.
   *
   * GATED ON THE DATA MODE, and that gate is the whole reason this is not a bug
   * that shipped. Under `fixtures` the workspace is BUILT on ids like
   * `usr_demo_noor`, so refusing every non-uuid here would sign the demo out of
   * the entire product — the marketing mockups and the Playwright suite included
   * — and it would present as "sign-in does nothing", which is a far worse
   * failure than the one being fixed. The uuid is only a lie in `supabase` mode.
   *
   * The mode is readable here because this runs on the Node.js runtime, as the
   * module comment above states. Were it ever moved to the Edge runtime,
   * `process.env.LIKO_DATA_MODE` would be undefined, `isSupabaseMode()` would
   * fall back to `fixtures`, and the check would go quietly inert rather than
   * refuse every session.
   */
  const impossible = isSupabaseMode()
    ? Boolean(verified && !isRealSupabaseUserId(verified.userId))
    : false;
  const session = impossible ? null : verified;

  const headers = new Headers();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }

  /*
   * Handled AFTER the security headers are built, because the response that
   * drops the cookie is still a response and must carry them like every other.
   */
  if (impossible) {
    if (!needsSession) {
      const response = NextResponse.next({ headers });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }

    const url = new URL('/login', request.url);
    url.searchParams.set('next', safeNextPath(pathname + search, { fallback: '/overview' }));
    const response = NextResponse.redirect(url, { headers });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  // Signed in and heading for a login page: send them to their workspace.
  //
  // `landingPathFor(session.role)`, NOT a hardcoded `/overview`. A student and a
  // guardian do not hold `analytics:read`, so `/overview` resolved to
  // `permissionForPath` a permission they lack and was rewritten to
  // `/forbidden` on the very next check below. Signing in as a student and being
  // told "you cannot view this page" is not a refusal of anything they asked
  // for; it is the one page the app sent them to. Two of the four roles had a
  // successful sign-in land on an error page.
  if (session && isAuthPage) {
    const target = new URL(landingPathFor(session.role), request.url);
    headers.set('x-user-id', session.userId);
    headers.set('x-user-role', session.role);
    return NextResponse.redirect(target, { headers });
  }

  if (!needsSession) {
    return NextResponse.next({ headers });
  }

  // No valid session on a protected route.
  if (!session) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', safeNextPath(pathname + search, { fallback: '/overview' }));
    const response = NextResponse.redirect(url, { headers });
    if (request.cookies.has(SESSION_COOKIE)) {
      // A cookie that failed verification is worse than none: drop it.
      response.cookies.delete(SESSION_COOKIE);
    }
    return response;
  }

  // Email must be verified before the workspace renders.
  if (!session.emailVerified) {
    const url = new URL('/verify-email', request.url);
    const response = NextResponse.redirect(url, { headers });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  // Role check. A refusal is explicit, never a silent redirect.
  const permission = permissionForPath(pathname);
  if (permission && !can(session.role, permission)) {
    const url = new URL('/forbidden', request.url);
    return NextResponse.rewrite(url, { headers });
  }

  headers.set('x-user-id', session.userId);
  headers.set('x-user-role', session.role);
  return NextResponse.next({ headers });
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, generated images, and the service
     * worker. Without the trailing `.*` this would also match `/` itself.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.png|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|swe-worker-.*|icons/|brand/|_serwist/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico)$).*)',
  ],
};