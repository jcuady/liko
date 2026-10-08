/**
 * Subject parsing.
 *
 * WHY THIS IS ITS OWN MODULE. A `'use server'` module may only export async
 * functions, because on the client every other export is replaced by a reference
 * proxy. A plain helper exported from one would therefore arrive as a proxy that
 * is not callable. That has bitten this codebase twice already, so the helpers
 * live beside the components that use them and the server modules export only
 * actions.
 */

/**
 * Subjects arrive as free text because that is how a teacher thinks about them.
 * "AP Biology" and "Year 10 Chemistry" are both legitimate answers, and splitting
 * them into a subject table would buy nothing, because nothing joins to a
 * subject: the gradebook reaches a student through a class.
 *
 * Duplicates are folded case-insensitively but the first spelling typed is the
 * one kept, so the list still reads the way the teacher wrote it.
 */
export function parseSubjects(raw: string): string[] {
  const seen = new Set<string>();
  const subjects: string[] = [];

  for (const piece of raw.split(',')) {
    const value = piece.trim();
    if (value.length === 0) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    subjects.push(value);
  }

  return subjects.slice(0, 20);
}