'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import {
  currentSummary,
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
  /*
   * THE STATE STARTS AT THE OUTBOX'S LAST READING, NOT AT ZERO.
   *
   * React can throw this component away and build it again, and a banner that
   * starts at zero claims that nothing is waiting until it has read the queue
   * for itself. On 2026-10-26 that is exactly what happened: the count went 1,
   * then 0, then 1 again across a reload, with the queued row never deleted,
   * and the 0 was a lie produced by a component that had just mounted.
   *
   * So the banner starts from what the outbox last saw. The outbox keeps that
   * in its module, which outlives any component, and a banner that mounts can
   * read it synchronously instead of guessing.
   */
  const [queued, setQueued] = React.useState(() => currentSummary().count);
  const [latest, setLatest] = React.useState<string | null>(() => currentSummary().latest);
  const [readable, setReadable] = React.useState(() => currentSummary().readable);

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
        if (!active) return;
        setReadable(summary.readable);
        /*
         * THE COUNT IS ONLY TAKEN FROM A READING THAT WORKED.
         *
         * A failed read keeps the count the banner last saw. Overwriting it
         * with zero is what turned a storage error into "your register is
         * safe", and the banner's own comment below says that is the one
         * answer that must never be given.
         */
        if (summary.readable) {
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

  /*
   * A QUEUE THAT COULD NOT BE READ IS NOT AN EMPTY QUEUE.
   *
   * This is the branch that was missing, and its absence is what made the
   * 2026-10-26 failure a failure rather than a slow test. The banner rendered
   * nothing when the count was zero, and a failed read produced a count of
   * zero, so a storage error looked exactly like a teacher with nothing
   * waiting: no banner, no warning, and a register that was never sent.
   *
   * So when the queue cannot be read, the banner says so, and it says how much
   * it last knew was waiting. Silence is the answer that makes a teacher
   * believe their work is safe.
   */
  if (!readable) {
    return (
      <div
        data-slot="offline-banner"
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 px-4 py-2 text-[0.8125rem] font-medium bg-warning-subtle text-warning"
      >
        {queued > 0
          ? `${queued} change${queued === 1 ? '' : 's'} may still be waiting, and this device cannot check the queue.`
          : 'This device cannot check whether every change has been sent.'}
      </div>
    );
  }

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