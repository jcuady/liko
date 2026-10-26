'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import {
  pendingSummary,
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
  const [latest, setLatest] = React.useState<string | null>(null);

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
      void pendingSummary().then((summary) => {
        if (active) {
          setQueued(summary.count);
          setLatest(summary.count === 1 ? summary.latest : null);
        }
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
      /*
       * A STABLE HOOK, AND NOT ONLY FOR THE TESTS.
       *
       * This banner is the outbox's own view of the queue, so it is on screen
       * exactly when the device is offline OR there is something left to send.
       * A caller that needs to know "is the queue empty" cannot ask that by
       * wording, because the wording changes the moment the browser comes back
       * online: offline it says "X is queued on this device", online it says
       * "Syncing N queued changes". A locator on the text therefore stops
       * matching at the moment the queue is still full.
       *
       * `role="status"` is no use as a hook either: Radix renders toasts with
       * `role="status"` too, so anything watching for a status region is
       * watching for toasts as well.
       *
       * `data-slot` is the codebase's own convention for this, and it is what
       * `select-content`, `select-item` and `notification-badge` already use.
       */
      data-slot="offline-banner"
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-[0.8125rem] font-medium',
        online ? 'bg-accent-subtle text-accent' : 'bg-warning-subtle text-warning',
      )}
    >
      {online ? (
        <>
          {latest ? (
            <>Syncing {latest}</>
          ) : (
            <>
              Syncing {queued} queued {queued === 1 ? 'change' : 'changes'}
            </>
          )}
        </>
      ) : (
        <>
          {latest ? (
            <>{latest} is queued on this device.</>
          ) : (
            <>
              Offline. {queued} change{queued === 1 ? '' : 's'} queued on this device.
            </>
          )}
        </>
      )}
    </div>
  );
}