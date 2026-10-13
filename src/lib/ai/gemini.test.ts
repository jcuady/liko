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

/**
 * Sending a photograph.
 *
 * WHY THIS IS ASSERTED AGAINST THE REQUEST BODY AND NOT AGAINST THE OPTIONS. A
 * caller can pass an image and have it silently dropped, and every other gate
 * still passes: the option type allows it, the function is called, the refusal
 * path works, and the response parses. What proves the picture travels is the
 * body that leaves. This is the same class of bug as a verdict computed and then
 * assigned from a different variable, which is indistinguishable in the output
 * from a correct pass.
 */
describe('sending a photograph', () => {
  const captured: { url?: string; body?: Record<string, unknown> } = {};

  function stubFetch() {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured.url = String(url);
      captured.body = JSON.parse(String(init?.body ?? '{}'));
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"entries":[]}' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  }

  /** The `contents[0].parts` array, typed so the assertions read as prose. */
  function parts(): { inline_data?: { mime_type: string; data: string }; text?: string }[] {
    const contents = captured.body?.contents as { role: string; parts: never[] }[];
    return contents[0]!.parts as never;
  }

  it('sends the image as inline data when one is supplied', async () => {
    process.env.GEMINI_API_KEY = 'test-key-000000000000';
    const restore = stubFetch();

    try {
      await generateDeckOutline({
        prompt: 'Read this timetable',
        system: 'Return JSON.',
        schemaHint: 'A shape.',
        image: { mimeType: 'image/jpeg', base64: 'QUJD' },
      });
    } finally {
      restore();
    }

    const image = parts().find((part) => part.inline_data);
    expect(image?.inline_data).toEqual({ mime_type: 'image/jpeg', data: 'QUJD' });
  });

  it('puts the image before the instruction, so the page is read before it is labelled', async () => {
    process.env.GEMINI_API_KEY = 'test-key-000000000000';
    const restore = stubFetch();

    try {
      await generateDeckOutline({
        prompt: 'Read this timetable',
        system: 'Return JSON.',
        schemaHint: 'A shape.',
        image: { mimeType: 'image/png', base64: 'QUJD' },
      });
    } finally {
      restore();
    }

    expect(parts()[0]?.inline_data).toBeDefined();
    expect(parts().at(-1)?.text).toContain('Read this timetable');
  });

  it('sends no image part at all for a text-only generation', async () => {
    process.env.GEMINI_API_KEY = 'test-key-000000000000';
    const restore = stubFetch();

    try {
      await generateDeckOutline({
        prompt: 'Five slides on the collision theory',
        system: 'Return JSON.',
        schemaHint: 'A shape.',
      });
    } finally {
      restore();
    }

    expect(parts().some((part) => part.inline_data)).toBe(false);
  });

  /*
   * The negative cases. An allowlist that quietly accepts everything is an
   * allowlist that has not been written, and the provider's own error for a
   * misused field names the field rather than the file, so it is not something a
   * student can act on.
   */
  it('refuses a file type the model cannot read, before the network', async () => {
    process.env.GEMINI_API_KEY = 'test-key-000000000000';
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    try {
      const failure = await generateDeckOutline({
        prompt: 'Read this',
        system: 'Return JSON.',
        schemaHint: 'A shape.',
        image: { mimeType: 'application/pdf', base64: 'QUJD' },
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AiUnavailable);
      expect((failure as AiUnavailable).kind).toBe('malformed');
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('refuses an empty image rather than sending a blank part', async () => {
    process.env.GEMINI_API_KEY = 'test-key-000000000000';
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    try {
      const failure = await generateDeckOutline({
        prompt: 'Read this',
        system: 'Return JSON.',
        schemaHint: 'A shape.',
        image: { mimeType: 'image/jpeg', base64: '' },
      }).catch((error: unknown) => error);

      expect((failure as AiUnavailable).kind).toBe('malformed');
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
});