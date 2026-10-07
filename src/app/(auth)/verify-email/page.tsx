import type { Metadata } from 'next';
import Link from 'next/link';
import { EnvelopeOpenIcon } from '@phosphor-icons/react/dist/ssr';

import { LikoLogo } from '@/components/brand/LikoLogo';
import { ResendVerificationForm } from './ResendVerificationForm';

export const metadata: Metadata = {
  title: 'Verify your email',
  description: 'Confirm your email address to open your LIKO workspace.',
};

const ERRORS: Record<string, string> = {
  missing: 'That link was incomplete. Send yourself a new one below.',
  expired: 'That link has expired. Send yourself a new one below.',
  invalid: 'That confirmation link is invalid or has expired.',
};

/**
 * The page `proxy.ts` sends unverified accounts to.
 *
 * It has to work with no session at all, because the whole point is that the
 * session has not been issued yet.
 *
 * This page used to be static copy with no way forward, which combined with the
 * proxy's refusal of unverified sessions to make registration a dead end. It
 * now states what went wrong when the link fails, and offers the resend form
 * that actually sends another one.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; pending?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? (ERRORS[params.error] ?? ERRORS.invalid) : null;

  return (
    <div className="flex flex-col items-center text-center">
      <LikoLogo showWordmark className="mb-10" />

      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full bg-accent-subtle text-accent"
      >
        <EnvelopeOpenIcon size={26} weight="duotone" />
      </span>

      <h1 className="text-h3 mt-6">
        {error ? 'That link did not work' : 'Check your inbox'}
      </h1>

      {error ? (
        <p className="measure mt-3 text-[0.9375rem] text-ink-muted">{error}</p>
      ) : (
        <p className="measure mt-3 text-[0.9375rem] text-ink-muted">
          We sent a verification link to your email address. Open it to activate
          your workspace.
        </p>
      )}

      {!error ? <ResendVerificationForm /> : null}

      <p className="mt-8 text-[0.875rem] text-ink-subtle">
        Wrong address?{' '}
        <Link
          href="/register"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Start again
        </Link>
      </p>
    </div>
  );
}