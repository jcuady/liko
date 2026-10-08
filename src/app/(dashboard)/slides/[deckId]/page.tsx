import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/ssr';

import { SlideEditor } from './SlideEditor';

export const metadata: Metadata = {
  title: 'Slide editor',
  description: 'Edit a lesson deck.',
};

/**
 * One deck.
 *
 * Reads both the deck and its slides in the server component so the editor opens
 * on real content rather than a spinner over data it already has. A deck id that
 * is not this teacher's is a 404, not an empty editor: an empty editor reads as
 * data loss.
 */
export default async function SlideEditorPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const session = await requirePagePermission('plan:write');
  const { deckId } = await params;

  const store = await data();

  let deck;
  try {
    const decks = await store.listDecks(session.userId);
    deck = decks.find((row) => row.id === deckId);
  } catch {
    deck = undefined;
  }
  if (!deck) notFound();

  const slides = await store.listSlides(session.userId, deck.id);

  return (
    <div className="pb-16">
      <Link
        href="/slides"
        className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] text-[0.9375rem] text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
        All decks
      </Link>

      <SlideEditor deck={deck} slides={slides} />
    </div>
  );
}