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
  SLIDE_LAYOUTS,
  type DeckInput,
  type SlideInput,
  type SlideLayout,
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