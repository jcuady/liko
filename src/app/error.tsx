'use client';

import Link from 'next/link';

/**
 * Root SEGMENT boundary.
 *
 * This file used to render its own document element and body tag, which is only
 * legal in `global-error.tsx`. As a segment boundary it is rendered INSIDE the
 * root layout, so the document is already open: nesting a second document
 * element produced invalid markup that the browser repaired by hoisting the new
 * element into the body, which replaced the shell providers (theme, query,
 * toasts) and blanked the page instead of showing a recoverable message.
 *
 * Mirrors `not-found.tsx` deliberately. Both are terminal states for a route
 * that has no better place to say what happened, and keeping one shape means the
 * two are recognisably the same kind of page rather than two designs.
 *
 * The heading text is held at "Something went wrong" because `rbac.spec.ts`
 * asserts on that exact name to prove a route did NOT fall through to this
 * boundary. Softening the copy would silently blind that regression check.
 */
export default function RootSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[34rem] flex-col items-center justify-center px-6 text-center">
      <p className="text-label">Error</p>
      <h1 className="text-h3 mt-4">Something went wrong</h1>
      <p className="measure mt-3 text-[0.9375rem] text-ink-muted">
        This page failed to load. Retrying usually fixes it. If it keeps
        happening, quote the reference below when reporting it.
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
          href="/"
          className="pressable inline-flex h-11 items-center rounded-[12px] border border-border bg-surface px-5 text-[0.9375rem] font-medium text-ink"
        >
          Go to liko.app
        </Link>
      </div>
    </main>
  );
}