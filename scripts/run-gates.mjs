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

import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  { id: 'check:responsive', script: 'check:responsive', server: true },
  { id: 'check:behaviour', script: 'check:behaviour', server: true },
  { id: 'probe:shape', script: 'probe:shape' },
  { id: 'probe:guardian', script: 'probe:guardian', server: true, env: { LIKO_VERIFY_BASE_URL: () => `http://127.0.0.1:${SERVER_PORT}` } },
  { id: 'verify:app', script: 'verify:app', server: true, env: { LIKO_VERIFY_BASE_URL: () => `http://127.0.0.1:${SERVER_PORT}` } },
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
 * named `check:*`, `probe:*`, `verify:*` and `db:*` sat outside it. A recorder
 * that says "N pass" reads as "everything passed", and it is not saying that.
 *
 * Declaring the omissions was the first half. The second half was to remove
 * three of them. `check:responsive` and `check:behaviour` need a server, and
 * nothing was wrong with serving one — see `ensureServer`. They were documented
 * rather than registered only because starting a server here was the job nobody
 * had done. `verify:app` was excluded while two of its assertions were red, and
 * the stated reason named a cause that turned out to be wrong: the export was
 * not being refused by `proxy.ts` at all. The session
 * cookie is `Secure`, so the check's own request was leaving anonymous and the
 * sign-in page was being read as a refusal. An exclusion is not a decision, it is
 * a debt, and a debt whose stated reason is wrong is worse than the red gate it
 * was hiding. Fixed, mutation-proved, and registered. The rest genuinely cannot
 * run here: they need a deployed site, or they write to one.
 *
 * So the remaining omissions are declared with a reason, and a script that is
 * neither registered nor listed here FAILS the recorder. That is the part that
 * matters: it is not enough to write down today's omissions, because the next
 * person to add a gate would otherwise widen the gap silently.
 *
 * Each reason below was read out of the script it names, not assumed.
 */
const EXCLUDED = {
  'probe:seats':
    'writes to the live project: it calls the security definer redeem_org_invite and cleans up after itself',
  'probe:gemini': 'a pre-flight provider diagnostic that overlaps probe:ai, which the recorder does run',
  'probe:ai:check': 'not a measurement: it replays the cache probe:ai has just written, and probe:ai already reports the result',
  'verify:saas': 'live HTTP against the deployed site, which needs a deployment rather than a checkout',
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
function invoke(exe, args, { timeout, viaCmd, env }) {
  const shared = {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    ...(env ? { env } : {}),
  };

  if (!IS_WIN || !viaCmd) return execFileSync(exe, args, shared);

  return execFileSync('cmd.exe', ['/d', '/s', '/c', [exe, ...args].join(' ')], shared);
}

function tail(text) {
  const lines = redact(text).split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.slice(-TAIL_LINES);
}

/*
 * A PRODUCTION SERVER FOR THE GATES THAT MEASURE RENDERED PAGES.
 *
 * `check:responsive` and `check:behaviour` open real pages in a real browser, so
 * they need a server serving THIS checkout. Excluding them was honest but it
 * cost coverage: they ran only when somebody remembered, and their rows in
 * PROJECT_STATUS.md sat at "not re-run 2026-10-17" while every row beside them
 * was re-measured. So the recorder starts one and these become ordinary gates.
 *
 * THE PORT IS DELIBERATELY NOT 3311. That is where `playwright.config.ts` puts
 * its own server, and a `pnpm start` left behind on 3311 by one of these very
 * checks is what made a later e2e run adopt a stale process and collapse
 * mid-suite. Distinct ports mean the two can never meet.
 *
 * One server serves both gates and is torn down when the run ends. `describeTarget`
 * still has the last word: it compares the served build id against
 * `.next/BUILD_ID` and fails rather than grading a stale process, so starting a
 * server here cannot quietly reintroduce the bug it prevents.
 */
const SERVER_PORT = 3317;

let server = null;

/** The last few hundred lines the server wrote to stderr, kept to explain a failure. */
let serverLog = [];

/**
 * Where the server's stderr goes.
 *
 * A FILE DESCRIPTOR, NOT AN EVENT HANDLER. This recorder is synchronous from end
 * to end, so a `server.stderr.on('data', ...)` handler would never be called
 * before the evidence file is written -- the event loop never turns. The log
 * would be empty, the record would carry an empty `serverLog`, and the fix would
 * look like it worked while proving nothing. Handing the child a real file
 * descriptor has the operating system do the writing, which needs no event loop.
 */
let serverLogPath = join(tmpdir(), 'liko-gates-server-stderr.log');
let serverLogFd = null;

/** The build id the run started serving, compared against the one on disk at the end. */
let buildAtStart = null;

/**
 * The id of the build currently on disk, or null if there is none.
 *
 * `.next` is gitignored, so the tree-state check cannot see it. A second process
 * working in the same checkout can replace it without touching a single tracked
 * file, and a server already serving it will start answering 500 as its chunks
 * are swapped underneath it. That is not hypothetical: it happened during a full
 * run here, when a concurrent `next build` in the same working directory replaced
 * the build between two gates, and three gates went red for reasons that had
 * nothing to do with the product.
 */
function readBuildId() {
  try {
    return readFileSync(join(ROOT, '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    return null;
  }
}

function serverEnv() {
  /*
   * `LIKO_DATA_MODE=supabase`, DELIBERATELY AGAINST `.env.local`.
   *
   * `.env.local` says `fixtures`, and the e2e suite inherits that — its own
   * webServer sets a session secret and a rate-limit override and nothing else.
   * But a gate that touches data cannot use fixtures: pointed at a
   * fixture-mode server, `verify:app` reports **41 passed, 16 failed**, and one
   * of those reads `writing attendance into another teacher's class is refused —
   * answered 200`, which looks exactly like a cross-tenant security hole and is
   * an artefact of the wrong mode. `probe:guardian` fails the same way.
   *
   * Supabase is also the mode production runs in, so the layout and no-JS gates
   * are better off on it: they then measure the server a real request reaches.
   */
  return { ...process.env, PORT: String(SERVER_PORT), LIKO_DATA_MODE: 'supabase' };
}

/** Start the server and wait for it to answer, without throwing. */
function ensureServer() {
  if (server) return { ok: true };

  const buildId = join(ROOT, '.next', 'BUILD_ID');
  if (!existsSync(buildId)) {
    return {
      ok: false,
      reason:
        'no .next/BUILD_ID in this checkout, so the rendered-page gates have nothing to ' +
        'compare a server against. They are ordered after `e2e`, which builds; run the ' +
        'recorder rather than a single gate in isolation.',
    };
  }

  /*
   * The build this run is about to serve, recorded before it starts serving.
   * `.next` is gitignored, so a dirty tree says nothing about it, and a second
   * process in the same working directory can replace it mid-run.
   */
  buildAtStart = readBuildId();

  const bin = join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  /*
   * THE SERVER'S ERROR OUTPUT IS KEPT, NOT DISCARDED.
   *
   * This was `stdio: 'ignore'`, which threw away the one thing that explains a
   * 500. A gate that reported "Internal Server Error" gave the reader no cause
   * at all, and the cause had to be reconstructed by hand -- by starting a
   * second server and hoping it reproduced, which it did not, because the cause
   * was that the build directory changed underneath the running server.
   */
  try {
    serverLogFd = openSync(serverLogPath, 'w');
  } catch {
    serverLogFd = null;
  }
  server = spawn(process.execPath, [bin, 'start', '--port', String(SERVER_PORT)], {
    cwd: ROOT,
    env: serverEnv(),
    stdio: ['ignore', 'ignore', serverLogFd ?? 'ignore'],
  });

  /*
   * Readiness is polled inside one child so this stays synchronous. `next start`
   * binds the port well after the process exists, so spawning is not readiness.
   *
   * IT SETS `process.exitCode` AND RETURNS RATHER THAN CALLING `process.exit()`.
   * Calling exit from inside a fetch callback on Windows trips a libuv assertion
   * (`UV_HANDLE_CLOSING`) that kills the child before it can report anything,
   * which looks exactly like "the server never answered" and was, for one
   * baffling run, believed to be a server problem. Letting the loop drain and
   * exit on its own costs nothing and does not assert.
   */
  const probe = `
    const deadline = Date.now() + 60000;
    const tick = () => {
      let code = 1;
      fetch('http://127.0.0.1:${SERVER_PORT}/_next/static/' +
            require('node:fs').readFileSync('${buildId.replace(/\\/g, '\\\\')}', 'utf8').trim() +
            '/_buildManifest.js')
        .then((r) => { code = r.ok ? 0 : 1; })
        .catch(() => { code = 1; })
        .finally(() => {
          if (code === 0 || Date.now() > deadline) {
            process.exitCode = code;
            return;
          }
          setTimeout(tick, 500);
        });
    };
    tick();
  `;

  try {
    execFileSync(process.execPath, ['-e', probe], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90_000,
    });
    return { ok: true };
  } catch (error) {
    stopServer();
    const why = `${error.stderr ?? ''}${error.stdout ?? ''}`
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .slice(-4)
      .join(' | ');
    return {
      ok: false,
      reason:
        `the server never answered on port ${SERVER_PORT}` +
        (why ? ` — ${redact(why)}` : ` (${String(error.message ?? error).slice(0, 200)})`),
    };
  }
}

function stopServer() {
  if (serverLogFd !== null) {
    try {
      closeSync(serverLogFd);
    } catch {
      /* already closed */
    }
    serverLogFd = null;
  }
  if (!server) return;
  const pid = server.pid;
  try {
    // `next start` runs under a shell on Windows, so the children have to go too.
    if (IS_WIN && pid) execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
  } catch {
    /* already gone, which is the state we wanted anyway */
  }
  server = null;
}

process.on('exit', stopServer);

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

  const env = { ...(gate.server ? serverEnv() : {}) };
  // A gate may name the target it should measure; a value may be a function so it
  // can depend on SERVER_PORT rather than repeating the number in two places.
  for (const [key, value] of Object.entries(gate.env ?? {})) {
    env[key] = typeof value === 'function' ? value() : value;
  }
  if (gate.server) {
    const ready = ensureServer();
    if (!ready.ok) {
      return { status: 'fail', exit: 1, ms: Date.now() - started, tail: [ready.reason] };
    }
  }

  try {
    const { exe, args, viaCmd } = launcherFor(command);
    const out = invoke(exe, args, { timeout: gate.live ? 180_000 : 900_000, viaCmd, env });
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
 * What the gates actually measured, as distinct from what they are labelled.
 *
 * WHY THIS EXISTS. The gates run the working tree. `commit` is `HEAD`. Those are
 * the same thing only when nothing is uncommitted, and the recorder never said so,
 * so a run over edited-and-staged code was filed under the previous commit and
 * read afterwards as proof about that commit. It happened here: a run recorded at
 * `312da33` was measuring a tree that contained four uncommitted files, none of
 * them in that commit.
 *
 * Untracked files count. `src/` compiles untracked modules into the build, so an
 * untracked `.tsx` is part of what `e2e` and `verify:app` exercised, which means
 * "HEAD" is not merely imprecise for a dirty tree, it can name a version that
 * never existed.
 *
 * WHY THE CHANGES ARE SPLIT INTO TWO LISTS. A dirty tree is not automatically an
 * inexact label. A stray note at the repository root cannot change what any gate
 * measures, and if every run printed a warning for it, the warning would be
 * noise that people learn to skip -- which is the fate of every check that cries
 * wolf. So the paths are sorted by whether they can reach the build, and only the
 * ones that can are allowed to raise an alarm. The split is deliberately a
 * whitelist of directories and root config files, because a blacklist of "safe"
 * paths would have to be right about every new file, and a wrong blacklist is
 * silent while a wrong whitelist is loud.
 */
const MATERIAL_ROOTS = ['src', 'e2e', 'scripts', 'supabase', 'tests', 'public'];
const MATERIAL_ROOT_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'playwright.config.ts',
  'vitest.config.ts',
  'postcss.config.mjs',
  'next.config.ts',
  'next.config.mjs',
  'vercel.json',
];

function isMaterial(path) {
  const normalised = path.replace(/\\/g, '/');
  const head = normalised.split('/')[0];
  if (MATERIAL_ROOT_FILES.includes(normalised)) return true;
  if (!MATERIAL_ROOTS.includes(head)) return false;
  /*
   * `scripts/` holds gate scripts, so anything there matters. But a scratch file
   * another process left behind does not, and a worktree or a build directory
   * under `src/` is not source either.
   */
  if (head === 'scripts' && /\.(mjs|cjs|js|ts)$/.test(normalised)) return true;
  if (head === 'scripts') return false;
  return true;
}

function treeState() {
  let porcelain;
  try {
    porcelain = execFileSync('git', ['status', '--porcelain'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  } catch (error) {
    return { clean: null, count: 0, paths: [], error: String(error.message ?? error).slice(0, 200) };
  }

  const paths = porcelain
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => line.slice(3).trim());

  const material = paths.filter(isMaterial);
  const immaterial = paths.filter((p) => !isMaterial(p));

  return {
    clean: paths.length === 0,
    count: paths.length,
    material,
    immaterial,
    /*
     * `exact` is the question the evidence record actually needs answered: does
     * the commit label describe the code that was measured? It is not the same
     * as "the tree is clean".
     */
    exact: material.length === 0,
  };
}

const tree = treeState();

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

/*
 * Said before the gates run, not after. A reader who sees this line knows the
 * commit label on the evidence record is a label and not a measurement, and can
 * decide whether to trust the run before reading a single result.
 *
 * Only a change that can reach the build is allowed to raise it. A stray file
 * that cannot change what a gate measures is reported and ignored, because a
 * warning that fires on every run is a warning nobody reads.
 */
if (tree.exact === false) {
  process.stdout.write(
    `WARNING  ${tree.material.length} changed path(s) can reach the build, so ${commit} is a\n` +
      `         label on this run and not a statement about the code that was tested.\n` +
      tree.material.map((p) => `           ${p}\n`).join('') +
      (tree.immaterial.length
        ? `         ${tree.immaterial.length} further path(s) cannot reach the build and are not listed: ${tree.immaterial.join(', ')}\n`
        : '') +
      '\n',
  );
}

const results = {};
for (const gate of gates) {
  const result = run(gate);
  results[gate.id] = { ...result, at: new Date().toISOString() };
  const mark = { pass: 'ok  ', blocked: 'BLOCK', fail: 'FAIL', error: 'ERR ' }[result.status];
  process.stdout.write(`${mark}  ${gate.id.padEnd(16)} exit ${result.exit}  ${(result.ms / 1000).toFixed(1)}s\n`);
}

stopServer();

/*
 * The server's own log, read from the file the operating system wrote for it.
 * Read after `stopServer`, because that is what closes the descriptor and
 * guarantees the bytes are all there.
 */
try {
  if (existsSync(serverLogPath)) {
    serverLog = readFileSync(serverLogPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .slice(-60);
  }
} catch {
  serverLog = [];
}

/*
 * Did the build change underneath the run?
 *
 * `.next` is gitignored, so the tree check above cannot see it, and the server
 * reads its chunks lazily from disk. A concurrent `next build` in the same
 * working directory replaces the whole directory while a server is serving it,
 * and the server then answers 500 for pages whose chunks were swapped.
 *
 * That is not hypothetical. It happened during a full run here: three gates went
 * red with "Internal Server Error", the tree was clean the whole time, and the
 * only trace was that the build id on disk at the end was not the one the server
 * had started on. A red gate that was never the product's fault is the same
 * failure as a wrong cause written into a document -- it costs the next person
 * hours and sends them to open the wrong file.
 *
 * So the run is CONTAMINATED, which is not the same as failed and not the same
 * as passed: the measurements are real but they describe a build that no longer
 * exists, and they cannot be read as a verdict on this commit.
 */
const buildAtEnd = readBuildId();
const buildChanged = Boolean(buildAtStart) && buildAtEnd !== buildAtStart;
const contaminated = buildChanged;

if (contaminated) {
  process.stdout.write(
    `CONTAMINATED  the build changed during this run: served ${buildAtStart}, on disk now ${buildAtEnd}.\n` +
      '             Something rebuilt .next while these gates were running, so the results below\n' +
      '             describe a build that no longer exists and cannot be read as a verdict on\n' +
      `             ${commit}. Re-run the recorder on its own.\n\n`,
  );
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
  tree,
  build: { atStart: buildAtStart, atEnd: buildAtEnd, changed: buildChanged },
  contaminated,
  partial: Boolean(only),
  gateCount: gates.length,
  node: process.version,
  summary: {
    pass: Object.values(results).filter((r) => r.status === 'pass').length,
    blocked: Object.values(results).filter((r) => r.status === 'blocked').length,
    fail: Object.values(results).filter((r) => r.status === 'fail').length,
    error: Object.values(results).filter((r) => r.status === 'error').length,
  },
  results,
  lastPassing,
  /*
   * The server's own error output, kept only when something went wrong. A gate
   * that reported "Internal Server Error" without the server's log is a report
   * with no cause in it, and reconstructing the cause by hand is the expensive
   * part.
   */
  serverLog: serverLog.length ? serverLog.join('\n') : undefined,
  note:
    'Recorded by scripts/run-gates.mjs. A blocked gate measured nothing and never overwrites a previous pass; see lastPassing. ' +
    'The gates run the WORKING TREE, so `commit` describes only what was checked out: read `tree` for whether that commit is also what was measured. ' +
    '`build` records the build the server served, and `contaminated` says whether that build changed while the run was in flight.',
};

/*
 * A DIAGNOSTIC RUN MUST NOT EVICT A FULL RUN.
 *
 * The history was capped at thirty records and the cap was applied to all runs
 * alike, so eight `--only=typecheck` probes pushed two full-suite runs out of
 * the file. That is the wrong way round: the file is the project's proof, and a
 * one-gate diagnostic is worth less than a full run of every gate. The two
 * records lost that way cannot be reconstructed from the file afterwards.
 *
 * So full runs and partial runs are counted separately, and a partial run is
 * dropped before a full one is. The full-run cap is the thirty the file has
 * always had; the partial runs get five slots of their own on top, so a
 * diagnostic can never push a full run out. Records written before this
 * distinction existed have no `partial` field and count as full, which is the
 * right reading of them -- the registry grew over time, so an older run with
 * fewer results was still every gate that existed then.
 */
const KEEP_FULL = 30;
const KEEP_PARTIAL = 5;

const all = [...(previous.runs ?? []), record];
const fullRuns = all.filter((r) => !r.partial);
const partialRuns = all.filter((r) => r.partial);
const kept = new Set([...fullRuns.slice(-KEEP_FULL), ...partialRuns.slice(-KEEP_PARTIAL)]);
previous.runs = all.filter((r) => kept.has(r));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(previous, null, 2)}\n`, 'utf8');

process.stdout.write(`\nwrote ${OUT}\n`);
process.stdout.write(
  `${record.summary.pass} pass, ${record.summary.blocked} blocked, ${record.summary.fail} fail, ${record.summary.error} error\n`,
);

if (contaminated) {
  process.stdout.write(
    'this run is CONTAMINATED, not a verdict: the build it served no longer exists on disk, so its results\n' +
      'describe a build that was replaced mid-flight. Re-run the recorder on its own to get a real answer.\n',
  );
  process.exitCode = 1;
} else if (record.summary.blocked + record.summary.fail + record.summary.error > 0) {
  process.stdout.write(
    'a blocked gate is not a pass and a failing gate is not either: this run did not prove everything\n',
  );
  process.exitCode = 1;
}