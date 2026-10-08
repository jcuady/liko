/**
 * Token-bucket rate limiting for server-side endpoints.
 *
 * THIS IS A PER-INSTANCE, PER-DEPLOY LIMIT, NOT A GLOBAL ONE. The buckets live
 * in a `Map` in this module's memory. They are not shared between processes,
 * they are gone after every cold start, and they are gone after every deploy. On
 * a host that runs N instances or scales to zero, the limit an attacker actually
 * faces is `limit x N`, and it resets every time a new instance comes up.
 *
 * So say what it actually does: this raises the cost of credential stuffing and
 * nothing more. It is a real brake on a single process and it is NOT a
 * distributed rate limit, and it must never be described as one. A real
 * guarantee needs a shared store such as Redis or Upstash behind the same
 * interface, which is the seam this module already is.
 *
 * A client-side cooldown is cosmetic and does not replace this.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Buckets for every key seen by this process. Per instance and per deploy: empty
 * on a cold start, never shared with another instance, never written to disk.
 * Treat the numbers it holds as an honest local brake, not a fleet-wide budget.
 */
const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  /** Maximum sustained requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Two granularities for credential endpoints, because one is not enough.
 *
 * `auth` is per IP *and* the account being attempted: 10 wrong passwords against
 * one address is credential stuffing and gets stopped.
 *
 * `authBurst` is per IP alone and deliberately far looser. The previous single
 * bucket was IP-only at 10 per 5 minutes, which meant every teacher and student
 * on one school network shared a single allowance. Ten sign-ins from the same
 * classroom egress IP locked out the whole staffroom, and the school-day login
 * burst tripped it every morning.
 *
 * Together they stop both threats: an attacker cannot grind one account, and an
 * attacker cannot grind many accounts from one address.
 */
export const RATE_LIMITS = {
  auth: { limit: 10, windowMs: 5 * 60 * 1000 },
  authBurst: { limit: 120, windowMs: 5 * 60 * 1000 },
  passwordReset: { limit: 3, windowMs: 60 * 60 * 1000 },
  ai: { limit: 20, windowMs: 60 * 1000 },
} satisfies Record<string, RateLimitConfig>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the caller may retry. Zero when allowed. */
  retryAfter: number;
}

/** One warning per process per condition, so a busy route cannot flood the log. */
let warned = false;

/**
 * `process.emitWarning` rather than a console call: this module is loaded by
 * `proxy.ts` and the API routes, the repo bans stray console statements, and a
 * warning on stderr is the louder of the two anyway.
 */
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  process.emitWarning(message, 'LikoRateLimit');
}

/**
 * Test-only escape hatch, and it refuses to work in production.
 *
 * The limiter is in-process and keyed on the caller, so an end-to-end suite that
 * signs in as the same demo account twenty times trips the exact protection that
 * stops credential stuffing, and every sign-in after the tenth is refused.
 * Throttling is a production control; it must not be in the way of a test run.
 * `playwright.config.ts` sets this for its own server.
 *
 * The flag used to be honoured everywhere, which made the only brute-force
 * control in the product one careless `vercel env add` away from being off. An
 * environment variable is not a security boundary: nobody reviews the diff, and
 * a copy-pasted `.env.local` into production is exactly the accident this guards.
 * So in production the flag is IGNORED and says so, loudly, and the limits below
 * apply. Development and test still get the switch, because that is where it is
 * actually useful.
 *
 * THE ONE PRODUCTION BYPASS, AND WHY IT TAKES TWO VARIABLES. The end-to-end
 * suite drives a PRODUCTION build through `next start`, which is why the rule
 * above would have throttled it into failure. Rather than reopen the single-flag
 * hole, the production case requires `LIKO_E2E=true` as well. Getting there takes
 * two deliberate choices in the same place, so the accident the flag exists to
 * prevent, a stray `LIKO_RATE_LIMIT_DISABLED` in a deploy dashboard, still
 * resolves to limits being active.
 */
function limiterDisabled(): boolean {
  if (process.env.LIKO_RATE_LIMIT_DISABLED !== 'true') return false;

  const env = process.env.NODE_ENV ?? 'development';

  if (env === 'production') {
    if (process.env.LIKO_E2E === 'true') {
      warnOnce(
        'SECURITY: rate limiting is DISABLED because LIKO_E2E=true alongside ' +
          'LIKO_RATE_LIMIT_DISABLED=true. This combination must exist only on a ' +
          'test server. If you are reading this on a deployed environment, turn the ' +
          'limiter off at the store layer instead of here.',
      );
      return true;
    }

    warnOnce(
      'LIKO_RATE_LIMIT_DISABLED is set but NODE_ENV is "production", so it is being ' +
        'IGNORED and rate limiting is ACTIVE. Remove the variable from production; it ' +
        'only exists to unblock local test runs.',
    );
    return false;
  }

  warnOnce(
    `SECURITY: rate limiting is DISABLED in "${env}" because LIKO_RATE_LIMIT_DISABLED=true. ` +
      'Every login, registration, password reset and AI call is unlimited. This must ' +
      'never be true in production.',
  );
  return true;
}

export function consume(key: string, config: RateLimitConfig): RateLimitResult {
  if (limiterDisabled()) {
    return { allowed: true, remaining: config.limit, retryAfter: 0 };
  }

  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing) {
    buckets.set(key, { tokens: config.limit - 1, updatedAt: now });
    return { allowed: true, remaining: config.limit - 1, retryAfter: 0 };
  }

  const elapsed = now - existing.updatedAt;
  const refillRate = config.limit / config.windowMs;
  const refilled = Math.min(config.limit, existing.tokens + elapsed * refillRate);

  if (refilled < 1) {
    const waitMs = Math.ceil((1 - refilled) / refillRate);
    existing.tokens = refilled;
    existing.updatedAt = now;
    buckets.set(key, existing);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(waitMs / 1000),
    };
  }

  existing.tokens = refilled - 1;
  existing.updatedAt = now;
  buckets.set(key, existing);

  return { allowed: true, remaining: Math.floor(refilled - 1), retryAfter: 0 };
}

/** Best-effort client identity from proxy headers. */
export function clientKey(request: Request, scope: string): string {
  return `${scope}:${clientIp(request)}`;
}

/** The caller's address, or `unknown` when no proxy header is present. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (
    forwarded?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Consumes both credential buckets and refuses only if either is exhausted.
 *
 * `subject` is the normalised account address. The fine bucket stops credential
 * stuffing against one account; the coarse bucket stops an attacker rotating
 * addresses from a single host.
 */
export function consumeCredential(
  request: Request,
  scope: string,
  subject: string,
): RateLimitResult {
  const ip = clientIp(request);
  const fine = consume(`${scope}:acct:${ip}:${subject}`, RATE_LIMITS.auth);
  if (!fine.allowed) return fine;
  return consume(`${scope}:burst:${ip}`, RATE_LIMITS.authBurst);
}

/**
 * CSRF defence. State-changing requests must come from our own origin; a
 * cross-origin form post cannot set a custom header, so `Sec-Fetch-Site` is the
 * reliable signal alongside the Origin check.
 */
export function isSameOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  const host = request.headers.get('host');
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}