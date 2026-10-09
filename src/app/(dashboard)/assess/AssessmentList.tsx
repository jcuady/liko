'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewAssessmentDialog } from '@/components/product/NewAssessmentDialog';
import { queryKeys } from '@/lib/query/keys';
import type { AssessmentRecord, QuestionRecord } from '@/lib/api/types';

import { ASSESSMENT_TYPES } from './options';
import { QuestionBuilder } from './QuestionBuilder';
import { ScanSheet } from './ScanSheet';

/**
 * The assessments for one class, and the two things that were missing: the
 * questions behind an assessment, and a way to read a marked sheet against them.
 *
 * An assessment is now selected rather than merely listed. It had to be, because
 * a question set and a scan both belong to exactly one assessment, and with a
 * list and no selection there was nothing for either to attach to.
 */

const TYPE_LABELS = new Map(ASSESSMENT_TYPES.map((type) => [type.value, type.label]));

export function AssessmentList({
  classes,
  classId,
  assessments,
  questionsByAssessment,
  students,
}: {
  classes: { id: string; name: string }[];
  classId: string;
  assessments: AssessmentRecord[];
  /** Pre-loaded on the server so the builder paints without a round trip. */
  questionsByAssessment: Record<string, QuestionRecord[]>;
  students: { id: string; name: string }[];
}) {
  const [selectedId, setSelectedId] = React.useState(classId);
  const [assessmentId, setAssessmentId] = React.useState<string>('');

  const effectiveClassId = classes.some((item) => item.id === selectedId) ? selectedId : classId;
  const classRoster = students;

  const { data: rows = assessments, isFetching } = useQuery({
    queryKey: queryKeys.assessments(effectiveClassId),
    queryFn: async () => {
      const { loadAssessments } = await import('./actions');
      return loadAssessments(effectiveClassId);
    },
    initialData: assessments,
    staleTime: 30_000,
  });

  const weightTotal = rows.reduce((total, row) => total + row.weight, 0);
  const active = rows.find((row) => row.id === assessmentId) ?? null;
  const activeQuestions = active ? (questionsByAssessment[active.id] ?? []) : [];

  // Choosing a different class leaves a selection that belongs to the old one.
  // Adjusted during render rather than from an effect, which would first paint
  // the old class's assessment against the new class's roster.
  const [lastClassId, setLastClassId] = React.useState(effectiveClassId);
  if (lastClassId !== effectiveClassId) {
    setLastClassId(effectiveClassId);
    setAssessmentId('');
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <label htmlFor="assess-class" className="text-[0.875rem] font-medium text-ink">
            Class
          </label>
          <select
            id="assess-class"
            value={effectiveClassId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-1.5 flex h-11 rounded-[12px] border border-border-strong bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
          >
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <NewAssessmentDialog classId={effectiveClassId} triggerLabel="New assessment" variant="primary" />
      </div>

      {rows.length === 0 ? (
        <p
          aria-live="polite"
          className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted"
        >
          {isFetching
            ? 'Loading assessments.'
            : 'No assessments in this class yet. Create one and it becomes a column in the gradebook.'}
        </p>
      ) : (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Assessments</CardTitle>
              <p className="text-meta text-ink-muted" aria-live="polite">
                {rows.length} {rows.length === 1 ? 'assessment' : 'assessments'}, weights
                totalling {Math.round(weightTotal)}%.
                {weightTotal > 0 && Math.round(weightTotal) !== 100
                  ? ' Term totals only mean something once that reaches 100.'
                  : ''}
              </p>
            </div>
          </CardHeader>

          <CardContent>
            <ul className="flex flex-col gap-2">
              {rows.map((row) => {
                const isActive = row.id === assessmentId;
                const count = questionsByAssessment[row.id]?.length ?? 0;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setAssessmentId(isActive ? '' : row.id)}
                      aria-expanded={isActive}
                      aria-controls="assessment-detail"
                      className={
                        isActive
                          ? 'flex w-full flex-wrap items-center justify-between gap-3 rounded-[12px] border border-accent bg-accent-subtle px-4 py-3 text-left transition-colors duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]'
                          : 'flex w-full flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-surface-sunken px-4 py-3 text-left transition-colors duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-border-strong'
                      }
                    >
                      <span className="min-w-0">
                        <span className="block text-[0.9375rem] font-medium text-ink">
                          {row.title}
                        </span>
                        <span className="block text-meta text-ink-muted">
                          {TYPE_LABELS.get(row.type) ?? row.type} · out of {row.maxScore} · weight{' '}
                          {row.weight}%
                          {row.dueOn ? ` · due ${row.dueOn}` : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone={count > 0 ? 'success' : 'warning'}>
                          {count > 0 ? `${count} question${count === 1 ? '' : 's'}` : 'No questions'}
                        </Badge>
                        {row.standardCodes.map((code) => (
                          <Badge key={code} tone="neutral">
                            {code}
                          </Badge>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {active ? (
        <div id="assessment-detail" className="flex flex-col gap-5">
          <QuestionBuilder
            assessmentId={active.id}
            assessmentTitle={active.title}
            maxScore={active.maxScore}
          />
          <ScanSheet
            assessment={active}
            questions={activeQuestions}
            students={classRoster}
          />
        </div>
      ) : null}
    </div>
  );
}