import type { IdFormat, QuestionKind, QuestionOption } from '@/lib/api/types';
import { CODE_DIGIT_GAP_MM, CODE_WITHIN_GAP_MM } from '@/lib/omr/code-block';

/**
 * The printable answer sheet.
 *
 * THIS LAYOUT IS A CONTRACT WITH `src/lib/omr/omr.ts`, not a design choice. The
 * detector finds bubbles by shape, size and position rather than by being told
 * where the grid is, and every number below exists to stay inside its gates.
 * Measured against a photographed A4 page normalised to 1400px on the long edge:
 *
 * * `minSide` is `min(width, height) / 6 * 0.22`, which on A4 portrait is about
 *   51px. The bubble is 11mm, which normalises to roughly 73px. Comfortably
 *   inside, and a smaller bubble would fall out of the gate entirely.
 * * `maxSide` is `min(width, height) / 6`, about 233px, so a prompt cannot grow
 *   into a bubble by accident.
 * * Text is 10pt, about 23px once normalised, which is under `minSide`. Letters
 *   are 9pt. This is the load-bearing part of the design: a glyph that cleared
 *   `minSide` would be detected as an answer target, and the fullest row would
 *   then define more columns than the sheet has, shifting every mark left. The
 *   type is small on purpose.
 * * Rows sit 14mm apart and the row tolerance is `bubble height * 0.75`, so
 *   consecutive questions cannot merge into one row.
 * * No rule, border or box ever touches a bubble. Touching ink merges into a
 *   single component, and one merged component is one bubble, not two.
 *
 * Every row prints the same number of columns whether or not that question uses
 * them all. A row with fewer bubbles would still line up against the fullest
 * row, but a row with *none* in a column is an unreadable cell rather than a
 * blank answer, and that is a different thing on the review grid.
 *
 * There is no answer key anywhere in this file, and no field for one. The same
 * reasoning that keeps it off the scan screen applies: a sheet that can be used
 * to mark a class cannot carry the answers.
 *
 * The code block below obeys the same gates as the answer grid and adds one more
 * of its own. `readIdRow` finds where one digit ends and the next begins by
 * measuring the GAP between bubbles, so the gap between the last code of one
 * digit and the first of the next is 2.4 times the gap inside a digit. That is
 * wider than the 1.6 times the reader uses as its boundary, with margin on both
 * sides: the block has to survive a phone photograph, and a ratio chosen to sit
 * exactly on the threshold is a ratio that fails when the paper is slightly
 * crooked.
 *
 * The block sits in the header band, well clear of the first answer row, because
 * the detector clusters by vertical position within `bubble height * 0.75`. Two
 * rows closer than that merge into one row, and a merged code row is not a code
 * row.
 */

/**
 * What a printed row needs, which is not everything a stored question is.
 *
 * The teacher owns these questions and is entitled to know the answers, so this
 * page is not a leak. It is still worth narrowing: Server Components serialise
 * their props into the HTML, so passing the whole record would put every answer
 * for the whole class into the page source and into the browser cache of
 * whatever machine printed it. The sheet needs a prompt and some labels.
 */
export interface SheetQuestion {
  id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  options: QuestionOption[];
}

/**
 * One student's code and the name behind it.
 *
 * Rendered on screen and never printed, which is the whole point of the block. A
 * sheet that printed twenty-eight names and handed them out loose loses its
 * anonymity in a bag, and the anonymity is what lets a teacher hand a sheet back
 * without asking the class to identify themselves. The teacher reads this key
 * while handing sheets out; the paper carries only numbers.
 */
export interface SheetCodeKeyEntry {
  /** The number a student shades, 1-based. */
  number: number;
  name: string;
}

/** Rows per printed page. Below this the prompts start wrapping into each other. */
const ROWS_PER_PAGE = 24;

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Bubble-to-bubble spacing inside an answer row. */
const BUBBLE_GAP = '4mm';

/** Inset that lines the column letters up with the bubbles below them. */
const COLUMN_INSET = '1.5mm';

function pages(questions: SheetQuestion[]) {
  const out: SheetQuestion[][] = [];
  for (let i = 0; i < questions.length; i += ROWS_PER_PAGE) {
    out.push(questions.slice(i, i + ROWS_PER_PAGE));
  }
  return out.length > 0 ? out : [[]];
}

/** The whole assessment needs one column count, taken from the widest question. */
export function optionColumns(questions: SheetQuestion[]): number {
  return questions.reduce((widest, q) => Math.max(widest, q.options.length), 0);
}

function Bubble({ id, muted }: { id: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      /*
       * `data-bubble` is how a row and column are addressed without depending
       * on this component's internal structure. The e2e proof uses it to shade a
       * chosen set of bubbles and photograph the result, which is the only way to
       * show that the sheet the app prints is the sheet the app can read rather
       * than two layouts that merely look related.
       */
      data-bubble={id}
      className={`flex h-[11mm] w-[11mm] shrink-0 items-center justify-center rounded-full border-[0.6mm] ${
        muted ? 'border-[0.3mm] border-border-strong' : 'border-black'
      }`}
    />
  );
}

/**
 * The student's code block.
 *
 * Drawn with the same bubble component, the same size and the same ink as the
 * answer grid. That is not tidiness: the detector's scale gate keeps the
 * dominant bubble population and discards anything outside
 * `[typical * 0.45, typical * 2.1]`, so a block drawn at a different size would
 * either vanish or take over as the reference size and redefine every column.
 */
function CodeBlock({
  format,
  pageIndex,
}: {
  format: IdFormat;
  pageIndex: number;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-[4mm] text-[10pt]">
        <span className="font-semibold">Your code</span>
        <span>Shade one bubble in each group. Leave a group empty only if you are not sure.</span>
      </div>
      {/*
        Stacked, not label-beside-block. A two-group block is about 172mm wide
        and the text column is 182mm, so a label sitting beside it would push the
        whole thing past the right edge. The block gets the full width and the
        label takes a line of its own.
      */}
      <div
        className="mt-[4mm] flex items-end"
        style={{ gap: `${CODE_DIGIT_GAP_MM}mm`, paddingRight: COLUMN_INSET }}
      >
        {Array.from({ length: format.groups }, (_, group) => (
          <div key={group} className="flex flex-col items-center">
            <div className="flex" style={{ gap: `${CODE_WITHIN_GAP_MM}mm` }}>
              {Array.from({ length: format.perGroup }, (_, code) => (
                <Bubble key={code} id={`${pageIndex}-id-${group}-${code}`} />
              ))}
            </div>
            {/*
              The group number, not the code number. A student is told which
              bubble to shade by its position in the group, so labelling the
              groups tells them which mark is which without printing a number
              next to every bubble, which would crowd the row the detector reads.
            */}
            <span className="mt-[1.5mm] text-[9pt]">{group + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnswerSheet({
  title,
  className,
  questions,
  idFormat = null,
}: {
  title: string;
  className: string;
  questions: SheetQuestion[];
  idFormat?: IdFormat | null;
}) {
  const columns = optionColumns(questions);

  return (
    <div className="flex flex-col gap-[10mm]">
      {pages(questions).map((rows, pageIndex) => (
        <section
          key={pageIndex}
          /*
           * A stable hook rather than a bare tag. The end-to-end proof has to
           * address the printed paper specifically, and "the first `<section>`
           * on this route" stopped being that the moment the page grew a panel
           * above the sheet. A position-based locator is a defect waiting for the
           * next component added above it.
           */
          data-answer-sheet={pageIndex}
          className="mx-auto w-[210mm] min-h-[297mm] bg-white px-[14mm] py-[12mm] text-black"
        >
          <header className="mb-[6mm]">
            <h1 className="text-[14pt] font-semibold leading-tight">{title}</h1>
            <p className="mt-[1mm] text-[10pt]">
              {className} &middot; sheet {pageIndex + 1}
            </p>
          </header>

          {/*
            The number box is where the student's name goes, and it is only here
            when there is no code block.

            A code sheet identifies itself, so asking for a name as well would be
            asking the same child twice, and the written answer is the one a
            scanner cannot read. A sheet with a block says "shade your code"
            instead, and the scan screen picks the student from that.
          */}
          {idFormat ? (
            <div className="mb-[8mm]">
              <CodeBlock format={idFormat} pageIndex={pageIndex} />
            </div>
          ) : (
            <div className="mb-[6mm] flex items-end gap-[4mm] text-[10pt]">
              <span>Name or number</span>
              <span className="h-[10mm] flex-1 border-b-[0.3mm] border-black/40" />
            </div>
          )}

          <p className="mb-[6mm] text-[10pt] leading-snug">
            Shade one bubble completely with a dark pencil or pen. For a question
            with several answers, shade every one that applies. Leave a bubble
            empty rather than ticking it lightly.
          </p>

          {/* Column letters. Small on purpose: at this size they fall under the
              detector's minimum shape and are never read as answer targets. */}
          <div className="mb-[2mm] flex justify-end">
            <div className="flex" style={{ gap: BUBBLE_GAP, paddingRight: COLUMN_INSET }}>
              {LETTERS.slice(0, columns).map((letter) => (
                <span key={letter} className="w-[11mm] text-center text-[9pt]">
                  {letter}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col" style={{ gap: '3mm' }}>
            {rows.map((question, rowIndex) => (
              <div key={question.id} className="flex items-center" style={{ gap: BUBBLE_GAP }}>
                <p className="flex-1 text-[10pt] leading-snug">{question.prompt}</p>
                <div className="flex shrink-0" style={{ gap: BUBBLE_GAP, paddingRight: COLUMN_INSET }}>
                  {LETTERS.slice(0, columns).map((letter, at) => (
                    <Bubble
                      key={letter}
                      id={`${pageIndex}-${rowIndex}-${at}`}
                      muted={at >= question.options.length}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}