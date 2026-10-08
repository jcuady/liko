import { NextResponse, type NextRequest } from 'next/server';

import {
  SESSION_COOKIE,
  verifySession,
} from '@/lib/auth/session';
import {
  AUTH_PATHS,
  can,
  isProtectedPath,
  permissionForPath,
} from '@/lib/auth/rbac';
import { isSameOrigin } from '@/lib/security/rate-limit';
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

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const needsSession = isProtectedPath(pathname);
  const isAuthPage = AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  const headers = new Headers();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }

  // Signed in and heading for a login page: send them to their workspace.
  if (session && isAuthPage) {
    const target = new URL('/overview', request.url);
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