'use client';

import * as React from 'react';
import { Toaster as SonnerToaster } from 'sonner';

/**
 * Toast host. Mounted once in the root layout.
 *
 * Durations and easing live here so a rapid burst of toasts retargets
 * smoothly: Sonner uses CSS transitions, not keyframes, so an interrupted
 * animation does not restart from zero.
 */
export function ToastProvider() {
  return (
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
  );
}