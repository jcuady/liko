'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import type { Student } from '@/lib/api/types';

/**
 * Gradebook grid.
 *
 * A real, keyboard-navigable grid: arrow keys move between cells, Enter opens a
 * cell for editing, Escape cancels, Tab commits. The same component renders the
 * gradebook route and the landing page bento miniature.
 *
 * Numbers use tabular figures so a score changing from 79 to 80 never shifts the
 * column width.
 */

export interface GradebookCell {
  score: number | null;
}

export interface GradebookGridProps {
  students: Student[];
  /** Column headers, short enough for a gradebook header row. */
  columns: string[];
  cells: Record<string, Record<string, number | null>>;
  compact?: boolean;
  editable?: boolean;
  onEdit?: (studentId: string, column: string, value: number | null) => void;
  /**
   * Renders a stored mark for display. The gradebook route stores raw marks and
   * derives letters, milestones, and GPA from them, so the cell text cannot be
   * hardcoded here without the grid re-deriving the same scale a second time.
   * `maxScoreFor` supplies the denominator that derivation needs.
   */
  formatValue?: (score: number, column: string) => string;
  maxScoreFor?: (column: string) => number;
  className?: string;
}

/**
 * Tone is driven by the proportion of the maximum, not the raw number. A 9 out
 * of 10 and an 85 out of 100 are both strong marks, and colouring by raw score
 * makes every short assessment look like a failing one.
 */
function scoreTone(score: number | null, maxScore?: number): string {
  if (score === null) return 'text-ink-subtle';
  const scale = maxScore && maxScore > 0 ? maxScore : 100;
  const percentage = (score / scale) * 100;
  if (percentage >= 85) return 'text-accent font-semibold';
  if (percentage >= 70) return 'text-ink';
  return 'text-danger font-semibold';
}

export function GradebookGrid({
  students,
  columns,
  cells,
  compact = false,
  editable = false,
  onEdit,
  formatValue,
  maxScoreFor,
  className,
}: GradebookGridProps) {
  const gridRef = React.useRef<HTMLTableElement>(null);
  const [editing, setEditing] = React.useState<{
    studentId: string;
    column: string;
  } | null>(null);
  const [draft, setDraft] = React.useState('');

  const cellText = compact ? 'text-[0.6875rem]' : 'text-[0.8125rem]';

  const commit = () => {
    if (!editing) return;
    const parsed = draft.trim() === '' ? null : Number(draft);
    onEdit?.(
      editing.studentId,
      editing.column,
      Number.isFinite(parsed) ? parsed : null,
    );
    setEditing(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTableElement>) => {
    if (!editable) return;

    const target = (event.target as HTMLElement).closest<HTMLTableCellElement>('[data-cell]');
    if (!target || !gridRef.current) return;

    const cells = Array.from(
      gridRef.current.querySelectorAll<HTMLTableCellElement>('[data-cell]'),
    );
    const index = cells.indexOf(target);
    if (index === -1) return;

    const columnsCount = columns.length + 1;
    let next = -1;

    switch (event.key) {
      case 'ArrowRight':
        next = Math.min(index + 1, cells.length - 1);
        break;
      case 'ArrowLeft':
        next = Math.max(index - 1, 0);
        break;
      case 'ArrowDown':
        next = Math.min(index + columnsCount, cells.length - 1);
        break;
      case 'ArrowUp':
        next = Math.max(index - columnsCount, 0);
        break;
      default:
        return;
    }

    event.preventDefault();
    cells[next]?.focus();
  };

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table
        ref={gridRef}
        onKeyDown={onKeyDown}
        className="w-full border-collapse text-left"
      >
        <caption className="sr-only">
          Gradebook. Use arrow keys to move between cells, Enter to edit, Escape
          to cancel, Tab to save.
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className={cn(
                'sticky left-0 z-10 bg-surface font-medium text-ink-subtle',
                compact ? 'px-2 py-1.5 text-[0.6875rem]' : 'px-3 py-2 text-[0.75rem]',
              )}
            >
              Student
            </th>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className={cn(
                  'px-2 py-1.5 text-center font-medium text-ink-subtle',
                  compact ? 'text-[0.6875rem]' : 'text-[0.75rem]',
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id} className="border-b border-border last:border-0">
              <th
                scope="row"
                className={cn(
                  'sticky left-0 z-10 max-w-[9rem] truncate bg-surface font-medium text-ink',
                  compact ? 'px-2 py-1.5 text-[0.6875rem]' : 'px-3 py-2 text-[0.8125rem]',
                )}
              >
                {student.name}
              </th>
              {columns.map((column) => {
                const value = cells[student.id]?.[column] ?? null;
                const isEditing =
                  editing?.studentId === student.id && editing.column === column;
                // The label has to name what the cell shows, not the raw stored
                // number, or a screen reader and the eye disagree about a mark.
                const shown =
                  value === null
                    ? 'not graded'
                    : formatValue && maxScoreFor
                      ? formatValue(value, column)
                      : String(value);

                return (
                  <td
                    key={column}
                    data-cell
                    tabIndex={editable ? 0 : -1}
                    role={editable ? 'gridcell' : undefined}
                    aria-label={`${student.name}, ${column}: ${shown}`}
                    onClick={() => {
                      if (!editable) return;
                      setEditing({ studentId: student.id, column });
                      setDraft(value === null ? '' : String(value));
                    }}
                    onKeyDown={(event) => {
                      if (!editable) return;
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        setEditing({ studentId: student.id, column });
                        setDraft(value === null ? '' : String(value));
                      }
                      if (event.key === 'Escape') setEditing(null);
                    }}
                    className={cn(
                      'tabular px-2 py-1.5 text-center',
                      scoreTone(value, maxScoreFor?.(column)),
                      editable && 'cursor-pointer hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-accent',
                      cellText,
                    )}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={commit}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commit();
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditing(null);
                          }
                        }}
                        inputMode="decimal"
                        aria-label={`Mark for ${student.name}, ${column}`}
                        className="tabular w-10 rounded-[6px] border border-accent bg-surface px-1 py-0.5 text-center text-[0.8125rem] focus:outline-none"
                      />
                    ) : value === null ? (
                      // An empty cell is the honest rendering of an ungraded mark.
                      // A dash here would be read as a mark of zero.
                      <span className="text-ink-subtle">
                        <span aria-hidden="true">.</span>
                        <span className="sr-only">not graded</span>
                      </span>
                    ) : formatValue && maxScoreFor ? (
                      formatValue(value, column)
                    ) : (
                      value
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}