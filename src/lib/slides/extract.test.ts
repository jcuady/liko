import { describe, expect, it } from 'vitest';

import {
  ImportRefusal,
  MAX_EXTRACTED_CHARS,
  extractDocumentText,
} from './extract';

/**
 * What LIKO can read out of a file a teacher brought with them.
 *
 * WHY THE FIXTURES ARE BUILT HERE RATHER THAN SHIPPED. A binary blob in the
 * repository is a blob nobody can edit, and the day the extractor changes shape
 * nobody can tell what the test file actually contained. A Word file is a ZIP
 * with three XML parts in it and a PDF is a list of numbered objects with a
 * cross-reference table, so both can be written out in the test and read by any
 * parser, which is exactly the property under test.
 *
 * WHY THE SCAN CASE IS COVERED. An import that succeeds and produces nothing is
 * the worst outcome this feature has, because there is nothing on screen that
 * says anything went wrong. A PDF with no text in its content stream is
 * exactly what a scanner produces, so it is the case worth building.
 */

// ---------------------------------------------------------------------------
// A ZIP writer, because a .docx is one
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A stored (uncompressed) ZIP. Uncompressed is deliberate: it keeps the writer
 * to the three header tables a ZIP has, with no deflate to get wrong, and the
 * parser under test does not care how the bytes were packed.
 */
function zipStore(files: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(12, 0x21, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, data);

    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(14, 0x21, true);
    entryView.setUint32(16, checksum, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, data.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);

    offset += 30 + name.length + data.length;
  }

  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let position = 0;
  for (const part of all) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const DOCX_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
  '</Types>',
].join('');

const DOCX_RELS = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
  '</Relationships>',
].join('');

function docxDocument(lines: string[]): string {
  const paragraphs = lines
    .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
    .join('');
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    `<w:body>${paragraphs}</w:body>`,
    '</w:document>',
  ].join('');
}

/** A Word file with one paragraph per line, which is the shape a lesson note has. */
function buildDocx(lines: string[]): ArrayBuffer {
  return asArrayBuffer(
    zipStore([
      { name: '[Content_Types].xml', content: DOCX_XML },
      { name: '_rels/.rels', content: DOCX_RELS },
      { name: 'word/document.xml', content: docxDocument(lines) },
    ]),
  );
}

// ---------------------------------------------------------------------------
// A PDF writer, because a .pdf is a list of numbered objects
// ---------------------------------------------------------------------------

/**
 * Builds a one page PDF with a real cross-reference table.
 *
 * WHY THE XREF TABLE IS WRITTEN RATHER THAN LEFT BROKEN. A PDF parser given a
 * damaged table falls back to scanning the whole file for objects, which works.
 * A test that only ever exercises the fallback is not testing what a real PDF
 * asks of a parser, and the offsets are the one part that makes a hand-built
 * file behave like a real one.
 */
function buildPdf(stream: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startxref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return asArrayBuffer(encoder.encode(pdf));
}

/** Two lines of text, drawn as two text objects on one page. */
function pdfWithText(...lines: string[]): ArrayBuffer {
  const commands = lines
    .map((line, index) => `BT /F1 12 Tf 40 ${340 - index * 24} Td (${line}) Tj ET`)
    .join('\n');
  return buildPdf(commands);
}

/**
 * A plain-text fixture, already wrapped for `extractDocumentText`.
 *
 * Returns the FILE rather than a bare buffer, because the extractor branches on
 * MIME first and filename second, and a test that only ever hands it
 * `text/plain` never exercises the extension branch at all. Passing `.md` with
 * an empty MIME type is how that branch gets covered.
 */
function textFile(value: string, mime = 'text/plain', filename = 'notes.txt') {
  return {
    buffer: asArrayBuffer(new TextEncoder().encode(value)),
    mime,
    filename,
  };
}

/**
 * Raw bytes for a plain-text body.
 *
 * One argument, because that is how every call site uses it: the cases that vary
 * the MIME type or the filename go through `textFile`, which returns the whole
 * file. Carrying two parameters here that no caller passes is a parameter list
 * that lies about what the tests are doing.
 */
function text(value: string): ArrayBuffer {
  return asArrayBuffer(new TextEncoder().encode(value));
}

async function refusalFrom(file: {
  buffer: ArrayBuffer;
  mime: string;
  filename: string;
}): Promise<ImportRefusal> {
  try {
    await extractDocumentText(file);
  } catch (error) {
    if (error instanceof ImportRefusal) return error;
    throw error;
  }
  throw new Error('That file was accepted, and it should not have been.');
}

describe('plain text and markdown', () => {
  it('reads a text file', async () => {
    const result = await extractDocumentText(
      textFile('Collision theory\n\nA catalyst gives the collisions more energy.'),
    );

    expect(result.kind).toBe('document');
    expect(result.truncated).toBe(false);
    expect(result.text).toContain('Collision theory');
    expect(result.text).toContain('A catalyst gives the collisions more energy.');
  });

  it('reads a markdown file the browser sent no type for', async () => {
    // Android and some desktop pickers send an empty MIME type for `.md`, so the
    // extension is the only thing left to go on. Refusing it here would lose a
    // format the picker was always willing to hand over.
    const result = await extractDocumentText({
      buffer: text('# Rates\n\n- temperature up, rate up'),
      mime: '',
      filename: 'week-3.md',
    });

    expect(result.kind).toBe('document');
    expect(result.text).toBe('# Rates\n\n- temperature up, rate up');
  });

  it('takes the MIME type over the extension, so a renamed image is still an image', async () => {
    const result = await extractDocumentText({
      buffer: asArrayBuffer(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
      mime: 'image/png',
      filename: 'diagram.pdf',
    });

    expect(result.kind).toBe('image');
    expect(result.text).toBe('');
  });
});

describe('whitespace', () => {
  it('collapses what a PDF writer leaves behind', async () => {
    // Padded glyph positions, tabs from a Word document, and a page break that
    // emits three blank lines. Left alone this arrives as one enormous line or
    // as a hundred empty ones, and either way it cannot be split into slides.
    const messy = 'Collision   theory\t\tin\ta nutshell\n\n\n\nA catalyst gives more energy.';

    const result = await extractDocumentText({
      buffer: text(messy),
      mime: 'text/plain',
      filename: 'messy.txt',
    });

    expect(result.text).toBe('Collision theory in a nutshell\n\nA catalyst gives more energy.');
  });

  it('trims the padding a PDF puts at the start of every page', async () => {
    const result = await extractDocumentText({
      buffer: text('\n\n   leading and trailing   \n\n'),
      mime: 'text/plain',
      filename: 'padded.txt',
    });

    expect(result.text).toBe('leading and trailing');
  });

  it('reports a document too long rather than silently dropping the rest', async () => {
    const chapter = 'A lesson plan point that runs on. '.repeat(Math.ceil(MAX_EXTRACTED_CHARS / 30));

    const result = await extractDocumentText({
      buffer: text(chapter),
      mime: 'text/plain',
      filename: 'chapter.txt',
    });

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS);
  });
});

describe('Word documents', () => {
  it('reads a .docx built in this test', async () => {
    const result = await extractDocumentText({
      buffer: buildDocx([
        'Collision theory',
        'A catalyst gives the collisions more energy.',
      ]),
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'chapter.docx',
    });

    expect(result.kind).toBe('document');
    expect(result.text).toContain('Collision theory');
    expect(result.text).toContain('A catalyst gives the collisions more energy.');
    /*
     * A BUDGET FOR THIS TEST ALONE, and it is about scheduling rather than
     * about the work. The whole file runs in well under a second on its own,
     * but this is the only test that pulls `mammoth` in, and on a full suite
     * run its worker is one of two dozen starting and transforming at once.
     * Measured under that contention it took 5.4 seconds against a 5 second
     * default, which failed the gate on a machine doing nothing wrong.
     *
     * Raising the timeout does not weaken the assertions above: they are
     * unchanged, and a parser that stopped returning the text would still fail
     * them at 15 seconds just as it would at 5. What changes is that the
     * result no longer depends on how busy the box is.
     */
  }, 15_000);

  it('reads a .docx the browser sent no type for', async () => {
    // Same reason as markdown: the extension is the fallback when the MIME type
    // is missing or `application/octet-stream`.
    const result = await extractDocumentText({
      buffer: buildDocx(['Collision theory']),
      mime: 'application/octet-stream',
      filename: 'chapter.docx',
    });

    expect(result.text).toContain('Collision theory');
  });

  it('says a Word file made of pictures has nothing to read', async () => {
    const refusal = await refusalFrom({
      buffer: buildDocx([]),
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'scanned.docx',
    });

    expect(refusal.reason).toBe('no-text-layer');
    expect(refusal.message).toContain('no readable text');
  });
});

describe('PDFs', () => {
  it('reads a PDF built in this test', async () => {
    const result = await extractDocumentText({
      buffer: pdfWithText('Collision theory', 'A catalyst gives more energy.'),
      mime: 'application/pdf',
      filename: 'chapter.pdf',
    });

    expect(result.kind).toBe('document');
    expect(result.text).toContain('Collision theory');
    expect(result.text).toContain('A catalyst gives more energy.');
  });

  it('keeps a line break between the lines a page draws', async () => {
    // Without this the whole chapter arrives as one line and splitting it into
    // slides produces a single slide holding everything.
    const result = await extractDocumentText({
      buffer: pdfWithText('First point', 'Second point'),
      mime: 'application/pdf',
      filename: 'chapter.pdf',
    });

    expect(result.text).toContain('\n');
    expect(result.text.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(2);
  });

  it('refuses a PDF with no text layer as a scan, by name', async () => {
    // An empty content stream is exactly what a scanner produces: a page of
    // pixels and no glyphs. Every parser returns nothing for it, so this is the
    // case where an import would otherwise succeed and produce zero slides.
    const refusal = await refusalFrom({
      buffer: buildPdf('0 0 0 rg 0 0 400 400 re f'),
      mime: 'application/pdf',
      filename: 'scanned-chapter.pdf',
    });

    expect(refusal.reason).toBe('no-text-layer');
    expect(refusal.message).toContain('scan');
    expect(refusal.message).toContain('no text to read');
    expect(refusal.message).toContain('OCR');
  });

  it('refuses a renamed image sent as a PDF', async () => {
    // A JPEG called `diagram.pdf` reaches the parser as a PDF often enough to
    // matter, and pdf.js fails on it with a message that names no cause.
    const refusal = await refusalFrom({
      buffer: asArrayBuffer(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])),
      mime: 'application/pdf',
      filename: 'diagram.pdf',
    });

    expect(refusal.reason).toBe('not-a-pdf');
    expect(refusal.message).toContain('not one');
    expect(refusal.message).toContain('image');
  });

  it('refuses something that is not a PDF at all', async () => {
    const refusal = await refusalFrom({
      buffer: asArrayBuffer(new TextEncoder().encode('this is not a pdf, it is a note')),
      mime: 'application/pdf',
      filename: 'notes.pdf',
    });

    expect(refusal.reason).toBe('not-a-pdf');
  });
});

describe('refusals', () => {
  it('names the format it was given and the ones it accepts', async () => {
    const refusal = await refusalFrom({
      buffer: text('anything at all'),
      mime: 'application/vnd.ms-powerpoint',
      filename: 'lesson.pptx',
    });

    expect(refusal.reason).toBe('unsupported');
    expect(refusal.message).toContain('lesson.pptx');
    expect(refusal.message).toContain('PDF, DOCX, TXT, Markdown');
  });

  it('refuses a format it has no parser for, even with a readable name', async () => {
    // An accepted extension with an unaccepted type. Refusing it by name is the
    // only honest answer, because returning no text would look like a success.
    const refusal = await refusalFrom({
      buffer: text('RTF header'),
      mime: 'application/rtf',
      filename: 'lesson.rtf',
    });

    expect(refusal.reason).toBe('unsupported');
    expect(refusal.message).toContain('lesson.rtf');
  });

  it('refuses an empty file rather than importing nothing', async () => {
    const refusal = await refusalFrom({
      buffer: new ArrayBuffer(0),
      mime: 'text/plain',
      filename: 'empty.txt',
    });

    expect(refusal.reason).toBe('empty');
    expect(refusal.message).toContain('empty');
  });

  it('refuses a file with a name but no type and no extension', async () => {
    const refusal = await refusalFrom({
      buffer: text('text with no extension'),
      mime: '',
      filename: 'notes',
    });

    expect(refusal.reason).toBe('unsupported');
  });
});