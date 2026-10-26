/**
 * Fails if raw form controls reappear outside the component kit.
 *
 * WHY THIS EXISTS. The product is on shadcn and Radix, and the select was
 * still a native `<select>` in eleven files at once, which is what a design
 * system leaks like: nothing failed, every screen looked nearly right, and the
 * control you are least able to style was the one the browser was drawing. The
 * tables did the same thing quieter: four of them, four cell rhythms, and no two
 * within a page agreeing on what a header looks like.
 *
 * The check is deliberately a list of ALLOWED raw controls rather than a search
 * for every one of them. A native checkbox that posts a value a schema
 * validates is not drift. A `type="file"` cannot be replaced. A blanket ban
 * would either be wrong in those places or push people to stop writing down
 * why, and the reason is the valuable half.
 *
 * Run: node scripts/check-primitives.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const KIT = join(SRC, 'components', 'ui');

/** Where a raw control is allowed, and why. */
const ALLOWED = [
  {
    file: join('components', 'ui', 'checkbox.tsx'),
    reason: 'a real checkbox posts what the consent schema validates',
  },
  {
    file: join('app', '(auth)', 'login', 'LoginForm.tsx'),
    reason: 'hidden field and a native checkbox, both posted with the form',
  },
  {
    file: join('app', '(dashboard)', 'welcome', 'OnboardingWizard.tsx'),
    reason: 'radio group posted by name with the onboarding form',
  },
  {
    file: join('app', '(dashboard)', 'quiz', 'QuizRunner.tsx'),
    reason: 'answer radios and checkboxes post one name per question',
  },
  {
    file: join('app', '(dashboard)', 'assess', 'ScanSheet.tsx'),
    reason: 'the sheet is a file upload and cannot be anything else',
  },
  {
    file: join('app', '(dashboard)', 'classes', 'ClassesManager.tsx'),
    reason: 'roster import is a file upload',
  },
  {
    file: join('components', 'product', 'GradebookGrid.tsx'),
    reason: 'an inline-editing cell with its own compact metrics and a ref',
  },
];

const CONTROLS = [
  { tag: 'select', note: 'use the Radix Select in components/ui/select.tsx' },
  { tag: 'textarea', note: 'use Textarea from components/ui/input.tsx' },
  /*
   * A table is not a form control, so it did not belong here while this file was
   * about forms. It does belong here now, because the four tables in the product
   * each styled their own cells and disagreed on padding, on whether rows drew a
   * rule, and on what a header looks like. That is the same leak this file exists
   * to stop, in a part of the interface it had no words for.
   */
  { tag: 'table', note: 'use the Table primitive in components/ui/table.tsx' },
];

/** `type` values on an `<input>` that must stay native wherever they appear. */
const NATIVE_INPUT_TYPES = new Set(['checkbox', 'radio', 'hidden', 'file', 'range']);

/**
 * Comments are blanked out before anything is matched.
 *
 * WHY. A doc comment that says "use `<table>` for this" is documentation, not
 * drift. The gate failing on it would push the next person to reword their
 * reasoning instead of fixing their markup, which trades the valuable half of
 * the convention away to keep the mechanical half. `PriceComparison` proved this
 * the moment `<table>` was added to the list: the file that had just been
 * migrated onto the primitive was reported as the one place still using a raw
 * one, and the match was its own comment describing what it had changed to.
 *
 * THE HEURISTIC, AND WHAT IT COSTS. Block comments are blanked wholesale. A line
 * comment is blanked only when `//` is the first non-space thing on the line,
 * which is what keeps the `https://` inside a string from being treated as the
 * start of a comment. Every non-newline character is replaced with a space
 * rather than removed, so byte offsets survive and the reported line numbers stay
 * true. The cost is that a comment trailing code on the same line is still
 * scanned, so `// migrate to <table>` still trips the gate. That is on purpose:
 * it is a note about code sitting right there, and deleting it is a one-word edit
 * rather than a second parsing problem.
 */
function blankComments(source) {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, ' '),
  );
  return withoutBlocks
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? line.replace(/[^\n]/g, ' ') : line))
    .join('\n');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

const allowed = new Map(
  // `rel` below is relative to the repository root, so it starts with `src/`.
  // Building the key without that prefix made every allowance silently fail to
  // match, and the check reported two deliberately native controls as drift.
  ALLOWED.map((a) => [`src/${a.file.split(sep).join('/')}`, a.reason]),
);
const problems = [];
const files = walk(SRC);

for (const file of files) {
  // The kit is the definition, not a violation of it.
  if (file.startsWith(KIT)) continue;

  const rel = relative(ROOT, file).split(sep).join('/');
  const source = blankComments(readFileSync(file, 'utf8'));
  const allowedHere = allowed.get(rel);

  for (const { tag, note } of CONTROLS) {
    for (const m of source.matchAll(new RegExp(`<${tag}\\b`, 'g'))) {
      const line = source.slice(0, m.index).split('\n').length;
      if (!allowedHere) {
        problems.push(`${rel}:${line}  raw <${tag}>, ${note}`);
      }
    }
  }

  // A text-like <input> is drift anywhere outside the kit. Native types are not.
  for (const m of source.matchAll(/<input\b([^>]*?)\/?>/gs)) {
    const attrs = m[1];
    const type = (/\btype=["']([^"']+)["']/.exec(attrs) ?? [, 'text'])[1];
    if (NATIVE_INPUT_TYPES.has(type)) continue;
    const line = source.slice(0, m.index).split('\n').length;
    if (!allowedHere) {
      problems.push(`${rel}:${line}  raw <input type="${type}">, use Input from components/ui/input.tsx`);
    }
  }
}

// An allowance that no longer matches anything is a stale note, which is worse
// than no note: it excuses a control that has since been introduced.
for (const { file } of ALLOWED) {
  const abs = join(ROOT, 'src', file);
  const present = (() => {
    try {
      return statSync(abs).isFile();
    } catch {
      return false;
    }
  })();
  if (!present) problems.push(`allowance points at a file that does not exist: src/${file}`);
}

if (problems.length > 0) {
  console.log(`${problems.length} raw control(s) outside the component kit:\n`);
  for (const p of problems) console.log(`  ${p}`);
  console.log('\nIf one of these is genuinely necessary, add it to ALLOWED in this');
  console.log('file with the reason. Do not inline a primitive to avoid the check.');
  process.exitCode = 1;
} else {
  console.log(`RESULT: ${files.length} files scanned. Every select, textarea, table and`);
  console.log('text <input> in the product is a kit primitive.');
  console.log(`${ALLOWED.length} deliberate exceptions are allowed and each carries a reason.`);
}