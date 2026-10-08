/**
 * Initials for a student, in one place.
 *
 * This started as an inline expression in the roster write action and grew a
 * second, subtly different copy in the CSV importer. They disagreed: the
 * importer took the first and last word, the form took the first two words, so
 * "Maria Josefina Dela Cruz" became "MD" by one route and "MJ" by the other.
 *
 * The initials are shown beside every name on the roster, in the gradebook and
 * on the attendance register, so a student would appear to change identity
 * depending on which screen the teacher was looking at.
 *
 * The rule kept is the original one: the first letter of each of the first two
 * words, uppercased. A single-word name therefore yields one letter, which is
 * what it has always done.
 */
export function initialsFor(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}