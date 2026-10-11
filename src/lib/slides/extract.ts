/**
 * What LIKO can read out of a file a teacher brought with them.
 *
 * WHY EXTRACTION IS SEPARATE FROM THE ACTION. The action owns who may import
 * and where the result lands. This module owns one thing: given bytes, return
 * text or a refusal that names the problem. That split is why the refusals can
 * be tested without a session, a database or a bucket, which is the only way
 * they get tested at all.
 *
 * WHY A REFUSAL IS AN EXCEPTION AND NOT AN EMPTY STRING. A file the app cannot
 * read, returned as empty text, reaches the teacher as "imported" and produces
 * zero slides. That is the single worst outcome this feature has, because
 * nothing on screen says anything went wrong. Every failure here throws with a
 * sentence that can be shown to a person as it is.
 *
 * WHY NO `server-only` HERE. The unit suite imports this file directly and the
 * package throws outside a React Server Component graph. The module is reached
 * only from a `use server` file, so it cannot reach a client bundle that way.
 */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * The ceiling on what one import may send.
 *
 * 25 MB is chosen against the two things that actually cross this boundary: a
 * browser upload that has to survive a school connection, and a parsed document
 * held in memory twice over while it is being read. A 25 MB PDF is a scanned
 * textbook chapter, which is already past the point where a teacher wants a
 * deck rather than the file. Past this the failure is better as a refusal with
 * a number in it than as a tab that stops responding.
 */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/**
 * The ceiling on extracted text.
 *
 * A whole chapter of a textbook is a few hundred thousand characters and every
 * one of them would be carried into the deck, re-read on each edit, and held in
 * the response of the page that lists assets. Half a million is comfortably
 * more than a lesson plan needs and far less than a deck should carry. What is
 * dropped is reported rather than silently applied, because a teacher who
 * pasted a 40 page chapter and got 12 slides back would otherwise think the
 * other 28 pages had been read and ignored.
 */
export const MAX_EXTRACTED_CHARS = 200_000;

/** Shown in the file picker and printed under it, so the two cannot disagree. */
export const ACCEPTED_FILE_TYPES =
  '.pdf,.docx,.txt,.md,.markdown,text/plain,text/markdown,application/pdf,image/*';

export const ACCEPTED_LABEL = 'PDF, DOCX, TXT, Markdown, or an image such as PNG, JPEG or WebP';

export type ImportRefusalReason =
  | 'unsupported'
  | 'empty'
  | 'not-a-pdf'
  | 'no-text-layer'
  | 'unreadable';

/**
 * A refusal a teacher can act on.
 *
 * Carries a `reason` as well as the sentence, because the action has to decide
 * whether this is the teacher's problem to fix or the app's, and matching on
 * prose would break the first time a sentence was reworded.
 */
export class ImportRefusal extends Error {
  readonly reason: ImportRefusalReason;

  constructor(reason: ImportRefusalReason, message: string) {
    super(message);
    this.name = 'ImportRefusal';
    this.reason = reason;
  }
}

type Format = 'image' | 'pdf' | 'docx' | 'text';

export type { Format };

/**
 * Decides what a file is from its MIME type first and its name second.
 *
 * WHY THE ORDER. Browsers, school proxies and download managers all disagree
 * about what MIME type to send, and a `.docx` arriving as `application/octet-stream`
 * is common. The name is the fallback for those. The reverse order would be
 * actively wrong: a JPEG saved as `diagram.pdf` keeps the image MIME type, and
 * preferring the name would send it to a PDF parser that cannot read it.
 */
function resolveFormat(mime: string, extension: string): Format | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === DOCX_MIME) return 'docx';
  if (mime === 'text/plain' || mime === 'text/markdown') return 'text';

  if (extension === 'pdf') return 'pdf';
  if (extension === 'docx') return 'docx';
  if (extension === 'txt' || extension === 'md' || extension === 'markdown') return 'text';

  return null;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * What a file is, or null if LIKO cannot read it.
 *
 * Exported so a caller can refuse an unsupported file before reading its bytes.
 * Reading 25 MB in order to then say no is a wait a teacher on a school
 * connection notices and cannot explain.
 */
export function acceptedFormat(mime: string, filename: string): Format | null {
  return resolveFormat(baseMime(mime), extensionOf(filename ?? ''));
}

/**
 * The MIME type to record when the browser sent none.
 *
 * Browsers report an empty type for `.md` and sometimes for `.txt`, and the row
 * carries the type it was stored as. An empty string there would make the same
 * file look like a different file on every machine that read it back.
 */
export function expectedMime(format: Format): string {
  if (format === 'pdf') return 'application/pdf';
  if (format === 'docx') return DOCX_MIME;
  if (format === 'image') return 'image/png';
  return 'text/plain';
}

/** MIME types carry parameters. `text/plain; charset=utf-8` is still plain text. */
function baseMime(mime: string): string {
  return (mime ?? '').split(';')[0]!.trim().toLowerCase();
}

/**
 * Whether the bytes are a PDF at all.
 *
 * WHY THE HEADER AND NOT THE EXTENSION. A renamed image reaches the parser as a
 * PDF far more often than it reaches it correctly, and pdf.js fails on it with
 * a stack trace that says nothing to a teacher. A PDF is defined by its first
 * bytes, so the header is the honest test. Offset rather than position zero
 * because a few writers prepend junk that pdf.js itself tolerates.
 */
function looksLikePdf(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer.slice(0, 1024));
  for (let i = 0; i + 4 < head.length; i += 1) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) {
      return true;
    }
  }
  return false;
}

/**
 * Puts extracted text into a shape a slide can use.
 *
 * WHY THIS IS NOT COSMETIC. A PDF of a textbook chapter arrives as one line
 * several hundred thousand characters long. Splitting it into slides that way
 * produces a single slide holding the entire chapter, which is the same as no
 * import at all. Runs of spaces are collapsed because PDF writers pad glyph
 * positions with them, three or more blank lines become one because page
 * breaks and section spacing both emit them, and the ends are trimmed because
 * the first page of every PDF is padded.
 */
function normaliseWhitespace(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cuts at a line boundary where one is close enough to the end to be worth it. */
function capLength(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_EXTRACTED_CHARS) return { text, truncated: false };

  const cut = text.slice(0, MAX_EXTRACTED_CHARS);
  const lastBreak = cut.lastIndexOf('\n');
  const end = lastBreak > MAX_EXTRACTED_CHARS / 2 ? lastBreak : cut.length;
  return { text: cut.slice(0, end).trim(), truncated: true };
}

async function readPdf(buffer: ArrayBuffer): Promise<string> {
  if (!looksLikePdf(buffer)) {
    throw new ImportRefusal(
      'not-a-pdf',
      'That file is named as a PDF but is not one. It is most likely an image saved with the wrong extension, so upload it as an image instead.',
    );
  }

  // Imported here rather than at the top of the module so a teacher uploading a
  // .txt does not pay to load a PDF engine, and so the client bundle never
  // follows the edge.
  const { extractText } = await import('unpdf');
  try {
    // Pages are joined here rather than merged, because a page break is the one
    // paragraph boundary a chapter scan reliably has.
    const result = await extractText(new Uint8Array(buffer), { mergePages: false });
    return result.text.join('\n\n');
  } catch {
    throw new ImportRefusal(
      'unreadable',
      'That PDF could not be read. It may be damaged or need a password.',
    );
  }
}

async function readDocx(buffer: ArrayBuffer): Promise<string> {
  const { extractRawText } = await import('mammoth');
  try {
    const result = await extractRawText({ buffer: Buffer.from(buffer) });
    return result.value;
  } catch {
    throw new ImportRefusal(
      'unreadable',
      'That Word file could not be read. Save it again from Word, or export it as a PDF.',
    );
  }
}

/**
 * Reads what the parser said, or says why it said nothing.
 *
 * WHY THE PDF BRANCH IS WORDED THE WAY IT IS. A scan has no text layer, so
 * every parser returns empty for it and every naive import calls that a
 * success. Naming the cause is the difference between a teacher who goes
 * looking for a text PDF and one who re-uploads the same scan for the rest of
 * the term. A Word file that reads empty has the same cause and the same fix,
 * so it is told the same thing.
 */
function refuseEmpty(format: Format): never {
  if (format === 'pdf') {
    throw new ImportRefusal(
      'no-text-layer',
      'That PDF looks like a scan, and scans have no text to read. LIKO cannot run OCR, so try a PDF that was saved as text, or add the points by hand.',
    );
  }
  if (format === 'docx') {
    throw new ImportRefusal(
      'no-text-layer',
      'That Word file has no readable text, which usually means it is made of pictures. LIKO cannot run OCR, so save it as a PDF with text in it, or add the points by hand.',
    );
  }
  throw new ImportRefusal('empty', 'That file has no readable text in it.');
}

/**
 * Turns one uploaded file into either an image to store or text to keep.
 *
 * Images are recognised and returned rather than parsed: what the editor needs
 * from a picture is the picture, and there is nothing to extract from one.
 *
 * `truncated` is reported rather than folded into the text so the caller can
 * say so in its own words and the stored text stays the text that was read.
 */
export async function extractDocumentText(file: {
  buffer: ArrayBuffer;
  mime: string;
  filename: string;
}): Promise<{ text: string; kind: 'image' | 'document'; truncated: boolean }> {
  const mime = baseMime(file.mime);
  const format = resolveFormat(mime, extensionOf(file.filename ?? ''));

  if (!format) {
    throw new ImportRefusal(
      'unsupported',
      `LIKO cannot read "${file.filename || 'that file'}". Accepted formats are ${ACCEPTED_LABEL}.`,
    );
  }

  if (file.buffer.byteLength === 0) {
    throw new ImportRefusal('empty', 'That file is empty, so there is nothing to import.');
  }

  if (format === 'image') return { text: '', kind: 'image', truncated: false };

  const raw =
    format === 'pdf'
      ? await readPdf(file.buffer)
      : format === 'docx'
        ? await readDocx(file.buffer)
        : new TextDecoder('utf-8').decode(file.buffer);

  const normalised = normaliseWhitespace(raw);
  if (normalised.length === 0) refuseEmpty(format);

  return { ...capLength(normalised), kind: 'document' };
}