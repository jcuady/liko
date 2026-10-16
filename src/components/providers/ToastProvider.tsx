'use client';

import * as React from 'react';

import { Toaster as SonnerToaster } from 'sonner';

/**
 * Toast host. Mounted once in the root layout.
 *
 * Durations and easing live here so a rapid burst of toasts retargets
 * smoothly: Sonner uses CSS transitions, not keyframes, so an interrupted
 * animation does not restart from zero.
 *
 * It also owns the assertive region that `@/lib/toast` writes error messages
 * into. The id is duplicated as a constant there rather than imported, because
 * this file must stay the only place that renders the region and the wrapper
 * must stay usable from a module that does not import any component.
 *
 * NO `role="alert"` HERE, DELIBERATELY. `role="alert"` on a permanently present
 * region makes it a match for every `[role="alert"]` query in the suite, and an
 * empty one satisfies a count assertion that was meant to be about a real
 * error. An `aria-live="assertive"` region with no role announces exactly the
 * same and is invisible to those queries.
 */
const ASSERTIVE_REGION_ID = 'liko-assertive-toasts';

export function ToastProvider() {
  return (
    <>
      <SonnerToaster
        position="bottom-center"
        closeButton
        richColors={false}
        duration={4000}
        toastOptions={{
          classNames: {
            toast:
              'liko-toast rounded-[12px] border border-border bg-surface-raised text-ink shadow-[var(--shadow-lg)]',
            title: 'text-[0.9375rem] font-semibold',
            description: 'text-meta text-ink-muted',
            actionButton: 'bg-accent text-on-accent rounded-[8px]',
            cancelButton: 'bg-surface-sunken text-ink-muted rounded-[8px]',
          },
        }}
      />
      <div
        id={ASSERTIVE_REGION_ID}
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </>
  );
}