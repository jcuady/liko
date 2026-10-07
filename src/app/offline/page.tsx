import type { Metadata } from 'next';
import Link from 'next/link';

import { LikoLogo } from '@/components/brand/LikoLogo';
import { OfflineStatus } from './OfflineStatus';

export const metadata: Metadata = {
  title: 'Offline',
  description: 'You are offline. Reconnect to open your workspace.',
};

/**
 * Service-worker fallback. A cold airplane-mode launch still renders this
 * instead of the browser's error page, so the app never feels crashed.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <LikoLogo showWordmark />

      <h1 className="text-h3 mt-10">You are offline</h1>
      <p className="measure mt-3 text-[0.9375rem] text-ink-muted">
        Your workspace is still available once you reconnect. Anything you
        entered while offline is queued on this device and sent automatically.
      </p>

      <Link
        href="/overview"
        className="pressable mt-8 inline-flex h-11 items-center rounded-[12px] bg-accent px-5 text-[0.9375rem] font-medium text-on-accent"
      >
        Try again
      </Link>

      <OfflineStatus />
    </div>
  );
}