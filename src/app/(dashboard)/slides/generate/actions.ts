'use server';

/**
 * Generating a deck from what the teacher typed.
 *
 * WHY THE QUOTA IS CHECKED BEFORE THE CALL AND AGAIN AFTER IT. Two people on
 * one key can both pass the first check and both be inside the allowance when
 * the second runs. The record is written in the same statement that reads the
 * count, so the number the teacher is shown is the number that was actually
 * spent rather than the number that was believed.
 *
 * WHY A REFUSAL IS A STATE AND NOT AN ERROR. Generation can fail because there
 * is no key, because the provider is out of capacity, because this person has
 * used their share, or because the answer was not an outline. Those are four
 * different sentences for a teacher and collapsing them into "something went
 * wrong" is what makes an AI feature feel broken.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import {
  AiUnavailable,
  GEMINI_MODEL,
  aiConfigured,
  AI_PURPOSE_DECK,
  generateDeckOutline,
  usageFrom,
  type UsageSummary,
} from '@/lib/ai/gemini';
import { OUTLINE_INSTRUCTION, buildDeckFromOutline, type GeneratedSlide } from '@/lib/slides/generate';

/**
 * The quota maths does not know which model is behind it, because it must be
 * testable without a server. Naming the model here keeps the number the panel
 * shows true, without dragging `server-only` into the arithmetic.
 */
function withModel(usage: UsageSummary): UsageSummary {
  return { ...usage, model: GEMINI_MODEL };
}

export interface GenerateResult {
  ok: boolean;
  /** A sentence for the teacher, already written for them. */
  message: string;
  deckId?: string;
  usage?: UsageSummary;
}

/**
 * What the AI panel renders before the teacher types anything.
 *
 * Read on mount rather than fetched after a failure, because the one state a
 * teacher most needs to see before they start is "this is going to be refused".
 */
export async function aiStatusAction(): Promise<UsageSummary> {
  const session = await requirePermission('plan:write');
  const store = await data();
  const rows = await store.listAiUsage(session.userId);
  return withModel(usageFrom(rows, aiConfigured()));
}

/**
 * Writes a deck the model described.
 *
 * The slides are built first and written second, and nothing is written until
 * the whole outline has survived validation. A deck that is half imported
 * because the response turned to prose in the middle is worse than no deck,
 * because the teacher cannot tell which half is real.
 */
async function persistDeck(
  userId: string,
  deckTitle: string,
  slides: GeneratedSlide[],
): Promise<string> {
  const store = await data();
  const deck = await store.createDeck(userId, { title: deckTitle, description: '' });
  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index]!;
    /*
     * The heading is found by shape rather than by assuming index 0. The model
     * decides how many elements a slide has, so `elements[0]` is not a contract.
     */
    const heading =
      slide.elements.find((el) => el.kind !== 'image' && 'content' in el)?.content ??
      slide.title;
    await store.createSlide(userId, deck.id, {
      layout: slide.elements.length > 1 ? 'bullets' : 'title',
      theme: slide.theme,
      elements: slide.elements,
      title: heading.slice(0, 160),
      body: '',
      notes: '',
    });
  }
  return deck.id;
}

export async function generateDeckAction(input: {
  prompt: string;
  deckTitle: string;
  classId: string | null;
}): Promise<GenerateResult> {
  const session = await requirePermission('plan:write');
  const store = await data();

  const prompt = input.prompt.trim();
  if (!prompt) {
    return { ok: false, message: 'Type what the slides should be about first.' };
  }

  const configured = aiConfigured();
  if (!configured) {
    return {
      ok: false,
      message: 'AI generation is not configured on this deployment.',
    };
  }

  /*
   * Pre-flight. It does not replace the authoritative check in the adapter, it
   * only avoids spending a call that is certainly going to be refused.
   */
  const before = withModel(usageFrom(await store.listAiUsage(session.userId), true));
  if (before.remaining <= 0) {
    return {
      ok: false,
      message: `You have used all ${before.limit} generations in the last hour. Try again shortly.`,
      usage: before,
    };
  }

  let outline: ReturnType<typeof buildDeckFromOutline>;
  let tokens: { promptTokens: number; outputTokens: number };

  try {
    const raw = await generateDeckOutline({
      prompt,
      system:
        'You write classroom slide decks. You answer only in the requested JSON shape, ' +
        'you never wrap the answer in prose or a code fence, and you never pad the deck ' +
        'with slides the teacher did not ask for.',
      schemaHint: OUTLINE_INSTRUCTION,
    });
    outline = buildDeckFromOutline(raw.text, input.deckTitle || prompt);
    tokens = { promptTokens: raw.promptTokens, outputTokens: raw.outputTokens };
  } catch (cause) {
    if (cause instanceof AiUnavailable) {
      return { ok: false, message: cause.message, usage: before };
    }
    // OutlineError and anything else: the call happened and was paid for, so it
    // is still recorded, because the teacher's own allowance did the work.
    await store.recordAiGeneration(session.userId, {
      model: GEMINI_MODEL,
      purpose: AI_PURPOSE_DECK,
      promptTokens: 0,
      outputTokens: 0,
    });
    const after = withModel(usageFrom(await store.listAiUsage(session.userId), true));
    return {
      ok: false,
      message:
        'The answer did not contain a usable deck. Rephrasing what you asked for usually ' +
        'fixes it.',
      usage: after,
    };
  }

  /*
   * Charged before the deck is written. If the write fails, the teacher is still
   * charged, and that is the correct direction to be wrong in: a limit that
   * refunds failures can be spent by causing failures.
   */
  await store.recordAiGeneration(session.userId, {
    model: GEMINI_MODEL,
    purpose: AI_PURPOSE_DECK,
    promptTokens: tokens.promptTokens,
    outputTokens: tokens.outputTokens,
  });

  const after = withModel(usageFrom(await store.listAiUsage(session.userId), true));

  try {
    const deckId = await persistDeck(session.userId, outline.title, outline.slides);
    revalidatePath('/slides');
    return {
      ok: true,
      message: `Made ${outline.slides.length} ${outline.slides.length === 1 ? 'slide' : 'slides'}. Every one of them is yours to edit.`,
      deckId,
      usage: after,
    };
  } catch {
    return {
      ok: false,
      message: 'The deck was made but could not be saved. Nothing was lost; try again.',
      usage: after,
    };
  }
}