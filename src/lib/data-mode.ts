/**
 * Data mode.
 *
 * `fixtures` serves the built-in demo workspace so the marketing page, the hero
 * device mockups, and the Playwright suite all run with no network and no
 * database. `supabase` serves real, per-user data.
 *
 * The rule this module exists to make checkable: when the mode is `supabase`,
 * NO route may render fixtures. A screen that quietly falls back to demo data
 * in production is worse than an error, because it looks like a working app.
 * `assertRealDataMode` is called from the seam so a fixture read under
 * `supabase` mode throws instead of returning a lie.
 */

export type DataMode = 'supabase' | 'fixtures';

export function getDataMode(): DataMode {
  const raw = process.env.LIKO_DATA_MODE?.trim().toLowerCase();
  if (raw === 'supabase') return 'supabase';

  // Deliberately conservative. An unset or misspelled variable falls back to
  // fixtures rather than half-working against a database.
  return 'fixtures';
}

export function isSupabaseMode(): boolean {
  return getDataMode() === 'supabase';
}

export class FixtureAccessInSupabaseModeError extends Error {
  constructor(operation: string) {
    super(
      `Refusing to serve fixture data for "${operation}" while LIKO_DATA_MODE=supabase. ` +
        'A fixture read in production returns demo data that looks real.',
    );
    this.name = 'FixtureAccessInSupabaseModeError';
  }
}

/**
 * Guard for the fixture adapter. Throws under `supabase` so a missed wiring
 * surfaces as a stack trace during development rather than as plausible-looking
 * fake data in front of a real teacher.
 */
export function assertRealDataMode(operation: string): void {
  if (isSupabaseMode()) {
    throw new FixtureAccessInSupabaseModeError(operation);
  }
}