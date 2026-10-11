/**
 * The deck instruction, duplicated as a plain module so a plain Node script can
 * send the SAME prompt the product sends.
 *
 * Why a copy rather than importing `src/lib/slides/generate.ts`: that module
 * imports through the `@/` alias, which Node's type stripper cannot resolve, and
 * installing a loader for one probe is not worth it. The risk of a copy is that
 * the two drift and the probe stops proving what the product does.
 *
 * `src/lib/slides/generate.test.ts` reads this file and asserts it is character
 * for character the same string the product uses. The copy is therefore not a
 * copy that can drift silently.
 */
export const OUTLINE_INSTRUCTION = `You are writing a slide deck for a teacher.
Return ONLY a JSON object, no prose and no code fence, of this shape:

{
  "title": "deck title",
  "slides": [
    {
      "title": "the slide heading",
      "bullets": ["a short point", "another short point"],
      "body": "optional paragraph instead of bullets",
      "theme": "viridian"
    }
  ]
}

Rules:
- Between 3 and 12 slides, unless the teacher asked for a number.
- A slide has a heading of at most 8 words.
- Bullets are complete sentences of at most 18 words. Never use a dash as a
  bullet marker; they are added by the renderer.
- Do not write "Slide 1" or "Introduction" unless that is really the content.
- theme must be one of: viridian, ink, paper, dusk.
- Use "body" for a paragraph and "bullets" for a list, not both.
- Say what the teacher asked for. Do not add a thank-you slide or a summary
  slide they did not request.`;
