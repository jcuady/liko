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

export const RATE_LIMITS = {
  auth: { limit: 10, windowMs: 5 * 60 * 1000 },
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
  const forwarded = request.headers.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return `${scope}:${ip}`;
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