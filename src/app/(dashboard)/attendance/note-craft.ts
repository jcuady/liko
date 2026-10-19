import type { Severity } from '@/lib/api/types';

/**
 * The vocabulary of an attendance note.
 *
 * WHY THIS IS A MODULE AND NOT AN ARRAY INSIDE THE COMPONENT. The server action
 * already decides which kinds of note exist and how long a note may be. A
 * control that carries its own copy of either rule is a control that can offer
 * something the server refuses, or refuse something the server would have taken.
 * Both copies now read these values.
 *
 * WHY NOTHING HERE IMPORTS REACT. The register renders this, and the action
 * validates against it, so it has to be readable from a server module as well as
 * a client one. Keeping it free of JSX also means the unit suite can collect it:
 * the suite globs `*.test.ts` and never sees a `.tsx` test.
 */

/** The longest note the server will store. Also the field's limit. */
export const NOTE_MAX_LENGTH = 500;

export interface NoteSeverityOption {
  value: Severity;
  label: string;
  description: string;
}

/**
 * Ordered by how much a teacher is escalating, not alphabetically.
 *
 * A control that presents them shuffled makes the reader do the ranking. The
 * order is the judgement: a note is neutral, praise is good, concern is a flag,
 * and an intervention is the one that should take the longest to choose.
 */
export const NOTE_SEVERITIES: readonly NoteSeverityOption[] = [
  {
    value: 'note',
    label: 'Note',
    description: 'Something worth recording, nothing more.',
  },
  {
    value: 'praise',
    label: 'Praise',
    description: 'Something the student did well.',
  },
  {
    value: 'concern',
    label: 'Concern',
    description: 'Something to watch before it becomes a problem.',
  },
  {
    value: 'intervention',
    label: 'Intervention',
    description: 'Something that needs action beyond today.',
  },
];

/**
 * The label for a stored severity, or an empty string for one we do not know.
 *
 * Returning an empty string rather than the raw value is deliberate: a severity
 * written by an older build, or by hand in the database, must not be rendered as
 * a readable option that looks like a choice the teacher is being offered.
 */
export function describeNoteSeverity(value: string): string {
  return NOTE_SEVERITIES.find((option) => option.value === value)?.label ?? '';
}

/**
 * The reason this note cannot be saved, or an empty string when it can.
 *
 * The same two rules the action enforces, so the field stops the teacher before
 * they press the button rather than after. Trimming first is what makes
 * `'   '` an empty note: a note of spaces is not a note.
 */
export function noteProblem(entry: string): string {
  if (entry.trim().length === 0) return 'Write the note before saving it.';
  if (entry.trim().length > NOTE_MAX_LENGTH) {
    return `Keep notes under ${NOTE_MAX_LENGTH} characters.`;
  }
  return '';
}