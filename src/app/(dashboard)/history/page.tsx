import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { NoClassesYet } from '../components/NoClassesYet';
import { requirePagePermission } from '@/lib/auth/guards';
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
  const session = await requirePagePermission('history:read');

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
        {/*
         * THE SHARED COMPONENT, AND NOT A PARAGRAPH OF OUR OWN.
         *
         * This page used to say "Create a class and add a roster first", to
         * every role that reached it. `history:read` is `own` for a student and
         * `linked` for a guardian, so both of them reached it, and neither of
         * them holds `class:write` at anything but `no`. The instruction was
         * one the application would refuse them, and it was reachable: an
         * archived student's seat reads no classes at all, because the linked
         * read excludes an archived row while leaving the account link alone.
         *
         * `NoClassesYet` is the same component `/grades`, `/plan` and `/assess`
         * already use, and its copy is role-aware: the roles that can create a
         * class are invited to, and the roles that cannot are told the honest
         * next step instead. A paragraph written here cannot know the role, so
         * it cannot make that distinction.
         */}
        <NoClassesYet role={session.role} subject="History records" />
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
