/**
 * Has the migration been applied to the real project?
 *
 * WHY IT NEEDS NO SECRET. The obvious approach is to fetch the PostgREST
 * OpenAPI schema at the root of `/rest/v1/` and read the table list from it.
 * That no longer works: Supabase answers a publishable key with
 * `{"message":"Secret API key required"}`, so the one endpoint that lists every
 * table is closed to the key that ships in `NEXT_PUBLIC_*`.
 *
 * There is another signal, and it is free. Asking for a table that does not
 * exist is a different answer from asking for one that does:
 *
 *   missing  -> 404 `PGRST205`, "Could not find the table ... in the schema cache"
 *   present  -> 200 with rows, or `[]` because RLS refused them, or 401/403
 *
 * So existence is distinguishable with the key we already have.
 *
 * WHY THIS FILE VALIDATES ITS OWN DISCRIMINATOR FIRST. The first version of this
 * script decided "exists" unless the error code was the SQLSTATE `42P01`, and
 * PostgREST does not put SQLSTATEs in that field: it returns its own `PGRST205`.
 * The check therefore never matched, every probe came back "exists", and the
 * script reported a fully migrated database that was in fact completely empty.
 * A check that cannot report "nothing is there" is not a check. So it now probes
 * two table names that cannot exist and refuses to answer anything unless they
 * are correctly reported as missing.
 *
 * WHAT IT DOES NOT DO. It reads no rows. `limit=1` is a ceiling, not a request:
 * an RLS-protected table returns an empty array to the anon role, and this script
 * reports only status codes and error codes, never data. There is no student
 * information anywhere in this file.
 *
 * Run: node --env-file=.env.local scripts/check-remote-db.mjs
 */

const TABLES = [
  'profiles',
  'classes',
  'students',
  'attendance',
  'assessments',
  'grades',
  'lesson_plans',
  'behaviour_logs',
  'student_history',
  'push_subscriptions',
  'organizations',
  'memberships',
  'decks',
  'slides',
  'consent_events',
];

/**
 * Columns the security fixes depend on. A table can be present and still be
 * unsafe if a column its policy relies on is missing, and that is a quieter
 * failure than a missing table.
 */
const COLUMNS = {
  students: ['account_id'],
  profiles: ['role', 'org_id'],
};

/** Names that cannot exist. If these read as present, the probe is broken. */
const CANARIES = ['zzz_liko_probe_canary_a', 'zzz_liko_probe_canary_b'];

const MISSING_TABLE = /could not find the table|not found in the schema cache|42P01|PGRST205/i;
const MISSING_COLUMN = /does not exist|column .* not found|42703|PGRST100/i;

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.');
    process.exit(1);
  }
  return { base: `${url.replace(/\/$/, '')}/rest/v1`, key };
}

async function probe(base, key, table, select = 'id') {
  const url = `${base}/${table}?select=${encodeURIComponent(select)}&limit=1`;
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });

  const text = await response.text();
  if (response.ok) return { status: response.status, missing: false };

  // Belt and braces: match the structured code, the SQLSTATE, or the message.
  // Any one of the three changing should not turn a real database into an empty
  // one, and any one of them alone has already been observed to be unreliable.
  let structured = '';
  try {
    structured = JSON.stringify(JSON.parse(text));
  } catch {
    structured = text;
  }

  return { status: response.status, missing: MISSING_TABLE.test(structured) };
}

async function columnExists(base, key, table, column) {
  const result = await probe(base, key, table, column);
  if (result.missing) return false;
  if (result.status === 200 || result.status === 401 || result.status === 403) return true;

  const url = `${base}/${table}?select=${encodeURIComponent(column)}&limit=1`;
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (response.ok) return true;
  return !MISSING_COLUMN.test(await response.text());
}

async function main() {
  const { base, key } = config();
  console.log(`Project: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host}`);
  console.log(`Schema:  ${base}\n`);

  // Self-check before anything else.
  for (const canary of CANARIES) {
    const result = await probe(base, key, canary);
    if (!result.missing) {
      console.error(
        `REFUSING TO REPORT. The canary "${canary}" came back as present ` +
          `(HTTP ${result.status}). The probe cannot tell a missing table from a ` +
          'present one, so every result it could produce would be meaningless.',
      );
      process.exit(1);
    }
  }
  console.log(`Self-check passed: ${CANARIES.length} canary tables correctly read as missing.\n`);

  const missing = [];
  const columnProblems = [];

  for (const table of TABLES) {
    const result = await probe(base, key, table);

    if (result.missing) {
      missing.push(table);
      console.log(`  MISSING  ${table}`);
      continue;
    }

    const wanted = COLUMNS[table];
    if (!wanted) {
      console.log(`  present  ${table}  (HTTP ${result.status})`);
      continue;
    }

    // One column at a time: selecting a missing column alongside a present one
    // fails the whole query and tells you nothing about the others.
    const absent = [];
    for (const column of wanted) {
      if (!(await columnExists(base, key, table, column))) absent.push(column);
    }

    if (absent.length > 0) {
      columnProblems.push({ table, absent });
      console.log(`  PARTIAL  ${table}  (no column ${absent.join(', ')})`);
    } else {
      console.log(`  present  ${table}  (HTTP ${result.status})`);
    }
  }

  console.log('');

  if (missing.length > 0) {
    console.log(
      `RESULT: the migration is NOT applied. ${missing.length} of ${TABLES.length} ` +
        `tables are absent:\n  ${missing.join('\n  ')}`,
    );
    if (missing.length === TABLES.length) {
      console.log('\nEvery table is absent, so this project has no LIKO schema at all.');
    }
    console.log('\nNext: apply supabase/migrations/20260101000000_initial_schema.sql.');
    console.log('Then run scripts/rls-settling-test.mjs, which needs a service key, to');
    console.log('prove the security policies actually behave and are not just present.');
    process.exit(1);
  }

  if (columnProblems.length > 0) {
    console.log('RESULT: every table exists, but required columns do not:');
    for (const { table, absent } of columnProblems) {
      console.log(`  ${table}: ${absent.join(', ')}`);
    }
    console.log('\nA policy referencing a column which does not exist cannot work.');
    process.exit(1);
  }

  console.log('RESULT: all 15 tables and their security-relevant columns exist.');
  console.log('Existence is not correctness. Run scripts/rls-settling-test.mjs to prove');
  console.log('the policies behave: that a user cannot promote themselves, and that no');
  console.log('account can read another school.');
}

main();