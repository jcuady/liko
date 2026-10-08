/**
 * Post-login redirect targets.
 *
 * WHY THIS IS NOT AN INLINE CHECK.
 *
 * The same predicate is needed in two places that cannot share a module for
 * free: `proxy.ts` builds the `?next=` it puts on the login redirect, and
 * `registerAction`/`loginAction` consume whatever arrived in the form. When they
 * were written separately they drifted, and both were incomplete in the same
 * way: they rejected `//evil.com` but accepted `/\evil.com`.
 *
 * That is not a theoretical gap. The WHATWG URL parser treats a backslash as a
 * forward slash for special schemes, and every scheme in play here is special,
 * so `/\evil.com` is parsed as `//evil.com` and resolves to the host
 * `evil.com`. A string check that only looks for a leading `//` walks straight
 * past it.
 *
 * The rule below is therefore not a list of shapes to reject. It resolves the
 * candidate against a known origin and returns it only if the origin survived
 * unchanged. Anything the parser is clever about becomes harmless automatically.
 */

/** An origin nothing can legitimately resolve to, used only for comparison. */
const INTERNAL_ORIGIN = 'https://internal.invalid';

/** Paths a signed-in user must never be sent back to. */
const AUTH_PREFIXES = ['/login', '/register'];

export interface SafeNextOptions {
  /** Where to send the user when the candidate is not usable. */
  fallback: string;
  /**
   * Optional per-role gate. Return false to refuse a path this particular user
   * is not allowed to open, which is how a guardian deep-linking to `/overview`
   * ends up on their own landing page instead of the forbidden screen.
   */
  allow?: (path: string) => boolean;
  /** Preserve the fragment. Off by default; fragments are not sent to servers. */
  keepHash?: boolean;
}

export function safeNextPath(raw: unknown, options: SafeNextOptions): string {
  const { fallback, allow, keepHash = false } = options;

  if (typeof raw !== 'string' || raw.length === 0) return fallback;

  // An absolute-path reference is the only acceptable shape. This rejects
  // `https://evil.com`, `javascript:...`, and `mailto:` in one step.
  if (!raw.startsWith('/')) return fallback;

  /*
   * Control characters are rejected outright. A raw newline or CR inside the
   * value could split the response header if it were ever reflected without
   * encoding, and none of them are legal in a URL path anyway.
   */
  if (/[\u0000-\u001F\u007F]/.test(raw)) return fallback;

  /*
   * Resolve and compare. This single line is what closes the backslash form:
   * the parser normalises `\` to `/` for special schemes, so `/\evil.com`
   * resolves to origin `https://evil.com` and fails the comparison. The
   * explicit backslash rejection below is belt and braces, so that the rule
   * still holds if a browser or a future refactor stops normalising.
   */
  let resolved: URL;
  try {
    resolved = new URL(raw, INTERNAL_ORIGIN);
  } catch {
    return fallback;
  }

  if (resolved.origin !== INTERNAL_ORIGIN) return fallback;
  if (raw.includes('\\')) return fallback;
  if (resolved.protocol !== 'https:') return fallback;

  // Normalise away a bare trailing slash so `/login/` and `/login` are one rule.
  const path = resolved.pathname.length > 1 && resolved.pathname.endsWith('/')
    ? resolved.pathname.slice(0, -1)
    : resolved.pathname;

  if (AUTH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return fallback;
  }

  if (allow && !allow(path)) return fallback;

  return keepHash ? `${path}${resolved.search}${resolved.hash}` : `${path}${resolved.search}`;
}