import 'server-only';

import webpush from 'web-push';

import { serverEnv } from '@/lib/env';
import { isAllowedPushEndpoint } from '@/lib/push/endpoint';
import { createSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Push dispatch.
 *
 * One entry point, `sendPushToUser()`, fans a payload out to every device a
 * teacher has registered. The service role client is used rather than the cookie
 * client because a cron request has no session and because the dispatcher must
 * read rows for a user who is not the caller.
 *
 * WHY DEAD ENDPOINTS ARE DELETED, NOT RETRIED. When a push service accepts a
 * message it stores it against an endpoint. When the browser deletes the site
 * data, uninstalls the PWA, or the subscription simply expires, that endpoint is
 * gone for good. The service then answers `404 Not Found` or `410 Gone`. That is
 * a permanent answer, not a transient failure: the endpoint will never work
 * again, and every later send will fail the same way. A scheduler that only
 * counted the failure would retry forever, so `push_subscriptions` would grow
 * with unreachable rows, every dispatch would get slower, and the teacher would
 * keep seeing nothing. So a 404 or 410 deletes the row on first sight and the
 * subscription is re-created by the browser if the device comes back. Anything
 * else (a 429, a 500, a DNS blip) is treated as transient and the row is kept,
 * because deleting on those would unsubscribe a working device over one bad
 * minute.
 *
 * SECURITY. The VAPID private key is read here from `serverEnv()` and handed to
 * `web-push` only. It is never returned from a route, never logged, and never
 * included in a payload. Only the public key reaches the browser, and it reaches
 * it through `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
 *
 * AND THE ENDPOINT IS CHECKED AGAIN HERE. This is the request the server makes
 * on someone else's behalf, so the row is re-validated against the push-service
 * allowlist before `sendNotification` is called. The subscribe route already
 * refuses an endpoint that is not https on a push service, but that is only one
 * door: rows written before the rule existed are still in the table, and a later
 * write path that forgets the check would be another. Defence in depth is the
 * whole point here, because a failure here is a request leaving the deployment
 * to an address the client chose.
 */

type Row = Record<string, unknown>;

export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path the notification click opens. Defaults to the overview. */
  url?: string;
  /** Groups a subject so a new message replaces the banner rather than stacking. */
  tag?: string;
}

export interface PushSummary {
  sent: number;
  /** Endpoints deleted after a 404 or 410. */
  pruned: number;
  /** Transient failures, where the subscription is deliberately kept. */
  failed: number;
  /** Set when nothing could be sent and the reason is worth surfacing. */
  reason?: string;
}

const DEFAULT_URL = '/overview';
const DEFAULT_TAG = 'liko';

/** How long a push service may hold the message for a device that is offline. */
const TTL_SECONDS = 60 * 60 * 12;

let vapidConfigured = false;

/**
 * Configures `web-push` once per process. Returns false when the keys are
 * absent, which is the honest local-development state: the routes still answer,
 * they simply report that nothing was sent.
 */
async function ensureVapid(): Promise<boolean> {
  const env = await serverEnv();
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;

  if (!vapidConfigured) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    vapidConfigured = true;
  }

  return true;
}

/** The push service's HTTP status, which is the only thing that says "gone". */
function statusCodeOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === 'number' ? value : null;
}

async function pruneEndpoint(
  admin: NonNullable<Awaited<ReturnType<typeof createSupabaseAdmin>>>,
  endpoint: string,
) {
  const { error } = await admin.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return error === null;
}

/**
 * Sends one payload to every subscription a user owns.
 *
 * Returns counts rather than throwing: a sweep walks many teachers and one dead
 * device must not stop the rest of the run.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushSummary> {
  const empty: PushSummary = { sent: 0, pruned: 0, failed: 0 };

  if (!(await ensureVapid())) {
    return { ...empty, reason: 'VAPID keys are not configured' };
  }

  const admin = await createSupabaseAdmin();
  if (!admin) {
    return { ...empty, reason: 'The service role key is not configured' };
  }

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) {
    return { ...empty, failed: 1, reason: 'Subscriptions could not be read' };
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return empty;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? DEFAULT_URL,
    tag: payload.tag ?? DEFAULT_TAG,
  });

  const summary: PushSummary = { sent: 0, pruned: 0, failed: 0 };

  for (const row of rows) {
    const endpoint = typeof row.endpoint === 'string' ? row.endpoint : '';
    const p256dh = typeof row.p256dh === 'string' ? row.p256dh : '';
    const auth = typeof row.auth === 'string' ? row.auth : '';

    // A row without usable keys cannot be delivered to and cannot be re-keyed.
    // Counting it as failed keeps it visible in the sweep response.
    if (!endpoint || !p256dh || !auth) {
      summary.failed += 1;
      continue;
    }

    /*
     * The allowlist is re-applied here, not trusted from the row. An endpoint
     * that is not an https URL on a push service is never dispatched, so a
     * hostile row cannot make the server fetch it from the at-risk cron or any
     * other dispatch path.
     *
     * It is counted as failed rather than pruned. A 404 or 410 is proof the
     * service is gone and the row is dead; "not a push service" only proves this
     * check disagrees with whatever wrote the row, and deleting a teacher's
     * device because the allowlist was wrong would be the worse mistake. The row
     * stays visible in the sweep until it is replaced or removed.
     */
    if (!isAllowedPushEndpoint(endpoint)) {
      summary.failed += 1;
      continue;
    }

    try {
      await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, body, {
        TTL: TTL_SECONDS,
        urgency: 'normal',
      });

      summary.sent += 1;

      // Marks the row live so a later cleanup can find what is still working.
      if (typeof row.id === 'string') {
        await admin
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', row.id);
      }
    } catch (error) {
      const status = statusCodeOf(error);

      if (status === 404 || status === 410) {
        if (await pruneEndpoint(admin, endpoint)) summary.pruned += 1;
        else summary.failed += 1;
        continue;
      }

      summary.failed += 1;
    }
  }

  return summary;
}