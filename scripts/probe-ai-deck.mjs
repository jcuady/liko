/**
 * Does a teacher's prompt actually become a deck?
 *
 * WHY THIS EXISTS AND NOT AN END-TO-END TEST. The first version of this proof
 * was a Playwright test that typed a prompt and clicked the button. It failed on
 * a 48 second timeout that said nothing about this codebase, because it had made
 * the suite depend on a third party being up, inside its quota, and fast. A test
 * that fails for somebody else's reasons is a test people learn to ignore.
 *
 * So the live call is here, where a slow answer is an expected cost, and the
 * end-to-end suite proves only that the product is wired. The split matches the
 * one already used for the seat limit: the gate that watches the thing refuse
 * lives beside the thing, not inside the general suite.
 *
 * Run: node --env-file=.env.local --experimental-strip-types scripts/probe-ai-deck.mjs
 */

const { OUTLINE_INSTRUCTION } = await import('./ai-prompt-hint.mjs');
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Where the live response is written.
 *
 * The validation runs as a vitest test rather than here, because
 * `buildDeckFromOutline` imports through the `@/` alias that Node's type
 * stripper cannot resolve. Splitting it this way means the LIVE answer is
 * checked by the REAL validator, with no second copy of the rules to drift.
 */
const CACHE = join(tmpdir(), 'liko-ai-live-response.json');
export const LIVE_RESPONSE_PATH = CACHE;

const KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.5-flash';

const results = [];
function check(name, ok, detail = '') {
  results.push({ ok });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}\n`);
}

if (!KEY) {
  process.stdout.write('FAIL  no GEMINI_API_KEY in the environment\n');
  process.exit(1);
}

const SYSTEM =
  'You write classroom slide decks. You answer only in the requested JSON shape, ' +
  'you never wrap the answer in prose or a code fence, and you never pad the deck ' +
  'with slides the teacher did not ask for.';

// A real teacher prompt, not "hello". A trivial prompt produces a trivial deck and
// proves nothing about whether the path holds together.
const PROMPT = 'Six slides on covalent bonding for Year 10 chemistry, ending with two worked examples.';

try {
  const started = Date.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\n${OUTLINE_INSTRUCTION}` }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    process.stdout.write(
      `FAIL  the provider answered ${response.status}: ${String(body?.error?.message ?? '').slice(0, 240)}\n`,
    );
    if (response.status === 429) {
      process.stdout.write('      429 is a quota or rate refusal, which is a NORMAL state on a free tier.\n');
    }
    process.exit(1);
  }

  const body = await response.json();
  const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const elapsed = Date.now() - started;

  check('the provider answered', Boolean(raw.trim()), `${Math.round(elapsed / 100) / 10}s`);
  check(
    'it reported token usage, which is what the quota is billed against',
    typeof body?.usageMetadata?.candidatesTokenCount === 'number',
    `prompt ${body?.usageMetadata?.promptTokenCount ?? '?'}, output ${body?.usageMetadata?.candidatesTokenCount ?? '?'}`,
  );


  /*
   * Hand the raw answer to the real validator.
   *
   * Everything that decides whether a model response is usable lives in
   * `buildDeckFromOutline`, behind an alias Node cannot resolve. Checking it
   * here would mean a second copy of the rules, and a second copy is a second
   * thing to be wrong. So the response is written out and
   * `src/lib/slides/live-response.test.ts` runs the REAL function over it.
   */
  mkdirSync(tmpdir(), { recursive: true });
  writeFileSync(CACHE, JSON.stringify({ raw, elapsedMs: elapsed, usage: body?.usageMetadata ?? null }, null, 2));
  process.stdout.write(`      wrote ${CACHE}\n`);
  process.stdout.write(`      now run: pnpm exec vitest run src/lib/slides/live-response.test.ts\n`);
} catch (error) {
  check('the probe ran to completion', false, String(error).slice(0, 200));
}

const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`\n${results.length - failed} passed, ${failed} failed\n`);

/*
 * Set the code and let Node exit on its own.
 *
 * `process.exit()` while undici still holds the response socket aborts the
 * handle mid-close, and libuv asserts on it. That turns a green run into a
 * non-zero exit, which is the fastest way to teach people to ignore the gate.
 */
process.exitCode = failed === 0 ? 0 : 1;
