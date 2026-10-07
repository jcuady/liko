'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewAssessmentDialog } from '@/components/product/NewAssessmentDialog';
import { queryKeys } from '@/lib/query/keys';
import type { AssessmentRecord } from '@/lib/api/types';

import { ASSESSMENT_TYPES } from './options';

/**
 * The assessment list.
 *
 * Reads arrive from the server as props and seed the cache, so the list paints
 * on first render. The cache entry is keyed by class, which is what lets the
 * gradebook route and this one share a single source for the same class.
 */

const TYPE_LABELS = new Map(ASSESSMENT_TYPES.map((type) => [type.value, type.label]));

export function AssessmentList({
  classes,
  classId,
  assessments,
}: {
  classes: { id: string; name: string }[];
  classId: string;
  assessments: AssessmentRecord[];
}) {
  const [selectedId, setSelectedId] = React.useState(classId);
  const effectiveId = classes.some((item) => item.id === selectedId) ? selectedId : classId;

  const { data: rows = assessments, isFetching } = useQuery({
    queryKey: queryKeys.assessments(effectiveId),
    queryFn: async () => {
      const { loadAssessments } = await import('./actions');
      return loadAssessments(effectiveId);
    },
    initialData: assessments,
    staleTime: 30_000,
  });

  const weightTotal = rows.reduce((total, row) => total + row.weight, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <label
            htmlFor="assess-class"
            className="text-[0.875rem] font-medium text-ink"
          >
            Class
          </label>
          <select
            id="assess-class"
            value={effectiveId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-1.5 flex h-11 rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
          >
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <NewAssessmentDialog classId={effectiveId} triggerLabel="New assessment" variant="primary" />
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
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-surface-sunken px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium text-ink">{row.title}</p>
                    <p className="text-meta text-ink-muted">
                      {TYPE_LABELS.get(row.type) ?? row.type} Â· out of {row.maxScore} Â· weight{' '}
                      {row.weight}%
                      {row.dueOn ? ` Â· due ${row.dueOn}` : ''}
                    </p>
                    {row.standardCodes.length > 0 ? (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {row.standardCodes.map((code) => (
                          <li key={code}>
                            <Badge tone="neutral">{code}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
