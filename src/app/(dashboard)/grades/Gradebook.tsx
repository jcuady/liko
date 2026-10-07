'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { GradebookGrid } from '@/components/product/GradebookGrid';
import { NewAssessmentDialog } from '@/components/product/NewAssessmentDialog';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { queryKeys } from '@/lib/query/keys';
import type { AssessmentRecord, GradeRecord, Student } from '@/lib/api/types';

import { saveGrade } from './actions';
import { SCALE_HINTS, SCALE_LABELS, SCALES, formatByScale, weightedTotal, type Scale } from './scales';

/**
 * The gradebook.
 *
 * WHY OPTIMISTIC MARKS ROLL BACK ON REFUSAL. A refusal from the seam arrives as
 * a resolved action result, not a thrown error, so the mutation throws when the
 * result is not ok. Without that, a mark the server rejected would sit in the
 * grid looking saved until the next reload corrected it, and a teacher's record
 * of a conversation with a parent would rest on it.
 *
 * WHY THE SCALE IS DISPLAY ONLY. Marks are stored raw. Letters, milestones, and
 * GPA are derived at render time, so changing the school's scale never rewrites
 * a single stored mark.
 */

export function Gradebook({
  classes,
  classId,
  students,
  assessments,
  grades,
}: {
  classes: { id: string; name: string }[];
  classId: string;
  students: { id: string; fullName: string; initials: string }[];
  assessments: AssessmentRecord[];
  grades: GradeRecord[];
}) {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = React.useState(classId);
  const [scale, setScale] = React.useState<Scale>('percentage');
  const effectiveClassId = classes.some((item) => item.id === selectedClassId)
    ? selectedClassId
    : classId;

  const gradeKey = queryKeys.grades(effectiveClassId);

  const { data: rows = grades } = useQuery({
    queryKey: gradeKey,
    queryFn: async () => {
      const { loadGrades } = await import('./actions');
      return loadGrades(effectiveClassId);
    },
    initialData: grades,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (input: Parameters<typeof saveGrade>[0]) => {
      const result = await saveGrade(input);
      // A refusal resolves rather than throws, so it is re-thrown here. That is
      // what routes a rejected mark into `onError` and rolls the optimistic cell
      // back, instead of leaving it on screen looking saved.
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: gradeKey });
      const previous = queryClient.getQueryData<GradeRecord[]>(gradeKey);

      queryClient.setQueryData<GradeRecord[]>(gradeKey, (current) => {
        const rest = (current ?? []).filter(
          (row) =>
            !(row.assessmentId === input.assessmentId && row.studentId === input.studentId),
        );
        return [
          ...rest,
          {
            id: `optimistic-${input.assessmentId}-${input.studentId}`,
            assessmentId: input.assessmentId,
            studentId: input.studentId,
            ownerId: '',
            score: input.score,
            maxScore: input.maxScore,
            rubric: [],
            feedback: input.feedback.trim().length > 0 ? input.feedback.trim() : null,
            gradedAt: new Date().toISOString(),
          },
        ];
      });

      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(gradeKey, context.previous);
      else void queryClient.invalidateQueries({ queryKey: gradeKey });
      toast.error(error instanceof Error ? error.message : 'That mark could not be saved.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gradeKey });
    },
  });

  const assessmentById = React.useMemo(
    () => new Map(assessments.map((item) => [item.id, item])),
    [assessments],
  );

  const cells = React.useMemo(() => {
    const built: Record<string, Record<string, number | null>> = {};
    for (const student of students) built[student.id] = {};
    for (const row of rows) {
      if (!built[row.studentId]) continue;
      built[row.studentId][row.assessmentId] = row.score;
    }
    return built;
  }, [rows, students]);

  const gridStudents: Student[] = students.map((student) => ({
    id: student.id,
    name: student.fullName,
    initials: student.initials,
    // The gradebook grid does not read these three; they belong to the overview
    // projection. They are zeroed rather than invented, so no figure on this
    // screen implies a figure that was never computed.
    grade: 0,
    attendanceRate: 0,
    trend: 'flat',
  }));

  const onEdit = (studentId: string, assessmentId: string, value: number | null) => {
    const assessment = assessmentById.get(assessmentId);
    if (!assessment) return;

    const existing = rows.find(
      (row) => row.assessmentId === assessmentId && row.studentId === studentId,
    );

    mutation.mutate({
      assessmentId,
      studentId,
      score: value,
      maxScore: assessment.maxScore,
      feedback: existing?.feedback ?? '',
    });
  };

  const totals = React.useMemo(
    () =>
      students.map((student) => {
        const entries = assessments
          .map((assessment) => {
            const row = rows.find(
              (candidate) =>
                candidate.assessmentId === assessment.id && candidate.studentId === student.id,
            );
            if (!row || row.score === null) return null;
            return {
              score: row.score,
              maxScore: row.maxScore,
              weight: assessment.weight,
            };
          })
          .filter((entry): entry is { score: number; maxScore: number; weight: number } =>
            entry !== null,
          );
        return { studentId: student.id, total: weightedTotal(entries) };
      }),
    [assessments, rows, students],
  );

  const maxScoreFor = React.useCallback(
    (assessmentId: string) => assessmentById.get(assessmentId)?.maxScore ?? 100,
    [assessmentById],
  );

  const formatValue = React.useCallback(
    (score: number, assessmentId: string) =>
      formatByScale(score, maxScoreFor(assessmentId), scale),
    [maxScoreFor, scale],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FormField id="grades-class" label="Class" className="min-w-[14rem]">
          {(props) => (
            <select
              {...props}
              value={effectiveClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
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

        <div className="flex flex-wrap items-end gap-3">
          <FormField id="grades-scale" label="Show as" hint={SCALE_HINTS[scale]}>
            {(props) => (
              <select
                {...props}
                value={scale}
                onChange={(event) => setScale(event.target.value as Scale)}
                className="flex h-11 rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
              >
                {SCALES.map((option) => (
                  <option key={option} value={option}>
                    {SCALE_LABELS[option]}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <NewAssessmentDialog classId={effectiveClassId} triggerLabel="New assessment" />
        </div>
      </div>

      <p className="text-meta text-ink-muted" aria-live="polite">
        {assessments.length === 0
          ? 'No assessments in this class yet. Create one and it becomes a column here.'
          : `Click a cell to enter a mark. Press Escape to cancel. Values shown as ${SCALE_LABELS[scale].toLowerCase()}.`}
      </p>

      {students.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          This class has no students, so there is no gradebook to show.
        </p>
      ) : assessments.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Gradebook</CardTitle>
          </CardHeader>
          <CardContent>
            <GradebookGrid
              students={gridStudents}
              columns={assessments.map((assessment) => assessment.title)}
              cells={cells}
              editable
              onEdit={onEdit}
              formatValue={formatValue}
              maxScoreFor={maxScoreFor}
            />

            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-[0.9375rem] font-medium text-ink">Weighted totals</h3>
              <p className="text-meta text-ink-muted">
                Calculated from the weights on each assessment. A student with no marks yet has no
                total rather than a zero.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {totals.map((entry) => {
                  const student = students.find((item) => item.id === entry.studentId);
                  if (!student || entry.total === null) return null;
                  return (
                    <li key={entry.studentId}>
                      <Badge tone={entry.total >= 70 ? 'success' : 'danger'}>
                        <span className="sr-only">{student.fullName}, weighted total </span>
                        {student.initials} {Math.round(entry.total)}%
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
