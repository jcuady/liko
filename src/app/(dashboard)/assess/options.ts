import type { AssessmentType } from '@/lib/api/types';

/**
 * Assessment type options.
 *
 * Deliberately NOT in `actions.ts`. A `'use server'` module may only export
 * async functions: every export becomes a remotely callable endpoint, so a
 * constant or a synchronous type guard in that file is a build error rather than
 * a style note. Keeping the options here also lets the builder, the list, and
 * the validation share one list instead of three.
 */

export const ASSESSMENT_TYPES: { value: AssessmentType; label: string }[] = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'worksheet', label: 'Worksheet' },
  { value: 'exam', label: 'Exam' },
  { value: 'project', label: 'Project' },
  { value: 'lab', label: 'Lab' },
];

const VALUES: AssessmentType[] = ASSESSMENT_TYPES.map((option) => option.value);

export function isAssessmentType(value: unknown): value is AssessmentType {
  return typeof value === 'string' && VALUES.includes(value as AssessmentType);
}