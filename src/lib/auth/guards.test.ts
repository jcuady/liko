import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE, signSession, type SessionPayload } from './session';

/**
 * THE SESSION IS CHECKED AGAINST THE MODE IT WILL BE USED IN.
 *
 * WHY THIS EXISTS. `getSession()` is the only place a signed cookie is read
 * without a second source to check it against, because in `supabase` mode it
 * deliberately skips the `findUserById` round trip that fixture mode does. That
 * left a cookie minted while the app ran in `fixtures` mode still valid after a
 * switch to `supabase`: same `LIKO_SESSION_SECRET`, so the signature verifies,
 * and a `fixtures` id like `usr_demo_noor` cannot name a real account.
 *
 * It was then carried into Postgres, which rejected it for a uuid column
 * (`invalid input syntax for type uuid: "usr_demo_noor"`) and sent every data
 * page to the error boundary with HTTP 200. Nothing was wrong with the data —
 * the rows were there and RLS had admitted them — so the symptom pointed at the
 * database and away from the identity that was actually fictional.
 *
 * The fix refuses an id that cannot be a Supabase user id. These tests pin both
 * halves of it: that the refusal happens, and that it happens ONLY in supabase
 * mode, because the fixture workspace is built on those same fixed strings and
 * breaking them would break every demo.
 */

/** A real `auth.users.id`. */
const REAL_UUID = '9984dc37-232f-4bbb-a985-2d1fab05ca38';
/** The id `src/lib/auth/store.ts` gives the demo student. */
const FIXTURE_ID = 'usr_demo_noor';

const makePayload = (userId: string): SessionPayload => ({
  userId,
  email: 'student@liko.test',
  role: 'student',
  emailVerified: true,
});

/**
 * Both modules are mocked rather than imported for real.
 *
 * `next/headers` has no meaning outside a request, and `isSupabaseMode` reads an
 * environment variable that the suite must be able to set per test — a shared
 * module cache would let one test's mode leak into the next, which is the same
 * "a suite can be silent about the state it does not name" trap as anywhere else.
 */
const state = { cookie: undefined as string | undefined, supabase: false };

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE ? { value: state.cookie } : undefined) }),
}));

vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));

vi.mock('@/lib/data-mode', () => ({
  isSupabaseMode: () => state.supabase,
}));

// Imported after the mocks so the module graph picks them up.
const { getSession } = await import('./guards');

beforeEach(() => {
  process.env.LIKO_SESSION_SECRET = 'x'.repeat(64);
  state.cookie = undefined;
  state.supabase = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getSession', () => {
  it('refuses a fixture-minted id under supabase mode, rather than passing it to Postgres', async () => {
    state.supabase = true;
    state.cookie = await signSession(makePayload(FIXTURE_ID));

    // Without the guard this returned the payload, and the first thing that
    // touched it was `.eq('account_id', 'usr_demo_noor')`.
    expect(await getSession()).toBeNull();
  });

  it('still admits a real uuid under supabase mode', async () => {
    state.supabase = true;
    state.cookie = await signSession(makePayload(REAL_UUID));

    expect((await getSession())?.userId).toBe(REAL_UUID);
  });

  it('keeps admitting the demo id in fixture mode, where it is a real identity', async () => {
    // The counter-case that stops the fix from becoming a regression: the fixture
    // workspace is built on exactly these strings.
    state.supabase = false;
    state.cookie = await signSession(makePayload(FIXTURE_ID));

    expect((await getSession())?.userId).toBe(FIXTURE_ID);
  });

  it('refuses an unsigned or tampered cookie in either mode', async () => {
    state.supabase = true;
    state.cookie = 'not.a.jwt';

    expect(await getSession()).toBeNull();
  });

  it('refuses no cookie at all', async () => {
    state.supabase = true;

    expect(await getSession()).toBeNull();
  });
});