'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import {
  pendingCount,
  startAutoFlush,
  subscribeToOutbox,
} from '@/lib/outbox';

/**
 * Connection and sync state for the workspace.
 *
 * This banner used to listen for a `liko-queue-change` postMessage from the
 * service worker. Nothing ever sent one, because there was no queue behind it,
 * so the count it displayed was permanently zero and the whole component was
 * decorative. It now reads the actual IndexedDB outbox and starts the flush
 * loop.
 *
 * The banner reports state rather than blocking the page, and it is positioned
 * so it can never sit on top of the keyboard-focused control (WCAG 2.2 AA,
 * focus-not-obscured).
 */
export function OfflineBanner() {
  const [online, setOnline] = React.useState(true);
  const [queued, setQueued] = React.useState(0);

  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  React.useEffect(() => {
    let active = true;

    const refresh = () => {
      void pendingCount().then((count) => {
        if (active) setQueued(count);
      });
    };

    refresh();
    const unsubscribe = subscribeToOutbox(refresh);
    const stopFlush = startAutoFlush();

    return () => {
      active = false;
      unsubscribe();
      stopFlush();
    };
  }, []);

  if (online && queued === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-[0.8125rem] font-medium',
        online ? 'bg-accent-subtle text-accent' : 'bg-warning-subtle text-warning',
      )}
    >
      {online ? (
        <>
          Syncing {queued} queued {queued === 1 ? 'change' : 'changes'}
        </>
      ) : (
        <>
          Offline. {queued} change{queued === 1 ? '' : 's'} queued on this
          device.
        </>
      )}
    </div>
  );
}