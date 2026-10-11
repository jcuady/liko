import { afterEach, describe, expect, it } from 'vitest';

import { AiUnavailable, aiConfigured, generateDeckOutline } from '@/lib/ai/gemini';

/**
 * Reading the provider key.
 *
 * WHY THIS TEST EXISTS. The key first deployed to production was stored with a
 * leading byte order mark, because it had been piped into the Vercel CLI from a
 * shell that writes one. Every request then failed with a `TypeError` about a
 * character that is not a ByteString, and because the failure was classified as
 * a transport fault, the teacher was told "the AI service could not be reached.
 * Try again in a moment." Nothing in that sentence was true: the network was
 * fine, the key was fine, and retrying would never have worked.
 *
 * So two things are pinned here. A key carrying a byte order mark must still be
 * read as a key rather than sent as a malformed header, and a key that cannot be
 * used must never be reported as configured, because "configured" is the one
 * word on that panel a teacher cannot check for themselves.
 */

const ORIGINAL = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL;
});

describe('the provider key', () => {
  it('is configured when a key is present', () => {
    process.env.GEMINI_API_KEY = 'test-key-000000000000';
    expect(aiConfigured()).toBe(true);
  });

  it('is not configured when there is no key at all', () => {
    delete process.env.GEMINI_API_KEY;
    expect(aiConfigured()).toBe(false);
  });

  /*
   * The real defect. A byte order mark is invisible in a dashboard and in most
   * editors, and it makes the value un-sendable as a header.
   */
  it('is not configured when the value is only a byte order mark', () => {
    process.env.GEMINI_API_KEY = '\uFEFF';
    expect(aiConfigured()).toBe(false);
  });

  it('is not configured when the value is only whitespace', () => {
    process.env.GEMINI_API_KEY = '   \n\t ';
    expect(aiConfigured()).toBe(false);
  });

  it('survives a leading byte order mark, because the request uses the trimmed value', () => {
    process.env.GEMINI_API_KEY = '\uFEFFtest-key-000000000000';
    expect(aiConfigured()).toBe(true);
  });

  it('survives a trailing newline, which is what a pasted key carries', () => {
    process.env.GEMINI_API_KEY = 'test-key-000000000000\n';
    expect(aiConfigured()).toBe(true);
  });
});

describe('refusing before the network', () => {
  /*
   * WHY THE ASSERTION IS ON THE KIND AND NOT THE MESSAGE. The message is what a
   * teacher reads and it is deliberately vague; the kind is what decides whether
   * the allowance is charged and what the panel is allowed to claim. Two
   * different failures that share a sentence are how a misconfigured deployment
   * ends up looking like an outage.
   */
  it('refuses as not-configured rather than attempting a request', async () => {
    process.env.GEMINI_API_KEY = '\uFEFF   ';

    const failure = await generateDeckOutline({
      prompt: 'Five slides on the collision theory',
      system: 'Return JSON.',
      schemaHint: 'A shape.',
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AiUnavailable);
    expect((failure as AiUnavailable).kind).toBe('not-configured');
  });
});