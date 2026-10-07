import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { serverEnv } from '@/lib/env';

/**
 * Server-side Supabase clients.
 *
 * Three shapes, and the difference matters:
 *
 *   createSupabaseServerClient()  The workhorse. Reads and refreshes the
 *      Supabase session from its own httpOnly cookies, so PostgREST evaluates
 *      RLS with `auth.uid()` set to the signed-in teacher. This is the only
 *      path a screen's reads and writes are allowed to take.
 *
 *   createSupabaseAdmin()  Uses the secret (service_role) key, which BYPASSES
 *      RLS. Only for auth administration, the seed script, push dispatch, and
 *      the at-risk sweep.
 *
 *   createSupabaseAs(token)  Explicitly bearer-authenticated, for route
 *      handlers that arrive with their own Authorization header.
 *
 * Conflating admin and user-scoped access is how a service key leaks into a
 * client bundle, so each lives in its own function and none returns the other.
 *
 * The app keeps its OWN `liko_session` JWT alongside these. Supabase owns
 * identity and data; the app JWT stays the thing `proxy.ts` and
 * `requirePermission()` check, which keeps the existing RBAC tests untouched
 * and keeps the token out of localStorage.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/supabase/server.ts must never be imported by a client component',
  );
}

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = await serverEnv();
  if (!env.supabaseAnonKey) return null;

  const store = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, normalizeCookieOptions(options));
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware-free path is acceptable: the session is already
          // persisted from the server action that established it, and a refresh
          // that cannot persist simply means the next request refreshes again.
        }
      },
    },
  });
}

function normalizeCookieOptions(options: CookieOptions): CookieOptions {
  return {
    ...options,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  };
}

/**
 * Server-only client using the secret key, which bypasses RLS. Never call this
 * with a user-supplied filter and assume RLS will catch a mistake.
 */
export async function createSupabaseAdmin(): Promise<SupabaseClient | null> {
  const env = await serverEnv();
  if (!env.hasServiceRole) return null;

  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Explicitly bearer-authenticated client, for route handlers carrying a token. */
export async function createSupabaseAs(
  accessToken: string | undefined,
): Promise<SupabaseClient | null> {
  const env = await serverEnv();
  if (!env.supabaseAnonKey || !accessToken) return null;

  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anon client with no session. Used for sign-in and password reset only. */
export async function createSupabaseAnon(): Promise<SupabaseClient | null> {
  const env = await serverEnv();
  if (!env.supabaseAnonKey) return null;

  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}