import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth/guards';

import { loadSchedule } from './actions';
import { WeeklyGrid } from './WeeklyGrid';

export const metadata: Metadata = {
  title: 'Schedule',
  description: 'Your week, and the classes you have to be somewhere for.',
};

const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/**
 * ONE PAGE, TWO SUBJECTS.
 *
 * A student arrives here to answer "what do I have today" and the subject is
 * their own roster row, resolved server side from the account link. A teacher
 * arrives at the same grid with a picker, because "what does this child have on
 * Thursday" is the same question with a different subject.
 *
 * One grid rather than two means a new role view is a question about who the
 * week belongs to, not a second component to keep in step with the first.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  await requirePagePermission('class:read');
  const params = await searchParams;

  const view = await loadSchedule(params.student ?? null);
  const { staff } = view;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h2">Schedule</h1>
        <p className="text-body text-ink-muted">
          {view.student
            ? `${view.student.fullName}. Times are local to the school.`
            : staff
              ? 'Pick a student to see their week.'
              : 'Your week. Times are local to the school.'}
        </p>
      </header>

      {/*
       * A clash is REPORTED, never hidden and never resolved automatically. Two
       * classes in the same slot are either a real double booking or a photo
       * that was read slightly wrong, and the person who can tell which is the
       * student. Dropping or reshuffling a row would quietly take that away.
       */}
      {view.conflicts.length > 0 ? (
        <p
          role="status"
          className="rounded-[12px] border border-warning bg-surface px-4 py-3 text-body text-ink"
        >
          Two classes overlap on{' '}
          {Array.from(new Set(view.conflicts.map((conflict) => DAY_NAMES[conflict.dayOfWeek - 1]))).join(
            ' and ',
          )}
          . Check the times before relying on them.
        </p>
      ) : null}

      <WeeklyGrid
        student={view.student}
        entries={view.entries}
        options={view.options}
        showPicker={staff}
        role={view.role}
      />
    </div>
  );
}