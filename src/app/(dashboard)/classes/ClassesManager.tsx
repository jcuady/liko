'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArchiveIcon, PlusIcon, UsersIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { queryKeys } from '@/lib/query/keys';
import type { ClassLevel, StudentRecord } from '@/lib/api/types';

import { archiveClass, archiveStudent, createClass, createStudent } from './actions';

/**
 * Roster management.
 *
 * Reads arrive as server props and are handed to the query cache as `initialData`,
 * so the first paint is the server's answer rather than a spinner over the same
 * data. Writes go through server actions, and every one of them calls the seam.
 *
 * WHY EVERY WRITE REFRESHES THE ROUTER. This component renders `classes` from
 * props, not from a `useQuery` observer, so `invalidateQueries` had nothing to
 * re-render and a freshly created class or student simply did not appear until
 * a full reload. `router.refresh()` re-runs the server component, which is the
 * only thing that can update server props. The invalidation is kept because other
 * screens (grades, attendance, history) do observe those keys.
 */

function useRefreshAfterWrite() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.classes() });
    router.refresh();
  }, [queryClient, router]);
}

const LEVEL_LABELS: Record<ClassLevel, string> = {
  preschool: 'Preschool',
  k12: 'K to 12',
  university: 'University',
};

export interface ClassSummary {
  id: string;
  name: string;
  code: string;
  level: ClassLevel;
  meetsPerWeek: number;
  students: StudentRecord[];
}

export function ClassesManager({ classes }: { classes: ClassSummary[] }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(classes[0]?.id ?? null);
  const selected = classes.find((item) => item.id === selectedId) ?? classes[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-h4">Your classes</h2>
          <p className="text-meta text-ink-muted">
            {classes.length === 0
              ? 'Nothing yet.'
              : `${classes.length} ${classes.length === 1 ? 'class' : 'classes'}, ${classes.reduce(
                  (total, item) => total + item.students.length,
                  0,
                )} students in total.`}
          </p>
        </div>
        <NewClassDialog />
      </div>

      {classes.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No classes yet"
          description="A class holds the roster, the register, the gradebook, and the plan. Create one and everything else attaches to it."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          {/*
            `min-w-0` on both grid children is load bearing. A grid item defaults
            to `min-width: auto`, which means it refuses to shrink below its
            widest unbreakable content. The code badge is `whitespace-nowrap`,
            so on a 375px screen the list refused to shrink, the single-column
            grid track grew to fit it, and the whole page scrolled sideways by
            56px. The desktop track already used `minmax(0, ...)` for the same
            reason.
          */}
          <ul className="flex min-w-0 flex-col gap-2">
            {classes.map((item) => {
              const active = item.id === selected?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`pressable w-full rounded-[12px] border px-4 py-3 text-left transition-colors duration-150 ${
                      active
                        ? 'border-accent bg-accent-subtle'
                        : 'border-border bg-surface hover:border-border-strong hover:bg-surface-sunken'
                    }`}
                  >
                    <span className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-[0.9375rem] font-medium text-ink">
                        {item.name}
                      </span>
                      <Badge tone={active ? 'accent' : 'neutral'}>{item.code}</Badge>
                    </span>
                    <span className="mt-1 block text-meta text-ink-muted">
                      {LEVEL_LABELS[item.level]} · {item.students.length}{' '}
                      {item.students.length === 1 ? 'student' : 'students'} · {item.meetsPerWeek}{' '}
                      {item.meetsPerWeek === 1 ? 'lesson' : 'lessons'} a week
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected ? <RosterPanel classRecord={selected} /> : null}
        </div>
      )}
    </div>
  );
}

function RosterPanel({ classRecord }: { classRecord: ClassSummary }) {
  const [studentToArchive, setStudentToArchive] = React.useState<string | null>(null);
  const refresh = useRefreshAfterWrite();

  const archive = useMutation({
    mutationFn: archiveStudent,
    onSuccess: (result) => {
      // A refusal arrives as a resolved value, so it is checked here rather
      // than left to look like a success.
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setStudentToArchive(null);
      void refresh();
    },
    onError: () => toast.error('That student could not be archived. Try again.'),
  });

  const archiveClassMutation = useMutation({
    mutationFn: archiveClass,
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      void refresh();
    },
    onError: () => toast.error('That class could not be archived. Try again.'),
  });

  return (
    <Card className="min-w-0">
      {/*
        Stacks below `sm`. The title carries a class name and the action is
        `whitespace-nowrap`, so side by side they needed 410px of a 375px
        screen and the page scrolled sideways to reach Archive.
      */}
      <CardHeader className="flex-col items-start gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="min-w-0">
          <CardTitle>Roster for {classRecord.name}</CardTitle>
          <p className="text-meta text-ink-muted">
            Guardian details are used for messages about this student.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <NewStudentDialog classId={classRecord.id} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => archiveClassMutation.mutate(classRecord.id)}
            disabled={archiveClassMutation.isPending}
          >
            <ArchiveIcon size={15} weight="bold" aria-hidden="true" />
            Archive class
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/*
          `relative` on the scroll wrapper is load bearing. An
          `overflow-x-auto` container only clips absolutely positioned
          descendants when it is their containing block. The "Actions" column
          header hides its label with an `sr-only` span, which is absolutely
          positioned, so without `relative` it escaped the clip and widened the
          document by 16px: a page that scrolled sideways by a hair for no
          visible reason.
        */}
        {classRecord.students.length === 0 ? (
          <p className="text-body text-ink-muted">
            No students on this roster yet. Add the first one and the register, gradebook, and
            history all start filling in.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Students in {classRecord.name}, with guardian contact details
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-2 py-2 text-[0.75rem] font-medium text-ink-subtle">
                    Student
                  </th>
                  <th scope="col" className="px-2 py-2 text-[0.75rem] font-medium text-ink-subtle">
                    Guardian
                  </th>
                  <th scope="col" className="px-2 py-2 text-[0.75rem] font-medium text-ink-subtle">
                    Contact
                  </th>
                  <th scope="col" className="px-2 py-2 text-right text-[0.75rem] font-medium text-ink-subtle">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {classRecord.students.map((student) => (
                  <tr key={student.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-2 py-2.5 text-[0.9375rem] font-medium text-ink">
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-[0.6875rem] font-semibold text-accent"
                        >
                          {student.initials}
                        </span>
                        {student.fullName}
                      </span>
                    </th>
                    <td className="px-2 py-2.5 text-[0.875rem] text-ink-muted">
                      {student.guardianName ?? <span className="text-ink-subtle">Not recorded</span>}
                    </td>
                    <td className="px-2 py-2.5 text-[0.875rem] text-ink-muted">
                      {student.guardianEmail ? (
                        <a
                          href={`mailto:${student.guardianEmail}`}
                          // `min-h-11` rather than padding, because padding plus a line box landed on
                          // 43px and the target has to be 44 or it is not one.
                          className="inline-flex min-h-11 items-center rounded-[4px] underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {student.guardianEmail}
                        </a>
                      ) : (
                        <span className="text-ink-subtle">No email</span>
                      )}
                      {student.guardianPhone ? (
                        <span className="tabular block text-[0.8125rem] text-ink-subtle">
                          {student.guardianPhone}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStudentToArchive(student.id)}
                        disabled={archive.isPending}
                      >
                        <span className="sr-only">Archive {student.fullName}</span>
                        <ArchiveIcon size={15} weight="bold" aria-hidden="true" />
                        <span aria-hidden="true">Archive</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialog
          open={studentToArchive !== null}
          onOpenChange={(open) => {
            if (!open) setStudentToArchive(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archive this student?</DialogTitle>
              <DialogDescription>
                They disappear from the register, gradebook, and history. Existing marks are kept
                but stop appearing. This cannot be undone from here.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setStudentToArchive(null)}>
                Keep on roster
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (studentToArchive) archive.mutate(studentToArchive);
                }}
                disabled={archive.isPending}
              >
                {archive.isPending ? 'Archiving' : 'Archive student'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function NewClassDialog() {
  const [open, setOpen] = React.useState(false);
  const refresh = useRefreshAfterWrite();

  const create = useMutation({
    mutationFn: createClass,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      await refresh();
    },
    onError: () => toast.error('That class could not be created. Try again.'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon size={15} weight="bold" aria-hidden="true" />
          New class
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a class</DialogTitle>
          <DialogDescription>
            Everything else in the app attaches to a class, so this is the first thing to set up.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            create.mutate({
              name: String(form.get('name') ?? ''),
              code: String(form.get('code') ?? ''),
              level: String(form.get('level') ?? 'k12') as ClassLevel,
              meetsPerWeek: Number(form.get('meetsPerWeek') ?? 1),
            });
          }}
        >
          <FormField id="class-name" label="Class name" required>
            {(props) => <Input {...props} name="name" placeholder="Chemistry, Period 2" />}
          </FormField>

          <FormField id="class-code" label="Short code" required hint="Shown wherever space is tight.">
            {(props) => <Input {...props} name="code" placeholder="CHEM-2" />}
          </FormField>

          <FormField id="class-level" label="Level">
            {(props) => (
              <Select
                {...props}
                name="level"
                defaultValue="k12"
              >
                <option value="preschool">Preschool</option>
                <option value="k12">K to 12</option>
                <option value="university">University</option>
              </Select>
            )}
          </FormField>

          <FormField id="class-meets" label="Lessons per week">
            {(props) => (
              <Input
                {...props}
                name="meetsPerWeek"
                type="number"
                min={1}
                max={14}
                defaultValue={3}
                inputMode="numeric"
              />
            )}
          </FormField>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating' : 'Create class'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewStudentDialog({ classId }: { classId: string }) {
  const [open, setOpen] = React.useState(false);
  const refresh = useRefreshAfterWrite();

  const create = useMutation({
    mutationFn: createStudent,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      await refresh();
    },
    onError: () => toast.error('That student could not be added. Try again.'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <PlusIcon size={15} weight="bold" aria-hidden="true" />
          Add student
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a student</DialogTitle>
          <DialogDescription>
            Guardian details are optional now and can be filled in later.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            create.mutate({
              classId,
              fullName: String(form.get('fullName') ?? ''),
              guardianName: String(form.get('guardianName') ?? ''),
              guardianEmail: String(form.get('guardianEmail') ?? ''),
              guardianPhone: String(form.get('guardianPhone') ?? ''),
            });
          }}
        >
          <FormField id="student-name" label="Full name" required>
            {(props) => <Input {...props} name="fullName" autoComplete="off" />}
          </FormField>

          <FormField id="student-guardian" label="Guardian name">
            {(props) => <Input {...props} name="guardianName" autoComplete="off" />}
          </FormField>

          <FormField id="student-email" label="Guardian email" hint="Used for messages about this student.">
            {(props) => (
              <Input {...props} name="guardianEmail" type="email" autoComplete="off" />
            )}
          </FormField>

          <FormField id="student-phone" label="Guardian phone">
            {(props) => (
              <Input {...props} name="guardianPhone" type="tel" autoComplete="off" />
            )}
          </FormField>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding' : 'Add student'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
