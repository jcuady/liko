import { publicEnv } from '@/lib/env';

/**
 * Browser push subscription helper.
 *
 * All the judgement lives here and the settings page only renders the outcome,
 * so the rules cannot drift between what the copy claims and what the code does.
 *
 * WHY iOS IS TREATED AS NOT SUPPORTED UNTIL THE APP IS INSTALLED. Web Push on
 * iOS exists only inside an installed Home Screen PWA (iOS 16.4 and later). In a
 * Safari tab the `PushManager` is present and `Notification.requestPermission()`
 * can even answer `granted`, but nothing is ever delivered, because there is no
 * registered push service worker outside an installed app. A toggle there would
 * be a lie the teacher discovers only after waiting for an alert that was never
 * going to arrive. So the iOS check is done first and the switch is disabled with
 * an explanation instead.
 *
 * PERMISSION IS NEVER REQUESTED HERE ON A PAGE LOAD. Every `requestPermission()`
 * call in this module is reachable only from `enablePush()`, which the settings
 * page calls from a click handler. Reading the current state is a separate
 * function and never prompts.
 *
 * THE VAPID PUBLIC KEY COMES FROM `publicEnv()`. `serverEnv()` is not imported:
 * it reads server-only variables, and only the `NEXT_PUBLIC_` key may reach the
 * browser. The private key is never referenced in this file and never leaves the
 * server.
 */

const SW_PATH = '/sw.js';
const SW_SCOPE = '/';

export type PushAvailability =
  /** Everything the browser needs is present. */
  | 'ready'
  /** No Push API, so no toggle is worth showing. */
  | 'unsupported'
  /** iOS, but not installed to the Home Screen. */
  | 'needs-install';

export interface PushState {
  availability: PushAvailability;
  /** `unsupported` replaces the three real states when the API is missing. */
  permission: NotificationPermission | 'unsupported';
  /** A subscription exists in this browser. */
  subscribed: boolean;
  ios: boolean;
  standalone: boolean;
}

export type PushOutcome =
  | { status: 'enabled' }
  | { status: 'disabled' }
  | { status: 'denied' }
  | { status: 'needs-install' }
  | { status: 'unsupported' }
  | { status: 'unconfigured' }
  | { status: 'error' };

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;

  // iPadOS 13 and later report a desktop Safari user agent, so the touch point
  // count is the only signal that separates an iPad from a Mac.
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || iPadOs;
}

/** True when the page is running as an installed app rather than a browser tab. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  const iosWindow = window.navigator as Navigator & { standalone?: boolean };
  return (
    iosWindow.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** VAPID keys are URL-safe base64, which `Uint8Array.from` cannot decode. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);

  // Backed by a plain ArrayBuffer rather than the shared one `new Uint8Array(n)`
  // can produce, because `BufferSource` does not accept a SharedArrayBuffer view.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function availability(): PushAvailability {
  if (!isSupported()) return 'unsupported';
  if (isIos() && !isStandalone()) return 'needs-install';
  return 'ready';
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (existing) return existing;

  // The worker is disabled in development unless LIKO_ENABLE_SW is set, so a
  // missing /sw.js here is a configuration state, not a failure to report.
  return navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
}

/**
 * Reads the current state without prompting. Safe to call on mount.
 */
export async function readPushState(): Promise<PushState> {
  const ios = isIos();
  const standalone = isStandalone();

  if (!isSupported()) {
    return { availability: 'unsupported', permission: 'unsupported', subscribed: false, ios, standalone };
  }

  let subscribed = false;
  try {
    const existing = await registration();
    subscribed = (await existing.pushManager.getSubscription()) !== null;
  } catch {
    // A worker that fails to register is reported as "not subscribed" rather
    // than thrown, so the page can still explain the situation.
    subscribed = false;
  }

  return {
    availability: availability(),
    permission: Notification.permission,
    subscribed,
    ios,
    standalone,
  };
}

/**
 * Subscribes and stores the subscription. Call from a user gesture only.
 */
export async function enablePush(): Promise<PushOutcome> {
  const state = await readPushState();

  if (state.availability === 'unsupported') return { status: 'unsupported' };
  if (state.availability === 'needs-install') return { status: 'needs-install' };

  const { vapidPublicKey } = publicEnv();
  if (!vapidPublicKey) return { status: 'unconfigured' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { status: 'denied' };

    const worker = await registration();
    const subscription =
      (await worker.pushManager.getSubscription()) ??
      (await worker.pushManager.subscribe({
        // Required by Chrome: a subscription that cannot show a notification is
        // not accepted, so this is not optional.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!response.ok) return { status: 'error' };

    return { status: 'enabled' };
  } catch {
    return { status: 'error' };
  }
}

/**
 * Unsubscribes and removes the stored row.
 *
 * The endpoint is read FIRST, before the service worker is told anything. The
 * worker tears the subscription down as soon as it receives the message, so a
 * subscription read afterwards can come back null and the server row would be
 * left behind, receiving pushes the teacher has switched off until some later
 * sweep happens to prune it.
 *
 * Each remaining step is independent: the row is deleted even if `unsubscribe()`
 * throws, otherwise a failed local teardown would leave the teacher receiving
 * pushes they turned off.
 */
export async function disablePush(): Promise<PushOutcome> {
  if (!isSupported()) return { status: 'unsupported' };

  let endpoint: string | null = null;

  try {
    const worker = await registration();
    const subscription = await worker.pushManager.getSubscription();
    endpoint = subscription?.endpoint ?? null;

    worker.active?.postMessage({ type: 'unsubscribe' });

    await subscription?.unsubscribe();
  } catch {
    // Continued deliberately: the server row must go regardless.
  }

  if (!endpoint) return { status: 'disabled' };

  try {
    const response = await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });

    return response.ok ? { status: 'disabled' } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}