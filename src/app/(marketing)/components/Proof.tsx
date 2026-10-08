import { SectionHeader } from './SectionHeader';
import { ProofCarousel } from './ProofCarousel';
import type { Quote } from './ProofCarousel';

/**
 * Proof. Three testimonials.
 *
 * The figures that used to open this section now sit directly under the hero,
 * in `StatsBand`, carrying their illustrative-figures caveat with them. What
 * stayed here is the part that could not move: the only three named accounts on
 * the page, unchanged and attributed exactly as they were.
 *
 * Every figure is illustrative rather than measured, and says so where it is
 * printed. Shipping an unsourced statistic about teachers would be the exact
 * kind of claim the brand voice rules out.
 *
 * A server component. The section shell and the quotes are static, so they ship
 * as HTML; only the carousel's crossfade and its two controls need a runtime,
 * and those live in `ProofCarousel`.
 */

const QUOTES: Quote[] = [
  {
    quote:
      'I stopped maintaining a parallel spreadsheet the week I moved my gradebook over. The first time I needed to explain a mark to a parent, I had the rubric right there.',
    name: 'Maya Okonkwo',
    role: 'Chemistry teacher, four sections',
  },
  {
    quote:
      'The at-risk flags are the part. I get told in week six now, which is early enough to actually do something about it.',
    name: 'Dev Ramanathan',
    role: 'Department head, K-8',
  },
  {
    quote:
      'It works on my phone in a corridor with no signal, and the marks are there when I get back to the office. That was not true of anything else I tried.',
    name: 'Ingrid Halvorsen',
    role: 'Science teacher, rural district',
  },
];

export function Proof() {
  return (
    <section
      id="proof"
      aria-labelledby="proof-title"
      className="chapter border-y border-border bg-surface-sunken"
    >
      <div className="container-marketing">
        <SectionHeader
          label="Why teachers switch"
          id="proof-title"
          title="The week stops being a relay between tabs."
        />

        <ProofCarousel quotes={QUOTES} />
      </div>
    </section>
  );
}