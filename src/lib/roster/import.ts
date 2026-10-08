import { emailSchema } from '@/lib/schemas/auth';
import { parseCsv } from '@/lib/csv/parse';
import { initialsFor } from './initials';

export { initialsFor };

/**
 * Turning a pasted or uploaded CSV into students that are safe to create.
 *
 * Pure on purpose. It takes text and an optional set of names already on the
 * roster, and returns a plan plus the reasons rows were refused. It creates
 * nothing, which is what lets the same code run twice: once in the browser to
 * show a preview before a teacher commits, and once on the server to do the
 * work. The server must never trust the preview, so it runs this again over the
 * original text rather than accepting what the client says is valid.
 *
 * The header is matched by alias rather than by position, because nobody's
 * export agrees on column order and "Guardian Email" is as likely as
 * "guardian_email" or "Parent email". A file with no recognisable header is
 * still accepted: the first column is taken as the name and the rest ignored,
 * which is the right guess for a list of thirty names copied out of a
 * register.
 */

/** One student that passed validation and can be created. */
export type RosterDraft = {
  /** 1-based line in the file, so an error can point at a row a teacher can see. */
  row: number;
  fullName: string;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
};

/** One row that cannot be created, and why. */
export type ImportProblem = { row: number; message: string };

export type ImportPlan = {
  drafts: RosterDraft[];
  problems: ImportProblem[];
  /** True when the first line was read as column headings. */
  hasHeader: boolean;
  /** Rows that were read but held nothing usable, such as blank spacer lines. */
  skipped: number;
};

const NAME_HEADERS = ['name', 'student', 'student name', 'full name', 'pupil', 'learner'];
const GUARDIAN_NAME_HEADERS = ['guardian', 'guardian name', 'parent', 'parent name', 'carer'];
const GUARDIAN_EMAIL_HEADERS = ['guardian email', 'parent email', 'email', 'e-mail'];
const GUARDIAN_PHONE_HEADERS = ['guardian phone', 'parent phone', 'phone', 'mobile', 'contact'];

/** A paste this large is a mistake, not a class. */
export const MAX_IMPORT_ROWS = 500;

function normaliseHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function indexOfAlias(cells: readonly string[], aliases: readonly string[]): number {
  return cells.findIndex((cell) => aliases.includes(normaliseHeader(cell)));
}

export function buildImportPlan(text: string, existingNames: ReadonlySet<string> = new Set()): ImportPlan {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { drafts: [], problems: [], hasHeader: false, skipped: 0 };
  }

  const first = rows[0];
  const nameIndex = indexOfAlias(first, NAME_HEADERS);
  const guardianNameIndex = indexOfAlias(first, GUARDIAN_NAME_HEADERS);
  const guardianEmailIndex = indexOfAlias(first, GUARDIAN_EMAIL_HEADERS);
  const guardianPhoneIndex = indexOfAlias(first, GUARDIAN_PHONE_HEADERS);

  /*
   * A header is only a header if it looks like one. A single column holding the
   * literal string "name" is a student called Name, which is not impossible, so
   * the fallback case also requires that the file has nothing else in it.
   */
  const hasHeader =
    nameIndex >= 0 &&
    (first.length > 1 || (guardianNameIndex < 0 && guardianEmailIndex < 0 && guardianPhoneIndex < 0));

  const body = hasHeader ? rows.slice(1) : rows;
  const nameColumn = hasHeader ? nameIndex : 0;
  const guardianNameColumn = hasHeader ? guardianNameIndex : -1;
  const guardianEmailColumn = hasHeader ? guardianEmailIndex : -1;
  const guardianPhoneColumn = hasHeader ? guardianPhoneIndex : -1;

  const drafts: RosterDraft[] = [];
  const problems: ImportProblem[] = [];
  let skipped = 0;

  body.slice(0, MAX_IMPORT_ROWS).forEach((cells, offset) => {
    // +2 so the number matches what a teacher sees in a spreadsheet viewer.
    const row = hasHeader ? offset + 2 : offset + 1;
    const cell = (index: number) => (index >= 0 ? (cells[index] ?? '').trim() : '');

    const fullName = cell(nameColumn);

    if (fullName === '' && cells.every((value) => value.trim() === '')) {
      skipped += 1;
      return;
    }

    if (fullName === '') {
      problems.push({ row, message: 'No name in this row.' });
      return;
    }

    if (fullName.length > 120) {
      problems.push({ row, message: 'That name is longer than 120 characters.' });
      return;
    }

    if (existingNames.has(fullName.toLowerCase())) {
      problems.push({ row, message: `${fullName} is already on this roster.` });
      return;
    }

    const rawEmail = cell(guardianEmailColumn);
    let guardianEmail: string | null = null;
    if (rawEmail !== '') {
      const parsed = emailSchema.safeParse(rawEmail);
      if (!parsed.success) {
        problems.push({ row, message: `"${rawEmail}" is not an email address.` });
        return;
      }
      guardianEmail = parsed.data;
    }

    const phone = cell(guardianPhoneColumn);
    if (phone.length > 40) {
      problems.push({ row, message: 'That phone number is longer than 40 characters.' });
      return;
    }

    const guardianName = cell(guardianNameColumn);

    drafts.push({
      row,
      fullName,
      guardianName: guardianName === '' ? null : guardianName.slice(0, 120),
      guardianEmail,
      guardianPhone: phone === '' ? null : phone,
    });
  });

  return { drafts, problems, hasHeader, skipped };
}