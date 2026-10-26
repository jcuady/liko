#!/usr/bin/env node
/**
 * check:copy — no em dash or en dash in visible copy, anywhere in the source.
 *
 * THE RULE IS OLDER THAN ITS ENFORCEMENT.
 *
 * `docs/DESIGN.md` bans em dashes in visible copy, anywhere, and it has done so
 * since the design system landed. The only automated check for it was an
 * end-to-end test that walked the text nodes of the marketing page and nowhere
 * else, so the rule was enforced on the one page that nobody reads twice and
 * left unenforced on every screen a teacher actually uses. A rule that is
 * enforced in one place and not in another is not a rule; it is a habit.
 *
 * The scope was never written down either. The document said "anywhere", the
 * test said "the landing page", and neither mentioned the other.
 *
 * WHY A STATIC SCAN RATHER THAN A BROWSER.
 *
 * A browser check can only see the pages it visits, and a page that renders
 * nothing without a signed-in account cannot be checked by a test that does not
 * sign in. A static scan reads the source, so it sees every string the app can
 * possibly show, including the ones behind a role, behind a route, and behind
 * an empty state that only an empty database reaches.
 *
 * WHY THE TYPESCRIPT PARSER AND NOT A REGULAR EXPRESSION.
 *
 * The first version of this idea was a regular expression over the source, and
 * it was wrong in two ways at once. A `//` inside a string is not a comment,
 * and an apostrophe inside JSX text is not a string, so a scanner that guesses
 * where strings begin will either miss an offender or swallow the rest of the
 * file. The parser knows the difference, so the parser is what reads the file.
 *
 * WHAT COUNTS AS VISIBLE COPY.
 *
 * Every string literal, every template literal, and every run of JSX text.
 * JSX text is the one that matters most: `<p>Half the work — half the
 * teaching</p>` is a paragraph of visible copy written without a single quote
 * character in it, and a scanner that only looked inside strings would miss it.
 *
 * WHAT DOES NOT COUNT.
 *
 * Comments. This repository writes long explanatory comments, and they use
 * em dashes. That is correct English and it is not visible to a reader of the
 * product, so it is out of scope. A comment is not a string literal and the
 * parser does not see it as one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import ts from 'typescript';

const ROOT = process.cwd();
const SOURCE_ROOT = join(ROOT, 'src');

/** The characters the rule bans. U+2014 is an em dash, U+2013 an en dash. */
const BANNED = /[\u2014\u2013]/;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * The floor the scan has to clear before its silence means anything.
 *
 * A scanner that walks the wrong directory finds no offenders, and a gate that
 * reports "PASS, no em dashes" when it read three files is worse than no gate,
 * because it is read as protection. These numbers are well below what this
 * repository actually has, so a scanner that has stopped working trips them.
 */
const MIN_FILES = 150;
const MIN_LITERALS = 2000;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) continue;
    out.push(full);
  }
  return out;
}

function rel(path) {
  return relative(ROOT, path).split(sep).join('/');
}

/** The text a reader can see, taken from the parsed tree rather than the bytes. */
function visibleStrings(sourceFile) {
  const found = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      found.push({ text: node.text, pos: node.getStart(sourceFile) });
    } else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found.push({ text: node.text, pos: node.getStart(sourceFile) });
    } else if (ts.isJsxText(node)) {
      found.push({ text: node.text, pos: node.getStart(sourceFile) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function lineOf(text, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

if (!statSync(SOURCE_ROOT).isDirectory()) {
  console.error(`FAIL  ${rel(SOURCE_ROOT)} is not a directory. The scan read nothing.`);
  process.exit(1);
}

const files = walk(SOURCE_ROOT).sort();
let literals = 0;
const offenders = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  for (const literal of visibleStrings(sourceFile)) {
    literals += 1;
    if (!BANNED.test(literal.text)) continue;
    offenders.push({
      file,
      line: lineOf(text, literal.pos),
      text: literal.text.replace(/\s+/g, ' ').trim().slice(0, 120),
    });
  }
}

console.log(`scanned ${files.length} source files, ${literals} visible strings`);

if (files.length < MIN_FILES || literals < MIN_LITERALS) {
  console.error(
    `\nFAIL  the scan read ${files.length} files and ${literals} strings, which is below the floor of ` +
      `${MIN_FILES} files and ${MIN_LITERALS} strings. A scan that finds nothing because it read ` +
      'nothing is not a pass.',
  );
  process.exit(1);
}

if (offenders.length > 0) {
  console.error(`\nFAIL  ${offenders.length} piece(s) of visible copy carry a dash the design bans:`);
  for (const o of offenders) {
    console.error(`  ${rel(o.file)}:${o.line}  ${o.text}`);
  }
  console.error(
    '\n  Em dashes and en dashes are banned in visible copy. Use a full stop, a colon, or a ' +
      'parenthetical instead.',
  );
  process.exit(1);
}

console.log('\nPASS  no visible string in the source carries an em dash or an en dash.');
