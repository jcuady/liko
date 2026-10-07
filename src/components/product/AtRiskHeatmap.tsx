'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import type { HeatCell } from '@/lib/api/types';

/**
 * At-risk heatmap.
 *
 * Each level carries three encodings: colour, a pattern fill, and a text label.
 * Colour alone never conveys the level, which keeps the chart readable for
 * colourblind users and in forced-colours mode.
 */

const LEVELS = {
  'on-track': {
    label: 'On track',
    cell: 'bg-accent-subtle text-accent',
    pattern: '',
    border: 'border-accent/20',
  },
  watch: {
    label: 'Watch',
    cell: 'bg-warning-subtle text-warning',
    pattern:
      'bg-[linear-gradient(45deg,transparent_45%,currentColor_45%,currentColor_55%,transparent_55%)] bg-[length:6px_6px]',
    border: 'border-warning/25',
  },
  'at-risk': {
    label: 'At risk',
    cell: 'bg-danger-subtle text-danger',
    pattern:
      'bg-[linear-gradient(0deg,currentColor_1.5px,transparent_1.5px)] bg-[length:100%_5px]',
    border: 'border-danger/30',
  },
} as const;

export interface AtRiskHeatmapProps {
  cells: HeatCell[];
  /**
   * Student id to display name.
   *
   * A plain record rather than a lookup callback. This component is a client
   * component, so a Server Component cannot hand it a function: React rejects
   * serialising a function across the server/client boundary and the whole
   * page fails to render. Serialisable data is the only thing that crosses.
   */
  namesById: Record<string, string>;
  compact?: boolean;
  className?: string;
}

export function AtRiskHeatmap({
  cells,
  namesById,
  compact = false,
  className,
}: AtRiskHeatmapProps) {
  return (
    <div className={cn(className)}>
      <ul
        className={cn(
          'grid gap-1',
          compact
            ? 'grid-cols-8'
            : 'grid-cols-4 sm:grid-cols-8 lg:grid-cols-12',
        )}
      >
        {cells.map((cell) => {
          const meta = LEVELS[cell.level];
          const name = namesById[cell.studentId] ?? 'Unknown student';
          const sign = cell.delta > 0 ? '+' : '';

          return (
            <li key={cell.studentId}>
              <div
                role="img"
                aria-label={`${name}: ${meta.label}, ${sign}${cell.delta} points`}
                title={`${name} · ${meta.label} · ${sign}${cell.delta}`}
                className={cn(
                  'relative grid place-items-center overflow-hidden rounded-[8px] border',
                  compact ? 'h-9' : 'h-12',
                  meta.cell,
                  meta.border,
                )}
              >
                {/* Pattern sits under the glyph so the label stays legible. */}
                {meta.pattern ? (
                  <span
                    aria-hidden="true"
                    className={cn('absolute inset-0 opacity-[0.18]', meta.pattern)}
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={cn(
                    'tabular relative font-semibold',
                    compact ? 'text-[0.625rem]' : 'text-[0.75rem]',
                  )}
                >
                  {sign}
                  {cell.delta}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(Object.keys(LEVELS) as Array<keyof typeof LEVELS>).map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                'size-3.5 rounded-[4px] border',
                LEVELS[key].cell,
                LEVELS[key].border,
              )}
            />
            <span className="text-[0.75rem] text-ink-muted">{LEVELS[key].label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}