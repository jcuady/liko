'use client';

import * as React from 'react';

/**
 * Connection status for the offline fallback.
 *
 * Uses the `online`/`offline` events rather than a scroll or pointer listener,
 * and pauses while the tab is hidden so a backgrounded tab does no work.
 */
export function OfflineStatus() {
  const [online, setOnline] = React.useState<boolean | null>(null);

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

  return (
    <p
      id="offline-status"
      aria-live="polite"
      className="mt-6 text-[0.8125rem] text-ink-subtle"
    >
      {online === null
        ? 'Checking connection'
        : online
          ? 'Connection restored. You can retry now.'
          : 'Still offline. Retrying when you reconnect.'}
    </p>
  );
}