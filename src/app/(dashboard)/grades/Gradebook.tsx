'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { GradebookGrid } from '@/components/product/GradebookGrid';
import { NewAssessmentDialog } from '@/components/product/NewAssessmentDialog';
import { ScaleEditorDialog } from '@/components/product/ScaleEditorDialog';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { queryKeys } from '@/lib/query/keys';
import type {
  AssessmentRecord,
  GradeRecord,
  GradingPolicyRecord,
  Student,
} from '@/lib/api/types';
import {
  PERCENTAGE_POLICY,
  formatByPolicy,
  toPolicy,
  weightedPointTotal,
} from '@/lib/grading/policy';

import { saveGrade, setClassGradingPolicy } from './actions';

/**
 * The gradebook.
 *
 * WHY OPTIMISTIC MARKS ROLL BACK ON REFUSAL. A refusal from the seam arrives as
 * a resolved action result, not a thrown error, so the mutation throws when the
 * result is not ok. Without that, a mark the server rejected would sit in the
 * grid looking saved until the next reload corrected it, and a teacher's record
 * of a conversation with a parent would rest on it.
 *
 * WHY MARKS ARE STORED RAW. Letters, milestones, GPA, and GWA are all views over
 * one percentage, so a school changing its scale never rewrites a single stored
 * mark. The percentage is the only truth; a scale is how it is written down.
 *
 * WHY THE SCALE IS PER CLASS. A department can run GWA while another runs
 * percentage, and a teacher with classes on both systems needs each class to say
 * which it is on. The selector shows every scale available to the account and
 * offers to make the choice stick to the class.
 */

export function Gradebook({
  classes,
  classId,
  policies,
  students,
  assessments,
  grades,
}: {
  classes: { id: string; name: string; gradingPolicyId: string | null }[];
  classId: string;
  policies: GradingPolicyRecord[];
  students: { id: string; fullName: string; initials: string }[];
  assessments: AssessmentRecord[];
  grades: GradeRecord[];
}) {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = React.useState(classId);
  const effectiveClassId = classes.some((item) => item.id === selectedClassId)
    ? selectedClassId
    : classId;

  const selectedClass = classes.find((item) => item.id === effectiveClassId);

  /*
   * The class names the scale it is graded on, and that is the source of truth.
   *
   * Switching class therefore switches scale with no synchronising effect: the
   * per-class override map is consulted first, and where it has no entry the
   * class's own setting is used. Deriving it rather than copying it into state on
   * an effect avoids a frame where the previous class's scale is still showing,
   * and avoids the cascading render that comes with syncing state to a prop.
   */
  const [scaleOverride, setScaleOverride] = React.useState<Record<string, string>>({});

  const classPolicyId = selectedClass?.gradingPolicyId ?? 'percentage';
  const policyId = scaleOverride[effectiveClassId] ?? classPolicyId;

  const policy = React.useMemo(() => {
    const record = policies.find((item) => item.id === policyId);
    return record ? toPolicy(record) : PERCENTAGE_POLICY;
  }, [policies, policyId]);

  const applyToClass = useMutation({
    mutationFn: async (nextPolicyId: string) => {
      const result = await setClassGradingPolicy({
        classId: effectiveClassId,
        policyId: nextPolicyId === 'percentage' ? null : nextPolicyId,
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.classes() });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'That class could not be changed.'),
  });

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

  /*
   * Totals read in the terms of the chosen scale. A point scale reports grade
   * points, because that is what a GPA or a GWA actually is; anything else falls
   * back to the weighted percentage, which is the only arithmetic every scale
   * shares. Both refuse to invent a number when there is nothing marked.
   */
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

        const points = weightedPointTotal(entries, policy);
        if (points !== null) return { studentId: student.id, total: points, unit: 'point' as const };

        const weight = entries.reduce((sum, entry) => sum + entry.weight, 0);
        if (weight <= 0) return { studentId: student.id, total: null, unit: 'percent' as const };

        const percentage =
          entries.reduce(
            (sum, entry) => sum + (entry.score / entry.maxScore) * 100 * entry.weight,
            0,
          ) / weight;
        return { studentId: student.id, total: percentage, unit: 'percent' as const };
      }),
    [assessments, policy, rows, students],
  );

  const maxScoreFor = React.useCallback(
    (assessmentId: string) => assessmentById.get(assessmentId)?.maxScore ?? 100,
    [assessmentById],
  );

  const formatValue = React.useCallback(
    (score: number, assessmentId: string) =>
      formatByPolicy(score, maxScoreFor(assessmentId), policy),
    [maxScoreFor, policy],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FormField id="grades-class" label="Class" className="min-w-[14rem]">
          {(props) => (
            <Select
              {...props}
              value={effectiveClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <div className="flex flex-wrap items-end gap-3">
          <FormField id="grades-scale" label="Show as" hint={policy.hint}>
            {(props) => (
              <Select
                {...props}
                value={policyId}
                onChange={(event) =>
                  setScaleOverride((current) => ({
                    ...current,
                    [effectiveClassId]: event.target.value,
                  }))
                }
                className="flex h-11 rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
              >
                {policies.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          {/*
            A view is not a decision. Without this the choice resets on reload
            and a teacher has to re-pick the school's scale every single session,
            which is how a GWA transcript quietly comes out as a percentage one.
          */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={
              applyToClass.isPending ||
              (selectedClass?.gradingPolicyId ?? 'percentage') === policyId
            }
            onClick={() => applyToClass.mutate(policyId)}
          >
            {applyToClass.isPending ? 'Applying' : 'Use for this class'}
          </Button>

          <ScaleEditorDialog
            policies={policies}
            onCreated={(created) => {
              setScaleOverride((current) => ({ ...current, [effectiveClassId]: created.id }));
              void queryClient.invalidateQueries({ queryKey: queryKeys.policies() });
            }}
          />

          <NewAssessmentDialog classId={effectiveClassId} triggerLabel="New assessment" />

          {/*
            A plain link, not a button and not a fetch. The endpoint sends the
            file as an attachment with Content-Disposition, so the browser
            handles the download and the page never has to build a Blob or hold
            the data in memory twice.
          */}
          <a
            href={`/grades/export?class=${encodeURIComponent(effectiveClassId)}`}
            download
            className="inline-flex h-11 items-center rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring/25"
          >
            Export CSV
          </a>
        </div>
      </div>

      <p className="text-meta text-ink-muted" aria-live="polite">
        {assessments.length === 0
          ? 'No assessments in this class yet. Create one and it becomes a column here.'
          : `Click a cell to enter a mark. Press Escape to cancel. Values shown as ${policy.label.toLowerCase()}.`}
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
                {policy.kind === 'points' || policy.kind === 'letter'
                  ? `Weighted grade points on the ${policy.label} scale. A student with no marks yet has no total rather than a zero.`
                  : 'Calculated from the weights on each assessment. A student with no marks yet has no total rather than a zero.'}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {totals.map((entry) => {
                  const student = students.find((item) => item.id === entry.studentId);
                  if (!student || entry.total === null) return null;
                  const isPoint = entry.unit === 'point';
                  return (
                    <li key={entry.studentId}>
                      <Badge tone={isPoint ? 'neutral' : entry.total >= 70 ? 'success' : 'danger'}>
                        <span className="sr-only">
                          {student.fullName}, weighted total{' '}
                        </span>
                        {student.initials}{' '}
                        {isPoint ? entry.total.toFixed(2) : `${Math.round(entry.total)}%`}
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
