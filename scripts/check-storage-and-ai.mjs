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
} finally {
  await client.end();
}

process.stdout.write(`\n${failed === 0 ? 'all confirmed' : `${failed} failed`}\n`);
process.exit(failed === 0 ? 0 : 1);