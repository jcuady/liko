/**
 * Confirms the tightened code-block constraint is what the database is actually
 * enforcing. `check:sql` parses the file and `db:apply` reports success; neither
 * says the constraint that survived is the one that was written, and a
 * constraint silently left at its first version is a constraint that permits
 * shapes the page cannot print.
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
  const { rows } = await client.query(
    `select pg_get_constraintdef(oid) as def
       from pg_constraint
      where conrelid = 'public.assessments'::regclass
        and conname = 'assessments_id_format_shape'`,
  );
  const def = rows[0]?.def ?? '';
  check('the shape constraint exists', def.length > 0, def.slice(0, 200));
  // Every `<= n` in the definition, not the first one. Showing only the first
  // printed `id_format_groups <= 3` under a check named "caps the block at
  // twelve codes", which is a report that looks wrong while the check is right.
  const caps = [...def.matchAll(/<= *(\d+)/g)].map((m) => m[1]);
  check('it caps the block at twelve codes', /<= *12/.test(def), `caps present: ${caps.join(', ')}`);

  const { rows: orgCols } = await client.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'organizations'
        and column_name in ('country_code','sector','grade_min','grade_max','enrolment',
                            'timezone','contact_name','contact_role',
                            'verification_status','verified_at')`,
  );
  check(
    'every institutional profile column is present',
    orgCols.length === 10,
    `${orgCols.length}/10`,
  );

  const { rows: bad } = await client.query(
    `select count(*)::int as n from public.organizations
      where (verification_status = 'verified') <> (verified_at is not null)`,
  );
  check('verification status and its timestamp agree on every row', bad[0].n === 0, `${bad[0].n} incoherent`);

  const { rows: span } = await client.query(
    `select count(*)::int as n from public.organizations
      where grade_min is not null and grade_max is not null and grade_min > grade_max`,
  );
  check('no organisation has an upside-down grade span', span[0].n === 0, `${span[0].n}`);
} finally {
  await client.end();
}

process.stdout.write(`\n${failed === 0 ? 'all constraints confirmed' : `${failed} failed`}\n`);
process.exit(failed === 0 ? 0 : 1);