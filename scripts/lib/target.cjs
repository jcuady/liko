'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Which server a check is allowed to measure.
 *
 * Both check scripts used to default to `http://localhost:3000`. On this machine
 * port 3000 is a different application: a `next start` server for the Lasa
 * project, serving `lang="en-PH"` and its own headline. Every check ran against
 * it and reported a confident result. The no-JS check failed on a `no-js` class
 * that Lasa's build never had, which reads exactly like a LIKO regression and
 * is not one. Verified against a real server: LIKO answers 200 on the manifest
 * below, Lasa does not answer it at all.
 *
 * A check that silently measures the wrong application is worse than no check,
 * because it turns an unrun test into a passing one, and a failing one into a
 * phantom bug somebody spends an afternoon chasing.
 *
 * So the target is identified by the build it is serving rather than by a port
 * number. A port only says which process is listening, not which checkout it is
 * running: the same stale-server problem that bit `pnpm e2e` is still live
 * here. `next start` serves `/_next/static/<BUILD_ID>/_buildManifest.js` out of
 * `.next/BUILD_ID` in this repository, so a server on the right port serving
 * yesterday's build fails the check instead of quietly grading it.
 */

/** The default target, matching the port `playwright.config.ts` already uses. */
function defaultUrl() {
  return `http://127.0.0.1:${process.env.PORT ?? 3311}`;
}

function portOf(url) {
  const match = /:(\d+)/.exec(url);
  return match ? match[1] : '3000';
}

/** The build id this checkout produced, or null when it has not been built. */
function localBuildId() {
  const file = path.join(ROOT, '.next', 'BUILD_ID');
  if (!fs.existsSync(file)) return null;
  const id = fs.readFileSync(file, 'utf8').trim();
  return id || null;
}

/**
 * Resolves whether `url` is serving this checkout right now.
 *
 * Returns `{ ok: true, buildId }` or `{ ok: false, reason }`. It never throws,
 * because a failure to reach the server is a result the caller should report,
 * not an exception that skips the rest of the gate.
 */
async function describeTarget(url) {
  const base = url.replace(/\/+$/, '');
  const id = localBuildId();

  if (!id) {
    return {
      ok: false,
      reason:
        'no .next/BUILD_ID in this checkout, so there is nothing to compare against. ' +
        'Run `pnpm build` first; these checks run against a production server.',
    };
  }

  let response;
  try {
    response = await fetch(`${base}/_next/static/${id}/_buildManifest.js`);
  } catch (error) {
    return {
      ok: false,
      reason:
        `nothing answered on ${base} (${error.message}). Start one with ` +
        `\`pnpm build && pnpm run start --port ${portOf(base)}\`.`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason:
        `the server on ${base} answered ${response.status} for the manifest of build ${id}, ` +
        'so it is not serving this checkout. Either something else has that port, or it is ' +
        'running a stale build. Pass an explicit URL if you meant to test something else.',
    };
  }

  return { ok: true, buildId: id };
}

module.exports = { defaultUrl, describeTarget, localBuildId };