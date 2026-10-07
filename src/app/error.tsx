'use client';

import Link from 'next/link';

/**
 * Root error boundary.
 *
 * Shows the error digest so a user can quote a correlation handle, but does not
 * log to the console: the shipped-code bar is zero stray console statements, and
 * production reporting belongs to the observability layer rather than to this
 * component.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-[100dvh] max-w-[34rem] flex-col items-center justify-center px-6 text-center">
          <h1 className="text-h3">Something went wrong</h1>
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
      </body>
    </html>
  );
}