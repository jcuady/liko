'use client';

import * as React from 'react';
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ClockIcon,
} from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { AttendanceGrid } from './AttendanceGrid';
import { TrendLine } from './TrendLine';
import type { AttendanceStatus, Stat, Student } from '@/lib/api/types';
import { gradeTrend } from '@/lib/fixtures/workspace';

/**
 * The overview screen.
 *
 * This is the real component. The landing page hero renders it inside a device
 * frame at reduced scale, which is why the mockup can never drift from the
 * product: there is no second implementation to fall out of date.
 */

export interface OverviewDashboardProps {
  stats: Stat[];
  students: Student[];
  attendance: Record<string, AttendanceStatus>;
  /** Compact drops interaction affordances for the hero miniature. */
  compact?: boolean;
  className?: string;
}

export function OverviewDashboard({
  stats,
  students,
  attendance,
  compact = false,
  className,
}: OverviewDashboardProps) {
  const [marks, setMarks] = React.useState(attendance);

  const scale = compact ? 0.82 : 1;

  return (
    <div
      className={cn(
        'flex flex-col gap-4 bg-surface text-ink',
        compact ? 'p-4' : 'p-5',
        className,
      )}
      style={compact ? { fontSize: `${scale}rem` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn('font-semibold', compact ? 'text-sm' : 'text-h4')}>
            Today
          </p>
          <p className="text-[0.75rem] text-ink-subtle">
            4 classes · Wednesday
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-accent-subtle px-2 py-1 text-[0.6875rem] font-medium text-accent">
          <ClockIcon size={12} weight="fill" aria-hidden="true" />
          Period 2
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const up = stat.delta > 0;
          const flat = stat.delta === 0;
          return (
            <div
              key={stat.label}
              className="rounded-[12px] border border-border bg-surface-sunken px-3 py-2.5"
            >
              <dt className="text-[0.6875rem] font-medium text-ink-subtle">
                {stat.label}
              </dt>
              <dd className="mt-0.5 flex items-baseline gap-1.5">
                <span className="tabular text-[1.125rem] font-semibold">
                  {stat.value}
                </span>
                {!flat ? (
                  <span
                    className={cn(
                      'tabular flex items-center text-[0.6875rem] font-medium',
                      up ? 'text-accent' : 'text-danger',
                    )}
                  >
                    {up ? (
                      <ArrowUpRightIcon size={11} weight="bold" aria-hidden="true" />
                    ) : (
                      <ArrowDownRightIcon size={11} weight="bold" aria-hidden="true" />
                    )}
                    {Math.abs(stat.delta)}
                  </span>
                ) : null}
                <span className="sr-only">
                  {flat
                    ? 'unchanged'
                    : `${up ? 'up' : 'down'} ${Math.abs(stat.delta)}`}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      <section aria-labelledby="overview-attendance" className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between">
          {/*
            In compact mode this panel is decorative mockup, and its labels are
            rendered as paragraphs rather than headings. A heading inside an
            aria-hidden subtree still lands in the document outline used by
            screen-reader heading navigation, which would put an h3 directly
            after the hero h1 and break the heading hierarchy.
          */}
          {compact ? (
            <p className="text-[0.8125rem] font-semibold">Attendance</p>
          ) : (
            <h3
              id="overview-attendance"
              className="text-h4 font-semibold"
            >
              Attendance
            </h3>
          )}
          <span className="tabular text-[0.6875rem] text-ink-subtle">
            {students.length} students
          </span>
        </div>
        <AttendanceGrid
          students={students.slice(0, 8).map((s) => ({
            id: s.id,
            initials: s.initials,
            name: s.name,
          }))}
          marks={marks}
          compact={compact}
          interactive={!compact}
          onChange={(id, state) =>
            setMarks((prev) => ({ ...prev, [id]: state as AttendanceStatus }))
          }
        />
      </section>

      <section aria-labelledby="overview-trend" className="min-w-0">
        {compact ? (
          <p className="mb-1 text-[0.8125rem] font-semibold">Grade trend</p>
        ) : (
          <h3 id="overview-trend" className="text-h4 mb-1 font-semibold">
            Grade trend
          </h3>
        )}
        <TrendLine
          values={gradeTrend}
          label="Class average across twenty weeks"
          summary="The class average rose from 71 to 88 over twenty weeks."
          compact={compact}
        />
        <p className="tabular mt-1 text-[0.6875rem] text-ink-subtle">
          71 → 88 across 20 weeks
        </p>
      </section>
    </div>
  );
}