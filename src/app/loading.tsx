import { Skeleton } from '@/components/ui/feedback';

/**
 * Root loading state.
 *
 * Neutral blocks on purpose. A skeleton that imitates real content (sample
 * names, a fake gradebook row) reads as data the moment it paints, and a teacher
 * who sees invented numbers on a slow connection has no way to tell them from
 * the real ones. Blocks say "not yet" without ever asserting something false.
 *
 * No heading. A loading state is not a page, so it takes no `h1`; the h1
 * belongs to the page that replaces it, and a heading that appears and then
 * silently swaps out under the reader is worse than no heading at all.
 *
 * `Skeleton` is reused rather than restated because it already owns the
 * `animate-pulse bg-surface-sunken` pair, and a second hand-rolled copy here
 * would drift the moment that primitive changes.
 *
 * The live region announces the wait for assistive tech, which would otherwise
 * experience this as an empty document with no explanation for the silence.
 */
export default function RootLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex min-h-[100dvh] max-w-[34rem] flex-col justify-center px-6 py-20"
    >
      <p role="status" className="sr-only">
        Loading this page.
      </p>

      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-4 w-24 rounded-[6px]" />
        <Skeleton className="h-8 w-[22rem] max-w-full" />
        <Skeleton className="mt-2 h-4 w-[30rem] max-w-full" />
        <Skeleton className="h-4 w-[26rem] max-w-full" />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2" aria-hidden="true">
        <Skeleton className="h-32 w-full rounded-[16px]" />
        <Skeleton className="h-32 w-full rounded-[16px]" />
        <Skeleton className="h-32 w-full rounded-[16px]" />
        <Skeleton className="h-32 w-full rounded-[16px]" />
      </div>
    </main>
  );
}