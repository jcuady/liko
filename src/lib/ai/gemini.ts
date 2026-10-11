import 'server-only';

/**
 * The AI seam.
 *
 * WHY A SEAM AND NOT A CALL SITE. Generation costs money and can be refused, so
 * it cannot be sprinkled through the product. It is one module with one
 * function, and everything above it deals in the app's own types.
 *
 * WHY THE PROVIDER IS A CONSTANT AND NOT A CHOICE. There is exactly one
 * provider and exactly one model, and naming them here means the rest of the
 * product never learns either. Swapping providers is a change to this file and
 * to nothing else.
 *
 * WHY THE KEY IS ONLY EVER READ HERE. The key is a server variable, read inside
 * a module marked `server-only`, and is never passed to a component, logged, or
 * written into an error. A generation failure is reported as a state, not as a
 * string that might contain the request.
 */

import { DataError } from '@/lib/api/errors';
import {
  GENERATION_LIMIT_PER_HOUR,
  WINDOW_MINUTES,
  usageFrom,
  type UsageSummary,
} from '@/lib/ai/quota';

export { usageFrom, GENERATION_LIMIT_PER_HOUR, WINDOW_MINUTES };
export type { UsageSummary };

const GENERATIVE_LANGUAGE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * `gemini-3.5-flash` because it is what this key can actually reach.
 *
 * The list endpoint reports the model as available and the generate endpoint
 * answers 404 for `2.5-flash` on a new key, so the model was chosen by calling
 * it rather than by reading the list. `scripts/probe-gemini.mjs` re-runs that
 * check and prints the token usage, which is the same number this module bills
 * the quota against.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash';

/** Ceiling on one prompt, so a pasted document cannot become an unbounded bill. */
const MAX_PROMPT_CHARS = 4000;

/** Rough ceiling on the response, which is what actually decides the cost. */
const MAX_OUTPUT_TOKENS = 4096;

export interface GenerateOptions {
  /** What the teacher asked for. */
  prompt: string;
  /** Extra instruction that is not the teacher's to edit, such as the shape. */
  system: string;
  /** The floor plan the answer has to fit into, described in words. */
  schemaHint: string;
}

export interface GenerateResult {
  text: string;
  model: string;
  promptTokens: number;
  outputTokens: number;
}

export class AiUnavailable extends Error {
  constructor(
    message: string,
    readonly kind: 'not-configured' | 'refused' | 'quota' | 'malformed' | 'network',
  ) {
    super(message);
    this.name = 'AiUnavailable';
  }
}

/**
 * Asks the model for a deck outline as JSON.
 *
 * RETURNS A STRING AND NOT AN OBJECT on purpose. The single most reliable way to
 * keep a model from wrapping JSON in prose or a code fence is to stop asking it
 * for JSON and ask it for a format that is trivial to split, then validate what
 * came back. Anything that survives that is checked again by the caller against
 * the real element types.
 */
export async function generateDeckOutline(options: GenerateOptions): Promise<GenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiUnavailable(
      'AI generation is not configured on this deployment.',
      'not-configured',
    );
  }

  const prompt = options.prompt.trim().slice(0, MAX_PROMPT_CHARS);
  if (!prompt) {
    throw new AiUnavailable('Type what the slides should be about first.', 'malformed');
  }

  let response: Response;
  try {
    response = await fetch(`${GENERATIVE_LANGUAGE}/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.system }] },
        contents: [{ role: 'user', parts: [{ text: `${prompt}\n\n${options.schemaHint}` }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    // Never interpolate the cause: a fetch error can carry the request URL, and
    // the request URL carries the key when it is a query parameter.
    throw new AiUnavailable('The AI service could not be reached. Try again in a moment.', 'network');
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new AiUnavailable(
        'The AI service is out of capacity or this key has hit its limit. Try again later.',
        'quota',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new AiUnavailable('The AI service rejected this deployment\'s credentials.', 'refused');
    }
    throw new AiUnavailable(`The AI service answered ${response.status}.`, 'refused');
  }

  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text.trim()) {
    throw new AiUnavailable('The AI service returned an empty answer.', 'malformed');
  }

  return {
    text,
    model: GEMINI_MODEL,
    promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
  };
}


export { DataError };
