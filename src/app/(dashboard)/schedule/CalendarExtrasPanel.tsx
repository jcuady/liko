'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { CalendarPlus, CircleAlert, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CalendarEventRecord, TermRecord } from '@/lib/api/types';

import {
  deleteEventAction,
  deleteTermAction,
  saveEventAction,
  saveTermAction,
  type SaveResult,
} from './events';

/**
 * Deadlines and the term they sit inside.
 *
 * WHY A TIMETABLE NEEDS DATES BESIDE IT. The weekly grid answers "what do I have
 * on Thursday" and cannot answer "when is the lab report due", because a
 * recurring class has no date and a deadline has no slot in a week. They are
 * different kinds of thing and the schema keeps them apart: a class is a day of
 * the week and minutes from midnight, an event is a moment.
 *
 * So the review-before-replacing rule does not apply here. A deadline the person
 * typed is the record, and the only thing worth guarding is that it is legible
 * and removable by name.
 */

const KINDS = [
  { value: 'deadline', label: 'Deadline' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'exam', label: 'Exam' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'event', label: 'Event' },
] as const;

const FIELD_ID = 'calendar-event';

/**
 * A date, written the way a person says it.
 *
 * Not `toISOString`, because that converts to UTC and can move an all-day item
 * to the day before for anyone west of Greenwich. The input gave a local date and
 * the list reads a local date.
 *
 * `withYear` exists because a TERM is the one thing here that routinely crosses
 * a calendar year. "Aug 3 to Jan 18" with no years is not ambiguous to a
 * machine and is ambiguous to a teacher: it does not say whether this is the
 * term that began last August or the one beginning next. A deadline is read
 * against today, so the year is noise there and it is left off.
 */
function readableDate(iso: string, withYear = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/**
 * The four shapes a school can call a term.
 *
 * A school running quarters and a school running semesters both say "term", so
 * the label has to come from what was recorded. The values are the schema's,
 * not a second list of them.
 */
const TERM_KINDS = [
  { value: 'semester', label: 'Semester' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'term', label: 'Term' },
  { value: 'trimester', label: 'Trimester' },
] as const;

export function CalendarExtrasPanel({
  studentId,
  events,
  terms,
  canWriteTerms,
}: {
  studentId: string | null;
  events: CalendarEventRecord[];
  terms: TermRecord[];
  canWriteTerms: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [termOpen, setTermOpen] = React.useState(false);

  /*
   * Deleting the current term is offered on the same row that states it, and
   * only to whoever may write terms. A student sees the term and nothing else:
   * the school publishes it, a student does not get to retract it.
   */
  const removeTerm = useMutation({
    mutationFn: (termId: string) => deleteTermAction({ termId }),
    onSuccess: (outcome: SaveResult) => {
      if (!outcome.ok) {
        setMessage(outcome.message ?? 'That term could not be removed.');
        return;
      }
      setMessage(null);
      router.refresh();
    },
    onError: () => setMessage('That term could not be removed.'),
  });

  const remove = useMutation({
    mutationFn: (eventId: string) =>
      deleteEventAction({ eventId, studentId }),
    onSuccess: (outcome: SaveResult) => {
      if (!outcome.ok) {
        setMessage(outcome.message ?? 'That could not be removed.');
        return;
      }
      setMessage(null);
      router.refresh();
    },
    onError: () => setMessage('That could not be removed.'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deadlines and dates</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/*
          The current term is stated rather than assumed. A school running
          quarters and a school running semesters both call this a term, so the
          label comes from what was recorded rather than from a default.
        */}
        {terms.length > 0 ? (
          <div className="flex items-start justify-between gap-3">
            <p className="text-body text-ink">
              <span className="font-semibold">{terms[0]?.name}</span>{' '}
              <span className="text-ink-muted">
                {readableDate(terms[0]?.startsOn ?? '', true)} to{' '}
                {readableDate(terms[0]?.endsOn ?? '', true)}
              </span>
            </p>
            {canWriteTerms && terms[0] ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={removeTerm.isPending}
                onClick={() => removeTerm.mutate(terms[0]!.id)}
                aria-label={`Remove ${terms[0]!.name}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : canWriteTerms ? (
          <p className="text-body text-ink-muted">
            No term has been set up yet. Adding one tells everyone which stretch of
            the year this is.
          </p>
        ) : (
          <p className="text-body text-ink-muted">
            Your school has not published a term yet.
          </p>
        )}

        {/*
          THE FORM THIS PANEL USED TO ASK FOR IN WORDS AND NOT PROVIDE.

          It displayed terms, it told a teacher that "no term has been set up yet"
          and that adding one would help, and it offered no way to add one. The
          action and the schema were both already written and gated on
          `class:write`, so this was the last piece, and the panel had been
          reading as a feature that existed while offering no control for it.
        */}
        {canWriteTerms ? (
          <Dialog open={termOpen} onOpenChange={setTermOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="self-start">
                <CalendarPlus size={17} aria-hidden="true" />
                {terms.length > 0 ? 'Add another term' : 'Set up a term'}
              </Button>
            </DialogTrigger>
            <AddTermDialog
              onCancel={() => setTermOpen(false)}
              onSaved={() => {
                setTermOpen(false);
                setMessage(null);
                router.refresh();
              }}
            />
          </Dialog>
        ) : null}

        {events.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-body font-semibold text-ink">{event.title}</p>
                  <p className="text-meta text-ink-muted">
                    {readableDate(event.startsAt)}
                    {event.allDay ? '' : `, ${new Date(event.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
                    {' · '}
                    {KINDS.find((kind) => kind.value === event.kind)?.label ?? event.kind}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(event.id)}
                  aria-label={`Remove ${event.title}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-muted">
            Nothing due in the next few months.
          </p>
        )}

        <p aria-live="polite" className="min-h-5 text-body text-danger">
          {message}
        </p>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary" className="self-start">
              <CalendarPlus size={17} aria-hidden="true" />
              Add a deadline
            </Button>
          </DialogTrigger>
          <AddEventDialog
            studentId={studentId}
            onCancel={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              setMessage(null);
              router.refresh();
            }}
          />
        </Dialog>
      </CardContent>
    </Card>
  );
}

/**
 * Creates an academic term.
 *
 * The dates are two plain `YYYY-MM-DD` strings, not timestamps. A term is a
 * range of days, and turning the ends into instants is what gives a school a
 * term that is an hour short on one side and a day long on the other depending
 * on the reader's timezone. The schema refuses an end before its start with a
 * sentence naming both dates, rather than silently swapping them.
 */
function AddTermDialog({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel: () => void;
}) {
  const FIELD_ID = 'term';
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState<string>('semester');
  const [startsOn, setStartsOn] = React.useState('');
  const [endsOn, setEndsOn] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => saveTermAction({ name, kind, startsOn, endsOn }),
    onSuccess: (outcome: SaveResult) => {
      if (!outcome.ok) {
        setError(outcome.message ?? 'That term could not be saved.');
        return;
      }
      onSaved();
    },
    onError: () => setError('That term could not be saved.'),
  });

  // The button waits for the whole range, because a term with no end is the one
  // thing here that cannot be repaired later without re-asking every student.
  const complete = name.trim().length > 0 && startsOn.length > 0 && endsOn.length > 0;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Set up a term</DialogTitle>
        <DialogDescription>
          Everyone sees the term this school is in. It is what tells a deadline
          whether it is due this term or next.
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <FormField id={`${FIELD_ID}-name`} label="Name" required>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Autumn term"
              autoComplete="off"
            />
          )}
        </FormField>

        <label className="flex flex-col gap-1.5">
          <span className="text-label text-ink">Kind</span>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERM_KINDS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <FormField id={`${FIELD_ID}-starts`} label="Starts" required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            )}
          </FormField>
          <FormField id={`${FIELD_ID}-ends`} label="Ends" required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            )}
          </FormField>
        </div>

        {error ? (
          <p role="alert" className="flex items-start gap-1.5 text-body text-danger">
            <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}

        <DialogFooter>
          {/*
            A way out that is not the save button.

            Without it the only ways to leave are saving or pressing Escape,
            which discards whatever was typed with no confirmation. Escape still
            works and the close control still works; this is for the person who
            typed a term, decided it was wrong, and wants to stop without
            guessing a keyboard shortcut.
          */}
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || !complete}>
            {save.isPending ? 'Saving' : 'Save the term'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function AddEventDialog({
  studentId,
  onSaved,
  onCancel,
}: {
  studentId: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState('');
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('23:59');
  const [kind, setKind] = React.useState<string>('deadline');
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveEventAction({
        studentId,
        title,
        startsAt: new Date(`${date}T${time}`).toISOString(),
        allDay: false,
        kind,
      }),
    onSuccess: (outcome: SaveResult) => {
      if (!outcome.ok) {
        setError(outcome.message ?? 'That could not be saved.');
        return;
      }
      onSaved();
    },
    onError: () => setError('That could not be saved.'),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add a deadline</DialogTitle>
        <DialogDescription>
          It appears here and nowhere else until someone gives it a slot in the week.
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <FormField id={`${FIELD_ID}-title`} label="What is it" required>
          {(props) => (
            <Input
              {...props}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
            />
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField id={`${FIELD_ID}-date`} label="Date" required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            )}
          </FormField>
          <FormField id={`${FIELD_ID}-time`} label="Time" required>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            )}
          </FormField>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-label text-ink">Kind</span>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {error ? (
          <p role="alert" className="flex items-start gap-1.5 text-body text-danger">
            <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || date.length === 0}>
            {save.isPending ? 'Saving' : 'Add it'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}