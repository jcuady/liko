'use server';

import { headers } from 'next/headers';

import { recordConsent } from '@/lib/auth/consent';
import { getSession } from '@/lib/auth/guards';

/**
 * Server-side half of the cookie banner.
 *
 * WHY A SERVER ACTION FOR A COOKIE.
 *
 * The cookie itself is written in the browser, because the banner has to be able
 * to record a choice before anyone has signed in. That alone would leave the
 * banner with no server-visible trace, and a record that only the visitor's own
 * browser holds is not a record. When there IS a session, the choice is written
 * here as well, into the append-only consent log the account holder cannot edit.
 *
 * An anonymous visitor cannot have a row, because a consent log with no subject
 * would be unusable and unbounded. For them the cookie is the whole record, and
 * that is stated in `/cookies`.
 *
 * This is a no-op without a session rather than an error: the banner must work
 * the same for a signed-out visitor, and refusing would only produce a console
 * error nobody is watching.
 */
export async function recordCookieConsent(): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const requestHeaders = await headers();
  await recordConsent({
    userId: session.userId,
    email: session.email,
    subject: 'cookies',
    source: 'cookie_banner',
    ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: requestHeaders.get('user-agent'),
  });
}