'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/input';
import { queryKeys } from '@/lib/query/keys';
import type { HistoryRecord } from '@/lib/api/types';

import { SEVERITY_OPTIONS, addBehaviourLog, loadHistory } from './actions';

/**
 * The cumulative record for one student.
 *
 * WHY HISTORY AND BEHAVIOUR SIT TOGETHER. `getStudentHistory` is the timeline
 * the seam derives, and `addBehaviourLog` is the only free-text channel it
 * exposes. Splitting them across two screens would make a teacher write down
 * something here and then be unable to see it there, so the entry form lives
 * beside the timeline it feeds.
 *
 * Event payloads are free-form records whose shape depends on the event type,
 * so they are rendered as readable text rather than asserted into a type that
 * would be a guess.
 */

const EVENT_LABELS: Record<string, string> = {
  enrolled: 'Enrolled',
  attendance_flag: 'Attendance flag',
  standard_mastered: 'Standard mastered',
  assessment_scored: 'Assessment scored',
  intervention: 'Intervention',
  note: 'Note',
};

/**
 * Tone is keyed by event type because that is what the timeline actually
 * carries. A concern and an intervention read very differently to a teacher
 * scanning back through a term, so they do not share a neutral badge.
 */
const EVENT_TONES: Record<string, 'neutral' | 'accent' | 'warning' | 'danger'> = {
  enrolled: 'neutral',
  standard_mastered: 'accent',
  assessment_scored: 'neutral',
  attendance_flag: 'warning',
  intervention: 'danger',
  note: 'neutral',
};

function describePayload(payload: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'object') continue;
    parts.push(`${key.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${String(value)}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

export function StudentHistory({
  classes,
  classId,
  students,
  studentId,
  history,
}: {
  classes: { id: string; name: string }[];
  classId: string;
  students: { id: string; fullName: string; initials: string }[];
  studentId: string | null;
  history: HistoryRecord[];
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedClassId, setSelectedClassId] = React.useState(classId);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('');

  const effectiveClassId = classes.some((item) => item.id === selectedClassId)
    ? selectedClassId
    : classId;

  const roster = students.filter((student) => student.id !== null);
  const activeStudentId =
    roster.some((item) => item.id === selectedStudentId)
      ? selectedStudentId
      : roster.some((item) => item.id === studentId)
        ? studentId
        : (roster[0]?.id ?? null);

  const historyKey = queryKeys.history(activeStudentId ?? 'none');

  const { data: rows = history } = useQuery({
    queryKey: historyKey,
    queryFn: () => loadHistory(activeStudentId ?? ''),
    enabled: Boolean(activeStudentId),
    initialData: history,
    staleTime: 30_000,
  });

  const log = useMutation({
    mutationFn: addBehaviourLog,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await Promise.all([
        // The timeline and the log are separate reads, so both caches move.
        queryClient.invalidateQueries({ queryKey: historyKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.behaviourLogs(effectiveClassId) }),
      ]);
    },
    onError: () => toast.error('That entry could not be saved. Try again.'),
  });

  const active = roster.find((item) => item.id === activeStudentId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="history-class" label="Class">
          {(props) => (
            <select
              {...props}
              value={effectiveClassId}
              onChange={(event) => {
                // Switching class changes the roster, so the stored student
                // selection is cleared rather than carried into a class the
                // student is not in.
                setSelectedClassId(event.target.value);
                setSelectedStudentId('');
                const params = new URLSearchParams({ class: event.target.value });
                router.push(`/history?${params.toString()}`);
              }}
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

        <FormField id="history-student" label="Student">
          {(props) => (
            <select
              {...props}
              value={activeStudentId ?? ''}
              disabled={roster.length === 0}
              onChange={(event) => {
                const next = event.target.value;
                setSelectedStudentId(next);
                // The student lives in the URL so a record can be linked to and
                // survives a reload.
                const params = new URLSearchParams({
                  class: effectiveClassId,
                  student: next,
                });
                router.push(`/history?${params.toString()}`);
              }}
              className="flex h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25 disabled:opacity-50"
            >
              {roster.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.fullName}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>

      {roster.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          This class has no students, so there is no history to show.
        </p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Timeline for {active?.fullName ?? 'this student'}</CardTitle>
              <p className="text-meta text-ink-muted" aria-live="polite">
                {rows.length === 0
                  ? 'Nothing recorded yet.'
                  : `${rows.length} ${rows.length === 1 ? 'event' : 'events'}, most recent first.`}
              </p>
            </CardHeader>

            <CardContent>
              {rows.length === 0 ? (
                <p className="text-body text-ink-muted">
                  Enrolment, attendance flags, and assessment scores appear here as they happen.
                  Add the first note below.
                </p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {rows.map((row) => {
                    const detail = describePayload(row.payload);
                    const label = EVENT_LABELS[row.eventType] ?? row.eventType;
                    return (
                      <li
                        key={row.id}
                        className={`border-l-2 pl-4 ${
                          EVENT_TONES[row.eventType] === 'danger'
                            ? 'border-danger'
                            : EVENT_TONES[row.eventType] === 'warning'
                              ? 'border-warning'
                              : 'border-border'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[0.875rem] font-medium text-ink">{label}</span>
                          <Badge tone={EVENT_TONES[row.eventType] ?? 'neutral'}>
                            {formatDay(row.occurredAt)}
                          </Badge>
                        </div>
                        {detail ? (
                          <p className="mt-1 text-meta text-ink-muted">{detail}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add an entry</CardTitle>
              <p className="text-meta text-ink-muted">
                Entries are cumulative. They stay on the record, so write what you would be willing
                to read back.
              </p>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!activeStudentId) return;
                  const form = new FormData(event.currentTarget);
                  log.mutate({
                    classId: effectiveClassId,
                    studentId: activeStudentId,
                    entry: String(form.get('entry') ?? ''),
                    severity: String(form.get('severity') ?? 'note') as
                      | 'note'
                      | 'praise'
                      | 'concern'
                      | 'intervention',
                  });
                  event.currentTarget.reset();
                }}
              >
                <FormField id="history-entry" label="Entry" required>
                  {(props) => (
                    <Textarea
                      {...props}
                      name="entry"
                      rows={3}
                      placeholder="Stayed after to finish the lab write-up."
                    />
                  )}
                </FormField>

                <FormField id="history-severity" label="Kind">
                  {(props) => (
                    <select
                      {...props}
                      name="severity"
                      defaultValue="note"
                      className="flex h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
                    >
                      {SEVERITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>

                <div>
                  <Button type="submit" disabled={log.isPending || !activeStudentId}>
                    {log.isPending ? 'Saving' : 'Add entry'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
