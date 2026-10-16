"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScheduleEntryRecord, StudentRecord } from "@/lib/api/types";
import type { Role } from "@/lib/auth/rbac";
import { formatMinute } from "@/lib/schedule/extract";
import { queryKeys } from "@/lib/query/keys";

import { removeScheduleEntry, saveScheduleEntry } from "./actions";

const DAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
] as const;

/** The school day, because a weekend column with one cell is decoration. */
const WEEKDAYS = DAYS.slice(0, 5);

const START_MINUTE = 7 * 60;
const END_MINUTE = 19 * 60;
const PX_PER_MINUTE = 0.9;

function clockToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

interface Props {
  student: StudentRecord | null;
  entries: ScheduleEntryRecord[];
  options: { id: string; fullName: string }[];
  showPicker: boolean;
  role: Role;
}

export function WeeklyGrid({ student, entries, options, showPicker, role }: Props) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState<number | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  /*
   * Captured before the empty-state return below, because a hook cannot sit
   * after an early return and the mutations are declared above the guard. The
   * key accepts undefined and falls back to `'own'`, which is the right cache
   * entry for a student with no roster row because that is the week being
   * invalidated.
   */
  const subjectId = student?.id;

  const save = useMutation({
    mutationFn: saveScheduleEntry,
    onSuccess: (result) => {
      if (!result.ok) {
        setMessage(result.message ?? "That class could not be saved.");
        return;
      }
      setMessage(null);
      setAdding(null);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.schedule(subjectId),
      });
    },
    onError: () => setMessage("That class could not be saved."),
  });

  const remove = useMutation({
    mutationFn: removeScheduleEntry,
    onSuccess: (result) => {
      if (!result.ok) {
        setMessage(result.message ?? "That class could not be removed.");
        return;
      }
      setMessage(null);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.schedule(subjectId),
      });
    },
    onError: () => setMessage("That class could not be removed."),
  });

  if (showPicker && !student) {
    return <StudentPicker options={options} />;
  }

  if (!student) {
    /*
     * No subject resolved, and only a student or a guardian gets here: staff are
     * caught by the `showPicker` branch above.
     *
     * These are two different situations wearing one screen. A student is between
     * creating an account and being linked to a class by their teacher. A guardian
     * has no roster row of their own and no account-level link to a child either:
     * the roster stores a guardian's email and phone as plain text and nothing
     * connects those to a signed-in login, so "your teacher links you from the
     * class roster" asks a parent to go and ask their child's teacher, which is
     * not how any of this works.
     *
     * Neither copy offers to create a class. That is the one action that would be
     * wrong in both cases.
     */
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {role === "guardian" ? "No child is linked to you yet" : "You are not on a class yet"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-ink-muted">
            {role === "guardian"
              ? "Ask the school to link your child's account to this one. A week appears here once they do."
              : "Your teacher links you from the class roster. Once they do, your week appears here and you can add to it yourself."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const byDay = new Map<number, ScheduleEntryRecord[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.dayOfWeek) ?? [];
    list.push(entry);
    byDay.set(entry.dayOfWeek, list);
  }

  const height = (END_MINUTE - START_MINUTE) * PX_PER_MINUTE;

  return (
    <div className="flex flex-col gap-4">
      {/*
       * `aria-live="polite"` rather than `role="alert"`. A refused save is a
       * response to something the person just did, not an emergency, and
       * `assertive` would interrupt a screen reader mid-sentence for it.
       */}
      <p aria-live="polite" className="min-h-5 text-body text-danger">
        {message}
      </p>

      {showPicker && options.length > 1 ? (
        <StudentPicker options={options} />
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[46rem]">
          <div className="grid grid-cols-[3.5rem_repeat(5,1fr)] border-b border-border text-label text-ink-muted">
            <div />
            {WEEKDAYS.map((day) => (
              <div key={day.value} className="px-3 py-2">
                {day.label}
              </div>
            ))}
          </div>

          <div
            className="relative grid grid-cols-[3.5rem_repeat(5,1fr)]"
            style={{ height }}
          >
            {WEEKDAYS.map((day) => (
              <div key={day.value} className="border-l border-border" />
            ))}

            {WEEKDAYS.map((day) => {
              const dayEntries = byDay.get(day.value) ?? [];
              return (
                <div
                  key={day.value}
                  className="absolute top-0 border-l border-border"
                  style={{
                    left: `calc(3.5rem + (100% - 3.5rem) / 5 * ${day.value - 1})`,
                    width: `calc((100% - 3.5rem) / 5)`,
                    height,
                  }}
                >
                  {dayEntries.map((entry) => {
                    const top =
                      (entry.startMinute - START_MINUTE) * PX_PER_MINUTE;
                    const blockHeight = Math.max(
                      28,
                      (entry.endMinute - entry.startMinute) * PX_PER_MINUTE,
                    );
                    return (
                      <div
                        key={entry.id}
                        className="absolute inset-x-1 overflow-hidden rounded-[8px] border border-border bg-surface-raised px-2 py-1.5"
                        style={{ top, height: blockHeight }}
                      >
                        <p className="truncate text-label text-ink">
                          {entry.title}
                        </p>
                        <p className="tabular text-meta text-ink-muted">
                          {formatMinute(entry.startMinute)} to{" "}
                          {formatMinute(entry.endMinute)}
                        </p>
                        {entry.room ? (
                          <p className="truncate text-meta text-ink-subtle">
                            {entry.room}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}

                  <AddSlotButton
                    day={day}
                    onAdd={() => setAdding(day.value)}
                    open={adding === day.value}
                    onClose={() => setAdding(null)}
                    pending={save.isPending}
                    error={message}
                    onSubmit={(input) =>
                      save.mutate({ studentId: student.id, ...input })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DayList
        entries={entries}
        pending={remove.isPending}
        onRemove={(entryId) =>
          remove.mutate({ entryId, studentId: student.id })
        }
      />
    </div>
  );
}

/** The linear list. The grid is a picture of the week; this is the reading of it. */
function DayList({
  entries,
  pending,
  onRemove,
}: {
  entries: ScheduleEntryRecord[];
  pending: boolean;
  onRemove: (entryId: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-body text-ink-muted">
        No classes yet. Add one, or photograph your timetable and let it read
        the week for you.
      </p>
    );
  }

  const grouped = new Map<number, ScheduleEntryRecord[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.dayOfWeek) ?? [];
    list.push(entry);
    grouped.set(entry.dayOfWeek, list);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...grouped.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([day, dayEntries]) => (
          <section key={day}>
            <h2 className="text-label mb-2 text-ink-muted">
              {WEEKDAYS.find((d) => d.value === day)?.label ?? "Other"}
            </h2>
            <ul className="flex flex-col gap-2">
              {dayEntries
                .sort((a, b) => a.startMinute - b.startMinute)
                .map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-ink">
                        {entry.title}
                      </p>
                      <p className="tabular text-meta text-ink-muted">
                        {formatMinute(entry.startMinute)} to{" "}
                        {formatMinute(entry.endMinute)}
                        {entry.teacherName ? ` · ${entry.teacherName}` : ""}
                        {entry.room ? ` · ${entry.room}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => onRemove(entry.id)}
                      aria-label={`Remove ${entry.title}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function StudentPicker({
  options,
}: {
  options: { id: string; fullName: string }[];
}) {
  const router = useRouter();

  if (options.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No students yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-ink-muted">
            Add a student to a class and their week will be here to read.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label text-ink">Student</span>
      <Select
        value=""
        onValueChange={(value) => router.push(`/schedule?student=${value}`)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Choose a student" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

/**
 * A `+` on each column that opens the add form.
 *
 * A 44px target is not achievable inside a grid cell, so the button is carried
 * by the column rather than sized to the cell, and the column itself is a
 * generous target. The dialog is what does the work; the button only opens it.
 */
function AddSlotButton({
  day,
  onAdd,
  onClose,
  open,
  pending,
  error,
  onSubmit,
}: {
  day: { value: number; label: string };
  onAdd: () => void;
  onClose: () => void;
  open: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (input: {
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    title: string;
    teacherName?: string | null;
    room?: string | null;
  }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onAdd() : onClose())}>
      <DialogTrigger asChild>
        {/*
         * VISIBLE, NOT HOVER-ONLY. This was `opacity-0 group-hover:opacity-100`
         * with no `group` on the parent, which resolves to permanently
         * invisible: the only way to add a class was a keyboard focus nobody
         * would arrive at. Always visible at a low opacity, full on hover and
         * focus, so it reads as available without shouting over the week.
         */}
        <button
          type="button"
          aria-label={`Add a class on ${day.label}`}
          className="absolute inset-x-0 bottom-0 flex h-11 w-full items-center justify-center gap-1 text-label text-ink-subtle opacity-60 transition-opacity hover:bg-surface-sunken hover:opacity-100 focus-visible:opacity-100"
        >
          <Plus size={15} aria-hidden="true" />
          Add
        </button>
      </DialogTrigger>
      <AddClassDialogBody
        day={day}
        pending={pending}
        error={error}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Dialog>
  );
}

function AddClassDialogBody({
  day,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  day: { value: number; label: string };
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: {
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    title: string;
    teacherName?: string | null;
    room?: string | null;
  }) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("09:00");
  const [teacher, setTeacher] = React.useState("");
  const [room, setRoom] = React.useState("");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add a class on {day.label}</DialogTitle>
        <DialogDescription>
          It repeats every week. Use the school clock, not your phone&apos;s.
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            dayOfWeek: day.value,
            startMinute: clockToMinutes(start),
            endMinute: clockToMinutes(end),
            title,
            teacherName: teacher || null,
            room: room || null,
          });
        }}
      >
        <FormField id="schedule-title" label="Class" required>
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
          <FormField id="schedule-start" label="Starts" required>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            )}
          </FormField>
          <FormField id="schedule-end" label="Ends" required>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            )}
          </FormField>
        </div>

        <FormField id="schedule-teacher" label="Teacher" hint="Optional">
          {(props) => (
            <Input
              {...props}
              value={teacher}
              onChange={(event) => setTeacher(event.target.value)}
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField id="schedule-room" label="Room" hint="Optional">
          {(props) => (
            <Input
              {...props}
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              autoComplete="off"
            />
          )}
        </FormField>

        {error ? (
          <p role="alert" className="text-body text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving" : "Add class"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
