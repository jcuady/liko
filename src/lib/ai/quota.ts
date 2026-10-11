/**
 * How much generation a person has spent.
 *
 * WHY THIS IS NOT IN `gemini.ts`. That module is marked `server-only` so the
 * provider key can never reach a component, and the arithmetic here is worth
 * testing. A quota whose math cannot be unit tested is a quota that is only ever
 * checked by the thing it is protecting.
 */

export interface UsageSummary {
  /** What the user has spent in the current window. */
  used: number;
  /** What the user may spend. */
  limit: number;
  remaining: number;
  /** False when the provider refused, which is a different state from "spent". */
  available: boolean;
  /** Why it is unavailable, for the teacher to read. */
  reason: string;
  /** False when no key is configured, so the UI can say so rather than guess. */
  configured: boolean;
  model: string;
  windowMinutes: number;
}

/**
 * Generations allowed per person per rolling hour.
 *
 * A ceiling the product enforces, not a hope about the provider's free tier. The
 * provider's own limit is per key and per minute; this is per person and per
 * hour, because the failure a teacher cares about is "mine stopped working",
 * which is a per-person question.
 */
export const GENERATION_LIMIT_PER_HOUR = 8;

export const WINDOW_MINUTES = 60;

/**
 * Reads the allowance from the rows a person has spent against.
 *
 * `available` is deliberately conservative: it reports false when no key is
 * configured, which is the one state the product can be certain about, and it
 * never claims true merely because a key exists. A key whose upstream tier is
 * exhausted looks identical from here until something is actually called, so
 * claiming true would be a promise the product cannot keep.
 *
 * `remaining` is clamped at zero. A count that can go negative is a count that
 * renders as a negative number of things you can still do.
 */
export function usageFrom(
  rows: { created_at: string }[],
  configured: boolean,
  now: number = Date.now(),
): UsageSummary {
  const cutoff = now - WINDOW_MINUTES * 60_000;
  const used = rows.filter((row) => {
    const at = new Date(row.created_at).getTime();
    // A row with an unparseable date counts. Counting it as "not recent" would
    // let a corrupt row silently restore somebody's whole allowance.
    return Number.isNaN(at) ? true : at > cutoff;
  }).length;

  return {
    used,
    limit: GENERATION_LIMIT_PER_HOUR,
    remaining: Math.max(0, GENERATION_LIMIT_PER_HOUR - used),
    available: configured,
    reason: configured ? '' : 'AI generation is not configured on this deployment.',
    configured,
    model: '',
    windowMinutes: WINDOW_MINUTES,
  };
}