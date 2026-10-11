import { Skeleton } from '@/components/ui/feedback';

/**
 * Workspace loading state.
 *
 * This exists mainly to protect the shell. `app/loading.tsx` sits above every
 * group, so a slow workspace query would fall back to it and swap the entire
 * dashboard, sidebar and banner included, for a bare page, then swap the whole
 * thing back. The user would watch the navigation they were reaching for
 * disappear and reappear. A boundary this close to the content suspends only the
 * content, so the layout around it stays mounted and the shell never blinks.
 *
 * Mirrors the shape a workspace page actually takes, a title line above a body,
 * without naming any of it. The blocks are neutral by the same rule as the root
 * loading state: a skeleton that imitates real records shows invented data and
 * gives the reader no way to tell it from the truth.
 *
 * No heading here either. The page that resolves this boundary owns the h1.
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading this page.
      </p>

      <div className="mb-8 flex flex-col gap-2.5" aria-hidden="true">
        <Skeleton className="h-4 w-28 rounded-[6px]" />
        <Skeleton className="h-8 w-[20rem] max-w-full" />
        <Skeleton className="h-4 w-[26rem] max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        <Skeleton className="h-40 w-full rounded-[16px]" />
        <Skeleton className="h-40 w-full rounded-[16px]" />
        <Skeleton className="h-40 w-full rounded-[16px]" />
      </div>

      <Skeleton className="mt-4 h-64 w-full rounded-[16px]" />
    </div>
  );
}