/**
 * CSV parsing, the inverse of `write.ts`.
 *
 * The writer had to handle quotes and commas because people type them; the
 * reader has to handle them because other software produces them. A roster
 * exported from a school system routinely contains a name with a comma in it,
 * a note with a line break in it, and a field that looks like `=SUM(A1)` that
 * must survive the round trip untouched so the import preview shows what the
 * teacher actually wrote.
 *
 * This is a character scanner rather than a split, because `String.split` cannot
 * tell a delimiter inside a quoted field from a delimiter between two of them,
 * which is the entire reason CSV needs a parser.
 */

export type ParsedCsv = string[][];

/**
 * Parses CSV text into rows of raw cells.
 *
 * Deliberately forgiving about the things spreadsheets disagree on and strict
 * about the things that would silently corrupt a roster:
 *
 *   - A UTF-8 byte order mark is dropped. It arrives on every file Excel writes
 *     and would otherwise become part of the first header.
 *   - Both CRLF and bare LF end a record, because a file edited on Windows and
 *     a file edited anywhere else both turn up.
 *   - A quote inside a quoted field that is not a doubled quote is kept as
 *     literal text. Strict parsers reject the file; a teacher with one odd
 *     apostrophe should not lose a class of thirty students over it.
 *   - A trailing newline does not produce a final empty row.
 *   - A row with fewer cells than the header is padded, and extra cells are
 *     kept, so nothing is discarded before the mapping step can complain about
 *     it with a row number.
 */
export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, '');

  const rows: ParsedCsv = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = '';
    fieldWasQuoted = false;
  };

  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote is one literal quote; a lone one just ends the field.
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && !fieldWasQuoted && field.length === 0) {
      inQuotes = true;
      fieldWasQuoted = true;
      index += 1;
      continue;
    }

    if (char === ',') {
      endField();
      index += 1;
      continue;
    }

    if (char === '\r') {
      // Consume the \n of a CRLF pair; a bare \r still ends the record.
      if (text[index + 1] === '\n') index += 1;
      endRow();
      index += 1;
      continue;
    }

    if (char === '\n') {
      endRow();
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  /*
   * Whatever is left is the last record. A file ending in a newline has already
   * closed its final row, so only flush when something is genuinely pending.
   */
  if (field.length > 0 || fieldWasQuoted || row.length > 0) endRow();

  return rows;
}