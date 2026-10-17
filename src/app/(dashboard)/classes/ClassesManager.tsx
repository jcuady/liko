'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { Archive, Plus, Upload, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRowHead,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { queryKeys } from '@/lib/query/keys';
import type { ClassLevel, StudentRecord } from '@/lib/api/types';
import { buildImportPlan, type ImportPlan } from '@/lib/roster/import';

import { archiveClass, archiveStudent, createClass, createStudent, importRoster } from './actions';

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
  /**
   * Whether this account may read the roster, as opposed to merely seeing the
   * class. False renders no count, because RLS cannot tell an empty class from
   * a denied one and a printed "0" would be a claim nobody checked.
   */
  rosterVisible: boolean;
}

export function ClassesManager({ classes }: { classes: ClassSummary[] }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(classes[0]?.id ?? null);
  const selected = classes.find((item) => item.id === selectedId) ?? classes[0] ?? null;

  const visible = classes.filter((item) => item.rosterVisible);
  const studentsSeen = visible.reduce((total, item) => total + item.students.length, 0);
  const classNoun = classes.length === 1 ? 'class' : 'classes';

  /*
   * The old sentence, and the honest one.
   *
   * "3 classes, 8 students in total" is true when every roster is yours. It is
   * false when one is not, and it was false in production for exactly one
   * account. So the total is only stated across the rosters this account may
   * actually read, and the count of those is said rather than implied.
   */
  const summary =
    classes.length === 0
      ? 'Nothing yet.'
      : visible.length === classes.length
        ? `${classes.length} ${classNoun}, ${studentsSeen} students in total.`
        : `${classes.length} ${classNoun}. ${studentsSeen} students across the ${visible.length} ${
            visible.length === 1 ? 'roster' : 'rosters'
          } you can see.`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-h4">Your classes</h2>
          <p className="text-meta text-ink-muted">{summary}</p>
        </div>
        <NewClassDialog />
      </div>

      {classes.length === 0 ? (
        <EmptyState
          icon={Users}
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
                      {item.rosterVisible
                        ? `${LEVEL_LABELS[item.level]} · ${item.students.length} ${
                            item.students.length === 1 ? 'student' : 'students'
                          } · ${item.meetsPerWeek} ${
                            item.meetsPerWeek === 1 ? 'lesson' : 'lessons'
                          } a week`
                        : `${LEVEL_LABELS[item.level]} · Roster not visible to you · ${
                            item.meetsPerWeek
                          } ${item.meetsPerWeek === 1 ? 'lesson' : 'lessons'} a week`}
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
          <ImportRosterDialog classId={classRecord.id} />
          {/*
            CONFIRMED, BECAUSE ARCHIVING A CLASS IS NOT ARCHIVING A BUTTON.
            This fired on a single click, while the archive-student action
            directly below had a full confirmation dialog. So the less dangerous
            action was the guarded one, which is the wrong way round: archiving a
            class takes every student on it out of the register, the gradebook and
            the history in one click, with no undo offered and no chance to see
            which class was selected first.

            The dialog names the class, because "Archive class" alone beside a
            class named in the card heading is ambiguous when two cards are open.
          */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={archiveClassMutation.isPending}>
                <Archive size={15} aria-hidden="true" />
                Archive class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Archive {classRecord.name}?</DialogTitle>
                <DialogDescription>
                  Everyone on this roster disappears from the register, the
                  gradebook and the history. Existing marks are kept but stop
                  appearing. This cannot be undone from here.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Keep it</Button>
                </DialogClose>
                <Button
                  variant="danger"
                  onClick={() => archiveClassMutation.mutate(classRecord.id)}
                  disabled={archiveClassMutation.isPending}
                >
                  {archiveClassMutation.isPending ? 'Archiving' : 'Archive class'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
        {/*
          THREE THINGS LOOK THE SAME HERE AND ONLY ONE OF THEM IS TRUE: a roster
          nobody has added to, a roster you are not allowed to read, and a
          roster that failed to load. The second says so, because "add the first
          one" is advice that is wrong when the answer is that you cannot see
          them, and it invites an administrator to try to write into a class
          they do not teach.
        */}
        {!classRecord.rosterVisible ? (
          <p className="text-body text-ink-muted">
            This roster belongs to another teacher, so you cannot see the names on it. The
            class, its register and its gradebook are unaffected.
          </p>
        ) : classRecord.students.length === 0 ? (
          <p className="text-body text-ink-muted">
            No students on this roster yet. Add the first one and the register, gradebook, and
            history all start filling in.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <Table>
              <TableCaption className="sr-only">
                Students in {classRecord.name}, with guardian contact details
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Student</TableHead>
                  <TableHead scope="col">Guardian</TableHead>
                  <TableHead scope="col">Contact</TableHead>
                  <TableHead scope="col" className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classRecord.students.map((student) => (
                  <TableRow key={student.id}>
                    <TableRowHead scope="row">
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-[0.6875rem] font-semibold text-accent"
                        >
                          {student.initials}
                        </span>
                        {student.fullName}
                      </span>
                    </TableRowHead>
                    <TableCell className="text-ink-muted">
                      {student.guardianName ?? <span className="text-ink-subtle">Not recorded</span>}
                    </TableCell>
                    <TableCell className="text-ink-muted">
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
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStudentToArchive(student.id)}
                        disabled={archive.isPending}
                      >
                        <span className="sr-only">Archive {student.fullName}</span>
                        <Archive size={15} aria-hidden="true" />
                        <span aria-hidden="true">Archive</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
          <Plus size={15} aria-hidden="true" />
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
              /* `name` on the root: this dialog posts through FormData. */
              <Select name="level" defaultValue="k12">
                <SelectTrigger {...props}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preschool">Preschool</SelectItem>
                  <SelectItem value="k12">K to 12</SelectItem>
                  <SelectItem value="university">University</SelectItem>
                </SelectContent>
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

function ImportRosterDialog({ classId }: { classId: string }) {
  const [open, setOpen] = React.useState(false);
  const [csv, setCsv] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [result, setResult] = React.useState<{
    message: string;
    created: number;
    problems: { row: number; message: string }[];
    duplicates: { row: number; message: string }[];
  } | null>(null);
  const refresh = useRefreshAfterWrite();

  /*
   * Parsed here only so the teacher sees what is about to happen. The action
   * parses the same text again on the server and ignores this entirely, because
   * a preview is a claim until the server has checked it.
   */
  const plan: ImportPlan | null = React.useMemo(
    () => (csv.trim() === '' ? null : buildImportPlan(csv)),
    [csv],
  );

  const importList = useMutation({
    mutationFn: importRoster,
    onSuccess: async (data) => {
      await refresh();
      setResult({
        message: data.message,
        created: data.created,
        problems: data.problems,
        duplicates: data.duplicates,
      });
      if (data.ok && data.problems.length === 0) {
        toast.success(data.message);
      }
    },
    onError: () => toast.error('That file could not be imported. Try again.'),
  });

  function reset() {
    setCsv('');
    setFileName('');
    setResult(null);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Upload size={15} aria-hidden="true" />
          Import CSV
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a class list</DialogTitle>
          <DialogDescription>
            A CSV with a name column, and optionally guardian name, email and
            phone. Column order does not matter and the headings are matched by
            what they say.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4">
            <p className="text-[0.9375rem] text-ink">{result.message}</p>

            {(result.problems.length > 0 || result.duplicates.length > 0) && (
              <div className="max-h-56 overflow-y-auto rounded-[12px] border border-border">
                <Table>
                  <TableCaption className="sr-only">Rows left out of this import</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Row</TableHead>
                      <TableHead scope="col">Why</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...result.duplicates, ...result.problems].map((problem) => (
                      <TableRow key={`${problem.row}-${problem.message}`}>
                        <TableCell className="tabular text-ink-muted">{problem.row}</TableCell>
                        <TableCell>{problem.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <DialogFooter>
              <Button onClick={reset}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <FormField
              id="roster-file"
              label={fileName === '' ? 'Choose a CSV file' : fileName}
              hint="Or paste into the box below."
            >
              {(props) => (
                <input
                  {...props}
                  type="file"
                  accept=".csv,text/csv"
                  className="block w-full text-[0.9375rem] text-ink file:mr-3 file:rounded-[10px] file:border-0 file:bg-accent file:px-3 file:py-2 file:text-[0.9375rem] file:font-medium file:text-on-accent"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setFileName(file.name);
                    setCsv(await file.text());
                  }}
                />
              )}
            </FormField>

            <FormField id="roster-paste" label="Or paste rows" hint="First column is the name.">
              {(props) => (
                <Textarea
                  {...props}
                  rows={5}
                  value={csv}
                  onChange={(event) => {
                    setCsv(event.target.value);
                    setFileName('');
                  }}
                  placeholder={'Ana Ng, Mrs Ng, ana@example.com'}
                  className="w-full rounded-[12px] border border-border bg-surface px-3.5 py-3 text-[0.9375rem] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
                />
              )}
            </FormField>

            {plan && (
              <div className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface-sunken p-4">
                <p className="text-[0.9375rem] font-medium text-ink">
                  {plan.drafts.length === 0
                    ? 'No students could be read from this.'
                    : `${plan.drafts.length} student${plan.drafts.length === 1 ? '' : 's'} ready to add.`}
                </p>

                {plan.drafts.length > 0 && (
                  <p className="text-meta text-ink-muted">
                    {plan.drafts.slice(0, 4).map((draft) => draft.fullName).join(', ')}
                    {plan.drafts.length > 4 ? `, and ${plan.drafts.length - 4} more` : ''}
                  </p>
                )}

                {!plan.hasHeader && plan.drafts.length > 0 && (
                  <p className="text-meta text-ink-muted">
                    No heading row found, so the first column is being read as the
                    name and guardian columns are ignored.
                  </p>
                )}

                {plan.problems.length > 0 && (
                  <p className="text-meta text-ink-muted">
                    {plan.problems.length} row{plan.problems.length === 1 ? '' : 's'} will be left
                    out. The first is row {plan.problems[0].row}: {plan.problems[0].message}
                  </p>
                )}

                <p className="text-meta text-ink-muted">
                  No student logins are created by an import. Add those one at a
                  time when someone actually needs one.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Cancel
              </Button>
              <Button
                disabled={!plan || plan.drafts.length === 0 || importList.isPending}
                onClick={() => importList.mutate({ classId, csv })}
              >
                {importList.isPending
                  ? 'Adding'
                  : `Add ${plan?.drafts.length ?? 0} student${plan?.drafts.length === 1 ? '' : 's'}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewStudentDialog({ classId }: { classId: string }) {
  const [open, setOpen] = React.useState(false);
  const [issueLogin, setIssueLogin] = React.useState(false);
  const [issued, setIssued] = React.useState<{ name: string; password: string } | null>(null);
  const refresh = useRefreshAfterWrite();

  const create = useMutation({
    mutationFn: createStudent,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await refresh();
      if (result.issuedPassword) {
        // Kept open so the password is on screen when it is needed, rather than
        // handed over in a toast that disappears on its own.
        setIssued({ name: result.message.replace(' added with a login.', ''), password: result.issuedPassword });
      } else {
        setOpen(false);
      }
    },
    onError: () => toast.error('That student could not be added. Try again.'),
  });

  if (issued) {
    return (
      <Dialog open onOpenChange={(next) => { if (!next) setIssued(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login created</DialogTitle>
            <DialogDescription>
              Write this password down and hand it over now. It is shown once and
              cannot be shown again.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="rounded-[12px] border border-accent bg-accent-subtle p-4">
              <p className="text-label">{issued.name}</p>
              <p className="tabular mt-2 select-all break-all text-[1.0625rem] font-semibold text-ink">
                {issued.password}
              </p>
            </div>
            <p className="text-meta text-ink-muted">
              Ask them to change it after the first sign-in. Do not send it in an
              email that others can read.
            </p>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setIssued(null);
                setIssueLogin(false);
                setOpen(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus size={15} aria-hidden="true" />
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
              issueLogin,
              loginEmail: String(form.get('loginEmail') ?? ''),
              loginRole: String(form.get('loginRole') ?? 'student'),
              temporaryPassword: String(form.get('temporaryPassword') ?? ''),
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

          {/*
            The login is opt-in and off by default, because most students will
            never need one. The explanation sits above the control rather than in
            a tooltip, because the whole point is that this is the only way a
            student account comes into existence, and that is not a fact anyone
            should have to discover by reading the code.
          */}
          <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface-sunken p-4">
            <label className="flex items-center justify-between gap-4">
              <span className="text-[0.9375rem] font-medium text-ink">
                Create a LIKO login
              </span>
              <Switch
                checked={issueLogin}
                onCheckedChange={setIssueLogin}
                aria-label="Create a LIKO login for this student"
              />
            </label>

            <p className="text-meta text-ink-muted">
              Students and guardians cannot sign up themselves. This is the only
              place their account is created, and it is tied to this class.
            </p>

            {issueLogin ? (
              <div className="flex flex-col gap-4">
                <FormField id="student-login-role" label="Login is for">
                  {(props) => (
                    <Select name="loginRole" defaultValue="student">
                      <SelectTrigger {...props}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">The student</SelectItem>
                        <SelectItem value="guardian">The guardian</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FormField>

                <FormField
                  id="student-login-email"
                  label="Login email"
                  required
                  hint="Must be an address they can open."
                >
                  {(props) => (
                    <Input
                      {...props}
                      name="loginEmail"
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                    />
                  )}
                </FormField>

                <FormField
                  id="student-login-password"
                  label="Temporary password"
                  hint="Leave blank and one will be generated. They can change it after signing in."
                >
                  {(props) => (
                    <Input
                      {...props}
                      name="temporaryPassword"
                      type="text"
                      autoComplete="off"
                    />
                  )}
                </FormField>
              </div>
            ) : null}
          </div>

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
