'use client';

import * as React from 'react';
import { useMediaQuery } from '@/lib/hooks/use-media-query';

/**
 * The attendance tap grid.
 *
 * This is a real component: the same file renders the full-size grid on the
 * attendance route and the reduced miniature inside the landing page hero. That
 * is deliberate, because a hand-built div "screenshot" drifts from the product
 * the moment the real UI changes.
 *
 * Every state is carried by a glyph as well as a colour, so the encoding does
 * not depend on colour perception.
 */

export type AttendanceState = 'present' | 'absent' | 'late' | 'excused' | 'unset';

const STATE_META: Record<
  Exclude<AttendanceState, 'unset'>,
  { label: string; glyph: string; className: string }
> = {
  present: {
    label: 'Present',
    glyph: '✓',
    className: 'bg-accent-subtle text-accent border-accent/25',
  },
  absent: {
    label: 'Absent',
    glyph: '✕',
    className: 'bg-danger-subtle text-danger border-danger/25',
  },
  late: {
    label: 'Late',
    glyph: '~',
    className: 'bg-warning-subtle text-warning border-warning/25',
  },
  excused: {
    label: 'Excused',
    glyph: 'E',
    className: 'bg-surface-sunken text-ink-muted border-border-strong',
  },
};

export interface AttendanceGridProps {
  students: { id: string; initials: string; name: string }[];
  marks: Record<string, Exclude<AttendanceState, 'unset'>>;
  /** Compact renders the hero miniature: smaller cells, no interactive state. */
  compact?: boolean;
  /**
   * Dense renders inside the phone device frame on the landing page. The frame
   * is roughly 140px wide whatever the viewport is, so the column count has to
   * follow the container rather than a viewport breakpoint; a `sm:` variant
   * here would fan out to eight columns inside a phone screen.
   */
  dense?: boolean;
  interactive?: boolean;
  onChange?: (studentId: string, state: AttendanceState) => void;
  className?: string;
}

export function AttendanceGrid({
  students,
  marks,
  compact = false,
  dense = false,
  interactive = false,
  onChange,
  className,
}: AttendanceGridProps) {
  // Local edits are held as an override layer rather than copied into state,
  // so a change to `marks` needs no synchronising effect.
  const [overrides, setOverrides] = React.useState<
    Record<string, AttendanceState>
  >({});
  const effective = React.useMemo(
    () => ({ ...marks, ...overrides }),
    [marks, overrides],
  );

  const cycle = React.useCallback(
    (studentId: string) => {
      const order: AttendanceState[] = [
        'present',
        'late',
        'absent',
        'excused',
        'unset',
      ];
      const current = effective[studentId] ?? 'unset';
      const next = order[(order.indexOf(current) + 1) % order.length];
      setOverrides((prev) => ({ ...prev, [studentId]: next }));
      onChange?.(studentId, next);
    },
    [effective, onChange],
  );

  const size = dense
    ? 'size-6 text-[0.5625rem]'
    : compact
      ? 'size-8 text-[0.6875rem]'
      : 'size-11 text-[0.8125rem]';

  const columns = dense
    ? 'grid-cols-4 gap-1'
    : `grid-cols-4 gap-1.5 ${compact ? 'sm:grid-cols-8' : 'sm:grid-cols-6'}`;

  return (
    <ul className={`grid ${columns} ${className ?? ''}`}>
      {students.map((student) => {
        const state = (effective[student.id] ?? 'unset') as AttendanceState;
        const meta = STATE_META[state as Exclude<AttendanceState, 'unset'>];
        const label = meta ? `${student.name}: ${meta.label}` : `${student.name}: not set`;

        return (
          <li key={student.id}>
            {interactive ? (
              <button
                type="button"
                onClick={() => cycle(student.id)}
                aria-label={`Set attendance for ${student.name}. Currently ${meta?.label ?? 'not set'}`}
                className={`pressable grid ${size} place-items-center rounded-[10px] border text-center font-semibold transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  meta?.className ?? 'border-dashed border-border text-ink-subtle'
                }`}
              >
                <span className="sr-only">{label}</span>
                <span aria-hidden="true">{meta?.glyph ?? ''}</span>
              </button>
            ) : (
              <div
                title={label}
                aria-label={label}
                role="img"
                className={`grid ${size} place-items-center rounded-[10px] border font-semibold ${
                  meta?.className ?? 'border-dashed border-border text-ink-subtle'
                }`}
              >
                <span aria-hidden="true">{meta?.glyph ?? ''}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Legend. Duplicated for every grid so each grid reads on its own. */
export function AttendanceLegend({ compact = false }: { compact?: boolean }) {
  return (
    <ul
      className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${compact ? '' : 'mt-4'}`}
    >
      {(Object.keys(STATE_META) as Array<keyof typeof STATE_META>).map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`grid size-5 place-items-center rounded-[6px] border text-[0.625rem] font-bold ${STATE_META[key].className}`}
          >
            {STATE_META[key].glyph}
          </span>
          <span className="text-[0.75rem] text-ink-muted">{STATE_META[key].label}</span>
        </li>
      ))}
    </ul>
  );
}

export function useIsCompact() {
  return useMediaQuery('(min-width: 1024px)');
}