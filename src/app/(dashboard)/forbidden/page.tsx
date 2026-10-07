import type { Metadata } from 'next';
import Link from 'next/link';

import { LikoLogo } from '@/components/brand/LikoLogo';

export const metadata: Metadata = {
  title: 'No access',
  description: 'Your role does not have access to this area.',
};

/**
 * 403. An explicit refusal, never a silent redirect: quietly bouncing someone
 * to a page they cannot use teaches them the app is broken.
 *
 * Lives inside the dashboard group so it renders inside the app shell.
 */
export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex max-w-[34rem] flex-col items-center py-20 text-center">
      <LikoLogo showWordmark className="mb-10" />

      <h1 className="text-h3">You do not have access to this area</h1>
      <p className="measure mt-3 text-[0.9375rem] text-ink-muted">
        Your role can see a different part of LIKO. If you think this is wrong,
        ask whoever administers your account to review your permissions.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/overview"
          className="pressable inline-flex h-11 items-center rounded-[12px] bg-accent px-5 text-[0.9375rem] font-medium text-on-accent"
        >
          Back to overview
        </Link>
        <Link
          href="/"
          className="pressable inline-flex h-11 items-center rounded-[12px] border border-border bg-surface px-5 text-[0.9375rem] font-medium text-ink"
        >
          Go to liko.app
        </Link>
      </div>
    </div>
  );
}