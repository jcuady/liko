'use client';

import { toast as sonnerToast } from 'sonner';

/**
 * The toast API, with errors announced assertively.
 *
 * WHY THIS EXISTS. Sonner 2.0.8 renders one live region for the whole viewport,
 * `aria-live="polite"`, and gives every toast the same treatment. There is no
 * prop for changing that and no exported subscription hook: the only occurrences
 * of `aria-live` or `role` in the library are that single polite region and its
 * container label. So an error toast, which is the one message in the product
 * that a person needs to be told about, is announced at the same priority as a
 * "Profile saved" that nobody was waiting for, and sits in the queue behind
 * whatever a screen reader is already reading.
 *
 * Fixing this at each call site would mean forty edits and no guarantee about
 * the next one. So the announcement is made here, in the one place every error
 * toast passes through, and the assertive region lives in `ToastProvider`.
 *
 * SUCCESS TOASTS ARE DELIBERATELY LEFT POLITE. Assertive interrupts, and an
 * interruption per saved keystroke would make the product worse to use with a
 * screen reader, not better. Only `error` is escalated.
 */

/** Must match the region rendered by `ToastProvider`. */
const ASSERTIVE_REGION_ID = 'liko-assertive-toasts';

/**
 * The text a screen reader should hear.
 *
 * A toast title may be a React node rather than a string, and a node cannot be
 * read aloud as text. When that happens the toast is still shown and still
 * sounds, it is simply not mirrored here, because announcing `[object Object]`
 * would be worse than announcing nothing.
 */
function speakable(message: unknown): string | null {
  if (typeof message === 'string') return message;
  if (typeof message === 'number') return String(message);
  return null;
}

/**
 * Post to the assertive region.
 *
 * The region is cleared first and written on a later tick. A live region whose
 * text does not change is not re-announced, so two identical failures in a row,
 * which is exactly what happens when a person presses the same button twice,
 * would otherwise be heard once.
 */
export function announceAssertively(message: string): void {
  if (typeof document === 'undefined') return;
  const region = document.getElementById(ASSERTIVE_REGION_ID);
  if (!region) return;

  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 60);
}

type ToastFn = typeof sonnerToast;

const wrapped = ((...args: Parameters<ToastFn>) =>
  sonnerToast(...args)) as ToastFn;

wrapped.success = sonnerToast.success;
wrapped.info = sonnerToast.info;
wrapped.warning = sonnerToast.warning;
wrapped.message = sonnerToast.message;
wrapped.promise = sonnerToast.promise;
wrapped.custom = sonnerToast.custom;
wrapped.dismiss = sonnerToast.dismiss;
wrapped.loading = sonnerToast.loading;

/**
 * `toast.error`, plus the announcement Sonner will not make.
 *
 * The visual toast is unchanged: this adds a second channel for people who do
 * not see it, and it does not remove or delay the one everybody else uses.
 */
wrapped.error = ((message: Parameters<ToastFn['error']>[0], data?: Parameters<ToastFn['error']>[1]) => {
  const text = speakable(message);
  if (text !== null) announceAssertively(text);
  return sonnerToast.error(message, data);
}) as ToastFn['error'];

export const toast = wrapped;

export { Toaster } from 'sonner';
export type { Action, ToastT } from 'sonner';