'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { FormField } from '@/components/ui/form-field';
import type { AttendanceStatus } from '@/lib/api/types';

import { AttendanceDateField, AttendanceRegister } from './AttendanceGridClient';

/**
 * Class and day selection for the register.
 *
 * Selection drives the URL rather than component state. A register for one
 * class on one date is a thing a teacher links to or reopens from history, and
 * URL state survives the reload that an optimistic write would otherwise lose.
 */
export function AttendanceShell({
  classes,
  classId,
  date,
  today,
  students,
  initialMarks,
}: {
  classes: { id: string; name: string }[];
  classId: string;
  date: string;
  today: string;
  students: { id: string; initials: string; name: string }[];
  initialMarks: Record<string, AttendanceStatus>;
}) {
  const router = useRouter();

  const navigate = (nextClassId: string, nextDate: string) => {
    const params = new URLSearchParams({ class: nextClassId, date: nextDate });
    router.push(`/attendance?${params.toString()}`);
  };

  const selected = classes.find((item) => item.id === classId);

  if (students.length === 0) {
    return (
      <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
        {selected?.name ?? 'This class'} has no students yet. Add a roster before taking
        attendance.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="attendance-class" label="Class">
          {(props) => (
            <select
              {...props}
              value={classId}
              onChange={(event) => navigate(event.target.value, date)}
              className="flex h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <AttendanceDateField
          id="attendance-date"
          date={date}
          onChange={(value) => {
            // An empty date input means the teacher cleared the field. Hold the
            // last valid day rather than navigating to a register with no date.
            if (value) navigate(classId, value);
          }}
        />
      </div>

      <p className="text-meta text-ink-subtle">
        Showing {date === today ? 'today' : date}. Registers are kept per class per day.
      </p>

      <AttendanceRegister
        classId={classId}
        className={selected?.name ?? 'Class'}
        date={date}
        students={students}
        initialMarks={initialMarks}
      />
    </div>
  );
}
