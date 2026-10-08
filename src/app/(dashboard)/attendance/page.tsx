import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';
import type { AttendanceStatus } from '@/lib/api/types';

import { AttendanceShell } from './AttendanceShell';

export const metadata: Metadata = {
  title: 'Attendance',
  description: 'Take attendance in a few taps, online or off.',
};

/**
 * Attendance reads on the server, writes from the client.
 *
 * WHY THE FIXTURE IMPORT IS GONE. This page used to import
 * `@/lib/fixtures/workspace` directly, so it showed demo names to a signed-in
 * teacher and the register it displayed was never the register it saved. Both
 * the roster and the marks now arrive through `data()`, which is the same seam
 * a backend swap would change.
 *
 * The class and the day arrive as search params rather than as client state,
 * so a register is a shareable URL and the server can render the marks that
 * belong to it.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; date?: string }>;
}) {
  const session = await requirePagePermission('attendance:write');

  const params = await searchParams;
  const store = await data();
  const classes = await store.listClasses(session.userId);

  // An honest empty state beats a register with no class behind it.
  if (classes.length === 0) {
    return (
      <div className="mx-auto max-w-[64rem]">
        <PageHeader
          title="Attendance"
          description="Four taps per student. Works with no signal and syncs when you reconnect."
        />
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          There is no class to take attendance for yet. Create one first, then come back.
        </p>
      </div>
    );
  }

  const requested = params.class ?? '';
  const selected = classes.find((item) => item.id === requested) ?? classes[0];
  const today = new Date().toISOString().slice(0, 10);
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  const students = await store.listStudents(session.userId, selected.id);
  const marks: Record<string, AttendanceStatus> = await store.getAttendance(
    session.userId,
    selected.id,
    date,
  );

  return (
    <div className="mx-auto max-w-[64rem]">
      <PageHeader
        title="Attendance"
        description="Four taps per student. Works with no signal and syncs when you reconnect."
      />
      <AttendanceShell
        classes={classes.map((item) => ({ id: item.id, name: item.name }))}
        classId={selected.id}
        date={date}
        today={today}
        students={students.map((student) => ({
          id: student.id,
          initials: student.initials,
          name: student.fullName,
        }))}
        initialMarks={marks}
      />
    </div>
  );
}
