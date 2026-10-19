'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';

import { addAttendanceNote } from './actions';
import { NOTE_MAX_LENGTH, NOTE_SEVERITIES, noteProblem } from './note-craft';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import type { Severity } from '@/lib/api/types';

/**
 * Recording why a student is marked the way they are.
 *
 * WHY THIS EXISTS. `addAttendanceNote` has been on the server since the register
 * was built, with the behaviour log behind it and no control in front of it. A
 * teacher could mark a student absent and had nowhere to record why, which is
 * the half of the workflow the mark is for.
 *
 * WHY ONE DIALOG RATHER THAN A BUTTON ON EVERY ROW. `AttendanceGrid` is shared
 * with the overview dashboard, so a per-row control would put a 44px target in
 * a grid that is tuned for tapping a status, on a screen that has to work at
 * 375px. Choosing the student inside the dialog keeps the grid untouched and
 * gives the teacher one place to learn the four kinds of note.
 *
 * WHY THE FIELD VALIDATES BEFORE THE ACTION DOES. The limit and the vocabulary
 * come from `note-craft`, which the server action also reads, so the two cannot
 * drift. Checking here is a courtesy, not the safety net: the action still
 * refuses an empty note, because a client can be anything.
 */

export interface AttendanceNoteDialogProps {
  classId: string;
  students: { id: string; name: string }[];
  disabled?: boolean;
}

export function AttendanceNoteDialog({
  classId,
  students,
  disabled = false,
}: AttendanceNoteDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [studentId, setStudentId] = React.useState('');
  const [severity, setSeverity] = React.useState<Severity>('note');
  const [entry, setEntry] = React.useState('');
  const [problem, setProblem] = React.useState('');

  const mutation = useMutation({
    mutationFn: addAttendanceNote,
  });

  /*
   * Closing must not leave yesterday's half-written note in the field.
   *
   * Every route out of the dialog goes through here rather than through a bare
   * `setOpen(false)`. The first version reset from `onOpenChange` only, and the
   * Cancel button set the state directly, which does not raise that callback:
   * the dialog closed and the note stayed where it was, so reopening showed the
   * teacher a sentence they had already abandoned. Radix calls `onOpenChange`
   * when the trigger drives the state, not when the controlled prop changes.
   */
  const reset = () => {
    setStudentId('');
    setSeverity('note');
    setEntry('');
    setProblem('');
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const save = async () => {
    const found = noteProblem(entry);
    if (found) {
      setProblem(found);
      return;
    }
    if (!studentId) {
      setProblem('Choose which student this note is about.');
      return;
    }

    setProblem('');
    try {
      const outcome = await mutation.mutateAsync({ classId, studentId, entry, severity });
      if (!outcome.ok) {
        setProblem(outcome.message);
        return;
      }
      toast.success('Note saved.', {
        description: 'It is now part of the history for that student.',
      });
      close();
    } catch {
      setProblem('That note could not be saved.');
    }
  };

  const chosen = NOTE_SEVERITIES.find((option) => option.value === severity);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" disabled={disabled || students.length === 0}>
          Add note
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a note</DialogTitle>
          <DialogDescription>
            Notes are attached to the history for that student and to the day you
            chose. They do not change a mark.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <FormField id="note-student" label="Student" required>
            {(props) => (
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger id={props.id} aria-invalid={props['aria-invalid']}>
                  <SelectValue placeholder="Choose a student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <div>
            <Label htmlFor="note-kind">Kind</Label>
            <Select
              value={severity}
              onValueChange={(next) => {
                /*
                 * Narrowed through the list rather than cast. The widget hands
                 * back a string, and the action's parameter is a union, so a
                 * value the list does not contain has to be dropped rather than
                 * forced through and left for the server to refuse.
                 */
                const found = NOTE_SEVERITIES.find((option) => option.value === next);
                if (found) setSeverity(found.value);
              }}
            >
              <SelectTrigger id="note-kind" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_SEVERITIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chosen ? (
              <p className="mt-1.5 text-meta text-ink-muted">{chosen.description}</p>
            ) : null}
          </div>

          <FormField
            id="note-entry"
            label="Note"
            required
            error={problem || undefined}
            hint={`${entry.trim().length} of ${NOTE_MAX_LENGTH} characters`}
          >
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                value={entry}
                maxLength={NOTE_MAX_LENGTH}
                onChange={(event) => {
                  setEntry(event.target.value);
                  if (problem) setProblem('');
                }}
                placeholder="What happened?"
              />
            )}
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving' : 'Save note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}