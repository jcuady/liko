'use client';

import * as React from 'react';
import { NotebookPen } from 'lucide-react';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LessonPlanRecord } from '@/lib/api/types';

/**
 * The lesson plans, as a list.
 *
 * EXTRACTED FROM THE PLANNER ROUTE so the landing page can show the same thing
 * the app shows. The planner route used to own this markup, which meant the
 * landing page could only ever show a picture of it: a picture drifts from the
 * product the moment the product changes, and the landing page is the one
 * surface that cannot afford to drift, because it is the promise.
 *
 * `onEdit` is optional on purpose. The route passes it and gets an Edit
 * button; the landing page does not, and gets a list that is plainly a list of
 * things rather than a list of things you can click.
 */

export function readPlanField(body: LessonPlanRecord['body'], key: string): string {
  const value = body?.[key];
  return typeof value === 'string' ? value : '';
}

export interface LessonPlanListProps {
  plans: LessonPlanRecord[];
  /** Omitted where the plans are illustrations rather than records. */
  onEdit?: (plan: LessonPlanRecord) => void;
  /**
   * The reduced form the landing page shows.
   *
   * The same reduction the other product components make for the landing
   * miniature: `GradebookGrid`, `AtRiskHeatmap` and `AttendanceGrid` all have
   * one. The plan's activities are the long part, so the compact form drops
   * that paragraph and keeps the objective, the week and the standard codes.
   */
  compact?: boolean;
  className?: string;
}

export function LessonPlanList({ plans, onEdit, compact = false, className }: LessonPlanListProps) {
  return (
    <ul className={className ?? 'flex flex-col gap-3'}>
      {plans.map((plan) => (
        <li key={plan.id}>
          <Card className={compact ? 'rounded-[10px]' : undefined}>
            <CardHeader
              className={cn(
                'flex-row items-start justify-between gap-4 space-y-0',
                compact && 'p-3',
              )}
            >
              <div className="min-w-0">
                <CardTitle className={cn(compact && 'text-[0.9375rem]')}>{plan.title}</CardTitle>
                <p className="text-meta text-ink-muted">
                  {plan.weekOf ? `Week of ${plan.weekOf}` : 'No week set'}
                </p>
              </div>
              {onEdit ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(plan)}
                  className="shrink-0"
                >
                  <NotebookPen size={15} aria-hidden="true" />
                  Edit
                  <span className="sr-only"> {plan.title}</span>
                </Button>
              ) : null}
            </CardHeader>

            <CardContent className={cn(compact && 'p-3 pt-0')}>
              <p className="text-body text-ink">
                <span className="font-medium">Objective. </span>
                {readPlanField(plan.body, 'objective') || 'Not recorded.'}
              </p>
              {!compact && readPlanField(plan.body, 'activities') ? (
                <p className="mt-2 whitespace-pre-line text-body text-ink-muted">
                  {readPlanField(plan.body, 'activities')}
                </p>
              ) : null}
              {plan.standardCodes.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {plan.standardCodes.map((code) => (
                    <li key={code}>
                      <Badge tone="neutral">{code}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
