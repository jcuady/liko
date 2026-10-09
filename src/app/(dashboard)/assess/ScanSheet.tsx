'use client';

import * as React from 'react';
import Image from 'next/image';
import { useMutation } from '@tanstack/react-query';
import { CameraIcon, ScanIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { scanSheet, scoreAnswers } from '@/lib/omr/omr';
import type { OmrSheet } from '@/lib/omr/omr';
import type { QuestionRecord, ScannedAnswer } from '@/lib/api/types';
import { loadStudentsForClass, saveScannedGrade } from '@/app/(dashboard)/assess/actions';

/**
 * Reading a marked answer sheet.
 *
 * THE HONEST PART FIRST. A bubble sheet carries a score and nothing that says
 * whose it is, so the machine can never tell you the student. That is not a
 * limitation being worked around, it is why the assignment control below is a
 * required field rather than a convenience. A scan that guessed a name would
 * put the wrong mark on a real child, and a wrong mark in a gradebook is worse
 * than no mark.
 *
 * WHY THE TEACHER CONFIRMS BEFORE ANYTHING IS WRITTEN. A smudge, a shadow and a
 * half-shaded bubble are all cases where a human beats a threshold. The grid is
 * therefore shown, editable, and only written on an explicit save. Every cell
 * the teacher changes is flagged, so a later reader can tell a machine guess
 * from a human decision.
 *
 * WHY NOTHING IS TRUSTED FROM THE CLIENT. The score shown here is a preview
 * computed in the browser so the teacher sees it before committing. The number
 * actually stored is recomputed on the server from the stored questions and the
 * marks that were read, because a server action is a public endpoint and this
 * one decides what goes in a gradebook.
 */

/** Long edge the image is scaled to before analysis. Large enough to keep
 *  bubbles distinguishable, small enough that a phone photo stays responsive. */
const MAX_EDGE = 1400;

interface Detected {
  sheet: OmrSheet;
  marks: boolean[][];
  preview: string;
}

export function ScanSheet({
  assessment,
  questions,
  students,
}: {
  assessment: { id: string; title: string; classId: string };
  questions: QuestionRecord[];
  students: { id: string; name: string }[];
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [detected, setDetected] = React.useState<Detected | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [studentId, setStudentId] = React.useState('');

  // The page already ships the roster, so the only thing worth holding is one
  // fetched on demand when a scan starts without it. Keeping a mirrored copy of
  // the prop needed an effect to hold the two in step, and that copy was one
  // assessment change away from offering the previous class's students.
  const [loadedRoster, setLoadedRoster] = React.useState<{ id: string; name: string }[] | null>(
    null,
  );
  const roster = loadedRoster ?? students;

  // Opening a different assessment clears the sheet, the chosen student and the
  // fetched roster. This runs during render rather than from an effect on
  // purpose: an effect paints one frame of the old assessment's scan against the
  // new assessment's questions first, and React supports adjusting state here.
  const [lastAssessmentId, setLastAssessmentId] = React.useState(assessment.id);
  if (lastAssessmentId !== assessment.id) {
    setLastAssessmentId(assessment.id);
    setDetected(null);
    setStudentId('');
    setLoadedRoster(null);
  }

  const optionCount = Math.max(...questions.map((q) => q.options.length), 0);
  const optionKeys = Array.from({ length: optionCount }, (_, i) => String.fromCharCode(65 + i));

  const save = useMutation({
    mutationFn: saveScannedGrade,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setDetected(null);
      setStudentId('');
      if (inputRef.current) inputRef.current.value = '';
    },
    onError: () => toast.error('That result could not be saved. Try again.'),
  });

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no context');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();

      const frame = ctx.getImageData(0, 0, width, height).data;
      // Rec. 601 luma. The detector is threshold-based, so an approximation of
      // perceived brightness is enough and avoids a colour-space round trip.
      const gray = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < frame.length; i += 4, p++) {
        gray[p] = (frame[i]! * 299 + frame[i + 1]! * 587 + frame[i + 2]! * 114) / 1000;
      }

      const sheet = scanSheet(gray, width, height);
      const preview = canvas.toDataURL('image/jpeg', 0.7);

      if (sheet.rows === 0) {
        setDetected(null);
        toast.error('No answer bubbles were found in that image. Try a flatter, brighter scan.');
        return;
      }

      setDetected({
        sheet,
        marks: sheet.bubbles.map((row) => row.map((b) => b.marked)),
        preview,
      });

      if (roster.length === 0) {
        const loaded = await loadStudentsForClass(assessment.classId);
        setLoadedRoster(loaded);
      }
    } catch {
      setDetected(null);
      toast.error('That image could not be read. Try a JPEG or PNG of the sheet, flat and in focus.');
    } finally {
      setBusy(false);
    }
  }

  const edited = React.useMemo(() => new Set<number>(), []);

  const answers: ScannedAnswer[] = detected
    ? detected.marks.map((row, index) => ({
        questionIndex: index,
        optionKeys: row
          .map((marked, col) => (marked ? optionKeys[col] ?? null : null))
          .filter((key): key is string => key !== null),
        edited: edited.has(index),
      }))
    : [];

  const preview = detected
    ? scoreAnswers(
        questions.map((question) => ({
          id: question.id,
          kind: question.kind,
          answerKey: question.answerKey,
          points: question.points,
        })),
        answers.map(({ questionIndex, optionKeys }) => ({ questionIndex, optionKeys })),
      )
    : null;

  const questionCount = Math.min(detected?.marks.length ?? 0, questions.length);
  const mismatched = (detected?.marks.length ?? 0) !== questions.length;

  function toggle(row: number, col: number) {
    setDetected((current) => {
      if (!current) return current;
      const marks = current.marks.map((line, r) =>
        line.map((value, c) => (r === row && c === col ? !value : value)),
      );
      edited.add(row);
      return { ...current, marks };
    });
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Scan a sheet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-ink-muted">
            Add at least one question to this assessment first. A sheet is read against the
            questions and the answer key, so there is nothing to read it against yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Scan a sheet</CardTitle>
          <p className="text-meta text-ink-muted">
            Photograph or scan a marked answer sheet. Read it, check it, then assign it to a
            student.
          </p>
        </div>
        <Badge tone="neutral">
          <ScanIcon size={13} aria-hidden="true" />
          {questions.length} questions
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="sheet-file">
            Answer sheet image
          </label>
          <input
            id="sheet-file"
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={busy}>
            <CameraIcon size={16} aria-hidden="true" />
            {busy ? 'Reading' : 'Choose sheet image'}
          </Button>
          {detected ? (
            <Button
              variant="ghost"
              onClick={() => {
                setDetected(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        {!detected ? (
          <p className="rounded-[16px] border border-dashed border-border bg-surface-sunken px-6 py-10 text-center text-body text-ink-muted">
            No sheet loaded. Lay the paper flat, fill the bubbles firmly, and photograph it in
            even light.
          </p>
        ) : (
          <>
            {mismatched ? (
              <p
                role="status"
                className="rounded-[12px] border border-warning bg-warning-subtle px-4 py-3 text-[0.875rem] text-warning"
              >
                {detected.marks.length} rows were read but this assessment has{' '}
                {questions.length} questions. Check the grid before saving.
              </p>
            ) : null}

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="flex flex-col gap-2">
                <span className="text-label">The sheet</span>
                {/* The scan itself is content, so it carries a description rather
                    than being a decorative image. */}
                <Image
                  src={detected.preview}
                  alt={`The answer sheet as it was read, showing ${detected.sheet.rows} rows of ${optionCount} bubbles`}
                  width={detected.sheet.width}
                  height={detected.sheet.height}
                  // The preview is a data URL drawn in the browser, so there is
                  // nothing for the optimiser to fetch or resize.
                  unoptimized
                  className="max-h-[22rem] w-full rounded-[16px] border border-border bg-surface-sunken object-contain"
                />
              </div>

              <div className="flex flex-1 flex-col gap-3">
                <span className="text-label">What was read</span>
                <ul className="flex flex-col gap-1.5">
                  {detected.marks.slice(0, questionCount).map((row, index) => {
                    const question = questions[index];
                    const result = preview?.perQuestion[index];
                    return (
                      <li
                        key={index}
                        className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-surface px-3 py-2"
                      >
                        <span className="tabular w-6 shrink-0 text-[0.8125rem] font-medium text-ink">
                          {index + 1}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {optionKeys.map((key, col) => {
                            const marked = row[col] ?? false;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggle(index, col)}
                                aria-pressed={marked}
                                aria-label={`Question ${index + 1}, option ${key}${marked ? ', marked' : ''}`}
                                className={
                                  marked
                                    ? 'size-8 rounded-full border-2 border-accent bg-accent text-on-accent transition-colors duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]'
                                    : 'size-8 rounded-full border-2 border-border-strong bg-surface text-ink-muted transition-colors duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-accent'
                                }
                              >
                                <span className="tabular block text-[0.6875rem] font-semibold">
                                  {key}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <span className="ml-auto flex items-center gap-2">
                          {question ? (
                            <Badge tone={question.kind === 'multiple' ? 'accent' : 'neutral'}>
                              {question.kind === 'multiple' ? 'Select' : 'Single'}
                            </Badge>
                          ) : null}
                          {result?.ambiguous ? <Badge tone="warning">Two marks</Badge> : null}
                          {result?.blank ? <Badge tone="warning">Blank</Badge> : null}
                          {result && !result.blank && !result.ambiguous ? (
                            <Badge tone={result.correct ? 'success' : 'danger'}>
                              {result.correct ? `+${result.awarded}` : '0'}
                            </Badge>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {detected.marks.length > questionCount ? (
                  <p className="text-[0.8125rem] text-ink-muted">
                    Rows {questionCount + 1} to {detected.marks.length} have no question behind them
                    and will not be scored.
                  </p>
                ) : null}
              </div>
            </div>

            <div
              className="flex flex-wrap items-end gap-4 rounded-[16px] border border-border bg-surface-sunken p-4"
              aria-live="polite"
            >
              <div className="flex flex-col gap-1">
                <span className="text-label">Score</span>
                {/* One element carries the whole "score / max" string so the
                    reading is unambiguous to a test and to a screen reader. The
                    two weights stay visual only. */}
                <span
                  data-testid="scan-score"
                  className="tabular text-[1.75rem] font-semibold leading-none text-ink"
                >
                  {`${preview?.score ?? 0} / ${preview?.maxScore ?? 0}`}
                </span>
                <span className="text-meta text-ink-muted">
                  {preview?.percentage ?? 0}% ·{' '}
                  {preview?.perQuestion.filter((q) => q.correct).length ?? 0} of{' '}
                  {preview?.perQuestion.length ?? 0} correct
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-[0.875rem] font-medium text-ink" htmlFor="scan-student">
                  Whose sheet is this?
                </label>
                <select
                  id="scan-student"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  className="flex h-11 max-w-[18rem] rounded-[12px] border border-border-strong bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
                >
                  <option value="">Choose a student</option>
                  {roster.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
                <p className="text-meta text-ink-muted">
                  The sheet carries no name, so this has to be set before saving.
                </p>
              </div>

              <Button
                disabled={!studentId || save.isPending || questionCount === 0}
                onClick={() =>
                  save.mutate({
                    assessmentId: assessment.id,
                    studentId,
                    maxScore: preview?.maxScore ?? 0,
                    scanDetail: answers.slice(0, questionCount),
                  })
                }
              >
                {save.isPending ? 'Saving' : 'Save result'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}