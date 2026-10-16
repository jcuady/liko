'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { setIdFormatAction } from '@/app/(dashboard)/assess/actions';
import type { IdFormat } from '@/lib/api/types';
import { codeBlockFits, codeBlockWidthMm, maxGroupsFor, SHEET_CONTENT_MM } from '@/lib/omr/code-block';

/**
 * Choosing the code block for one sheet.
 *
 * WHY THE TEACHER PICKS THIS AND NOT THE PRODUCT. Two digits of eight fits a
 * class of sixty-four and two digits of six fits twelve. A school of thirty is
 * better served by one digit of eight than by two digits of eight, because a
 * child shading a code should shade one bubble, not choose which of two groups to
 * trust. The product cannot know the class size at the moment a sheet is designed;
 * the teacher can.
 *
 * WHY THE BOUNDS ARE SHOWN RATHER THAN DISCOVERED. Three groups and eight
 * bubbles per group is twenty-four, which is the most that fits on one line
 * beside the title without crowding the answer grid below it. Letting a teacher
 * pick nine and discovering it as a print that runs off the page is worse than
 * saying the ceiling here.
 *
 * WHY THE CONTROL SITS ON THE PRINT PAGE. The thing being configured is a piece
 * of paper, and the screen that shows the paper is where the consequence is
 * visible. It also means the class size is right there, so a block too small for
 * the roster can be seen before it is printed rather than after thirty sheets
 * have gone out.
 */

const CODE_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

export function IdFormatControl({
  assessmentId,
  format,
  rosterSize,
}: {
  assessmentId: string;
  format: IdFormat | null;
  rosterSize: number;
}) {
  const [groups, setGroups] = React.useState(format?.groups ?? 2);
  const [perGroup, setPerGroup] = React.useState(format?.perGroup ?? 8);

  // Opening a different assessment has to reset the controls, and it is done
  // during render rather than in an effect: an effect paints one frame of the
  // previous assessment's settings against this assessment's sheet first, which
  // is a preview of a code block that is not on the paper.
  const [lastAssessmentId, setLastAssessmentId] = React.useState(assessmentId);
  if (lastAssessmentId !== assessmentId) {
    setLastAssessmentId(assessmentId);
    setGroups(format?.groups ?? 2);
    setPerGroup(format?.perGroup ?? 8);
  }

  const capacity = groups * perGroup;
  const tooSmall = capacity < rosterSize;

  const save = useMutation({
    mutationFn: (next: IdFormat | null) =>
      setIdFormatAction({
        assessmentId,
        groups: next ? next.groups : null,
        codes: next ? next.perGroup : null,
      }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    },
    onError: () => toast.error('That could not be saved. Try again.'),
  });

  /*
   * A `div`, not a `section`. The end-to-end proof addresses the printable page
   * by tag, and introducing a second `<section>` above it on the same route made
   * that locator resolve to this panel instead of the paper. A stable `data-`
   * hook is used now too, but a component should not silently steal a generic
   * query from the pages around it.
   */
  return (
    <div className="mt-8 rounded-[16px] border border-border bg-surface p-5">
      <h2 className="text-h3">Student codes</h2>
      <p className="mt-2 measure text-[0.9375rem] text-ink-muted">
        Print a block of bubbles at the top of the sheet and have each student shade
        their own code. A scanned sheet then arrives with the student already
        chosen, and you confirm it before anything is saved. The names are never
        printed, only shown on this screen.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.875rem] font-medium text-ink" htmlFor="code-groups">
            Groups
          </label>
          <Select
            value={String(groups)}
            onValueChange={(next) => {
              const chosen = Number(next);
              setGroups(chosen);
              // Choosing more groups than the page can hold would leave the
              // picker showing a shape the server refuses. Offering only what
              // fits is better than offering it and saying no afterwards.
              if (!codeBlockFits(chosen, perGroup)) {
                const widest = maxGroupsFor(perGroup);
                if (widest >= 1) setGroups(widest);
              }
            }}
          >
            <SelectTrigger id="code-groups" className="w-24 px-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* One to three, filtered by what actually fits alongside the
                  chosen number of bubbles per group. */}
              {[1, 2, 3]
                .filter((value) => codeBlockFits(value, perGroup))
                .map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[0.875rem] font-medium text-ink" htmlFor="code-codes">
            Bubbles per group
          </label>
          <Select
            value={String(perGroup)}
            onValueChange={(next) => {
              const chosen = Number(next);
              setPerGroup(chosen);
              const widest = maxGroupsFor(chosen);
              if (widest >= 1 && !codeBlockFits(groups, chosen)) setGroups(widest);
            }}
          >
            <SelectTrigger id="code-codes" className="w-24 px-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CODE_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() =>
            save.mutate({ groups, perGroup, capacity } as IdFormat)
          }
          disabled={save.isPending}
        >
          {save.isPending ? 'Saving' : format ? 'Change the block' : 'Add the block'}
        </Button>

        {format ? (
          <Button
            variant="ghost"
            onClick={() => save.mutate(null)}
            disabled={save.isPending}
          >
            Remove it
          </Button>
        ) : null}
      </div>

      <p className="mt-4 text-[0.875rem] text-ink-muted">
        <span className="tabular font-medium text-ink">{capacity}</span> codes fit on this
        shape, which prints {Math.round(codeBlockWidthMm(groups, perGroup))}mm of the{' '}
        {SHEET_CONTENT_MM}mm the sheet has.{' '}
        {rosterSize} {rosterSize === 1 ? 'student is' : 'students are'} on the roster.
      </p>

      {tooSmall ? (
        <p
          role="status"
          className="mt-3 rounded-[12px] border border-warning bg-warning-subtle px-4 py-3 text-[0.875rem] text-warning"
        >
          The last {rosterSize - capacity} {rosterSize - capacity === 1 ? 'student has' : 'students have'} no
          code to shade. Add another group, or more bubbles in each, before printing.
        </p>
      ) : null}
    </div>
  );
}