import Link from 'next/link';
import { ArrowUpRight, Check, Play, ScanLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { WorkspaceMock } from './WorkspaceMock';

/**
 * The hero, rendered with the supplied design's own class names and CSS rather
 * than reconstructed in Tailwind.
 *
 * The panel is the one place in the product where `text-on-accent` is the wrong
 * token and `text-forest` the right one: the highlight green is too light to
 * carry white text, and the two hero button variants exist for exactly that
 * pairing.
 *
 * `id="flow"` is what the footer's "The Flow" link points at. "Every teaching
 * task, in one flow" is the product's own tagline and this section is where that
 * promise is made.
 *
 * The design wrote an em dash in the sub-line. This page has a gate that fails
 * the build on em dashes in visible copy, so the sentence is broken with a
 * comma instead, which is the only visible difference from the source.
 */
export function Hero() {
  return (
    <section id="flow" className="hero">
      <div className="hero-content">
        <p className="eyebrow">
          <span className="status-dot" aria-hidden="true" />
          Your new favorite teaching assistant
        </p>

        <h1>
          Liko. Less admin.
          <br />
          <span>More teaching.</span> More impact.
        </h1>

        <p className="hero-copy">
          Meet Liko. Your lessons, grades, quizzes, and student insights,
          <br className="desktop-only" />
          finally together. So you can focus on the students, not the spreadsheets.
        </p>

        <div className="hero-ctas">
          <Button asChild variant="hero" size="cta">
            <Link href="/register">
              Start teaching with Liko
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="hero-outline" size="cta">
            <Link href="/overview">
              <Play size={13} fill="currentColor" aria-hidden="true" />
              See Liko in action
            </Link>
          </Button>
        </div>

        <p className="hero-note">Free to get started. No credit card needed.</p>
      </div>

      <div className="hero-product">
        <WorkspaceMock className="h-[340px] md:h-[420px]" />

        <div className="floating-label first">
          <span className="avatar" aria-hidden="true">
            <Check size={16} />
          </span>
          <div>
            <strong>A little less busywork.</strong>
            <small>A lot more room to teach.</small>
          </div>
        </div>

        <div className="floating-label second">
          <ScanLine size={25} aria-hidden="true" />
          <div>
            <strong>Paper quiz. Instant insights.</strong>
            <small>Scan. Score. See the difference.</small>
          </div>
        </div>
      </div>
    </section>
  );
}