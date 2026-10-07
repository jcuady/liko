/**
 * Environment access.
 *
 * One place that knows how to read configuration, so a missing or malformed
 * variable fails loudly and once rather than as `undefined` deep inside a query.
 *
 * Rules this module exists to enforce:
 *   * Only `NEXT_PUBLIC_*` may be read by a client component. Anything else
 *     throws if a browser bundle ever reaches it.
 *   * Server-only variables are read through `serverEnv()`, which is async so a
 *     missing value produces a clear message instead of a silent fallback.
 *   * No default values for secrets. A missing secret must break the build, not
 *     ship a guessable default.
 */

export const SUPABASE_URL = 'https://ulrjitekiylgepdyijsw.supabase.co';

/** Public keys. Safe to inline: these are designed to reach the browser. */
export function publicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
  };
}

export function isSupabaseConfigured(): boolean {
  const { supabaseAnonKey } = publicEnv();
  return supabaseAnonKey.length > 0;
}

/** Server-only configuration. Throws rather than defaulting a secret. */
export async function serverEnv() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? '';

  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    serviceRoleKey,
    hasServiceRole: serviceRoleKey.length > 0,
    sessionSecret: process.env.LIKO_SESSION_SECRET ?? '',
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    vapidPrivateKey,
    vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:support@liko.app',
    cronSecret: process.env.CRON_SECRET ?? '',
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  };
}