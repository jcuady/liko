import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireSession } from '@/lib/auth/guards';
import { isAllowedPushEndpoint } from '@/lib/push/endpoint';
import { isSameOrigin, clientKey, consume, type RateLimitConfig } from '@/lib/security/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Push subscription storage.
 *
 * The browser owns the subscription object; this route owns the row. The body
 * is validated in the `PushSubscriptionJSON` shape the browser actually
 * produces, which is `{ endpoint, keys: { p256dh, auth } }`. A body that carries
 * loose `p256dh` and `auth` fields instead of `keys` is rejected rather than
 * guessed at: the service worker posts `subscription.toJSON()`, and accepting a
 * second shape would mean two places to keep correct when the browser changes.
 *
 * RLS scopes the table to `user_id = auth.uid()`, and the cookie client carries
 * the signed-in teacher, so a row can only ever be written for the caller. The
 * DELETE repeats the owner in its filter anyway, because a forgotten filter
 * should not be the thing that unsubscribes another teacher's device.
 *
 * The upsert is keyed on the unique `endpoint`. A browser that re-subscribes
 * after an expiry hands back the same endpoint, so this updates the keys rather
 * than creating a duplicate row the sweep would then have to prune.
 *
 * THE ENDPOINT IS CHECKED BEFORE IT IS STORED. `endpoint` is a URL the client
 * chose and the server will later be asked to fetch it, so it has to be an https
 * URL on a real push service. Without that check, a signed-in teacher could
 * subscribe `http://169.254.169.254/latest/meta-data/`, the row would be written
 * happily, and the daily at-risk sweep would make the request from the server
 * with no response returned to them. The rule itself lives in
 * `@/lib/push/endpoint` and is applied again in `send.ts`, because rows written
 * before it existed are still in the table.
 *
 * The failure message says only that the endpoint is unsupported. It does not
 * list the allowed hosts, and it does not describe what this server can reach.
 */

const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine(isAllowedPushEndpoint, { message: 'Unsupported push endpoint' }),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

/**
 * Deliberately NOT restricted to the push allowlist, unlike POST above.
 * Unsubscribing has to keep working for every row the table can hold, including
 * a row written before the allowlist existed and including any row a browser
 * hands back that this server has never seen. Narrowing this schema would
 * strand exactly the rows that most need removing, and the DELETE is scoped to
 * the caller's own `user_id` anyway, so an odd URL here removes nothing but the
 * caller's own row.
 */
const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

/**
 * Local to this route on purpose. `RATE_LIMITS` in `src/lib/security` is shared
 * and not owned by this phase, and subscribing is not an auth or AI event, so
 * the budget lives beside the endpoint that spends it.
 */
const SUBSCRIBE_LIMIT: RateLimitConfig = { limit: 20, windowMs: 60 * 1000 };
const UNSUBSCRIBE_LIMIT: RateLimitConfig = { limit: 30, windowMs: 60 * 1000 };

/**
 * `requireSession()` redirects an anonymous visitor to `/login`, which is the
 * right answer for a page and a confusing one for a `fetch` that only wanted a
 * subscription. The redirect is caught so the caller gets a 401 it can act on.
 */
async function caller() {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}

function rateLimited(retryAfter: number) {
  return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = consume(clientKey(request, 'push-subscribe'), SUBSCRIBE_LIMIT);
  if (!limit.allowed) return rateLimited(limit.retryAfter);

  const session = await caller();
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid push subscription', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Push storage is unavailable' }, { status: 503 });
  }

  const { endpoint, keys } = parsed.data;
  const now = new Date().toISOString();

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: session.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: request.headers.get('user-agent'),
      last_used_at: now,
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    return NextResponse.json({ error: 'Subscription could not be saved' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = consume(clientKey(request, 'push-unsubscribe'), UNSUBSCRIBE_LIMIT);
  if (!limit.allowed) return rateLimited(limit.retryAfter);

  const session = await caller();
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid push subscription', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Push storage is unavailable' }, { status: 503 });
  }

  // The owner filter is what makes this "my device only". RLS says the same
  // thing, and both are kept because a service key on this path would make one
  // of them the only guard left.
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint)
    .eq('user_id', session.userId);

  if (error) {
    return NextResponse.json({ error: 'Subscription could not be removed' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}