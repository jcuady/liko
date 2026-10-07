/**
 * Ambient types for `web-push`.
 *
 * WHY THIS FILE EXISTS. `web-push@3.6.7` ships no declaration file and
 * `@types/web-push` is not a dependency of this project, so `import webpush from
 * 'web-push'` would fail typecheck with TS7016 under `strict`. Rather than add a
 * dependency for four symbols, the surface we actually call is declared here.
 *
 * It is deliberately partial. Only the members `src/lib/push/send.ts` uses are
 * described, so a wrong assumption elsewhere cannot be typed as correct. The
 * module is `export =` because the package is CommonJS
 * (`module.exports = { ... }` in `src/index.js`), which is what lets the default
 * import interop cleanly under `esModuleInterop`.
 *
 * Nothing here reads configuration. The VAPID private key is passed at runtime by
 * `send.ts` from `serverEnv()` and never appears in this file.
 */

declare module 'web-push' {
  /** The subscription shape the browser hands us and `push_subscriptions` stores. */
  interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }

  interface SendOptions {
    /** Seconds the push service may hold the message for an offline device. */
    TTL?: number;
    /** `normal` for reminders, `high` for something a teacher must see today. */
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
  }

  interface WebPushStatic {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: PushSubscription,
      payload?: string | null,
      options?: SendOptions,
    ): Promise<SendResult>;
    supportedProtocols?: string[];
  }

  const webpush: WebPushStatic;
  export = webpush;
}