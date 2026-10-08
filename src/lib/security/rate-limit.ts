/**
 * Token-bucket rate limiting for server-side endpoints.
 *
 * State is held in memory, which is correct for a single instance and a
 * deliberate simplification for a multi-instance deployment. When LIKO scales
 * horizontally this must move to a shared store such as Redis; the interface
 * below is the seam.
 *
 * A client-side cooldown is cosmetic and does not replace this.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

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

export function consume(key: string, config: RateLimitConfig): RateLimitResult {
  /*
   * Test-only escape hatch.
   *
   * The limiter is in-process and keyed on the caller, so an end-to-end suite
   * that signs in as the same demo account twenty times trips the exact
   * protection that stops credential stuffing, and every sign-in after the tenth
   * is refused. Throttling is a production control; it must not be in the way
   * of a test run. `playwright.config.ts` sets this for its own server, and it
   * is never set in a deployed environment.
   */
  if (process.env.LIKO_RATE_LIMIT_DISABLED === 'true') {
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