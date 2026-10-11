import type { Metadata } from 'next';

import { getSession } from '@/lib/auth/guards';
import { landingPathFor } from '@/lib/auth/rbac';
import { JoinForm } from './JoinForm';

export const metadata: Metadata = {
  title: 'Join a school',
  description: 'Enter the invitation code an administrator gave you to join a school.',
};

/**
 * Where an invitation code is redeemed.
 *
 * A server component for two reasons. The session is read here, where signing
 * out is a decision this page can present rather than a redirect the proxy makes
 * on the way in. And a code pasted into a link arrives as `?code=`, so it is
 * prefilled from the query string before anything renders.
 *
 * The permission is deliberately absent: a student joining a school is exactly
 * who this page is for, and `/join` carries no entry in the route matrix.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);

  return (
    <JoinForm
      signedIn={Boolean(session)}
      // The same rule the redirect after a successful redemption uses, so the
      // way out of this page cannot differ from the way in.
      landingPath={landingPathFor(session?.role)}
      initialCode={params.code ?? ''}
    />
  );
}