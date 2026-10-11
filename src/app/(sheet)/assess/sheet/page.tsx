import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';
import { idFormatOf } from '@/lib/api/types';
import { studentNumberToDigits } from '@/lib/omr/omr';

import { AnswerSheet } from './AnswerSheet';
import { IdFormatControl } from './IdFormatControl';
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

  /*
   * The roster, ordered the one way it can be ordered reproducibly.
   *
   * A student's code IS their position in this list, so the order is not a
   * cosmetic choice: two runs that disagree would hand two children the same
   * code and read one child's sheet as another's. Name then id is used because
   * two students can share a name, and the id makes the tie total.
   */
  const idFormat = idFormatOf(assessment);
  const roster = (
    await store.listStudents(session.userId, assessment.classId)
  )
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id));

  /*
   * A block that cannot carry the class is refused here rather than printed.
   *
   * The alternative is a sheet where the last few students have no code to
   * shade, whose sheets come back unidentified, and the teacher does not find
   * out until the marks are already wrong. Saying so on the print screen, before
   * the paper is used, is the difference between a broken setting and a wasted
   * lesson.
   */
  const tooSmallForRoster = idFormat !== null && roster.length > idFormat.capacity;

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

        {/*
          The code key, on screen and never on paper.

          The teacher reads this while handing sheets out. It is `print:hidden`
          because a sheet that printed the class roster alongside the codes would
          be handed out loose and lose the anonymity that lets a child fill one
          in without anyone watching, and because the names in this table are
          every child in the room.
        */}
        {idFormat && !tooSmallForRoster && roster.length > 0 ? (
          <div data-code-key className="print:hidden mt-8 rounded-[16px] border border-border bg-surface p-5">
            <p className="text-label">Who has which code</p>
            <p className="mt-2 text-[0.875rem] text-ink-muted">
              Keep this screen open while you hand the sheets out. It does not print.
            </p>
            <ul className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {roster.map((student, index) => (
                <li key={student.id} className="flex items-baseline gap-3">
                  <span className="tabular w-8 shrink-0 text-[0.875rem] font-semibold text-accent">
                    {(studentNumberToDigits(index + 1, idFormat) ?? []).join('') || index + 1}
                  </span>
                  <span className="truncate text-[0.9375rem] text-ink">{student.fullName}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tooSmallForRoster && idFormat ? (
          <p
            role="status"
            className="mt-8 rounded-[16px] border border-warning bg-warning-subtle px-5 py-4 text-[0.9375rem] text-warning"
          >
            This sheet has {idFormat.groups} groups of {idFormat.perGroup}, which carries{' '}
            {idFormat.capacity} codes, and {roster.length} students are on the roster. The last{' '}
            {roster.length - idFormat.capacity} would have no code to shade. Choose a bigger code
            block before printing.
          </p>
        ) : null}
      </div>

      <IdFormatControl
        assessmentId={assessment.id}
        format={idFormat}
        rosterSize={roster.length}
      />

      <div className="mt-8 flex justify-center print:mt-0">
        <AnswerSheet
          title={assessment.title}
          className={className}
          /*
           * Null when the block is off AND when the block is on but too small for
           * this class. The second case prints the old name line rather than a
           * code half the class cannot fill in, and the warning above says why.
           */
          idFormat={tooSmallForRoster ? null : idFormat}
          /*
           * Narrowed field by field rather than passed whole. The teacher owns
           * these answers, but Server Components serialise props into the HTML,
           * and a printed page should not leave every answer for the class in the
           * source of whatever machine ran the print.
           */
          questions={questions.map((question) => ({
            id: question.id,
            position: question.position,
            kind: question.kind,
            prompt: question.prompt,
            options: question.options,
          }))}
        />
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