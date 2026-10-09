'use client';

import * as React from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { AttendanceGrid, AttendanceLegend } from '@/components/product/AttendanceGrid';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { queryKeys } from '@/lib/query/keys';
import type { AttendanceStatus } from '@/lib/api/types';

import { loadAttendance } from './actions';
import { enqueueWrite } from '@/lib/outbox';

/**
 * The register.
 *
 * WHY ROLLBACK IS WIRED THROUGH THE MUTATION ERROR PATH. The previous version
 * wrapped `fetch` in try/catch and only restored the previous mark when the
 * request threw at the network layer. A 4xx or a 5xx resolves a fetch promise
 * perfectly happily, so every rejected write left the teacher's screen showing a
 * mark that was never saved, and never said so. Here a non-ok action result is
 * thrown inside the mutation, which routes both transport failures and
 * authoritative refusals into the same `onError`, so the optimistic value is
 * withdrawn in both cases and the teacher is told.
 *
 * WHY THE GRID IS REMOUNTED ON ROLLBACK. `AttendanceGrid` keeps an internal
 * override layer so a tap paints instantly without a round trip. That layer is
 * local, so restoring the cached value alone would leave the failed tap still on
 * screen. Bumping `resetToken` remounts the grid with its overrides cleared,
 * which is what makes the rollback actually visible.
 */

export interface AttendanceRegisterProps {
  classId: string;
  className: string;
  date: string;
  students: { id: string; initials: string; name: string }[];
  initialMarks: Record<string, AttendanceStatus>;
}

export function AttendanceRegister({
  classId,
  className,
  date,
  students,
  initialMarks,
}: AttendanceRegisterProps) {
  const queryClient = useQueryClient();
  const key = queryKeys.attendance(classId, date);

  const [resetToken, setResetToken] = React.useState(0);
  const [pendingCount, setPendingCount] = React.useState(0);

  const { data: marks = initialMarks } = useQuery({
    queryKey: key,
    queryFn: () => loadAttendance(classId, date),
    initialData: initialMarks,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (payload: { marks: { studentId: string; status: AttendanceStatus }[] }) => {
      /*
       * Through the outbox, not the server action.
       *
       * `enqueueWrite` puts the write in IndexedDB first and only then attempts
       * the network, so a teacher who taps a register on a train keeps the marks
       * and they replay on reconnect. Calling the server action directly meant
       * an offline tap had nothing durable behind it: the queue was never
       * written to, so the pending count was permanently zero and the "retry"
       * affordance was decoration.
       *
       * A server action could not have been replayed anyway, because a queued
       * record has to survive to `fetch(path)` hours later and an action id does
       * not. `POST /api/attendance` is the replay target and is idempotent.
       *
       * The three outcomes are deliberately different, because they mean
       * different things to the teacher:
       *
       *   null         offline; the write is durable and queued. Not a failure,
       *                 so the optimistic mark stays and the banner counts it.
       *   response 2xx saved.
       *   response 4xx the server refused it. Thrown, so the optimistic value
       *                 rolls back and the teacher is told, because retrying a
       *                 refusal is how a wrong mark becomes permanent.
       */
      const response = await enqueueWrite({
        path: '/api/attendance',
        method: 'POST',
        body: { classId, date, marks: payload.marks },
        /*
         * A human description of what is waiting. The banner shows this instead of
         * a bare count when a single write is pending, because "Syncing 1 queued
         * change" tells a teacher nothing about what they are waiting for.
         */
        label:
          payload.marks.length === 1
            ? `Attendance for ${date}`
            : `${payload.marks.length} marks for ${date}`,
      });

      if (response === null) return { queued: true };

      if (!response.ok) throw new Error(`refused with ${response.status}`);
      return { queued: false };
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Record<string, AttendanceStatus>>(key);
      queryClient.setQueryData<Record<string, AttendanceStatus>>(key, (current) => {
        const next = { ...(current ?? {}) };
        for (const mark of payload.marks) next[mark.studentId] = mark.status;
        return next;
      });
      return { previous };
    },
    onError: (error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      } else {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      // Remount so the grid's local override layer stops showing the failed tap.
      setResetToken((token) => token + 1);
      toast.error(error instanceof Error ? error.message : 'That change could not be saved.', {
        description: 'Your register is back to how it was.',
      });
    },
    onSuccess: (result) => {
      /*
       * Only refetch when the write actually reached the server.
       *
       * A queued write has not landed yet, so invalidating here would pull the
       * old marks back over the optimistic ones and the teacher's tap would
       * appear to undo itself the moment they went offline. The queue is the
       * record now; the refetch happens when the replay succeeds.
       */
      if (result.queued) return;
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const commit = (
    payload: { marks: { studentId: string; status: AttendanceStatus }[] },
    successMessage: string,
  ) => {
    setPendingCount((count) => count + 1);
    mutation
      .mutateAsync(payload)
      .then((result) =>
        // Saying "Mark saved." to a teacher who is offline is the kind of small
        // lie that makes an app untrustworthy when they reload. Say what is
        // actually true: it is held and will send itself.
        result.queued
          ? toast.info('Saved to the outbox.', {
              description: 'This will sync when you are back online.',
            })
          : toast.success(successMessage),
      )
      .catch(() => undefined)
      .finally(() => setPendingCount((count) => count - 1));
  };

  const onChange = (studentId: string, next: string) => {
    const current = marks[studentId] ?? null;
    const status = next as AttendanceStatus;

    if (!(status in { present: 1, absent: 1, late: 1, excused: 1 })) {
      // The cycle offers a fifth "unset" state. The seam can only write a
      // status, so clearing a mark has nowhere to go. Rather than paint a value
      // that a reload would contradict, keep what is stored and say why.
      toast.error('Clearing a mark is not available yet', {
        description: 'Set present, late, absent, or excused instead.',
      });
      setResetToken((token) => token + 1);
      return;
    }

    if (status === current) return;
    commit({ marks: [{ studentId, status }] }, 'Mark saved.');
  };

  const presentAll = () => {
    if (students.length === 0) return;
    commit(
      {
        marks: students.map((student) => ({ studentId: student.id, status: 'present' as const })),
      },
      `Marked ${students.length} present.`,
    );
  };

  const summary = React.useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter((value) => value === 'present').length,
      total: students.length,
    };
  }, [marks, students.length]);

  const saving = pendingCount > 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-medium text-ink">{className}</p>
          <p className="text-meta text-ink-muted" aria-live="polite">
            {summary.present} of {summary.total} marked present
            {saving ? ', saving' : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={presentAll}
          disabled={saving || students.length === 0}
        >
          Mark all present
        </Button>
      </div>

      <div className="rounded-[16px] border border-border bg-surface p-5">
        <AttendanceGrid
          key={`${classId}-${date}-${resetToken}`}
          students={students}
          marks={marks}
          interactive
          onChange={onChange}
        />
        <AttendanceLegend />
      </div>
    </div>
  );
}

/** Date control. Kept beside the register rather than in the page header so the
 *  chosen day and the marks below it are read together. */
export function AttendanceDateField({
  id,
  date,
  onChange,
}: {
  id: string;
  date: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField id={id} label="Register date">
      {(props) => (
        <Input
          {...props}
          type="date"
          value={date}
          max={date}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FormField>
  );
}
