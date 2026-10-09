#!/usr/bin/env node
/**
 * Apply the SQL migration to the real Supabase project.
 *
 * Usage: node --env-file=.env.local scripts/apply-migration.mjs [--dry-run]
 *
 * WHY A SCRIPT AND NOT THE SUPABASE CLI. The CLI is the better tool when it is
 * installed, but this project has to be able to bring a database up from a
 * checkout with nothing but Node, and the migration is a single file whose
 * re-runnability has already been proven by `pnpm check:sql`. One script that
 * applies the file and then proves it landed is worth more here than a tool that
 * would also manage a migration history this schema does not use.
 *
 * THE WHOLE FILE IS SENT AS ONE SIMPLE QUERY, deliberately. The migration has
 * dollar-quoted function bodies, so splitting it on semicolons in JavaScript
 * would cut a trigger body in half. Postgres parses the text properly; JavaScript
 * must not second-guess it. The cost is that everything runs in one implicit
 * transaction, which is the behaviour we want: a schema is either entirely
 * there or entirely absent, and a half-applied one is worse than none.
 *
 * That is only safe because nothing in the file is transaction-hostile. There is
 * no `CREATE INDEX CONCURRENTLY`, no `VACUUM`, no `CREATE DATABASE`; if that ever
 * changes, this script has to split the file and stop pretending otherwise.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '..', 'supabase', 'migrations', '20260101000000_initial_schema.sql');
const DRY_RUN = process.argv.includes('--dry-run');

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
    process.exit(1);
  }
  return value.trim();
}

/** `https://abc.supabase.co` to the Postgres host, which is a different name. */
function hostFromUrl(url) {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, '');
}

/**
 * Connection candidates, tried in order.
 *
 * Supabase's direct host `db.<ref>.supabase.co` is IPv6-ONLY: it publishes an
 * AAAA record and no A record. On an IPv4 network the first attempt fails with
 * ENOTFOUND, which reads like a wrong host and is not.
 *
 * The pooler is the answer for IPv4, and its host name carries the project
 * region, so it cannot be derived from the project URL. `SUPABASE_DB_HOST` and
 * `SUPABASE_DB_USER` set it explicitly when you know it; otherwise a short list
 * of standard regions is tried, because finding the right one by experiment is
 * faster than asking a human to go and read it off a dashboard. The user for the
 * pooler is `postgres.<ref>`, not `postgres`.
 */
function connectionCandidates(url) {
  const ref = hostFromUrl(url).split('.')[0];

  const explicit = process.env.SUPABASE_DB_HOST;
  if (explicit) {
    return [
      {
        label: `pooler (explicit) ${explicit}`,
        host: explicit,
        user: process.env.SUPABASE_DB_USER || `postgres.${ref}`,
        port: 5432,
      },
    ];
  }

  const candidates = [
    {
      label: `direct db.${ref}.supabase.co (IPv6 only)`,
      host: `db.${ref}.supabase.co`,
      user: 'postgres',
      port: 5432,
    },
  ];

  for (const region of (
    process.env.SUPABASE_DB_REGION
      ? [process.env.SUPABASE_DB_REGION]
      : ['ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'us-east-1', 'us-west-1', 'eu-west-1']
  )) {
    candidates.push({
      label: `pooler ${region}`,
      host: `aws-0-${region}.pooler.supabase.com`,
      user: `postgres.${ref}`,
      port: 5432,
    });
  }

  return candidates;
}

const url = required('NEXT_PUBLIC_SUPABASE_URL');
const password = required('SUPABASE_DB_PASSWORD');

if (DRY_RUN) console.log('Dry run: connecting and validating, then stopping before DDL.');

/** Tries each candidate until one authenticates. Returns { client, label }. */
async function connect() {
  const attempts = [];
  for (const candidate of connectionCandidates(url)) {
    const client = new pg.Client({
      host: candidate.host,
      port: candidate.port,
      database: 'postgres',
      user: candidate.user,
      password,
      // Supabase presents a certificate that does not chain to a public root,
      // and the host name is the one that identifies the project. Verification
      // is done by the credential, not by the certificate.
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15_000,
    });
    try {
      await client.connect();
      return { client, label: candidate.label };
    } catch (error) {
      attempts.push(`${candidate.label}: ${error.code || error.message}`);
      try {
        await client.end();
      } catch {
        // Already closed.
      }
    }
  }
  console.error('Could not reach the database. Tried:');
  for (const attempt of attempts) console.error(`  ${attempt}`);
  process.exit(1);
}

const { client, label } = await connect();
console.log(`Connected via ${label}`);

try {
  const version = await client.query('select version()');
  console.log(`Connected: ${version.rows[0].version.split(',')[0]}`);

  const before = await client.query(`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public'
  `);
  console.log(`Tables in public before: ${before.rows[0].n}`);

  if (DRY_RUN) {
    console.log('Dry run complete. Nothing was written.');
    await client.end();
    process.exit(0);
  }

  const sql = readFileSync(MIGRATION, 'utf8');
  console.log(`Applying ${sql.split('\n').length} lines...`);

  const started = Date.now();
  await client.query(sql);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const after = await client.query(`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public'
  `);
  const rls = await client.query(`
    select count(*)::int as n
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  `);
  const policies = await client.query(`
    select count(*)::int as n from pg_policies where schemaname = 'public'
  `);

  console.log(`Applied in ${elapsed}s`);
  console.log(`  tables       ${after.rows[0].n}`);
  console.log(`  RLS enabled  ${rls.rows[0].n}`);
  console.log(`  policies     ${policies.rows[0].n}`);

  /*
   * Tell PostgREST to rebuild its schema view.
   *
   * Without this the tables exist but the API answers 500 for them, which looks
   * like a broken database and is not: PostgREST keeps a cached picture of the
   * schema and does not notice a table created by someone else. It reloads on
   * its own eventually, but "eventually" is minutes during which `pnpm db:check`
   * reports failures and any request against the new tables errors.
   */
  await client.query("notify pgrst, 'reload schema'");
  console.log('  PostgREST    schema reload notified');

  await client.end();
  console.log('\nNext: pnpm db:check, then pnpm db:settle.');
} catch (error) {
  console.error('\nFAILED:', error.message);
  if (error.code) console.error('code:', error.code);
  try {
    await client.end();
  } catch {
    // The connection is already gone; nothing to clean up.
  }
  process.exit(1);
}