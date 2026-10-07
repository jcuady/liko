import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[34rem] flex-col items-center justify-center px-6 text-center">
      <p className="text-label">404</p>
      <h1 className="text-h3 mt-4">That page does not exist</h1>
      <p className="measure mt-3 text-[0.9375rem] text-ink-muted">
        The link may be out of date, or the page may have moved. Everything the
        product offers is reachable from the workspace.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="pressable inline-flex h-11 items-center rounded-[12px] bg-accent px-5 text-[0.9375rem] font-medium text-on-accent"
        >
          Go to liko.app
        </Link>
        <Link
          href="/overview"
          className="pressable inline-flex h-11 items-center rounded-[12px] border border-border bg-surface px-5 text-[0.9375rem] font-medium text-ink"
        >
          Open workspace
        </Link>
      </div>
    </main>
  );
}