'use server';

/**
 * Deck and slide writes.
 *
 * WHY A `plan:write` GATE ON A SLIDES MODULE. A deck is lesson material, the
 * same thing a lesson plan is, so it is gated the same way. Splitting the two
 * would mean a teacher could prepare a plan for a class they are not allowed to
 * teach into, or that the nav and the route disagreed about.
 *
 * WHY POSITION IS SENT AS A TARGET INDEX AND NOT A DELTA. The editor's arrows
 * know where the slide is going, and a client-computed delta is wrong the moment
 * two people reorder the same deck. The seam renumbers the deck so positions
 * stay contiguous.
 *
 * NO CONVERSION. There is deliberately no .pptx import or export here. A deck is
 * authored in LIKO and presented from it, or printed to PDF by the browser.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { DataError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/auth/guards';
import {
  normaliseElements,
  SLIDE_ALIGNMENTS,
  SLIDE_FONTS,
  SLIDE_INKS,
  SLIDE_LAYOUTS,
  SLIDE_SIZES,
  SLIDE_THEMES,
  SLIDE_WEIGHTS,
  type DeckInput,
  type SlideElement,
  type SlideInput,
  type SlideLayout,
  type SlideTextStyle,
  type SlideTheme,
} from '@/lib/api/types';

export interface DeckResult {
  ok: boolean;
  message: string;
  /** Set on create so the caller can navigate straight into the new deck. */
  deckId?: string;
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof DataError) return error.message;
  return fallback;
}

function readDeck(input: { title: string; description: string }): DeckInput | string {
  const title = input.title.trim().slice(0, 160);
  const description = input.description.trim().slice(0, 400);
  if (title.length < 1) return 'Give the deck a title.';
  return { title, description };
}

function readSlide(input: {
  layout: string;
  title: string;
  body: string;
  notes: string;
}): SlideInput | string {
  const layout = SLIDE_LAYOUTS.includes(input.layout as SlideLayout)
    ? (input.layout as SlideLayout)
    : null;
  if (!layout) return 'Choose one of the layouts listed.';

  const title = input.title.trim().slice(0, 160);
  const body = input.body.trim().slice(0, 4000);
  const notes = input.notes.trim().slice(0, 4000);

  // A slide with neither a title nor a body is indistinguishable from a bug to
  // anyone scanning the thumbnail rail, so it is refused where it can be fixed.
  if (title.length === 0 && body.length === 0) {
    return 'Give the slide a title or some points.';
  }

  return { layout, title, body, notes };
}

export async function createDeckAction(input: {
  title: string;
  description: string;
}): Promise<DeckResult> {
  const session = await requirePermission('plan:write');

  const parsed = readDeck(input);
  if (typeof parsed === 'string') return { ok: false, message: parsed };

  try {
    const store = await data();
    const deck = await store.createDeck(session.userId, parsed);
    revalidatePath('/slides');
    return { ok: true, message: `${deck.title} created.`, deckId: deck.id };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That deck could not be created.') };
  }
}

export async function updateDeckAction(input: {
  deckId: string;
  title: string;
  description: string;
}): Promise<DeckResult> {
  const session = await requirePermission('plan:write');

  if (!input.deckId.trim()) return { ok: false, message: 'That deck could not be found.' };

  const parsed = readDeck(input);
  if (typeof parsed === 'string') return { ok: false, message: parsed };

  try {
    const store = await data();
    await store.updateDeck(session.userId, input.deckId.trim(), parsed);
    revalidatePath('/slides');
    revalidatePath(`/slides/${input.deckId.trim()}`);
    return { ok: true, message: 'Deck saved.' };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That deck could not be saved.') };
  }
}

export async function archiveDeckAction(input: { deckId: string }): Promise<DeckResult> {
  const session = await requirePermission('plan:write');
  if (!input.deckId.trim()) return { ok: false, message: 'That deck could not be found.' };

  try {
    const store = await data();
    await store.archiveDeck(session.userId, input.deckId.trim());
    revalidatePath('/slides');
    return { ok: true, message: 'Deck archived.' };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That deck could not be archived.') };
  }
}

export async function createSlideAction(input: {
  deckId: string;
  layout: string;
  title: string;
}): Promise<DeckResult> {
  const session = await requirePermission('plan:write');
  if (!input.deckId.trim()) return { ok: false, message: 'That deck could not be found.' };

  try {
    const store = await data();
    const slide = await store.createSlide(session.userId, input.deckId.trim(), {
      layout: (SLIDE_LAYOUTS.includes(input.layout as SlideLayout)
        ? input.layout
        : 'bullets') as SlideLayout,
      title: input.title.trim().slice(0, 160),
    });
    revalidatePath(`/slides/${input.deckId.trim()}`);
    return { ok: true, message: 'Slide added.', deckId: slide.id };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That slide could not be added.') };
  }
}

export async function updateSlideAction(input: {
  slideId: string;
  deckId: string;
  layout: string;
  title: string;
  body: string;
  notes: string;
}): Promise<DeckResult> {
  const session = await requirePermission('plan:write');
  if (!input.slideId.trim()) return { ok: false, message: 'That slide could not be found.' };

  const parsed = readSlide(input);
  if (typeof parsed === 'string') return { ok: false, message: parsed };

  try {
    const store = await data();
    await store.updateSlide(session.userId, input.slideId.trim(), parsed);
    revalidatePath(`/slides/${input.deckId.trim()}`);
    return { ok: true, message: 'Slide saved.' };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That slide could not be saved.') };
  }
}

export async function deleteSlideAction(input: {
  slideId: string;
  deckId: string;
}): Promise<DeckResult> {
  const session = await requirePermission('plan:write');
  if (!input.slideId.trim()) return { ok: false, message: 'That slide could not be found.' };

  try {
    const store = await data();
    const slides = await store.listSlides(session.userId, input.deckId.trim());

    // The last slide goes with the deck. Leaving a deck that cannot be shown is
    // worse than removing it, and the teacher still has the archive to find it in.
    if (slides.length <= 1) {
      await store.archiveDeck(session.userId, input.deckId.trim());
      revalidatePath('/slides');
      return { ok: true, message: 'That was the last slide, so the deck was archived too.' };
    }

    await store.deleteSlide(session.userId, input.slideId.trim());
    revalidatePath(`/slides/${input.deckId.trim()}`);
    return { ok: true, message: 'Slide deleted.' };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That slide could not be deleted.') };
  }
}

export async function moveSlideAction(input: {
  slideId: string;
  deckId: string;
  toIndex: number;
}): Promise<DeckResult> {
  const session = await requirePermission('plan:write');
  if (!input.slideId.trim()) return { ok: false, message: 'That slide could not be found.' };

  const toIndex = Math.round(input.toIndex);
  if (!Number.isFinite(toIndex) || toIndex < 0) {
    return { ok: false, message: 'That slide cannot go there.' };
  }

  try {
    const store = await data();
    await store.moveSlide(session.userId, input.slideId.trim(), toIndex);
    revalidatePath(`/slides/${input.deckId.trim()}`);
    return { ok: true, message: 'Slide moved.' };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That slide could not be moved.') };
  }
}

/*
 * Slide content writes.
 *
 * WHY EVERYTHING IS RE-READ THROUGH A CLOSED SET HERE. A server action is a
 * public endpoint. Anything arriving from the browser can be an object with
 * `kind: 'heading'`, a `size` of `enormous` and a `col` of 900 written by anyone
 * who opens devtools, and `elements` is a jsonb column that stores whatever it
 * is given. `normaliseElements` on the way in is what means the renderer only
 * ever reads the closed set, and it is the same function the reader uses, so
 * what the teacher saw is what was stored.
 *
 * WHY THE STYLE PATCH IS APPLIED TO THE STORED LIST RATHER THAN SENT WHOLE. A
 * style control is a discrete choice, and sending the whole element list with it
 * turns one click into a last write wins race between two teachers editing the
 * same slide. The patch is applied to the row as it stands, so the two writers
 * touch different elements.
 *
 * The gate is `plan:write` for the reason the rest of this file gives: there is
 * no `slides:write`, and `/slides` is already authorised as `plan:write`.
 */

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function readTheme(value: unknown): SlideTheme | null {
  return oneOf(value, SLIDE_THEMES) ?? null;
}

function readElements(value: unknown): SlideElement[] | string {
  const parsed = normaliseElements(value);
  if (parsed === null) return 'That slide content could not be read.';
  return parsed;
}

/**
 * Reads a style patch out of an untrusted object.
 *
 * `null` rather than a rejection: a teacher changing one control must not lose
 * the other four because the browser sent one value nobody recognises.
 */
function readStylePatch(value: unknown): Partial<SlideTextStyle> {
  const patch = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const out: Partial<SlideTextStyle> = {};
  const size = oneOf(patch.size, SLIDE_SIZES);
  if (size) out.size = size;
  const weight = oneOf(patch.weight, SLIDE_WEIGHTS);
  if (weight) out.weight = weight;
  const font = oneOf(patch.font, SLIDE_FONTS);
  if (font) out.font = font;
  const ink = oneOf(patch.ink, SLIDE_INKS);
  if (ink) out.ink = ink;
  const align = oneOf(patch.align, SLIDE_ALIGNMENTS);
  if (align) out.align = align;
  return out;
}

export async function saveSlideElements(input: {
  slideId: string;
  elements: unknown;
  theme: string;
}): Promise<DeckResult> {
  const session = await requirePermission('plan:write');
  if (!input.slideId.trim()) return { ok: false, message: 'That slide could not be found.' };

  const elements = readElements(input.elements);
  if (typeof elements === 'string') return { ok: false, message: elements };

  const theme = readTheme(input.theme);
  if (!theme) return { ok: false, message: 'Choose one of the four backgrounds.' };

  try {
    const store = await data();
    const slide = await store.updateSlideContent(session.userId, input.slideId.trim(), {
      elements,
      theme,
    });
    revalidatePath(`/slides/${slide.deckId}`);
    return { ok: true, message: 'Slide saved.' };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That slide could not be saved.') };
  }
}

export async function updateElementStyle(input: {
  slideId: string;
  elementId: string;
  patch: unknown;
}): Promise<DeckResult> {
  const session = await requirePermission('plan:write');
  if (!input.slideId.trim()) return { ok: false, message: 'That slide could not be found.' };
  if (!input.elementId.trim()) return { ok: false, message: 'That element could not be found.' };

  const patch = readStylePatch(input.patch);

  try {
    const store = await data();
    const slide = await store.getSlide(session.userId, input.slideId.trim());
    const elements = normaliseElements(slide.elements) ?? [];
    const index = elements.findIndex((element) => element.id === input.elementId.trim());
    if (index === -1) return { ok: false, message: 'That element is no longer on the slide.' };

    const current = elements[index]!;
    if (current.kind === 'image') {
      return { ok: false, message: 'An image does not carry a text style.' };
    }

    elements[index] = { ...current, style: { ...current.style, ...patch } };
    await store.updateSlideContent(session.userId, slide.id, { elements, theme: slide.theme });
    revalidatePath(`/slides/${slide.deckId}`);
    return { ok: true, message: 'Element updated.' };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That element could not be updated.') };
  }
}