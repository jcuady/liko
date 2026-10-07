'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { publicEnv } from '@/lib/env';

/**
 * Browser Supabase client.
 *
 * Built lazily and cached on `globalThis` so React strict mode, and a fast
 * refresh, do not each construct a second client with its own realtime socket.
 *
 * This client only ever carries the publishable key. RLS is what protects data
 * here, which is exactly why the publishable key is safe to ship and the secret
 * key is not.
 */

let cached: SupabaseClient | null = null;

export function createSupabaseBrowser(): SupabaseClient | null {
  if (cached) return cached;

  const { supabaseUrl, supabaseAnonKey } = publicEnv();
  if (!supabaseAnonKey) return null;

  const store = globalThis as typeof globalThis & {
    __likoSupabase?: SupabaseClient;
  };
  cached =
    store.__likoSupabase ??
    (store.__likoSupabase = createBrowserClient(supabaseUrl, supabaseAnonKey));

  return cached;
}