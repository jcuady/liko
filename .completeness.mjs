/**
 * Completeness audit: every human-visible string in the supplied design's route,
 * checked against the deployed page.
 *
 * The comparison normalises what React does to assembled text, because a naive
 * substring search reports MISSING for a sentence that is plainly on screen.
 * `Save {n}% with yearly` renders as `Save <!-- -->20<!-- -->% with yearly`, and
 * curly quotes render as their entities.
 */
import { readFileSync } from 'node:fs';

const DESIGN = 'Liko new landing/src/routes/index.tsx';
const URL = 'https://liko-jcuadys-projects.vercel.app';

const raw = await (await fetch(URL)).text();
const flat = raw
  .replace(/<!--.*?-->/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&rsquo;|&#x27;/g, "'")
  .replace(/&hellip;/g, '...')
  .replace(/\s+/g, ' ')
  .trim();

const src = readFileSync(DESIGN, 'utf8');

/** Text a visitor can actually read: JSX text and string props, minus code-ish noise. */
const STOP = new Set([
  'Features', 'Classrooms', 'Mobile', 'Pricing', 'Features', 'Overview', 'Lessons', 'Quizzes', 'Insights',
]);

const strings = new Set();

// JSX text between > and < that has a letter in it.
for (const m of src.matchAll(/>([^<>{}]{4,})</g)) {
  const t = m[1].replace(/\s+/g, ' ').trim();
  if (/[A-Za-z]{3}/.test(t)) strings.add(t);
}
// String props used for visible copy.
for (const m of src.matchAll(/(?:q|a|title|description|label|content)="([^"]{6,})"/g)) {
  strings.add(m[1]);
}
// Array-of-objects copy used by the plan and FAQ maps.
for (const m of src.matchAll(/'([A-Z][^']{12,})'/g)) {
  const t = m[1];
  if (/[A-Za-z]{4}/.test(t) && !t.includes('<') && !t.includes('className')) strings.add(t);
}

const norm = (s) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

const rows = [];
for (const raw of strings) {
  const s = norm(raw);
  if (STOP.has(s)) continue;
  // Strip a leading/trailing punctuation artefact from JSX adjacency.
  const probe = s.replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '');
  if (probe.length < 6) continue;
  rows.push({ text: probe, live: flat.includes(probe) });
}

rows.sort((a, b) => Number(a.live) - Number(b.live) || a.text.localeCompare(b.text));

const missing = rows.filter((r) => !r.live);
console.log(`design visible strings checked: ${rows.length}`);
console.log(`present on the live page: ${rows.length - missing.length}`);
console.log(`NOT on the live page: ${missing.length}\n`);
for (const m of missing) console.log(`  MISSING  ${m.text}`);