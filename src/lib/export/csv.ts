/**
 * CSV serialisation for exports.
 *
 * Two things make this more than a join with commas.
 *
 * **Escaping.** RFC 4180: a cell containing a quote, a comma or a line break has
 * to be wrapped in quotes, and an inner quote is doubled. A student called
 * `Ng, Ana` or a feedback note that spans two lines would otherwise shift every
 * column after it, silently, in a file a teacher opens in a spreadsheet.
 *
 * **Formula injection.** This is the one that matters. A spreadsheet treats a
 * cell beginning `=`, `+`, `-` or `@` as a formula, and `=HYPERLINK(...)` or
 * `=cmd|...` is the well known way a CSV becomes code execution on the machine
 * of whoever opens it. Every value here is attacker-reachable: student names,
 * guardian names, assessment titles and feedback are all typed by somebody, and
 * a class is shared with other teachers. So a leading `=` is defused by
 * prefixing an apostrophe, which spreadsheets read as "this is text".
 *
 * The prefix is applied to strings only. A number is a number, not text that
 * happens to look like a formula, so a genuine negative value is not mangled.
 */

export type CsvCell = string | number | null | undefined;

/** Characters that force a cell to be quoted. */
const NEEDS_QUOTING = /["\r\n,]/;

/** Leading characters a spreadsheet would read as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Renders one cell, quoted and formula-guarded as needed. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';

  const text = typeof value === 'number' ? String(value) : value;
  const guarded = typeof value === 'number' ? text : FORMULA_START.test(text) ? `'${text}` : text;

  const padded = guarded !== guarded.trim();
  if (!NEEDS_QUOTING.test(guarded) && !padded) return guarded;

  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * Renders rows as a CSV document, CRLF terminated per RFC 4180.
 *
 * Empty input is an empty string rather than a lone line break, so a class with
 * no students does not produce a file that opens as one blank row.
 */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  if (rows.length === 0) return '';
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/**
 * Prefixes a byte order mark.
 *
 * Without it Excel on Windows reads a UTF-8 CSV as the system code page, and a
 * student called `María` or `José` arrives mojibake. Every other spreadsheet on
 * that platform ignores the mark.
 */
export function withBom(csv: string): string {
  return `\uFEFF${csv}`;
}

/**
 * Builds a `Content-Disposition` value from an untrusted filename.
 *
 * A class name is typed by a user and ends up in a response header, so it is
 * reduced to characters that cannot terminate the header or inject a second one.
 * A quote or a CRLF in a class name would otherwise let a teacher write arbitrary
 * response headers on a request they are themselves making, which is a smaller
 * problem than it looks because it is still a bug and it still breaks exports.
 */
export function contentDisposition(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `attachment; filename="${safe || 'export.csv'}"`;
}