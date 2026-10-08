import type { Severity } from '@/lib/api/types';

/**
 * Presentation data for the behaviour-log form.
 *
 * WHY THIS IS NOT IN `actions.ts`. A `'use server'` module may only export
 * async functions. Any other export is replaced, on the client, by a
 * reference proxy object, so importing `SEVERITY_OPTIONS` from there gave the
 * form a non-array and `SEVERITY_OPTIONS.map` threw, taking the whole `/history`
 * page into the error boundary. The same mistake was previously made and fixed
 * in `assess/`, which is why the options live in their own module here too.
 *
 * `SEVERITIES`, the trusted list the server validates against, deliberately
 * stays in `actions.ts` where the client cannot reach it.
 */
export const SEVERITY_OPTIONS: ReadonlyArray<{ value: Severity; label: string }> = [
  { value: 'note', label: 'Note' },
  { value: 'praise', label: 'Praise' },
  { value: 'concern', label: 'Concern' },
  { value: 'intervention', label: 'Intervention' },
];