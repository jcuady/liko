import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';

import { AnswerSheet } from './AnswerSheet';
import { PrintButton } from './PrintButton';

export const metadata: Metadata = {
  title: 'Printable sheet',
  description: 'The answer sheet this quiz is read from.',
};

/**
 * The printable half of the quiz.
 *
 * Print and scan is a loop with a missing link: the scanner has always existed
 * and there was nothing in the product that produced the sheet it reads. A
 * teacher was expected to invent a layout and hope the detector found it. This
 * route is that link, and the layout it prints is written against the detector's
 * gates rather than against taste alone, which is why the reasoning lives in
 * `AnswerSheet`.
 *
 * WHY THIS LIVES OUTSIDE THE DASHBOARD GROUP. Everything else in the workspace
 * prints inside a frame that includes the sidebar and the banner, and a sheet
 * with a sidebar printed down its side is both visibly wrong and a second thing
 * to remember not to print. This route has the root layout and nothing else, so
 * pressing print prints paper.
 *
 * The browser owns paper size, margins and scale-to-fit, and the detector's
 * geometry depends on all three, so the sheet is sized in millimetres and the
 * page margin is zero rather than left to a generated PDF to reproduce.
 */
export default async function SheetPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string }>;
}) {
  const session = await requirePagePermission('assess:write');

  const params = await searchParams;
  if (!params.assessment) notFound();

  const store = await data();

  // Ownership before content, the same order `saveQuestionSet` uses: a crafted
  // id must not print another teacher's quiz just because it has an id.
  const assessment = await store.getAssessment(session.userId, params.assessment);
  if (!assessment) notFound();

  const questions = await store.listQuestions(session.userId, assessment.id);
  const className =
    (await store.listClasses(session.userId)).find((row) => row.id === assessment.classId)?.name ??
    '';

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-[40rem] px-6 py-16">
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          This assessment has no questions, so there is no sheet to print yet.
        </p>
        <p className="mt-4 text-center">
          <Link href="/assess" className="text-accent underline underline-offset-4">
            Back to assessments
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-sunken py-8 print:bg-white print:py-0">
      <div className="print:hidden mx-auto max-w-[46rem] px-6">
        <h1 className="text-h3">Printable answer sheet</h1>
        <p className="mt-2 text-body text-ink-muted">
          Print one for the class, let students fill it in, then photograph it and
          read it back in. Every bubble is the same size and sits on a fixed grid,
          which is what lets the reader find them without being told where they
          are. The answers are not on this sheet.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <PrintButton />
          <Link
            href="/assess"
            className="text-[0.9375rem] text-accent underline underline-offset-4"
          >
            Back to assessments
          </Link>
        </div>
        <p className="mt-5 text-meta text-ink-muted">
          Print at 100% scale with margins set to none, and photograph the page
          flat rather than at an angle.
        </p>
      </div>

      <div className="mt-8 flex justify-center print:mt-0">
        <AnswerSheet title={assessment.title} className={className} questions={questions} />
      </div>

      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          html, body { background: #ffffff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}