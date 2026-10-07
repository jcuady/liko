'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { TrendLine } from '@/components/product/TrendLine';
import type { StageDefinition } from './stages';
import {
  gradeTrend,
  questionTypes,
  rubricRows,
  standards,
} from '@/lib/fixtures/workspace';
import { students } from '@/lib/fixtures/workspace';

/**
 * One Flow card. Copy on the left, a real artifact shape on the right.
 *
 * The artifacts are built from actual product primitives and fixture data
 * rather than lorem text, so the section reads as a product demonstration
 * instead of a placeholder.
 */
export function FlowStageCard({
  stage,
  compact = false,
}: {
  stage: StageDefinition;
  compact?: boolean;
}) {
  return (
    <article
      className={cn(
        'grid items-center gap-8 border-t border-border py-12 lg:grid-cols-2 lg:gap-16 lg:py-16',
        compact && 'py-8',
      )}
    >
      <div className="max-w-[34rem]">
        <p className="text-label text-accent">{stage.label}</p>
        <h3 className="text-h3 mt-3">{stage.title}</h3>
        <p className="measure mt-4 text-body">{stage.cost}</p>
        <p className="mt-5 text-[0.9375rem] font-medium text-ink">
          {stage.capability}
        </p>
      </div>

      <div className="rounded-[16px] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] md:p-6">
        <Artifact kind={stage.artifact} />
      </div>
    </article>
  );
}

function Artifact({ kind }: { kind: StageDefinition['artifact'] }) {
  switch (kind) {
    case 'standards':
      return (
        <ul className="space-y-2">
          {standards.map((standard) => (
            <li
              key={standard.code}
              className="flex items-start gap-3 rounded-[10px] border border-border px-3 py-2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] text-[0.625rem] font-bold',
                  standard.met
                    ? 'bg-accent-subtle text-accent'
                    : 'border border-dashed border-border text-ink-subtle',
                )}
              >
                {standard.met ? '✓' : ''}
              </span>
              <span className="min-w-0">
                <span className="tabular block text-[0.6875rem] text-ink-subtle">
                  {standard.code}
                </span>
                <span className="text-[0.875rem] text-ink">{standard.title}</span>
              </span>
              <span className="sr-only">
                {standard.met ? 'met' : 'not yet met'}
              </span>
            </li>
          ))}
        </ul>
      );

    case 'questions':
      return (
        <ul className="space-y-2">
          {questionTypes.map((type, index) => (
            <li
              key={type.id}
              className={cn(
                'flex items-center gap-3 rounded-[10px] border px-3 py-2',
                index === 0
                  ? 'border-accent/30 bg-accent-subtle'
                  : 'border-border',
              )}
            >
              <span className="tabular w-5 text-[0.6875rem] text-ink-subtle">
                {index + 1}
              </span>
              <span
                className={cn(
                  'text-[0.875rem]',
                  index === 0 ? 'font-medium text-accent' : 'text-ink-muted',
                )}
              >
                {type.label}
              </span>
              {index === 0 ? (
                <span className="ml-auto rounded-[6px] bg-accent px-1.5 py-0.5 text-[0.625rem] font-semibold text-on-accent">
                  Active
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      );

    case 'rubric':
      return (
        <table className="w-full text-left">
          <caption className="sr-only">Rubric rows with points available and points earned.</caption>
          <thead>
            <tr className="border-b border-border text-[0.6875rem] text-ink-subtle">
              <th scope="col" className="pb-2 font-medium">
                Criterion
              </th>
              <th scope="col" className="pb-2 text-center font-medium">
                Points
              </th>
              <th scope="col" className="pb-2 text-center font-medium">
                Earned
              </th>
            </tr>
          </thead>
          <tbody>
            {rubricRows.map((row) => (
              <tr key={row.criterion} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  className="py-2.5 text-[0.875rem] font-normal text-ink"
                >
                  {row.criterion}
                </th>
                <td className="tabular py-2.5 text-center text-[0.875rem] text-ink-subtle">
                  {row.points}
                </td>
                <td
                  className={cn(
                    'tabular py-2.5 text-center text-[0.875rem] font-semibold',
                    row.earned >= row.points * 0.8 ? 'text-accent' : 'text-warning',
                  )}
                >
                  {row.earned}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-2.5 text-[0.875rem] font-semibold text-ink">
                Total
              </th>
              <td className="tabular pt-2.5 text-center text-[0.875rem] text-ink-subtle">
                25
              </td>
              <td className="tabular pt-2.5 text-center text-[0.875rem] font-semibold text-ink">
                20
              </td>
            </tr>
          </tfoot>
        </table>
      );

    case 'grade':
      return (
        <ul className="space-y-2">
          {students.slice(0, 4).map((student) => (
            <li
              key={student.id}
              className="flex items-center gap-3 rounded-[10px] border border-border px-3 py-2"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-subtle text-[0.6875rem] font-semibold text-accent">
                {student.initials}
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">
                {student.name}
              </span>
              <span className="tabular text-[0.875rem] font-semibold text-ink">
                {student.grade}
              </span>
            </li>
          ))}
        </ul>
      );

    case 'trend':
      return (
        <div>
          <TrendLine
            values={gradeTrend}
            label="Class average across twenty weeks"
            summary="The class average rose from 71 to 88 over twenty weeks."
          />
          <p className="mt-3 text-[0.875rem] text-ink-muted">
            Two students flagged at risk in week six, weeks before the term ends.
          </p>
        </div>
      );
  }
}