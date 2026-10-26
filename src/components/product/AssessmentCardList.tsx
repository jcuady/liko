'use client';

import * as React from 'react';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ASSESSMENT_TYPES } from '@/app/(dashboard)/assess/options';
import { cn } from '@/lib/utils';
import type { AssessmentRecord, QuestionRecord } from '@/lib/api/types';

/**
 * The assessments for a class, as a card.
 *
 * EXTRACTED FROM THE ASSESS ROUTE so the landing page can show the same thing
 * the app shows. It used to live inside the route's own component, which made
 * the landing page's version of it a hand-built picture, and a picture of an
 * assessment list is a picture of the wrong number of questions.
 *
 * `onSelect` is optional and it changes what is rendered, not just what is
 * wired. With it, a row is a button that opens the builder. Without it, a row
 * is a row: a button that does nothing is worse than no button, and a landing
 * page full of controls that lead nowhere is the opposite of the point.
 */

const TYPE_LABELS = new Map(ASSESSMENT_TYPES.map((type) => [type.value, type.label]));

export interface AssessmentCardListProps {
  assessments: AssessmentRecord[];
  /** How many questions each assessment holds, keyed by assessment id. */
  questionsByAssessment: Record<string, QuestionRecord[]>;
  /** The assessment whose builder is open. Omitted where nothing can be opened. */
  selectedId?: string;
  onSelect?: (assessmentId: string) => void;
  /**
   * The reduced form the landing page shows.
   *
   * The same reduction the other product components make for the landing
   * miniature: `GradebookGrid`, `AtRiskHeatmap` and `AttendanceGrid` all have
   * one. The rows are still rows and the question counts are still the real
   * ones; only the type scale and the padding shrink.
   */
  compact?: boolean;
  className?: string;
}

export function AssessmentCardList({
  assessments,
  questionsByAssessment,
  selectedId,
  onSelect,
  compact = false,
  className,
}: AssessmentCardListProps) {
  const weightTotal = assessments.reduce((total, row) => total + row.weight, 0);
  const roundedWeight = Math.round(weightTotal);

  return (
    <Card className={cn(compact && 'rounded-[10px]', className)}>
      <CardHeader
        className={cn(
          'flex-row items-start justify-between gap-4 space-y-0',
          compact && 'p-3',
        )}
      >
        <div>
          <CardTitle className={cn(compact && 'text-[0.9375rem]')}>Assessments</CardTitle>
          <p className="text-meta text-ink-muted" aria-live="polite">
            {assessments.length} {assessments.length === 1 ? 'assessment' : 'assessments'}, weights
            totalling {roundedWeight}%.
            {roundedWeight > 0 && roundedWeight !== 100
              ? ' Term totals only mean something once that reaches 100.'
              : ''}
          </p>
        </div>
      </CardHeader>

      <CardContent className={cn(compact && 'p-3 pt-0')}>
        <ul className="flex flex-col gap-2">
          {assessments.map((row) => {
            const isActive = row.id === selectedId;
            const count = questionsByAssessment[row.id]?.length ?? 0;
            const summary = (
              <>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block font-medium text-ink',
                      compact ? 'text-[0.8125rem]' : 'text-[0.9375rem]',
                    )}
                  >
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
              </>
            );

            const shell = onSelect
              ? 'flex w-full flex-wrap items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-left transition-colors duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]'
              : 'flex w-full flex-wrap items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-left';
            const tone = onSelect
              ? isActive
                ? 'border-accent bg-accent-subtle hover:border-accent'
                : 'border-border bg-surface-sunken hover:border-border-strong'
              : 'border-border bg-surface-sunken';
            const compactShell = compact ? 'rounded-[8px] px-3 py-2' : '';

            return (
              <li key={row.id}>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(row.id)}
                    aria-expanded={isActive}
                    aria-controls="assessment-detail"
                    className={`${shell} ${compactShell} ${tone}`}
                  >
                    {summary}
                  </button>
                ) : (
                  <div className={`${shell} ${compactShell} ${tone}`}>{summary}</div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
