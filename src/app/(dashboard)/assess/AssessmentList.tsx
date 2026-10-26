'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NewAssessmentDialog } from '@/components/product/NewAssessmentDialog';
import { AssessmentCardList } from '@/components/product/AssessmentCardList';
import { queryKeys } from '@/lib/query/keys';
import type { AssessmentRecord, QuestionRecord } from '@/lib/api/types';
import { idFormatOf } from '@/lib/api/types';

import { QuestionBuilder } from './QuestionBuilder';
import { ScanSheet } from './ScanSheet';

/**
 * The assessments for one class, and the two things that were missing: the
 * questions behind an assessment, and a way to read a marked sheet against them.
 *
 * An assessment is now selected rather than merely listed. It had to be, because
 * a question set and a scan both belong to exactly one assessment, and with a
 * list and no selection there was nothing for either to attach to.
 *
 * THE CARD IS NOT IN THIS FILE. It is `AssessmentCardList`, shared with the
 * landing page so the two cannot drift apart.
 */

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
          <Select value={effectiveClassId} onValueChange={setSelectedId}>
            <SelectTrigger id="assess-class" aria-label="Class" className="mt-1.5 w-[16rem] max-w-full">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <AssessmentCardList
          assessments={rows}
          questionsByAssessment={questionsByAssessment}
          selectedId={assessmentId}
          onSelect={(id) => setAssessmentId(id === assessmentId ? '' : id)}
        />
      )}

      {active ? (
        <div id="assessment-detail" className="flex flex-col gap-5">
          <QuestionBuilder
            assessmentId={active.id}
            assessmentTitle={active.title}
            maxScore={active.maxScore}
            initialQuestions={activeQuestions}
          />
          <ScanSheet
            assessment={active}
            questions={activeQuestions}
            students={classRoster}
            /*
             * The shape the sheet was printed with, or null. Passing it is what
             * makes a missing block a refusal rather than a sheet read with no
             * student, and it has to come from the assessment rather than from
             * anything the scan screen holds, because the screen has to know what
             * to expect before it has an image.
             */
            idFormat={idFormatOf(active)}
          />

          {/*
            Print is the other half of the loop. Scanning has always existed and
            nothing in the product produced the sheet it reads, so this link sits
            directly above the reader rather than behind a menu: the two are one
            action with a photocopier in the middle.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/assess/sheet?assessment=${encodeURIComponent(active.id)}`}
              className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-border-strong bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring/25"
            >
              <Printer size={18} aria-hidden="true" />
              Print the answer sheet
            </Link>
            <span className="text-meta text-ink-muted">
              Same questions, laid out for a scanner. No answers on it.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}