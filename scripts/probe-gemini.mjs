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
 * Run: node --env-file=.env.local scripts/probe-gemini.mjs
 */
const KEY = process.env.GEMINI_API_KEY;

if (!KEY) {
  process.stdout.write('FAIL  no GEMINI_API_KEY in the environment\n');
  process.exit(1);
}

process.stdout.write(`key present, length ${KEY.length}, shape ${KEY.slice(0, 2)}…\n`);

const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
let chosen = null;

try {
  // List first: it tells us what this key can actually reach, which is a
  // different question from whether a key is well-formed.
  const listRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(KEY)}`,
  );
  const listBody = await listRes.json().catch(() => null);

  if (listRes.ok && listBody?.models) {
    const names = listBody.models.map((m) => m.name);
    process.stdout.write(`PASS  the key is accepted; ${names.length} models visible\n`);
    for (const candidate of MODELS) {
      if (names.some((n) => n.endsWith(candidate))) chosen = candidate;
    }
    if (!chosen) chosen = names.find((n) => /flash/i.test(n))?.replace(/^models\//, '') ?? null;
  } else {
    const message = listBody?.error?.message ?? 'no detail';
    process.stdout.write(`FAIL  model list refused: ${listRes.status} ${String(message).slice(0, 200)}\n`);
  }

  if (!chosen) {
    process.stdout.write('FAIL  no usable model on this key\n');
    process.exit(1);
  }
  process.stdout.write(`using model ${chosen}\n`);

  // Then actually generate, because a key can list models and still be barred
  // from inference on the free tier.
  const genRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${chosen}:generateContent?key=${encodeURIComponent(KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with the single word: ready' }] }],
        generationConfig: { maxOutputTokens: 16, temperature: 0 },
      }),
    },
  );
  const genBody = await genRes.json().catch(() => null);

  if (!genRes.ok) {
    process.stdout.write(
      `FAIL  generation refused: ${genRes.status} ${String(genBody?.error?.message ?? '').slice(0, 240)}\n`,
    );
    if (genRes.status === 429) {
      process.stdout.write('      429 is a quota or rate refusal, which is a NORMAL state on a free tier.\n');
    }
    process.exit(1);
  }

  const text = genBody?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const usage = genBody?.usageMetadata ?? {};
  process.stdout.write(`PASS  generation answered: ${JSON.stringify(text.trim().slice(0, 60))}\n`);
  process.stdout.write(
    `      usage: prompt ${usage.promptTokenCount ?? '?'}, output ${usage.candidatesTokenCount ?? '?'}, ` +
      `total ${usage.totalTokenCount ?? '?'}\n`,
  );
} catch (error) {
  process.stdout.write(`FAIL  the provider could not be reached: ${String(error).slice(0, 200)}\n`);
  process.exit(1);
}