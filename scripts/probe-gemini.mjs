/**
 * Does the configured provider actually answer?
 *
 * Run before building anything that depends on it. A key that is wrong, revoked,
 * quota-exhausted or from the wrong project produces three very different
 * failures, and each of them changes what the product should say to a teacher:
 * a bad key is a setup error, an exhausted free tier is a normal state with a
 * visible meter, and a network failure is neither.
 *
 * The key is read from the environment and never printed. Only its shape and
 * the provider's verdict are reported.
 *
 * THIS PROBES THE MODEL THE PRODUCT USES.
 *
 * It used to pick its own model by scanning the list for any name containing
 * "flash", which made it answer a different question from the one it exists to
 * answer. The product calls `GEMINI_MODEL`; a probe that quietly tests some
 * other model reports the health of a component nobody ships. It now probes the
 * product's model first and only then reports what else the key can reach, so
 * a green run means the thing that actually runs is working.
 *
 * Run: node --env-file=.env.local scripts/probe-gemini.mjs
 */

const KEY = process.env.GEMINI_API_KEY;

/**
 * The model `src/lib/ai/gemini.ts` calls. Duplicated here on purpose: a probe
 * that imported the module would drift from the product in the one direction
 * that matters, since a change to the product's model would silently update the
 * probe too and it would keep reporting the old model's health.
 */
const PRODUCT_MODEL = 'gemini-3.5-flash';

/** Preference order, newest first. Never reordered without re-probing. */
const FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

/**
 * `process.exitCode`, never `process.exit()`.
 *
 * This script holds a keep-alive socket to the provider. Calling `process.exit`
 * mid-flight tears the handle down and Node aborts on
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, so a genuine probe
 * failure used to exit on a crash rather than on its own verdict, and the
 * useful FAIL line scrolled past a Windows crash dump.
 */
const fail = (message) => {
  process.stdout.write(`${message}\n`);
  process.exitCode = 1;
};

if (!KEY) {
  fail('FAIL  no GEMINI_API_KEY in the environment');
} else {
  await run();
}

async function run() {
  process.stdout.write(`key present, length ${KEY.length}, shape ${KEY.slice(0, 2)}…\n`);

  let visible = [];
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(KEY)}`,
    );
    const listBody = await listRes.json().catch(() => null);

    if (listRes.ok && listBody?.models) {
      visible = listBody.models.map((m) => m.name);
      process.stdout.write(`PASS  the key is accepted; ${visible.length} models visible\n`);
    } else {
      fail(
        `FAIL  model list refused: ${listRes.status} ${String(listBody?.error?.message ?? 'no detail').slice(0, 200)}`,
      );
      return;
    }
  } catch (error) {
    fail(`FAIL  the provider could not be reached: ${String(error).slice(0, 200)}`);
    return;
  }

  if (visible.length === 0) {
    fail('FAIL  the key is accepted but exposes no models');
    return;
  }

  /*
   * Which model to test.
   *
   * The product's model always wins. The fallback scan used to be a loop that
   * kept overwriting `chosen`, so it selected the LAST candidate in the list
   * that existed rather than the first, inverting the preference order and
   * preferring the oldest available model. Taking the first match restores it.
   *
   * List entries are prefixed `models/`, and the generate URL already has
   * `models/` in it, so the prefix has to come off or the request goes to
   * `models/models/gemini-3.5-flash` and comes back 404.
   */
  const listed =
    visible.find((n) => n.endsWith(PRODUCT_MODEL)) ??
    FALLBACK_MODELS.find((candidate) => visible.some((n) => n.endsWith(candidate))) ??
    null;

  if (!listed) {
    fail('FAIL  no usable model on this key');
    return;
  }

  const target = listed.replace(/^models\//, '');

  const isProductModel = target.endsWith(PRODUCT_MODEL);
  process.stdout.write(`using model ${target}\n`);
  if (!isProductModel) {
    process.stdout.write(
      `      NOTE  ${PRODUCT_MODEL}, the model the product calls, is not on this key.\n` +
        '      A pass below describes a fallback and does not prove the product works.\n',
    );
  }

  let text = '';
  let usage = {};
  try {
    // Then actually generate, because a key can list models and still be barred
    // from inference, or point at a model that is listed but serving nothing.
    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${target}:generateContent?key=${encodeURIComponent(KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with the single word: ready' }] }],
          /*
           * 64, not 16.
           *
           * The budget was 16, and that manufactured the very failure this probe
           * was supposed to detect: the model returned HTTP 200 with an empty
           * candidate and `finishReason: MAX_TOKENS`, because one word did not
           * fit alongside its own overhead. A probe that sets a budget too
           * small to fit the answer will report the model as broken while the
           * product, which asks for `MAX_OUTPUT_TOKENS` in `gemini.ts`, works
           * fine. The budget has to leave room for the whole reply, not just the
           * reply.
           */
          generationConfig: { maxOutputTokens: 64, temperature: 0 },
        }),
      },
    );
    const genBody = await genRes.json().catch(() => null);

    if (!genRes.ok) {
      fail(
        `FAIL  generation refused: ${genRes.status} ${String(genBody?.error?.message ?? '').slice(0, 240)}`,
      );
      if (genRes.status === 429) {
        process.stdout.write(
          '      429 is a quota or rate refusal, which is a NORMAL state on a free tier.\n',
        );
      }
      if (genRes.status === 503) {
        process.stdout.write(
          '      503 means the model is listed but at capacity. It is listed in the\n' +
            '      models response and still refuses to generate, so a green list is\n' +
            '      not evidence that the model works.\n',
        );
      }
      return;
    }

    text = genBody?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    usage = genBody?.usageMetadata ?? {};
  } catch (error) {
    fail(`FAIL  the provider could not be reached: ${String(error).slice(0, 200)}`);
    return;
  }

  process.stdout.write(
    `      usage: prompt ${usage.promptTokenCount ?? '?'}, output ${usage.candidatesTokenCount ?? '?'}, ` +
      `total ${usage.totalTokenCount ?? '?'}\n`,
  );

  /*
   * An empty answer is not an answer.
   *
   * This used to print `PASS generation answered: ""` and exit 0. The provider
   * returns HTTP 200 with an empty candidate list when a model is listed but
   * serving nothing, and the probe read the status code and called that healthy.
   * Meanwhile `scripts/probe-ai-deck.mjs`, exercising the same model through the
   * product's own code path, failed on a 503. Two tools, one broken model, and
   * the one whose job was to answer "does it work" said yes.
   *
   * `src/lib/ai/gemini.ts` already refuses an empty answer with reason
   * "malformed". This probe now agrees with it.
   */
  if (!text.trim()) {
    fail(
      'FAIL  generation answered with nothing. The model is listed and returns\n' +
        '      HTTP 200, but produced no text. It is listed, not usable.\n',
    );
    return;
  }

  process.stdout.write(`PASS  generation answered: ${JSON.stringify(text.trim().slice(0, 60))}\n`);
}