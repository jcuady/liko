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
 */
export default async function SlidesPage() {
  const session = await requirePagePermission('plan:write');
  const store = await data();

  const decks = await store.listDecks(session.userId);
  const slideCounts = await Promise.all(
    decks.map(async (deck) => (await store.listSlides(session.userId, deck.id)).length),
  );

  return (
    <div className="pb-16">
      <PageHeader
        title="Slides"
        description="Build a deck for a lesson and present it from here. Printing to PDF is in your browser's hands."
      />
      <DecksList
        decks={decks.map((deck, index) => ({ ...deck, slideCount: slideCounts[index] ?? 0 }))}
      />
    </div>
  );
}