/**
 * Push endpoint policy.
 *
 * WHY THIS FILE EXISTS. `webpush.sendNotification()` performs a server-side HTTP
 * request to a URL that arrived from a client. The subscribe route accepted any
 * syntactically valid URL, so an authenticated teacher could store
 * `http://169.254.169.254/latest/meta-data/` as their "endpoint" and have the
 * at-risk cron fetch it from the server. Nothing comes back in the response, so
 * it is blind, but the request still leaves the deployment and reaches whatever
 * the host can reach: instance metadata, an internal admin port, a service on
 * the private network. A push endpoint is supposed to be a push service and
 * nothing else, so that is what this checks.
 *
 * It is checked at BOTH ends on purpose. On the way in, so a bad row is never
 * written. On the way out, because rows created before this rule existed are
 * still sitting in `push_subscriptions`, and because a future write path that
 * forgets the check must not be able to reach the network from here.
 *
 * THE MATCHING RULE, exactly:
 *
 *   1. Parse the whole string with `new URL()`. Anything that does not parse is
 *      rejected. The comparison is made against `URL.hostname`, which is the
 *      part the DNS lookup and the TLS SNI come from, never against the raw
 *      string.
 *   2. The scheme must be `https:`. `URL` lowercases it, so `HTTPS:` is fine and
 *      every other scheme, including `http:`, is rejected.
 *   3. Userinfo (`https://user:pass@host`) is rejected outright. `URL` moves it
 *      into `username`/`password`, so the hostname is still the real host, but a
 *      subscription has no business carrying credentials and rejecting it keeps
 *      the rule from ever being argued about.
 *   4. The port must be absent or 443.
 *   5. The hostname must EQUAL an allowed suffix, or be a subdomain of one,
 *      matched as `host === suffix || host.endsWith('.' + suffix)`.
 *
 * The leading dot in step 5 is the whole trick. It means the match is anchored
 * to a DNS label boundary, so `notfcm.googleapis.com` and
 * `fcm.googleapis.com.attacker.com` both fail: neither is equal to a suffix, and
 * neither ends with `.` followed by one. A naive `endsWith('fcm.googleapis.com')`
 * or an `includes()` accepts both, and an attacker only has to own
 * `attacker.com` to get a name that ends in the right characters.
 *
 * The suffixes are the services a browser `PushSubscription` can actually hand
 * back. Firefox's autopush staging host is deliberately absent: a staging
 * endpoint in a production table is not a browser behaviour worth keeping.
 *
 * This module has no imports, on purpose. It is the one piece of the push path
 * that the route handler, the dispatcher, and a plain unit test all need.
 */

/** Push services a subscription may legitimately point at. */
const ALLOWED_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge, Android
  'push.googleapis.com', // the wider FCM family, e.g. fcm.push.googleapis.com
  'updates.push.services.mozilla.com', // Firefox autopush
  'push.services.mozilla.com', // Firefox autopush subdomains
  'web.push.apple.com', // Safari, and iOS 16.4+ home-screen web push
] as const;

/**
 * True when `value` is an https URL on a known push service.
 *
 * Fails closed: every branch returns false rather than falling through, so an
 * unparseable URL, an exotic scheme, or a hostname this file has never heard of
 * is a rejection and not a maybe.
 */
export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;
  if (url.port !== '' && url.port !== '443') return false;

  // `URL` already lowercases the host for these schemes. Repeating it costs
  // nothing and keeps the rule correct if that ever stops being true.
  const host = url.hostname.toLowerCase();

  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}