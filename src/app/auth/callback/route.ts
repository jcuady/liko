import { NextResponse, type NextRequest } from 'next/server';

import { completeEmailVerification } from '@/app/(auth)/actions';

/**
 * Email confirmation and recovery callback.
 *
 * Supabase redirects here from the link in a confirmation email, carrying the
 * token as `token_hash` (PKCE) or the legacy `token` plus `type` pair. This
 * route consumes it, issues the session cookie, and forwards to the workspace.
 *
 * Why this route exists: `proxy.ts` refuses any session whose `emailVerified`
 * flag is false, so before it existed a newly registered account could be
 * created but never unlocked. This is the call site that flips the flag.
 *
 * Failures are not thrown. A dead link is an ordinary thing for a teacher to
 * click on a week-old email, so it gets a page explaining what to do next rather
 * than a 500.
 */

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  const tokenHash = url.searchParams.get('token_hash');
  const legacyToken = url.searchParams.get('token');
  const type = url.searchParams.get('type') ?? 'signup';

  // Recover links arrive here too. Supabase has already established a recovery
  // session in its own cookie by the time this runs, so the password form takes
  // over rather than this route consuming the token.
  if (!tokenHash && legacyToken) {
    return NextResponse.redirect(new URL('/reset-password', siteUrl));
  }

  if (!tokenHash) {
    return failure(siteUrl, 'missing');
  }

  const result = await completeEmailVerification({ tokenHash, type });

  if (!result.ok) {
    return failure(siteUrl, 'invalid');
  }

  return NextResponse.redirect(new URL('/overview?verified=1', siteUrl));
}

function failure(siteUrl: string, reason: string) {
  const url = new URL('/verify-email', siteUrl);
  url.searchParams.set('error', reason);
  return NextResponse.redirect(url);
}