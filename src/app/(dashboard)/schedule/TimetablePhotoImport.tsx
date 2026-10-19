'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, CircleAlert, TriangleAlert, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { formatMinute, type ScheduleConflict, type ScheduleEntry } from '@/lib/schedule/extract';

import {
  confirmScheduleAction,
  readTimetableAction,
  timetableAiStatusAction,
  type ConfirmResult,
  type ReadResult,
} from './actions';
import { queryKeys } from '@/lib/query/keys';

/**
 * Photographing a timetable, in two steps.
 *
 * WHY THERE IS A REVIEW STEP AND NOT A BUTTON THAT JUST WORKS. A model reading a
 * photograph is guessing, and the two ways it guesses wrong are a time read off
 * the wrong column and a row invented from a smudge. Writing that straight onto
 * the timetable would replace a week the student already had with a week nobody
 * verified, and the student would have no way to tell which rows were real. So
 * the read returns a proposal, the proposal is shown row by row, and only what
 * survives the student's own eyes is written.
 *
 * WHY THE DESTRUCTION IS SAID OUT LOUD BEFORE THE BUTTON. Confirming replaces
 * every class on the week. A button labelled "Save" next to a list of classes
 * reads as an addition, because that is what saving normally means here and in
 * every other screen in the product. The label says it replaces, and the warning
 * above the review says what goes with it.
 */

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const FIELD_ID = 'timetable-photo';

interface Props {
  studentId: string;
  studentName: string;
  /** The `accept` attribute, straight from the module that enforces it. */
  accept: string;
  /** The same list in words. A student is not served by a MIME type. */
  acceptedLabel: string;
  /** The size limit, in the same words the server refuses with. */
  sizeLabel: string;
}

export function TimetablePhotoImport({
  studentId,
  studentName,
  accept,
  acceptedLabel,
  sizeLabel,
}: Props) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  /*
   * The same meter the deck panel shows. Reading a photograph is the most
   * expensive AI call in this product, so a teacher about to spend it deserves
   * to know what is left before the upload rather than after the refusal.
   */
  const status = useQuery({
    queryKey: queryKeys.aiStatus(),
    queryFn: timetableAiStatusAction,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const [proposal, setProposal] = React.useState<{
    entries: ScheduleEntry[];
    warnings: string[];
    conflicts: ScheduleConflict[];
    message: string;
  } | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);

  const read = useMutation({
    mutationFn: async (photo: File) => {
      const form = new FormData();
      form.set('studentId', studentId);
      form.set('photo', photo);
      return readTimetableAction(form);
    },
    onSuccess: (outcome: ReadResult) => {
      if (!outcome.ok) {
        setProposal(null);
        setRefusal(outcome.message);
        return;
      }
      setRefusal(null);
      setSaved(null);
      setProposal({
        entries: outcome.entries,
        warnings: outcome.warnings,
        conflicts: outcome.conflicts,
        message: outcome.message,
      });
    },
    onError: () =>
      setRefusal('That photograph could not be read. Check your connection and try again.'),
  });

  const confirm = useMutation({
    mutationFn: (entries: ScheduleEntry[]) =>
      confirmScheduleAction({ studentId, entries }),
    onSuccess: (outcome: ConfirmResult) => {
      if (!outcome.ok) {
        setRefusal(outcome.message);
        return;
      }
      setProposal(null);
      setRefusal(null);
      setSaved(outcome.message);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    },
    onError: () => setRefusal('That week could not be saved. Nothing was changed.'),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file || read.isPending) return;
    setRefusal(null);
    setSaved(null);
    read.mutate(file);
  }

  function startAgain() {
    setProposal(null);
    setRefusal(null);
    setSaved(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const busy = read.isPending || confirm.isPending;

  const usage = status.data;
  const exhausted = usage ? usage.remaining <= 0 : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photograph your timetable</CardTitle>
        <p className="text-[0.8125rem] text-ink-subtle" role="status" aria-live="polite">
          {status.isLoading
            ? 'Checking what is left'
            : usage
              ? usage.configured
                ? `${usage.remaining} of ${usage.limit} left this hour`
                : 'Not configured on this deployment'
              : ''}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-body text-ink-muted">
          Take a photo of the timetable your school gave you and I will read the week out of it.
          You get to look at what I read before it changes anything.
        </p>

        {!proposal ? (
          <form onSubmit={submit} aria-busy={read.isPending} className="flex flex-col gap-4">
            <FormField
              id={FIELD_ID}
              label="Timetable photo"
              hint={`Accepted: ${acceptedLabel}. Up to ${sizeLabel}.`}
            >
              {(props) => (
                <Input
                  {...props}
                  ref={inputRef}
                  type="file"
                  accept={accept}
                  disabled={busy}
                  onChange={() => {
                    setRefusal(null);
                    setSaved(null);
                  }}
                />
              )}
            </FormField>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy || exhausted}>
                <Camera size={17} aria-hidden="true" />
                {read.isPending ? 'Reading it' : 'Read my timetable'}
              </Button>
              {exhausted ? (
                <p className="text-[0.8125rem] text-ink-muted">
                  The hourly limit has been reached. This comes back on its own.
                </p>
              ) : null}

              {/* Polite rather than a spinner in the button alone: the call can take
                  a while, and silence is what makes a button look broken. */}
              <span role="status" aria-live="polite" className="text-meta text-ink-muted">
                {read.isPending ? 'Reading the photograph. This takes a moment.' : ''}
              </span>
            </div>
          </form>
        ) : null}

        {saved ? (
          <p className="text-body text-ink">{saved}</p>
        ) : null}

        {refusal ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-[12px] border border-danger bg-danger-subtle p-3.5 text-meta font-medium text-danger"
          >
            <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{refusal}</span>
          </p>
        ) : null}

        {proposal ? (
          <ProposalReview
            studentName={studentName}
            message={proposal.message}
            entries={proposal.entries}
            warnings={proposal.warnings}
            conflicts={proposal.conflicts}
            pending={confirm.isPending}
            onDrop={(index) =>
              setProposal({
                ...proposal,
                entries: proposal.entries.filter((_, at) => at !== index),
              })
            }
            onConfirm={() => confirm.mutate(proposal.entries)}
            onStartAgain={startAgain}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * What was read, row by row, with the power to drop any of them.
 *
 * The list is the review. Dropping a row happens here rather than after saving,
 * so what is written is exactly what survived being looked at.
 */
function ProposalReview({
  studentName,
  message,
  entries,
  warnings,
  conflicts,
  pending,
  onDrop,
  onConfirm,
  onStartAgain,
}: {
  studentName: string;
  message: string;
  entries: ScheduleEntry[];
  warnings: string[];
  conflicts: ScheduleConflict[];
  pending: boolean;
  onDrop: (index: number) => void;
  onConfirm: () => void;
  onStartAgain: () => void;
}) {
  const days = [...new Set(entries.map((entry) => entry.dayOfWeek))].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink">{message}</p>

      {/*
        Said before the button, not in the button. "Replace my week" tells the
        student what the control will do; this tells them what it will cost, which
        is the thing that decides whether they press it.
      */}
      <p className="flex items-start gap-1.5 rounded-[12px] border border-warning bg-surface px-4 py-3 text-body text-ink">
        <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          Replacing puts {studentName}&apos;s week back to exactly these classes. Anything already
          on it that is not in this list will be taken off.
        </span>
      </p>

      {warnings.length > 0 ? (
        <div className="rounded-[12px] border border-border bg-surface px-4 py-3">
          <p className="text-label text-ink">Left out because I could not read them</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {warnings.map((warning) => (
              <li key={warning} className="text-meta text-ink-muted">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <p className="text-meta text-ink-muted">
          Two of these overlap, on{' '}
          {[...new Set(conflicts.map((conflict) => DAYS[conflict.dayOfWeek - 1]))].join(' and ')}.
          I have left both. Check the times before you rely on them.
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-body text-ink-muted">
          Nothing is left to save, so nothing will be changed.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {days.map((day) => (
            <li key={day}>
              <h3 className="text-label mb-1.5 text-ink-muted">{DAYS[day - 1]}</h3>
              <ul className="flex flex-col gap-2">
                {entries
                  .map((entry, index) => ({ entry, index }))
                  .filter(({ entry }) => entry.dayOfWeek === day)
                  .map(({ entry, index }) => (
                    <li
                      key={`${entry.dayOfWeek}-${entry.startMinute}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-body font-semibold text-ink">{entry.title}</p>
                        <p className="tabular text-meta text-ink-muted">
                          {formatMinute(entry.startMinute)} to {formatMinute(entry.endMinute)}
                          {entry.teacherName ? ` · ${entry.teacherName}` : ''}
                          {entry.room ? ` · ${entry.room}` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => onDrop(index)}
                        aria-label={`Leave out ${entry.title}`}
                      >
                        <X size={16} aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={onConfirm}
          disabled={pending || entries.length === 0}
        >
          {pending ? 'Saving' : 'Replace my week with these'}
        </Button>
        <Button type="button" variant="ghost" onClick={onStartAgain} disabled={pending}>
          Start again
        </Button>
      </div>
    </div>
  );
}