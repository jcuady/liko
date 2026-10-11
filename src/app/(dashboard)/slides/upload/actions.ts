'use server';

/**
 * Bringing a file into a deck.
 *
 * WHY THE ACTION TAKES `FormData`. The bytes of a PDF or an image are what is
 * crossing this boundary, and `FormData` is the one shape that carries them
 * without a second base64 step that would add a third of the size again. The
 * alternative, a typed `{ deckId, file }` argument, serialises a `File` through
 * the RSC payload, which works but re-encodes the upload for no reason.
 *
 * WHY THE GATE IS `plan:write`. There is no `slides:write`. `/slides` is
 * routed and authorised as `plan:write`, and a deck is lesson material, so it
 * is gated the same way `actions.ts` gates a deck. Inventing a second
 * permission here would mean the upload could be allowed while the deck it
 * writes into was refused, or refused while the deck was editable.
 *
 * WHY EVERY CHECK IS REPEATED ON THE SERVER. The picker already filters, and
 * the `accept` attribute is a hint rather than a control: it can be edited in
 * the browser's own devtools, which is not an attack but is a person trying to
 * upload a file the app has never read. Nothing here trusts the client.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { DataError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/auth/guards';
import {
  ACCEPTED_LABEL,
  ImportRefusal,
  MAX_EXTRACTED_CHARS,
  MAX_IMPORT_BYTES,
  acceptedFormat,
  expectedMime,
  extractDocumentText,
} from '@/lib/slides/extract';

/**
 * A result the panel can switch on.
 *
 * Never a thrown string. A rejected promise from a server action reaches the
 * panel as an error boundary, which loses the sentence the teacher needs, so
 * every refusal comes back as `ok: false` with its message intact.
 */
export interface ImportResult {
  ok: boolean;
  message: string;
  /**
   * What was brought IN, not which file type was read.
   *
   * `'image'` means bytes were stored and there is an asset id. `'document'`
   * means text was extracted and there is not. The panel switches on this to
   * decide whether to offer the image straight away. It is deliberately not the
   * `Format` union: a PDF and a DOCX are different formats but the same thing to
   * the caller, and widening this to the file type meant the one field the UI
   * reads had four values it never had a case for.
   */
  kind: 'image' | 'document' | null;
  /**
   * Set on a successful image import so the editor can place it on the current
   * slide. Null for a document, which produces text rather than an image.
   */
  assetId: string | null;
  /** Words actually read, so the success line can say something concrete. */
  wordCount: number | null;
  truncated: boolean;
}

function refusal(message: string): ImportResult {
  return { ok: false, message, kind: null, assetId: null, wordCount: null, truncated: false };
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Reads one uploaded file into the deck.
 *
 * Returns the asset id for an image so the caller can place it, and the word
 * count for a document so the caller can say what arrived. Never returns both,
 * because a file is one or the other and a panel that shows a word count for a
 * picture is reporting on something that never happened.
 */
export async function importDocument(form: FormData): Promise<ImportResult> {
  const session = await requirePermission('plan:write');

  const deckId = String(form.get('deckId') ?? '').trim();
  if (!deckId) return refusal('That deck could not be found.');

  const entry = form.get('file');
  if (!entry || typeof entry === 'string') {
    return refusal('Choose a file to import.');
  }

  const file = entry;
  const filename = (file.name ?? '').trim();
  if (!filename) return refusal('That file has no name, so it cannot be recorded.');

  if (file.size === 0) {
    return refusal('That file is empty, so there is nothing to import.');
  }

  if (file.size > MAX_IMPORT_BYTES) {
    return refusal(
      `"${filename}" is ${megabytes(file.size)}. The limit is ${megabytes(MAX_IMPORT_BYTES)}, so split the document or bring in the part you need.`,
    );
  }

  // Checked before the bytes are read, so a 25 MB file LIKO cannot parse is
  // refused without the wait.
  const format = acceptedFormat(file.type, filename);
  if (!format) {
    return refusal(`LIKO cannot read "${filename}". Accepted formats are ${ACCEPTED_LABEL}.`);
  }

  const buffer = await file.arrayBuffer();
  const mime = file.type || expectedMime(format);

  let extracted: { text: string; kind: 'image' | 'document'; truncated: boolean };
  try {
    extracted = await extractDocumentText({ buffer, mime, filename });
  } catch (error) {
    // The refusals carry the sentence a teacher can act on, and they are the
    // expected outcome rather than an exception: a scan and a Keynote export are
    // both ordinary things to pick by mistake.
    if (error instanceof ImportRefusal) return refusal(error.message);
    return refusal('That file could not be read. Try opening it on this device first.');
  }

  try {
    const store = await data();
    const asset = await store.createDeckAsset(session.userId, deckId, {
      kind: extracted.kind,
      filename,
      mime,
      byteSize: file.size,
      // Only an image needs its bytes kept. A document's original file is not
      // stored at all: the extracted text is what the deck uses, and holding a
      // megabyte of PDF per import that nothing ever reads back is the wrong
      // trade for a school connection.
      bytes: extracted.kind === 'image' ? buffer : undefined,
      extractedText: extracted.kind === 'document' ? extracted.text : null,
    });

    revalidatePath(`/slides/${deckId}`);

    if (extracted.kind === 'image') {
      return {
        ok: true,
        message: `${filename} uploaded. It is ready to place on a slide.`,
        kind: 'image',
        assetId: asset.id,
        wordCount: null,
        truncated: false,
      };
    }

    const words = extracted.text.split(/\s+/).filter(Boolean).length;
    const count = `${words} ${words === 1 ? 'word' : 'words'}`;
    const truncation = extracted.truncated
      ? ` It was longer than ${MAX_EXTRACTED_CHARS.toLocaleString('en-GB')} characters, so only the first part was read.`
      : '';

    return {
      ok: true,
      message: `${filename} imported. ${count} ready to turn into slides.${truncation}`,
      kind: 'document',
      assetId: null,
      wordCount: words,
      truncated: extracted.truncated,
    };
  } catch (error) {
    // A `DataError` message is already written for the person reading it. A
    // transport failure is not, so it gets a sentence that admits that rather
    // than a schema message about a table nobody has heard of.
    return refusal(
      error instanceof DataError
        ? error.message
        : 'That file could not be added to this deck. Try again in a moment.',
    );
  }
}

/**
 * Removes a file from a deck.
 *
 * Separate from `importDocument` because removing an image is a decision a
 * teacher makes later, usually after they have seen how it looks on a slide,
 * and it has to work without the upload form being on screen.
 */
export async function removeDeckAsset(input: {
  deckId: string;
  assetId: string;
}): Promise<ImportResult> {
  const session = await requirePermission('plan:write');

  if (!input.assetId.trim()) return refusal('That file could not be found.');

  try {
    const store = await data();
    await store.deleteDeckAsset(session.userId, input.assetId.trim());
    revalidatePath(`/slides/${input.deckId.trim()}`);
    return {
      ok: true,
      message: 'That file was removed.',
      kind: null,
      assetId: null,
      wordCount: null,
      truncated: false,
    };
  } catch (error) {
    return refusal(
      error instanceof DataError ? error.message : 'That file could not be removed.',
    );
  }
}