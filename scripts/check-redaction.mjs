/**
 * Prove the recorder's scrubber still removes secrets before anything is
 * committed. Run: node scripts/check-redaction.mjs
 *
 * WHY THIS IS A GATE. docs/evidence/gates.json is committed, and it contains the
 * output of gates that run with the Supabase service role key and the Gemini
 * API key. The scrubber is the only thing standing between that output and
 * permanent git history, and "the evidence file looks clean" cannot tell a
 * working scrubber from a broken one, because a scrubber that never fires and
 * a file containing no secrets are the same file.
 *
 * WHY IT IS A SEPARATE MODULE. The scrubber originally lived inside
 * run-gates.mjs, where importing it would launch all the gates, so it could not
 * be asked this question at all.
 *
 * Both halves matter. The positive cases catch a regex that does not match. The
 * negative cases catch a scrubber that eats real output, which is quieter and
 * just as bad: a gate tail full of `[redacted-key]` tells nobody anything.
 */
import { redact } from './lib/redact.mjs';

let failed = 0;

/**
 * Every fragment of the secret long enough to be material.
 *
 * The first version of this check searched the output for the WHOLE original
 * secret. That is not a leak test. A scrubber that replaces only the first
 * eight characters destroys the whole string and passes, while most of the key
 * is still sitting in the file. That is exactly what happened to `sb_secret_`:
 * the alternation matched the literal word, left the rest of the key behind,
 * and the assertion reported success over forty characters of the live service
 * key. Overlapping fragments of length 10 cannot be satisfied by any partial
 * replacement.
 */
function leakedFragments(secret, out, size = 10) {
  const found = [];
  for (let i = 0; i + size <= secret.length; i++) {
    const frag = secret.slice(i, i + size);
    if (out.includes(frag)) found.push(frag);
  }
  return found;
}

function expectRemoved(label, secret) {
  const out = redact(`prefix ${secret} suffix`);
  const leaked = leakedFragments(secret, out);
  if (leaked.length > 0) {
    failed++;
    console.log(`FAIL  ${label}`);
    console.log(`      ${leaked.length} fragment(s) survived, e.g. ${leaked.slice(0, 3).join(', ')}`);
    console.log(`      output: ${out}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

function expectPreserved(label, line) {
  const out = redact(line);
  if (out !== line) {
    failed++;
    console.log(`FAIL  ${label} was altered`);
    console.log(`      in : ${line}`);
    console.log(`      out: ${out}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

expectRemoved('Gemini API key', 'AIzaSyD9xKq2LmNp4RtVw8Yb3Zc6HjF7Gn1QaEuX');

// A realistic JWT header is 26 characters of base64url after `eyJ`, well under
// the 20+ that the first pattern demanded, which is why it matched nothing.
expectRemoved(
  'JWT with a short header',
  [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzAwMDAwMDAwfQ',
    'sZ8kQ2mXvB7nR4tW6yU1pL9dJ3hG5fC0aE7iO2nK4',
  ].join('.'),
);

expectRemoved('Supabase secret key', 'sb_secret_abcdef0123456789abcdef0123456789abcdef01');
expectRemoved('Supabase legacy key', 'sbp_0123456789abcdef0123456789abcdef012345');

// A secret embedded in ordinary prose, where the leak is least obvious and a
// reviewer is reading the surrounding words rather than the token.
{
  const secret = 'sb_secret_9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c';
  const line = `  ok    created organization abc  (service key ${secret} applied)`;
  const out = redact(line);
  const leaked = leakedFragments(secret, out);
  if (leaked.length > 0) {
    failed++;
    console.log('FAIL  a secret embedded in a normal log line survived');
    console.log(`      output: ${out}`);
  } else {
    console.log('ok    a secret embedded in a normal log line');
  }
}

// The shape of a key is itself disclosure: it identifies the provider and
// narrows a brute force to nothing. Consuming to end of line matters, because
// `\S+` used to stop at the space and leave `AIza` in the output.
{
  const out = redact('GEMINI key present, length 39, shape starts-with AIza');
  if (/AIza|length 39|starts-with/.test(out)) {
    failed++;
    console.log('FAIL  key length and shape survived');
    console.log(`      output: ${out}`);
  } else {
    console.log('ok    key length and shape');
  }
}

expectPreserved('an RLS PASS line', '  PASS  a signed-in student cannot set their own role to admin');
expectPreserved('a table inventory line', '  present  push_subscriptions  (HTTP 200)');
expectPreserved('a hex colour in output', 'theme_color #007134');
expectPreserved('the plan vocabulary guard line', '  ok    plan vocabulary: SQL, the API types and the pricing page all allow 3');

console.log('');
console.log(
  failed === 0
    ? 'RESULT: 7 secret shapes removed, 4 real gate lines unaltered.'
    : `RESULT: ${failed} check(s) failed. Do not commit gate output until this passes.`,
);
process.exitCode = failed === 0 ? 0 : 1;