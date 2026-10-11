import {
  DEFAULT_TEXT_STYLE,
  SLIDE_SIZES,
  SLIDE_THEMES,
  SLIDE_WEIGHTS,
  type SlideElement,
  type SlideTextElement,
  type SlideTheme,
} from '@/lib/api/types';

/**
 * Turning a model's answer into slides.
 *
 * WHY NOTHING FROM THE MODEL IS TRUSTED. The response is text from a system that
 * was asked to produce JSON and does not owe us JSON. It will wrap the object in
 * a code fence, it will add a sentence before it, it will return a string where a
 * number was asked for, and on a bad day it will return prose. Every field below
 * is therefore read through a closed set and anything unrecognised is replaced
 * with a default rather than passed through.
 *
 * THE CONSEQUENCE OF THAT IS THE POINT. A hallucinated font name cannot reach the
 * renderer, a hallucinated colour cannot produce a slide with white text on
 * white, and a model that returns nothing usable produces an empty deck and an
 * honest message rather than a deck full of broken boxes.
 */

export interface GeneratedSlide {
  /** One-line summary of what the slide is for, used as its accessible name. */
  title: string;
  theme: SlideTheme;
  /** Up to three columns of content: a heading and its body. */
  elements: SlideElement[];
}

export interface GeneratedDeck {
  title: string;
  slides: GeneratedSlide[];
}

/** Refuses a response that is not an outline at all, rather than inventing one. */
export class OutlineError extends Error {}

const MAX_SLIDES = 20;
const MAX_HEADING_CHARS = 140;
const MAX_BODY_CHARS = 900;

function firstString(value: unknown, fallback: string, cap: number): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, cap);
}

/**
 * Reads a closed set out of an untrusted value.
 *
 * `null` rather than a throw: one bad font on one slide should cost that slide
 * its custom font, not the whole import.
 */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Pulls a JSON object out of a response that may be wrapped in a fence.
 *
 * The fence is the common case and it is easy to strip. The prose either side of
 * it is rarer but real, so the first balanced object in the text is taken.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall through to the brace scan.
  }

  const start = candidate.indexOf('{');
  if (start === -1) throw new OutlineError('The answer was not a deck outline.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          throw new OutlineError('The answer was not valid JSON.');
        }
      }
    }
  }
  throw new OutlineError('The answer was cut off before it finished.');
}

/**
 * Turns one bullet into a text element.
 *
 * Bullets get a real list element rather than characters typed into a string, so
 * the renderer controls the marker, the indent and the line height. A model that
 * writes its own dashes therefore cannot produce a ragged left edge.
 */
function bulletElement(content: string, index: number, total: number, prefix: string): SlideTextElement {
  // The first bullets sit higher on the slide than the last ones, so a short
  // list sits under the heading instead of sinking to the middle of the frame.
  const span = total > 4 ? 4 : 5;
  const col = total > 4 ? 3 : 2;
  return {
    id: `${prefix}_b${index}`,
    kind: 'bullets',
    content,
    col,
    span,
    row: 3,
    tall: 4,
    style: { ...DEFAULT_TEXT_STYLE, size: total > 5 ? 'md' : 'lg' },
  };
}

/**
 * Builds slides from a model response.
 *
 * Throws `OutlineError` rather than returning a partial deck silently. A teacher
 * who asked for eight slides and got three with no explanation cannot tell a
 * truncation from a complete answer, and will teach the wrong thing.
 */
export function buildDeckFromOutline(raw: string, requestedTitle = ''): GeneratedDeck {
  const parsed = extractJson(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new OutlineError('The answer was not a deck outline.');
  }

  const outline = parsed as Record<string, unknown>;
  const rawSlides = Array.isArray(outline.slides) ? outline.slides : [];
  if (rawSlides.length === 0) {
    throw new OutlineError('The answer contained no slides.');
  }

  const deckTitle = firstString(outline.title, requestedTitle || 'New deck', 160) || 'New deck';

  const slides: GeneratedSlide[] = [];
  for (const [index, entry] of rawSlides.slice(0, MAX_SLIDES).entries()) {
    if (typeof entry !== 'object' || entry === null) continue;
    const slide = entry as Record<string, unknown>;
    const title = firstString(slide.title, '', MAX_HEADING_CHARS);

    /*
     * IDS CARRY THE SLIDE INDEX.
     *
     * Every slide used to mint `gen_h` and `gen_b0`, so a five slide deck held
     * five elements called `gen_h`. Nothing broke on the day it was written,
     * because the editor addresses an element as (slide, element) and React keys
     * are per list. But it is one careless lookup away from editing slide one
     * through a click on slide four, and the id is the only thing that makes an
     * element addressable at all.
     *
     * This was found by the LIVE probe rather than by the unit test, because the
     * unit test only checked the ids within a single slide.
     */
    const prefix = `s${index}`;

    const rawBullets = Array.isArray(slide.bullets) ? slide.bullets : [];
    const bullets = rawBullets
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.replace(/\s+/g, ' ').trim().slice(0, 240))
      .filter(Boolean)
      .slice(0, 8);

    const body = firstString(slide.body, '', MAX_BODY_CHARS);

    const elements: SlideElement[] = [];
    if (title) {
      elements.push({
        id: `${prefix}_h`,
        kind: 'heading',
        content: title,
        col: 2,
        span: 4,
        row: 1,
        tall: 2,
        // Forced large and semibold regardless of what the model asked for. A
        // heading is the one element whose job is to be read first.
        style: {
          size: 'xl',
          weight: 'semibold',
          font: oneOf(slide.font, ['geist', 'geist-mono'] as const, 'geist'),
          ink: oneOf(slide.ink, ['ink', 'muted', 'accent', 'on-accent'] as const, 'ink'),
          align: 'left',
        },
      });
    }
    if (body) {
      elements.push({
        id: `${prefix}_p`,
        kind: 'text',
        content: body,
        col: 2,
        span: 4,
        row: 3,
        tall: 4,
        style: { ...DEFAULT_TEXT_STYLE, size: 'lg' },
      });
    }
    bullets.forEach((item, at) => elements.push(bulletElement(item, at, bullets.length, prefix)));

    // A slide with nothing on it is worse than a missing slide: the deck shows a
    // blank frame and the teacher cannot tell which slide failed to generate.
    if (elements.length === 0) continue;

    slides.push({
      title: title || `Slide ${slides.length + 1}`,
      theme: oneOf(slide.theme, SLIDE_THEMES, 'viridian'),
      elements,
    });
  }

  if (slides.length === 0) {
    throw new OutlineError('The answer contained no usable slides.');
  }

  return { title: deckTitle, slides };
}

/**
 * The instruction sent with the prompt.
 *
 * It describes the floor plan in words rather than in a schema, because the
 * product, not the model, decides where things sit. A model asked to position
 * text produces coordinates that do not survive the grid, and the teacher gets
 * a slide that looks different from the one they approved.
 */
export const OUTLINE_INSTRUCTION = `You are writing a slide deck for a teacher.
Return ONLY a JSON object, no prose and no code fence, of this shape:

{
  "title": "deck title",
  "slides": [
    {
      "title": "the slide heading",
      "bullets": ["a short point", "another short point"],
      "body": "optional paragraph instead of bullets",
      "theme": "viridian"
    }
  ]
}

Rules:
- Between 3 and 12 slides, unless the teacher asked for a number.
- A slide has a heading of at most 8 words.
- Bullets are complete sentences of at most 18 words. Never use a dash as a
  bullet marker; they are added by the renderer.
- Do not write "Slide 1" or "Introduction" unless that is really the content.
- theme must be one of: viridian, ink, paper, dusk.
- Use "body" for a paragraph and "bullets" for a list, not both.
- Say what the teacher asked for. Do not add a thank-you slide or a summary
  slide they did not request.`;

/** Re-exported so the tests can assert against the same closed sets. */
export const VALID_SIZES = SLIDE_SIZES;
export const VALID_WEIGHTS = SLIDE_WEIGHTS;