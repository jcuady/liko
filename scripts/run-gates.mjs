/**
 * Run every gate and record what actually happened, durably.
 *
 * WHY THIS EXISTS. Gate results were living only in a chat transcript. A
 * transcript is not evidence: it cannot be re-read by a verifier who has no
 * database credentials and no time for a three minute Playwright run, and it
 * cannot be diffed between one run and the next. So the honest result of a real
 * run went somewhere nobody could check it.
 *
 * WHAT IT WRITES. `docs/evidence/gates.json`, which records each gate's real
 * exit code, a short redacted tail of its output, and whether it passed, failed
 * or was blocked.
 *
 * WHY BLOCKED IS NOT FAILED, AND WHY IT IS NOT ALLOWED TO REPLACE A PASS.
 * `probe:ai` depends on a third party's free tier. When that tier is exhausted
 * the gate measures nothing, and a blocked run is not a weaker measurement, it
 * is no measurement. Writing it over a previous pass would delete the proof of
 * the last run that actually proved something, which is the same failure as a
 * probe that overwrites good evidence with a blocked run. So a blocked or failed
 * gate leaves any previous pass for that gate intact under `lastPassing`, and the
 * run as a whole is still reported as not clean.
 *
 * Run: node --env-file=.env.local scripts/run-gates.mjs
 * Optional: node scripts/run-gates.mjs --only lint,unit   to run a subset.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { redact } from './lib/redact.mjs';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs', 'evidence', 'gates.json');

const SCRIPTS = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {};

/**
 * How to actually run one package script.
 *
 * Two shapes exist in this repository and they need genuinely different
 * launchers, which is worth spelling out because getting this wrong produced
 * four gates failing in zero milliseconds, twice, in two different ways.
 *
 * A script beginning `node ` is spawned DIRECTLY. `node.exe` is a native
 * executable, `execFileSync` spawns it without a shell, and the
 * `--env-file` flag belongs to it. Its path contains a space on a default
 * Windows install (`C:\Program Files\nodejs\node.exe`), which is fine when it
 * is never handed to cmd, and is not fine when it is: routing it through
 * cmd.exe unquoted gave a command called `\Program`, and quoting it gave a
 * command called `"C:\Program`, with the quotes included.
 *
 * Anything else names a binary in `node_modules/.bin`, which on Windows is a
 * `.cmd` batch shim that `execFileSync` refuses (`spawnSync EINVAL`). Those do
 * need cmd.exe. Their arguments are unquoted and checked for shell
 * metacharacters, because quoting them is what was also wrong: `pnpm.cmd
 * "lint"` is not the lint script, it is a request to pnpm to execute a command
 * called `lint`, and cmd then falls through to whatever else named `lint` is
 * on PATH. That failure was recorded as this project's lint gate failing.
 */
function launcherFor(command) {
  const argv = command.trim().split(/\s+/);

  if (argv[0] === 'node') {
    return { exe: process.execPath, args: argv.slice(1), viaCmd: false };
  }

  for (const arg of argv) {
    if (/[\s"'&|<>^%]/.test(arg)) {
      throw new Error(
        `gate command ${JSON.stringify(command)} contains an argument that cannot be ` +
          'passed safely without quoting. This launcher does not quote, on purpose.',
      );
    }
  }

  return { exe: 'pnpm.cmd', args: ['exec', ...argv], viaCmd: true };
}

/**
 * How much of each gate's output to keep. Enough to diagnose, not enough to bloat.
 *
 * THIS WAS 12 LINES, AND THAT WAS A DEFECT RATHER THAN A SAVING. A failing e2e
 * gate runs 197 tests, and the summary sits below roughly forty lines of passing
 * output. Every failing run recorded the last twelve lines, which were the
 * trace.zip path and "1 failed", so the recorded evidence never once contained
 * the assertion that failed. An intermittent slide-editor failure went four runs
 * undiagnosed because of it: the file could say which test had failed, but not
 * what it had said.
 *
 * 60 is chosen because it covers a Playwright failure block, which runs to about
 * forty lines including the error, the locator, the call log and the source
 * excerpt, plus the summary beneath it. It is a cap rather than a whole log, so
 * a gate that prints thousands of lines still cannot bloat the file.
 */
const TAIL_LINES = 60;

/**
 * Gates, by the package.json script that defines them.
 *
 * The recorder reads each script's own command out of `package.json` and runs
 * that verbatim, rather than keeping its own copy of the command line. Two
 * earlier versions did keep their own, and both were wrong in ways that looked
 * exactly like a broken product: `pnpm --env-file=.env.local db:check` passes
 * the flag to pnpm, which rejects it with "Unknown option: 'env-file'", and the
 * recorder filed that as three failing gates. The flag belongs to node, which is
 * why the package scripts say `node --env-file=.env.local script.mjs`.
 *
 * `live` marks a gate that depends on a third party, where a failure is a
 * blocked measurement rather than a broken product.
 */
const GATES = [
  { id: 'typecheck', script: 'typecheck' },
  { id: 'lint', script: 'lint' },
  { id: 'unit', script: 'test' },
  { id: 'check:sql', script: 'check:sql' },
  { id: 'check:redaction', script: 'check:redaction' },
  { id: 'check:primitives', script: 'check:primitives' },
  { id: 'e2e', script: 'e2e' },
  { id: 'db:check', script: 'db:check' },
  { id: 'db:settle', script: 'db:settle' },
  { id: 'probe:files', script: 'probe:files' },
  { id: 'probe:ai', script: 'probe:ai', live: true },
];

/**
 * A gate is BLOCKED when the thing it depends on is unavailable, rather than the
 * gate itself being wrong. Only the live AI gate qualifies: everything else
 * failing is a real failure and must be recorded as one.
 */
const BLOCKED = new Set(['probe:ai']);

/**
 * Every gate-shaped script in package.json is either in GATES or listed here.
 *
 * WHY THIS EXISTS. The recorder reported "11 pass" while six further scripts
 * named `check:*`, `probe:*`, `verify:*` and `db:*` sat outside it. Two of them
 * are layout and no-JS behaviour gates that pass, and because nothing ran them
 * automatically their rows in PROJECT_STATUS.md sat at "not re-run 2026-10-17"
 * while everything beside them was re-verified. A recorder that says "11 pass"
 * reads as "everything passed", and it is not saying that.
 *
 * So the omissions are declared rather than left implicit, and a script that is
 * neither registered nor listed here FAILS the recorder. That is the part that
 * matters: it is not enough to write down today's omissions, because the next
 * person to add a gate would otherwise widen the gap silently.
 *
 * Each reason below was read out of the script it names, not assumed.
 */
const EXCLUDED = {
  'check:responsive':
    'needs a server on 3311 serving this checkout: pnpm build && pnpm start --port 3311',
  'check:behaviour': 'needs the same server on 3311 as check:responsive',
  'probe:seats':
    'writes to the live project: it calls the security definer redeem_org_invite and cleans up after itself',
  'probe:shape':
    'needs the live database, and proves something check:sql cannot: that the constraint still on the server is the one written',
  'probe:gemini': 'a pre-flight provider diagnostic that overlaps probe:ai, which the recorder does run',
  'probe:ai:check': 'not a measurement: it replays the cache probe:ai has just written, and probe:ai already reports the result',
  'verify:saas': 'live HTTP against the deployed site, which needs a deployment rather than a checkout',
  'verify:app': 'needs a running server; this is the gap probe:guardian was written to cover for guardians',
  'probe:guardian': 'needs a running server or a live host; set LIKO_VERIFY_BASE_URL to choose one',
  'db:apply': 'an operation, not a measurement: it writes the migration',
};

/**
 * A script name the recorder treats as gate-shaped. Deliberately narrow: a bare
 * `test` or `build` is covered by GATES already, and anything not matching is
 * not obliged to justify itself.
 */
const GATE_SHAPED = /^(check|probe|verify|db):/;

function unaccountedGates() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const registered = new Set(GATES.map((g) => g.script));
  return Object.keys(pkg.scripts ?? {})
    .filter((name) => GATE_SHAPED.test(name))
    .filter((name) => !registered.has(name) && !EXCLUDED[name])
    .sort();
}

const IS_WIN = process.platform === 'win32';

/** A shell is used only where a batch shim makes one unavoidable. */
function invoke(exe, args, { timeout, viaCmd }) {
  const shared = {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  };

  if (!IS_WIN || !viaCmd) return execFileSync(exe, args, shared);

  return execFileSync('cmd.exe', ['/d', '/s', '/c', [exe, ...args].join(' ')], shared);
}

function tail(text) {
  const lines = redact(text).split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.slice(-TAIL_LINES);
}

function run(gate) {
  const started = Date.now();
  const command = SCRIPTS[gate.script];

  if (!command) {
    return {
      status: 'error',
      exit: 1,
      ms: 0,
      tail: [`package.json has no "${gate.script}" script, so there is no gate to run`],
    };
  }

  try {
    const { exe, args, viaCmd } = launcherFor(command);
    const out = invoke(exe, args, { timeout: gate.live ? 180_000 : 900_000, viaCmd });
    return { status: 'pass', exit: 0, ms: Date.now() - started, tail: tail(out) };
  } catch (error) {
    const combined = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    const exit = typeof error.status === 'number' ? error.status : 1;

    /*
     * A launcher that never ran and a gate that failed are different things.
     * An empty tail on a zero millisecond gate means this recorder never
     * started the gate, which is the one outcome it must not file as a result
     * about the product.
     */
    const neverRan = typeof error.status !== 'number' && !combined.trim();
    return {
      status: neverRan ? 'error' : BLOCKED.has(gate.id) ? 'blocked' : 'fail',
      exit,
      ms: Date.now() - started,
      tail: neverRan
        ? [`the gate could not be started at all: ${String(error.message ?? error).slice(0, 300)}`]
        : tail(combined),
    };
  }
}

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()) : null;
const gates = only ? GATES.filter((g) => only.includes(g.id)) : GATES;

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim();

/**
 * Read the previous evidence, tolerating a byte order mark.
 *
 * `JSON.parse` refuses a leading U+FEFF outright, and this file is small enough
 * that a human will eventually hand-edit it. Windows PowerShell 5.1 makes that
 * near-certain: `Set-Content -Encoding UTF8` writes a BOM, and the result was an
 * unhandled SyntaxError that killed the recorder before it produced any
 * evidence at all. The worst possible failure for the one script whose entire
 * job is to write down what happened.
 */
function readEvidence() {
  if (!existsSync(OUT)) return { runs: [] };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(OUT, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    process.stdout.write(
      `could not read ${OUT}: ${String(error.message ?? error)}\n` +
        'starting a fresh history rather than refusing to record this run\n',
    );
    return { runs: [] };
  }

  return Array.isArray(parsed?.runs) ? parsed : { runs: [] };
}

const previous = readEvidence();

/*
 * Accounted for before anything runs. A gate script that is neither registered
 * nor excluded makes the whole record misleading, and finding that out only
 * after eight minutes of gates would be the worst possible moment.
 */
const unaccounted = unaccountedGates();
if (unaccounted.length > 0) {
  process.stderr.write(
    `FAIL  unaccounted gate scripts\n` +
      unaccounted.map((n) => `        ${n}\n`).join('') +
      `      These are named check:/probe:/verify:/db: so they read as gates, but they\n` +
      '      are in neither GATES nor EXCLUDED in scripts/run-gates.mjs. Register one, or\n' +
      '      exclude it with the reason it cannot be recorded. Silence is not a reason.\n',
  );
  process.exit(1);
}

process.stdout.write(
  `running ${gates.length} gate(s) at ${commit} — ${Object.keys(EXCLUDED).length} further gate-shaped script(s) excluded, each with a stated reason\n\n`,
);

const results = {};
for (const gate of gates) {
  const result = run(gate);
  results[gate.id] = { ...result, at: new Date().toISOString() };
  const mark = { pass: 'ok  ', blocked: 'BLOCK', fail: 'FAIL', error: 'ERR ' }[result.status];
  process.stdout.write(`${mark}  ${gate.id.padEnd(12)} exit ${result.exit}  ${(result.ms / 1000).toFixed(1)}s\n`);
}

/*
 * A blocked or failed gate must not delete the proof of a previous pass. The
 * last run that actually measured this gate is kept separately and reported, so
 * the record shows both "it worked on Tuesday" and "it measured nothing today"
 * rather than silently keeping whichever is more convenient.
 */
const lastPassing = {};
for (const [id, result] of Object.entries(results)) {
  if (result.status === 'pass') continue;

  const prior = [...previous.runs].reverse().find((run) => run.results[id]?.status === 'pass');
  if (prior) {
    lastPassing[id] = { ...prior.results[id], recordedInRun: prior.at, commit: prior.commit };
  }
}

const record = {
  at: new Date().toISOString(),
  commit,
  node: process.version,
  summary: {
    pass: Object.values(results).filter((r) => r.status === 'pass').length,
    blocked: Object.values(results).filter((r) => r.status === 'blocked').length,
    fail: Object.values(results).filter((r) => r.status === 'fail').length,
    error: Object.values(results).filter((r) => r.status === 'error').length,
  },
  results,
  lastPassing,
  note:
    'Recorded by scripts/run-gates.mjs. A blocked gate measured nothing and never overwrites a previous pass; see lastPassing.',
};

previous.runs = [...(previous.runs ?? []), record].slice(-30);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(previous, null, 2)}\n`, 'utf8');

process.stdout.write(`\nwrote ${OUT}\n`);
process.stdout.write(
  `${record.summary.pass} pass, ${record.summary.blocked} blocked, ${record.summary.fail} fail, ${record.summary.error} error\n`,
);

if (record.summary.blocked + record.summary.fail + record.summary.error > 0) {
  process.stdout.write(
    'a blocked gate is not a pass and a failing gate is not either: this run did not prove everything\n',
  );
  process.exitCode = 1;
}