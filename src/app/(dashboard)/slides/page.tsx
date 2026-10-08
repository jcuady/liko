import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';

import { DecksList } from './DecksList';

export const metadata: Metadata = {
  title: 'Slides',
  description: 'Build and present lesson decks.',
};

/**
 * The deck list.
 *
 * Sits beside the planner because a deck and a lesson plan are the same job:
 * preparing something to teach with. Both are gated on `plan:write`, so a role
 * that can plan a lesson can build the slides for it.
 *
 * WHY THE COUNTS ARE BATCHED. This read the full slide records of every deck to
 * call `.length` on each one, so the list screen transferred every slide's
 * title, body, and speaker notes to render a badge. `countSlidesByDeck` fetches
 * one row per slide and returns totals, so the payload is a deck id per slide
 * and the page costs two reads instead of 1 + N.
 */
export default async function SlidesPage() {
  const session = await requirePagePermission('plan:write');
  const store = await data();

  const decks = await store.listDecks(session.userId);
  const slideCounts = await store.countSlidesByDeck(
    session.userId,
    decks.map((deck) => deck.id),
  );

  return (
    <div className="pb-16">
      <PageHeader
        title="Slides"
        description="Build a deck for a lesson and present it from here. Printing to PDF is in your browser's hands."
      />
      <DecksList
        decks={decks.map((deck) => ({ ...deck, slideCount: slideCounts[deck.id] ?? 0 }))}
      />
    </div>
  );
}