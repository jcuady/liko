'use client';

import Link from 'next/link';

import { LikoLogo } from '@/components/brand/LikoLogo';

/**
 * Workspace boundary.
 *
 * Scoped to the dashboard group on purpose. The root boundary would tear down the
 * app shell along with the failing page, so a single broken workspace route cost
 * the user their navigation, their session context, and the ability to reach any
 * other screen to recover from. Catching inside the group keeps the sidebar, the
 * header and the offline banner mounted, so recovery is a link away.
 *
 * Offers `/overview` rather than only `/`, because a signed-in teacher who
 * tripped over a workspace page wants their workspace back, not the marketing
 * site. Mirrors `forbidden/page.tsx`, the other dashboard state page.
 *
 * Heading text matches the root boundary so `rbac.spec.ts`, which asserts this
 * name is ABSENT on every healthy route, still fails when a route falls through
 * here instead of quietly passing.
 */
export default function DashboardSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[34rem] flex-col items-center py-20 text-center">
      <LikoLogo showWordmark className="mb-10" />

      <h1 className="text-h3">Something went wrong</h1>
      <p className="measure mt-3 text-[0.9375rem] text-ink-muted">
        This screen failed to load. The rest of your workspace still works, so
        retry here or move to another page. If it keeps happening, quote the
        reference below when reporting it.
      </p>

      {error.digest ? (
        <p className="tabular mt-4 text-[0.8125rem] text-ink-subtle">
          Reference {error.digest}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="pressable inline-flex h-11 items-center rounded-[12px] bg-accent px-5 text-[0.9375rem] font-medium text-on-accent"
        >
          Try again
        </button>
        <Link
          href="/overview"
          className="pressable inline-flex h-11 items-center rounded-[12px] border border-border bg-surface px-5 text-[0.9375rem] font-medium text-ink"
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