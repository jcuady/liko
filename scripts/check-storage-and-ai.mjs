/**
 * Confirms the storage bucket the app now uploads images to actually exists, and
 * that its policies are the ones the file was written to be.
 *
 * WHY THIS IS NOT `db:check`. That script asks whether the tables exist. A
 * missing bucket is not a missing table: every query the product makes against
 * `deck_assets` succeeds, the upload panel renders, and the failure arrives
 * later as a signed URL that will not sign. The failure happens at the moment a
 * teacher has already picked a picture.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';

/*
 * THE PURPOSE THE APPLICATION ACTUALLY WRITES.
 *
 * Read out of the source rather than repeated here, because this script's job
 * is to prove the write path works, and it would be proving a different write
 * from the one the application makes if the value were copied. The first
 * version of this probe sent `write-path-check`, which the check constraint
 * correctly refused, and the failure read exactly like a product defect.
 *
 * A plain `.mjs` script cannot import a `.ts` module under Node, so the constant
 * is read from the file. If it ever moves, this throws rather than quietly
 * probing a value the application never sends.
 */
const geminiSource = readFileSync(new URL('../src/lib/ai/gemini.ts', import.meta.url), 'utf8');
const purpose = geminiSource.match(/AI_PURPOSE_DECK\s*=\s*'([^']+)'/)?.[1];
const model = geminiSource.match(/GEMINI_MODEL\s*=\s*'([^']+)'/)?.[1];
if (!purpose || !model) {
  process.stdout.write("FAIL  the purpose or model constant was not found in src/lib/ai/gemini.ts\n");
  process.exitCode = 1;
  throw new Error('AI_PURPOSE_DECK or GEMINI_MODEL not found');
}

const { Client } = pg;
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ref = url.hostname.split('.')[0];

const client = new Client({
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
  user: `postgres.${ref}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await client.connect();

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}\n`);
};

try {
  const { rows } = await client.query(`select id, public from storage.buckets where id = 'deck-assets'`);
  check('the deck-assets bucket exists', rows.length === 1, `${rows.length} found`);
  // Private, not public. A public bucket means every image URL is guessable by
  // anyone who has seen one, which for a classroom photo is not acceptable.
  check('the bucket is private', rows[0]?.public === false, `public=${rows[0]?.public}`);

  const { rows: policies } = await client.query(
    `select policyname, cmd from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname ilike '%deck%' or policyname ilike '%asset%'`,
  );
  const commands = policies.map((p) => `${p.policyname}:${p.cmd}`).join(', ');
  check('deck asset policies exist on storage.objects', policies.length > 0, commands || 'none found');

  /*
   * The absence of a delete policy is the point, not an omission. Storage is
   * reachable through the dashboard and through any service-role caller, and an
   * open delete on somebody else's folder is the kind of mistake that cannot be
   * undone from inside the product.
   */
  check(
    'there is no delete policy on storage objects',
    !policies.some((p) => p.cmd === 'DELETE' || p.cmd === 'ALL'),
    commands || 'none found',
  );

  /*
   * Named columns, not a count. The first version of this asserted `length ===
   * 9` and `length === 9`, and both failed because the tables were correct and
   * I had miscounted. A count asserts nothing about WHICH columns exist, so a
   * table could carry three of the wrong ones and pass.
   */
  async function hasColumns(table, expected) {
    const { rows } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = $1`,
      [table],
    );
    const present = new Set(rows.map((r) => r.column_name));
    const missing = expected.filter((name) => !present.has(name));
    check(`${table} carries every column the adapter writes`, missing.length === 0, missing.join(', ') || `${rows.length} columns`);
  }

  await hasColumns('deck_assets', [
    'id', 'deck_id', 'owner_id', 'kind', 'filename', 'mime',
    'byte_size', 'storage_path', 'extracted_text', 'created_at',
  ]);

  await hasColumns('ai_generations', [
    'id', 'user_id', 'owner_id', 'model', 'purpose',
    'prompt_tokens', 'output_tokens', 'created_at',
  ]);

  const { rows: slideCols } = await client.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'slides'
        and column_name in ('elements', 'theme')`,
  );
  check('slides carries elements and theme', slideCols.length === 2, slideCols.map((c) => c.column_name).join(', '));

  /*
   * `ai_generations` IS THE RECORD A TEACHER'S ALLOWANCE IS COUNTED FROM.
   *
   * Which is why it has a select policy and nothing else: if a browser could
   * insert one, it could decide how much of its own allowance is left.
   */
  const { rows: aiPolicies } = await client.query(
    `select policyname, cmd from pg_policies
      where schemaname = 'public' and tablename = 'ai_generations'`,
  );
  const aiCommands = aiPolicies.map((p) => `${p.policyname}:${p.cmd}`).join(', ') || 'none';
  check(
    'the usage table can be read but not written from a client',
    aiPolicies.some((p) => p.cmd === 'SELECT') &&
      !aiPolicies.some((p) => p.cmd === 'INSERT' || p.cmd === 'ALL'),
    aiCommands,
  );

  /*
   * AND THEN THE WRITE PATH IS EXERCISED FOR REAL.
   *
   * Every check above is about shape. A table can have every column, every grant
   * and exactly the intended policies and still be unwritable through the client
   * the application actually uses, because the application used the wrong one:
   * `recordAiGeneration` was written against the signed-in teacher's session,
   * and `ai_generations` has no insert policy for `authenticated`. Every local
   * gate passed. It failed on production as a 500 and a meter that never moved,
   * which is an allowance failing open.
   *
   * So this posts a row through PostgREST as the service role, reads it back and
   * removes it, and the run after it posts the same row as the browser does.
   */
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /*
   * A REAL ACCOUNT, because `user_id` is a foreign key onto `users`. An invented
   * uuid is refused by the constraint before it reaches the thing being tested,
   * and a probe that fails for its own scaffolding teaches the next person to
   * ignore it.
   */
  const { rows: owners } = await client.query(
    /*
     * `auth.users`, not `public.users`, which does not exist: the foreign key on
     * `ai_generations.user_id` points at the auth schema, and the app's own copy
     * of the person is `public.profiles`. Picking the wrong one fails on the
     * relation before it reaches the thing being tested.
     */
    `select u.id from auth.users u
       join public.profiles p on p.id = u.id
      where p."role" = 'instructor'
      order by u.created_at limit 1`,
  );
  if (owners.length === 0) {
    check('an instructor account exists to record usage against', false, 'none found');
  }
  const probeUser = owners[0]?.id ?? null;

  const post = (key, body) =>
    fetch(`${base}/rest/v1/ai_generations`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });

  const row = {
    user_id: probeUser,
    owner_id: probeUser,
    model: model,
    purpose,
    prompt_tokens: 1,
    output_tokens: 1,
  };

  let serviceWrote = false;
  let probeId = null;
  if (!serviceKey) {
    check('a service key is available to prove the write path', false, 'SUPABASE_SERVICE_ROLE_KEY is not set');
  } else {
    const res = await post(serviceKey, row);
    const body = await res.text();
    serviceWrote = res.ok;
    check(
      'the server can record a generation through the client the app uses',
      res.ok,
      res.ok ? `status ${res.status}` : `status ${res.status} ${body.slice(0, 200)}`,
    );
    // The row's own id, so the cleanup below can remove THIS row and not
    // somebody's real usage history.
    if (res.ok) probeId = JSON.parse(body)[0]?.id ?? null;
  }

  /*
   * THE CONTROL. Without it, the check above only proves that something can
   * write. This is the assertion that RLS is still doing its job: the same row,
   * the same table, refused for the role a browser actually holds.
   */
  if (!anonKey) {
    check('an anon key is available to prove the refusal', false, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  } else {
    const res = await post(anonKey, row);
    const body = await res.text();
    check(
      'a browser cannot write its own usage record',
      !res.ok,
      res.ok ? 'the insert was ALLOWED, so the allowance is the client\'s to set' : `refused with ${res.status}`,
    );
    check(
      'that refusal is row level security rather than a missing grant',
      /42501|row-level security/i.test(body),
      body.slice(0, 160),
    );
  }

  // Read it back through the same table the meter counts, then remove it.
  if (serviceWrote && probeId) {
    const read = await fetch(`${base}/rest/v1/ai_generations?id=eq.${probeId}&select=created_at`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
    const rows = await read.json();
    check(
      'the recorded generation is readable back out for the meter',
      Array.isArray(rows) && rows.length === 1,
      `${Array.isArray(rows) ? rows.length : 'not an array'} rows`,
    );

    const removed = await fetch(`${base}/rest/v1/ai_generations?id=eq.${probeId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
    check('the probe row is removed again', removed.ok, `status ${removed.status}`);
  }
} finally {
  await client.end();
}

process.stdout.write(`\n${failed === 0 ? 'all confirmed' : `${failed} failed`}\n`);
/*
 * `process.exitCode`, not `process.exit()`. This script now makes HTTPS calls,
 * and undici still holds a socket when it finishes. Exiting mid-close makes
 * libuv assert, which reports a green run as a crash for a reason that has
 * nothing to do with the result.
 */
process.exitCode = failed === 0 ? 0 : 1;