'use server';

/**
 * The student side of flashcards.
 *
 * WHY THESE ARE SEPARATE FROM ANY TEACHER ACTION FILE. A student action filed
 * beside a teacher's would be one careless `requirePermission` away from being
 * reachable by the wrong role, which is the reason `/quiz` keeps its own.
 *
 * THE SCHEDULER RUNS HERE, NOT IN THE BROWSER. A review posts one of four
 * answers, and the interval that follows is computed on the server from the
 * stored row. If the client sent the next `due_at` instead, a student could
 * PATCH a card straight to a year and never see it again, and nothing in the
 * database could tell the difference from a legitimate answer. This is the same
 * reason a quiz score is recomputed server-side rather than trusted from the
 * submission: the number a client sends back is not evidence.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import { can } from '@/lib/auth/rbac';
import type {
  FlashcardDeckRecord,
  FlashcardProgressRecord,
  FlashcardRecord,
} from '@/lib/api/types';
import { countDue, review, toSchedule, type Recall } from '@/lib/srs/scheduler';

export interface DeckSummary {
  deck: FlashcardDeckRecord;
  due: number;
  learning: number;
  cards: number;
  /** True when the caller may edit this deck rather than only study it. */
  editable: boolean;
}

export interface StudyCard {
  card: FlashcardRecord;
  progress: FlashcardProgressRecord | null;
}

export interface DeckDetail {
  deck: FlashcardDeckRecord;
  cards: StudyCard[];
  due: number;
  learning: number;
  editable: boolean;
  /** False for a teacher, who owns decks but has no roster row to review against. */
  canReview: boolean;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * The clock, read once per call.
 *
 * Passed down rather than reached for inside the scheduler so that a deck's due
 * count and a review's scheduling are judged against the same instant.
 */
function now(): Date {
  return new Date();
}

/**
 * Classes the caller may publish a deck into.
 *
 * The picker is built from this list rather than from every class in the school,
 * so the share option is not offered for a class the server would refuse.
 *
 * OWNERSHIP IS NOT RE-FILTERED HERE, and that used to be the whole defect.
 *
 * `listClasses` already answers "the classes this caller may act on": the
 * Supabase adapter is bounded by RLS, and the fixture answers the same question
 * for its own store. This action then filtered the result a second time on
 * `ownerId === session.userId`, which re-implemented a rule the seam had already
 * applied rather than sharing it.
 *
 * In the database that was harmless, because a teacher's classes really are
 * owned by their own id. In fixture mode it emptied the list: the seeded demo
 * classes are owned by a synthetic owner rather than by the demo teacher, so
 * every filter came back empty, `classes` was empty, and the component that
 * draws the picker renders nothing when the list is empty. The result was that
 * in fixture mode, in the demo, and in this suite a teacher could not share a
 * deck at all, and the whole sharing path was unreachable and therefore
 * untested. The production answer was right and the local one was wrong, which
 * is the same shape as the fixture that was too permissive elsewhere: both
 * directions lie.
 *
 * The archived filter is kept, because whether a class is retired is a fact
 * about the class rather than a statement of who may act on it, and the seam
 * has no reason to make that call for a picker.
 */
export async function loadShareableClasses(): Promise<{ id: string; name: string }[]> {
  const session = await requirePermission('flashcard:write');

  /*
   * SHARING NEEDS A CLASS, AND ONLY STAFF HAVE ONE.
   *
   * `flashcard:write` is held by a student at `own` scope, so requiring it is
   * not enough on its own: a student owns no class, so every class in their
   * `listClasses` answer is one they are enrolled in rather than one they own.
   * Offering those in a share picker builds a control whose every save is
   * refused, which reads as a broken product rather than as a boundary.
   *
   * `class:write` is the permission that actually means "may own a class", so
   * the gate is that, rather than a role name.
   */
  if (!can(session.role, 'class:write')) return [];

  const store = await data();
  const classes = await store.listClasses(session.userId);
  return classes
    .filter((row) => row.archivedAt === null)
    .map((row) => ({ id: row.id, name: row.name }));
}

export async function loadDecks(): Promise<DeckSummary[]> {
  const session = await requirePermission('flashcard:read');
  const store = await data();
  const decks = await store.listFlashcardDecks(session.userId);
  const at = now();

  return Promise.all(
    decks.map(async (deck) => {
      const [cards, progress] = await Promise.all([
        store.listFlashcards(session.userId, deck.id),
        store.listFlashcardProgress(session.userId, deck.id),
      ]);

      // A card with no row is `new`, and `new` is due immediately, so the count
      // is built from the same rule the review session uses rather than from
      // whichever cards happen to have rows.
      const byCard = new Map(progress.map((row) => [row.cardId, row]));
      const counts = countDue(
        cards.map((card) => ({ schedule: toSchedule(byCard.get(card.id) ?? null, at) })),
        at,
      );

      return {
        deck,
        due: counts.due,
        learning: counts.learning,
        cards: counts.total,
        editable: deck.ownerId === session.userId,
      };
    }),
  );
}

export async function loadDeck(deckId: string): Promise<DeckDetail | null> {
  const session = await requirePermission('flashcard:read');
  const store = await data();

  const decks = await store.listFlashcardDecks(session.userId);
  const deck = decks.find((row) => row.id === deckId);
  if (!deck) return null;

  const [cards, progress] = await Promise.all([
    store.listFlashcards(session.userId, deck.id),
    store.listFlashcardProgress(session.userId, deck.id),
  ]);

  const at = now();
  const byCard = new Map(progress.map((row) => [row.cardId, row]));
  const counts = countDue(
    cards.map((card) => ({ schedule: toSchedule(byCard.get(card.id) ?? null, at) })),
    at,
  );

  return {
    deck,
    cards: cards.map((card) => ({ card, progress: byCard.get(card.id) ?? null })),
    due: counts.due,
    learning: counts.learning,
    editable: deck.ownerId === session.userId,
    // A review needs a student to belong to and at least one card to show.
    // Both are real refusals rather than display concerns: staff own no roster
    // row, so their save would be rejected by the very policy that guards it.
    canReview: session.role === 'student' && counts.total > 0,
  };
}

/**
 * Applies one answer and returns when the card comes back.
 *
 * The returned `dueAt` is what the client renders, and it comes from the same
 * `review()` call that was written to the database, so the number the student
 * reads and the row that was stored cannot disagree.
 */
export async function gradeCard(input: {
  cardId: string;
  deckId: string;
  recall: Recall;
}): Promise<ActionResult & { dueAt: string | null }> {
  const session = await requirePermission('flashcard:review');
  if (!input.cardId) return { ok: false, message: 'That card is no longer open.', dueAt: null };

  try {
    const store = await data();
    const cards = await store.listFlashcards(session.userId, input.deckId);
    const card = cards.find((row) => row.id === input.cardId);
    if (!card) return { ok: false, message: 'That card is no longer in this deck.', dueAt: null };

    const progress = await store.listFlashcardProgress(session.userId, input.deckId);
    const existing = progress.find((row) => row.cardId === card.id) ?? null;

    // `studentId` is a placeholder: both adapters resolve the caller to their
    // own roster row and ignore this. It is named here rather than fetched so
    // that the shape of the argument stays the shape of the row, and so that
    // no future caller is tempted to pass somebody else's id and believe it
    // was used. What is written is decided inside the adapter.
    const studentId = 'caller';

    const next = review(toSchedule(existing, now()), input.recall, now());

    await store.saveFlashcardProgress(session.userId, {
      cardId: card.id,
      studentId,
      status: next.status,
      easeFactor: next.easeFactor,
      intervalDays: next.intervalDays,
      stepIndex: next.stepIndex,
      repetitions: next.repetitions,
      lapses: next.lapses,
      dueAt: next.dueAt,
      lastReviewedAt: next.lastReviewedAt,
      updatedAt: next.dueAt,
    });

    revalidatePath('/flashcards');
    revalidatePath(`/flashcards/${input.deckId}`);
    return { ok: true, message: 'Saved.', dueAt: next.dueAt };
  } catch {
    return { ok: false, message: 'That review could not be saved. Try again.', dueAt: null };
  }
}

/**
 * The roster row belonging to the caller.
 *
 * The Supabase adapter resolves this inside `saveFlashcardProgress`; the fixture
 * adapter refuses a row that is not the caller's. Both refuse, so a forged
 * student id fails either way rather than depending on which adapter is live.
 */

export async function createDeck(input: {
  title: string;
  subject: string;
  description: string;
  classId: string | null;
}): Promise<ActionResult & { deckId?: string }> {
  const session = await requirePermission('flashcard:write');
  const title = input.title.trim();
  if (!title) return { ok: false, message: 'Give the deck a title.' };

  try {
    const store = await data();
    const deck = await store.createFlashcardDeck(session.userId, {
      title,
      subject: input.subject.trim(),
      description: input.description.trim(),
      classId: input.classId,
    });
    revalidatePath('/flashcards');
    return { ok: true, message: 'Deck created.', deckId: deck.id };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message.includes('class you own')
          ? 'You can only share a deck into a class you teach.'
          : 'The deck could not be created. Try again.',
    };
  }
}

export async function addCard(input: {
  deckId: string;
  front: string;
  back: string;
  hint: string;
}): Promise<ActionResult> {
  const session = await requirePermission('flashcard:write');
  const front = input.front.trim();
  const back = input.back.trim();
  if (!front || !back) return { ok: false, message: 'A card needs a front and a back.' };

  try {
    const store = await data();
    await store.createFlashcard(session.userId, input.deckId, {
      front,
      back,
      hint: input.hint.trim(),
      tags: [],
    });
    revalidatePath(`/flashcards/${input.deckId}`);
    return { ok: true, message: 'Card added.' };
  } catch {
    return { ok: false, message: 'That card could not be added. Try again.' };
  }
}

export async function archiveDeck(input: { deckId: string }): Promise<ActionResult> {
  const session = await requirePermission('flashcard:write');

  try {
    const store = await data();
    await store.archiveFlashcardDeck(session.userId, input.deckId);
    revalidatePath('/flashcards');
    return { ok: true, message: 'Deck archived.' };
  } catch {
    return { ok: false, message: 'That deck could not be archived. Try again.' };
  }
}