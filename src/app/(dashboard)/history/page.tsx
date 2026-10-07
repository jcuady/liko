import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { requirePermission, requireSession } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';

import { StudentHistory } from './StudentHistory';

export const metadata: Metadata = {
  title: 'History',
  description: 'The whole record for a student, not just this week.',
};

/**
 * Cumulative history, read through the seam.
 *
 * `getStudentHistory` is per student rather than per class, so the roster is
 * read first and the timeline for the selected student comes second. An
 * unroutable student id falls back to the first student on the roster rather
 * than erroring, because a stale link should still show a real record.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; student?: string }>;
}) {
  const session = await requireSession();
  await requirePermission('history:read');

  const params = await searchParams;
  const store = await data();
  const classes = await store.listClasses(session.userId);

  if (classes.length === 0) {
    return (
      <div className="mx-auto max-w-[64rem]">
        <PageHeader
          title="History"
          description="The whole record for a student, not just this week."
        />
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          History follows a student, and no classes exist yet. Create a class and add a roster
          first.
        </p>
      </div>
    );
  }

  const requestedClass = params.class ?? '';
  const selected = classes.find((item) => item.id === requestedClass) ?? classes[0];
  const roster = await store.listStudents(session.userId, selected.id);

  const requestedStudent = params.student ?? '';
  const student =
    roster.find((item) => item.id === requestedStudent) ?? roster[0] ?? null;

  const history = student ? await store.getStudentHistory(session.userId, student.id) : [];

  return (
    <div className="mx-auto max-w-[64rem]">
      <PageHeader
        title="History"
        description="The whole record for a student, not just this week."
      />
      <StudentHistory
        classes={classes.map((item) => ({ id: item.id, name: item.name }))}
        classId={selected.id}
        students={roster.map((item) => ({
          id: item.id,
          fullName: item.fullName,
          initials: item.initials,
        }))}
        studentId={student?.id ?? null}
        history={history}
      />
    </div>
  );
}
