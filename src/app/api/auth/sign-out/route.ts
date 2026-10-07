import { NextResponse } from 'next/server';

import { clearSessionCookie } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/security/rate-limit';

/**
 * Sign out. Clears the httpOnly session cookie and returns the caller to the
 * marketing page. Refuses cross-origin requests so an embedded page cannot log
 * a user out.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', clearSessionCookie());
  return response;
}