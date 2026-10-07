import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import {
  BackgroundSyncPlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

/**
 * LIKO service worker.
 *
 * Caching is split by resource class, because a single strategy is always wrong
 * somewhere:
 *
 *   - Hashed build assets are immutable, so CacheFirst is both safe and fast.
 *   - Documents must stay fresh, so NetworkFirst with an offline fallback.
 *   - API reads tolerate brief staleness; writes are never served from cache.
 *   - Failed writes go to a BackgroundSync queue instead of being lost.
 */

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,

  // A cold airplane-mode launch still renders something useful.
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },

  runtimeCaching: [
    {
      // Content-hashed build output. Immutable by construction.
      matcher: ({ url, request }) =>
        url.origin === self.location.origin &&
        request.destination === 'script' &&
        url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'liko-static',
        plugins: [
          new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
      }),
    },
    {
      // Same-origin images go through the optimiser, so treat them as content
      // addressed. Cross-origin assets are deliberately not intercepted.
      matcher: ({ url, request }) =>
        url.origin === self.location.origin &&
        request.destination === 'image' &&
        !url.pathname.startsWith('/_next/image'),
      handler: new CacheFirst({
        cacheName: 'liko-media',
        plugins: [
          new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
      }),
    },
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin && url.pathname.startsWith('/_next/image'),
      handler: new StaleWhileRevalidate({
        cacheName: 'liko-images',
        plugins: [
          new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
      }),
    },
    {
      // Documents: prefer the network, fall back to cache, then to /offline.
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'liko-pages',
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 }),
        ],
      }),
    },
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin && url.pathname.startsWith('/api/'),
      method: 'GET' as const,
      handler: new NetworkFirst({
        cacheName: 'liko-api',
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 5 }),
        ],
      }),
    },
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin && url.pathname.startsWith('/api/'),
      // Writes bypass every cache. When offline they are parked in a
      // background-sync queue and replayed on reconnect.
      method: 'POST' as const,
      handler: new NetworkOnly({
        plugins: [
          new BackgroundSyncPlugin('liko-sync', { maxRetentionTime: 60 * 24 }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();

/**
 * Push delivery.
 *
 * The three handlers below are registered on `self` rather than through Serwist
 * because Serwist owns request routing only. Adding them here does not touch the
 * `runtimeCaching` entries or `fallbacks` above, which is deliberate: a cache
 * rule that intercepted a notification click would fight with `openWindow`.
 *
 * NOTE FOR LOCAL TESTING. The worker is not built in development unless
 * `LIKO_ENABLE_SW=true`, so push cannot be exercised from `pnpm dev` without it.
 */

const NOTIFICATION_ICON = '/icon';
const NOTIFICATION_BADGE = '/apple-icon';
const DEFAULT_URL = '/overview';

interface PushMessage {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

function readMessage(event: PushEvent): PushMessage {
  if (!event.data) return {};

  try {
    const parsed: unknown = event.data.json();
    return typeof parsed === 'object' && parsed !== null ? (parsed as PushMessage) : {};
  } catch {
    // A plain text payload is not an error worth dropping the notification for.
    return { body: event.data.text() };
  }
}

self.addEventListener('push', (event) => {
  const message = readMessage(event);
  const title = message.title ?? 'LIKO';
  const body = message.body ?? 'A student needs attention.';
  const url = message.url ?? DEFAULT_URL;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // `src/app/icon.tsx` and `src/app/apple-icon.tsx` are generated image
      // routes, so there is no static `/icon.png` on disk to point at. These
      // paths resolve to the same mark the manifest uses.
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      tag: message.tag ?? 'liko',
      data: { url },
    }),
  );
});

/**
 * WHY A MATCHED WINDOW IS FOCUSED RATHER THAN A NEW ONE OPENED. Every alert
 * fires against a workspace the teacher already has open, so blindly calling
 * `openWindow` would stack duplicate tabs on every tap. Three steps, in order:
 * the exact URL if it is already open, then any other window of this origin
 * navigated to the target, and only a new window when nothing of ours is open.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = new URL(
    (event.notification.data as { url?: string } | undefined)?.url ?? DEFAULT_URL,
    self.location.origin,
  );

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const exact = windows.find((client) => {
        const url = new URL(client.url);
        return url.origin === target.origin && url.pathname === target.pathname;
      });

      if (exact) {
        await exact.focus();
        return;
      }

      const sameOrigin = windows.find((client) => new URL(client.url).origin === target.origin);
      if (sameOrigin) {
        const navigated = await sameOrigin.navigate(target.href);
        await (navigated ?? sameOrigin).focus();
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});

/**
 * The browser rotates a push subscription when its key pair expires or the
 * profile is restored. The old row in `push_subscriptions` is dead the moment
 * that happens, and the server prunes it on the next 404 or 410, so the only
 * thing left to do here is store the replacement.
 *
 * The application server key is taken from the outgoing subscription, because
 * that is the one value this worker already holds. When a browser does not
 * provide it there is nothing safe to fall back to: the VAPID public key is a
 * build-time value that must not be hardcoded into the worker, so the settings
 * page re-subscribes instead and the next sweep prunes whatever is stale.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const previous = event.oldSubscription?.options.applicationServerKey;
      if (!previous) return;

      try {
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: previous,
        });

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch {
        // Deliberately swallowed. A failed refresh is recovered by the settings
        // page, and throwing here would leave the event unhandled with nothing
        // better to do about it.
      }
    })(),
  );
});

/** Acknowledges the unsubscribe the settings page sends before it tears down. */
self.addEventListener('message', (event) => {
  const type = (event.data as { type?: string } | undefined)?.type;
  if (type !== 'unsubscribe') return;

  event.waitUntil(
    (async () => {
      const subscription = await self.registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
    })(),
  );
});