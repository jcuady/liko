/**
 * Scrub secrets out of gate output before it is committed.
 *
 * WHY THIS IS A SEPARATE FILE. It used to live inside run-gates.mjs as a
 * private function, which made it impossible to test: importing that module
 * executes the whole suite, so there was no way to ask "does the scrubber
 * actually scrub?" without launching every gate. The function guards the
 * contents of a file that gets committed to git, where a leak is permanent, so
 * it has to be callable on its own. `scripts/check-redaction.mjs` is what asks.
 *
 * WHY THE JWT PATTERN IS NOT THE OBVIOUS ONE. It was originally
 * `eyJ[A-Za-z0-9_-]{20,}` for the header alone, which requires a 24 character
 * header. Real JWT headers are usually shorter than that, so it matched
 * nothing and the redaction silently left in place the single most likely
 * secret to appear, because db:check and db:settle both run with the Supabase
 * service role key. Eight characters per segment is loose enough to catch
 * anything shaped like a JWT and still far too specific to hit ordinary output.
 *
 * WHY `sb_secret` IS SPELLED OUT RATHER THAN SHARED WITH `sbp_`. It used to be
 * one alternation, `(sb_secret|sbp_[A-Za-z0-9]{20,})`, and the first branch
 * matched only the literal word, leaving everything after the underscore in
 * place: a written-out key came out as `[redacted-key]_abcdef01...`, which is
 * 40 characters of the live service role key still sitting in a file destined
 * for git. The test that should have caught it searched for the whole original
 * string, which that partial replacement had already destroyed, so it reported
 * success over a live leak. Both the pattern and the assertion were wrong.
 */

/** @param {string} text @returns {string} */
export function redact(text) {
  return String(text)
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted-key]')
    .replace(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, '[redacted-jwt]')
    .replace(/sb_secret_[A-Za-z0-9]+/g, '[redacted-key]')
    .replace(/sbp_[A-Za-z0-9]{20,}/g, '[redacted-key]')
    // Consumes to end of line, not to the next space. `\S+` stopped at the
    // space before the token it was meant to hide and left `AIza` showing.
    .replace(/key present, length \d+, shape[^\r\n]*/g, 'key present (length and shape withheld)');
}