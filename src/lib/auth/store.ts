import { randomUUID } from 'node:crypto';

import { verifyPassword } from './password';
import { isSupabaseMode } from '@/lib/data-mode';
import { createSupabaseAdmin, createSupabaseAnon, createSupabaseServerClient } from '@/lib/supabase/server';
import type { Role } from './rbac';

/**
 * The user store.
 *
 * This module was the fixture seam: an in-memory map so the auth flow was
 * exercisable end to end before any backend existed. It now has two backends,
 * chosen by `LIKO_DATA_MODE` and never at runtime by a flag:
 *
 *   supabase  Supabase Auth owns identity. Signup sends a real confirmation
 *             email, sign-in returns a Supabase access token which is carried
 *             inside our own session JWT so PostgREST evaluates RLS as the user.
 *
 *   fixtures  The in-memory map, kept so the marketing page, the demo workspace
 *             and the Playwright suite run with no network and no database.
 *
 * THE REGISTRATION DEADLOCK THIS REPLACES
 * ---------------------------------------
 * `createUser` used to hardcode `emailVerified: false`. `proxy.ts` refuses any
 * unverified session, and `/verify-email` was static copy with no callback route
 * and no caller for `markEmailVerified()`. A newly registered user could
 * therefore never reach the dashboard.
 *
 * The two modes fix it differently, for a real reason:
 *
 *   supabase  Verification is genuine. Supabase sends the email, the recipient
 *             clicks a link that lands on `/auth/callback`, which calls
 *             `verifyOtp` and only then issues a session with
 *             `emailVerified: true`.
 *
 *   fixtures  Verified immediately, because a fixture adapter cannot send mail.
 *             Gating a demo user behind a verification step that can never be
 *             completed would reproduce the exact same dead end.
 */

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
}

/** A user plus the token needed to act as them against RLS. */
export interface AuthResult {
  user: StoredUser;
  /** Supabase access token, or null in fixture mode and before verification. */
  accessToken: string | null;
  /**
   * True when Supabase created the account but held the session back pending
   * email confirmation. The caller routes to /verify-email and issues no cookie.
   */
  awaitingConfirmation: boolean;
}

/**
 * WHY THIS MAP LIVES ON `globalThis`.
 *
 * A module-level `const` is per *bundle*, not per process. Next gives a page and
 * the server action it calls separate copies of a shared module, so an account
 * registered through `registerAction` was written into the action bundle's map
 * and then invisible to the bundle rendering `/settings/profile`. The page
 * synthesised a profile from an unknown account, so the name typed at signup was
 * blank on the profile form. Sign-in kept working because it only ever reads the
 * session cookie, which is why the symptom looked like a profile bug and not an
 * identity bug.
 *
 * `src/lib/api/fixtures.ts` hit the identical trap with its workspace store and
 * was fixed the same way. In `supabase` mode this map is unreachable, so nothing
 * here is load-bearing in production.
 */
const globalScope = globalThis as typeof globalThis & {
  __likoUsers?: Map<string, StoredUser>;
};

const users: Map<string, StoredUser> = (globalScope.__likoUsers ??= new Map());

/**
 * Demo accounts for `fixtures` mode.
 *
 * WHY THESE EXIST. The map above is process-local and starts empty, so before
 * this, a fresh `pnpm dev` had no account anyone could sign in with: the three
 * users `scripts/seed.mjs` creates only ever existed in Supabase mode, which
 * needs OAuth and a service role key. Every documented test user was therefore
 * unusable in the default mode and in the Playwright suite.
 *
 * They mirror `scripts/seed.mjs` exactly, same addresses, names, roles and
 * password, so a demo behaves identically whether it is backed by the in-memory
 * map or by a seeded database. All four RBAC roles are represented, because the
 * `student` and `guardian` columns of the matrix had no account that could ever
 * reach them.
 *
 * Ids are fixed strings rather than uuids so a restart reproduces the same
 * identity. Fixture reads ignore the owner id anyway (`src/lib/api/fixtures.ts`
 * returns the demo workspace to any signed-in user), so this is for stability of
 * debugging output, not for data isolation.
 */
const DEMO_PASSWORD = 'LikoDemo!2026';

const DEMO_USERS: ReadonlyArray<{
  id: string;
  name: string;
  email: string;
  role: Role;
}> = [
  { id: 'usr_demo_maya', name: 'Maya Okonkwo', email: 'maya@liko.test', role: 'instructor' },
  { id: 'usr_demo_dev', name: 'Dev Ramanathan', email: 'dev@liko.test', role: 'admin' },
  {
    id: 'usr_demo_ingrid',
    name: 'Ingrid Halvorsen',
    email: 'ingrid@liko.test',
    role: 'instructor',
  },
  { id: 'usr_demo_noor', name: 'Noor Haddad', email: 'student@liko.test', role: 'student' },
  {
    id: 'usr_demo_priya',
    name: 'Priya Raman',
    email: 'guardian@liko.test',
    role: 'guardian',
  },
];

/**
 * Populates the demo accounts once per process. Hashing is scrypt and therefore
 * async, so this is a memoised promise rather than a top-level await: every
 * caller awaits the same work, and concurrent first requests cannot each start
 * their own hash.
 *
 * It seeds on every process start rather than only when the map happens to be
 * empty. Guarding on `users.size` looked harmless, but in a run where any
 * account registered first the demo accounts were skipped, so the three
 * documented test users silently stopped existing and every demo sign-in failed
 * with a generic credential error. Seed each demo account if it is absent.
 */
let demoSeed: Promise<void> | null = null;

function ensureDemoUsers(): Promise<void> {
  if (!demoSeed) {
    demoSeed = (async () => {
      const missing = DEMO_USERS.filter((demo) => !users.has(demo.email));
      if (missing.length === 0) return;

      const passwordHash = await hashForFixture(DEMO_PASSWORD);
      const createdAt = new Date().toISOString();
      for (const demo of missing) {
        users.set(demo.email, {
          id: demo.id,
          name: demo.name,
          email: demo.email,
          passwordHash,
          role: demo.role,
          emailVerified: true,
          createdAt,
        });
      }
    })();
  }
  return demoSeed;
}

/**
 * True when `userId` is one of the seeded demo accounts.
 *
 * The fixture workspace is a single shared demo, so the adapter needs to know
 * who it belongs to. A teacher who registers during a demo session must get an
 * empty workspace rather than inheriting a roster they never created, otherwise
 * first-run onboarding sees classes that are not theirs and skips itself.
 */
export function isDemoAccount(userId: string): boolean {
  return DEMO_USERS.some((demo) => demo.id === userId);
}

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readProfile(
  userId: string,
  email: string,
  fallbackName: string,
): StoredUser {
  return {
    id: userId,
    name: fallbackName,
    email,
    passwordHash: '',
    role: 'instructor',
    emailVerified: true,
    createdAt: new Date().toISOString(),
  };
}

async function loadSupabaseUser(email: string) {
  const admin = await createSupabaseAdmin();
  if (!admin) return null;

  // listUsers is paginated and filtered client-side by the admin API, so this
  // is a deliberate single-page scan for the sign-in lookup. A production
  // deployment should switch this to the auth hook / custom claims, which the
  // profile table already supports.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) return null;

    const match = data.users.find(
      (candidate) => normalizeEmail(candidate.email ?? '') === email,
    );
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const key = normalizeEmail(email);

  if (!isSupabaseMode()) {
    await ensureDemoUsers();
    return users.get(key) ?? null;
  }

  const admin = await createSupabaseAdmin();
  if (!admin) return null;

  const match = await loadSupabaseUser(key);
  if (!match) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role')
    .eq('id', match.id)
    .maybeSingle();

  return {
    ...readProfile(match.id, key, String(profile?.full_name ?? '')),
    name: String(profile?.full_name ?? match.user_metadata?.full_name ?? ''),
    role: (profile?.role as Role) ?? 'instructor',
    emailVerified: Boolean(match.email_confirmed_at),
  };
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  if (!isSupabaseMode()) {
    // Seeded like every other fixture read: without this, a lookup that happens
    // before any sign-in finds an empty map and reports the demo accounts as
    // unknown accounts.
    await ensureDemoUsers();
    for (const user of users.values()) {
      if (user.id === id) return user;
    }
    return null;
  }

  const admin = await createSupabaseAdmin();
  if (!admin) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', id)
    .maybeSingle();

  if (!profile) return null;

  return {
    ...readProfile(profile.id, normalizeEmail(profile.email), ''),
    name: String(profile.full_name ?? ''),
    role: (profile.role as Role) ?? 'instructor',
    emailVerified: true,
  };
}

export async function createUser(input: CreateUserInput): Promise<StoredUser> {
  const email = normalizeEmail(input.email);

  if (!isSupabaseMode()) {
    const user: StoredUser = {
      id: `usr_${randomUUID()}`,
      name: input.name,
      email,
      passwordHash: input.passwordHash,
      role: input.role,
      // Verified on creation. A fixture adapter cannot send a confirmation
      // email, so requiring one would dead-end every demo account.
      emailVerified: true,
      createdAt: new Date().toISOString(),
    };
    users.set(email, user);
    return user;
  }

  throw new Error(
    'createUser must not be called directly in supabase mode. Use signUp(), ' +
      'which creates the account through Supabase Auth so the password is ' +
      'hashed by the auth service and a confirmation email is sent.',
  );
}

/**
 * Supabase-backed signup. Returns an AuthResult rather than a bare user because
 * the caller needs to know whether a session was issued or withheld.
 */
export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  /** Where Supabase redirects after the recipient clicks the email link. */
  redirectTo: string;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);

  if (!isSupabaseMode()) {
    const user = await createUser({
      name: input.name,
      email,
      passwordHash: await hashForFixture(input.password),
      role: input.role,
    });
    return { user, accessToken: null, awaitingConfirmation: false };
  }

  const supabase = await createSupabaseAnon();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  /*
   * signUp on the anon client is the standard flow: Supabase hashes the
   * password itself and sends the confirmation email, with `emailRedirectTo`
   * naming the /auth/callback route the recipient lands on. The
   * handle_new_user trigger creates the profile row from user_metadata, so no
   * admin insert is needed here.
   */
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: input.redirectTo,
      data: { full_name: input.name },
    },
  });

  if (error || !data.user) {
    // Do not echo the provider message: it distinguishes "already registered"
    // from other failures, which is enough to enumerate accounts.
    throw new Error('ACCOUNT_NOT_CREATED');
  }

  const user: StoredUser = {
    id: data.user.id,
    name: input.name,
    email,
    passwordHash: '',
    role: input.role,
    emailVerified: Boolean(data.user.email_confirmed_at),
    createdAt: data.user.created_at ?? new Date().toISOString(),
  };

  return {
    user,
    accessToken: data.session?.access_token ?? null,
    awaitingConfirmation: !user.emailVerified,
  };
}

/** Sends a fresh confirmation email for an account that has not verified yet. */
export async function resendConfirmation(
  email: string,
  redirectTo: string,
): Promise<void> {
  if (!isSupabaseMode()) return;

  const supabase = await createSupabaseAnon();
  if (!supabase) return;

  await supabase.auth.resend({
    type: 'signup',
    email: normalizeEmail(email),
    options: { emailRedirectTo: redirectTo },
  });
}

/**
 * Supabase-backed credential check.
 *
 * Returns null for both "no such account" and "wrong password" so the form
 * cannot be used to enumerate registered addresses. In fixture mode the timing
 * profile is flattened the same way the original store did.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthResult | null> {
  const key = normalizeEmail(email);

  if (!isSupabaseMode()) {
    await ensureDemoUsers();
    const user = users.get(key);

    if (!user) {
      // Compare against a throwaway hash to keep the timing profile flat.
      await verifyPassword(password, 'scrypt$16384$8$1$00$00');
      return null;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    return valid ? { user, accessToken: null, awaitingConfirmation: false } : null;
  }

  const admin = await createSupabaseAdmin();
  if (!admin) return null;

  const match = await loadSupabaseUser(key);

  // Sign in through the cookie-backed server client so the password is
  // verified by the auth service against its own hash, and so the resulting
  // session is persisted into httpOnly cookies for later RLS-scoped reads.
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: key,
    password,
  });

  if (error || !data.user) {
    // Still touch the admin path when the account was missing so the two
    // failure shapes take comparable time.
    if (!match) await loadSupabaseUser(key);
    return null;
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role')
    .eq('id', data.user.id)
    .maybeSingle();

  const user: StoredUser = {
    id: data.user.id,
    name: String(profile?.full_name ?? data.user.user_metadata?.full_name ?? ''),
    email: key,
    passwordHash: '',
    role: (profile?.role as Role) ?? 'instructor',
    emailVerified: Boolean(data.user.email_confirmed_at),
    createdAt: data.user.created_at ?? new Date().toISOString(),
  };

  return {
    user,
    accessToken: data.session?.access_token ?? null,
    awaitingConfirmation: !user.emailVerified,
  };
}

/**
 * Confirms an account from the emailed link.
 *
 * This is what finally gives `markEmailVerified` a caller. The link arrives as
 * a token_hash on /auth/callback; `verifyOtp` consumes it and flips the
 * account's confirmed state in Supabase Auth.
 */
export async function verifyEmailToken(params: {
  tokenHash: string;
  type: string;
}): Promise<AuthResult | null> {
  if (!isSupabaseMode()) {
    const user = await markEmailVerified('fixture');
    return user
      ? { user, accessToken: null, awaitingConfirmation: false }
      : null;
  }

  const admin = await createSupabaseAdmin();
  if (!admin) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: params.tokenHash,
    type: params.type as 'signup' | 'email_change' | 'recovery',
  });

  if (error || !data.user) return null;

  await admin.auth.admin.updateUserById(data.user.id, {
    email_confirm: true,
  });

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role')
    .eq('id', data.user.id)
    .maybeSingle();

  return {
    user: {
      id: data.user.id,
      name: String(profile?.full_name ?? ''),
      email: normalizeEmail(data.user.email ?? ''),
      passwordHash: '',
      role: (profile?.role as Role) ?? 'instructor',
      emailVerified: true,
      createdAt: data.user.created_at ?? new Date().toISOString(),
    },
    accessToken: data.session?.access_token ?? null,
    awaitingConfirmation: false,
  };
}

export async function markEmailVerified(
  userId: string,
): Promise<StoredUser | null> {
  if (!isSupabaseMode()) {
    const user = await findUserById(userId);
    if (user) user.emailVerified = true;
    return user;
  }

  const admin = await createSupabaseAdmin();
  if (!admin) return null;

  await admin.auth.admin.updateUserById(userId, { email_confirm: true });
  return findUserById(userId);
}

/** Starts a password reset. Always reports success so accounts stay private. */
export async function requestPasswordReset(
  email: string,
  redirectTo: string,
): Promise<void> {
  if (!isSupabaseMode()) return;

  const supabase = await createSupabaseAnon();
  if (!supabase) return;

  await supabase.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo });
}

/** Completes a password reset using the recovery session in the link. */
export async function completePasswordUpdate(newPassword: string): Promise<boolean> {
  if (!isSupabaseMode()) return true;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  return !error && Boolean(data.user);
}

/**
 * Fixture mode still needs a stored hash. Kept local so the fixture adapter has
 * no import cycle with the Supabase path.
 */
async function hashForFixture(password: string): Promise<string> {
  const { hashPassword } = await import('./password');
  return hashPassword(password);
}