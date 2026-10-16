import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '@/components/ui/feedback';
import { requirePagePermission } from '@/lib/auth/guards';

import { AddCardForm } from './AddCardForm';
import { ArchiveDeckButton } from './ArchiveDeckButton';
import { ReviewSession } from './ReviewSession';
import { loadDeck } from '../actions';

export const metadata: Metadata = {
  title: 'Deck',
  description: 'Study a deck, or add cards to one of your own.',
};

/**
 * One deck: study it, or edit it if it is yours.
 *
 * The two halves are chosen by ownership rather than by role, because they are
 * not the same question. A student owns a deck and a teacher may own one; both
 * hold `flashcard:write`, and the only thing that decides what the page offers
 * is whether the deck's owner is the person looking at it.
 *
 * REVIEW IS NOT OFFERED TO EVERYONE WHO CAN OPEN THE PAGE. Progress is a row
 * belonging to a student, so a teacher opening a deck they wrote sees the cards
 * and no session. Showing a "Start review" button there would offer a save the
 * database refuses, which is the broken-product failure rather than the
 * permission-boundary one.
 */
export default async function DeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  await requirePagePermission('flashcard:read');
  const { deckId } = await params;

  const detail = await loadDeck(deckId);
  if (!detail) notFound();

  const { deck, cards, due, learning, editable, canReview } = detail;
  const pending = due + learning;

  return (
    <div className="mx-auto max-w-[52rem]">
      <Link
        href="/flashcards"
        className="mb-6 inline-flex items-center gap-1.5 text-meta text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All decks
      </Link>

      <PageHeader
        title={deck.title}
        description={
          deck.description ||
          (editable ? 'Your deck.' : 'Shared into your class by your teacher.')
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-meta text-ink-muted">
        <span>
          {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        </span>
        {canReview ? (
          <span aria-live="polite">
            {pending > 0 ? `${pending} to review` : 'All caught up'}
          </span>
        ) : (
          <span>{editable ? 'Only students can review a deck.' : 'Shared with your class.'}</span>
        )}
      </div>

      {canReview ? <ReviewSession deckId={deck.id} cards={cards} startedAt={new Date().toISOString()} /> : null}

      {cards.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={undefined}
            title={editable ? 'No cards yet' : 'This deck has no cards'}
            description={
              editable
                ? 'A deck needs at least one card before it can be reviewed. Add the first below.'
                : 'Your teacher has not added any cards to this deck yet.'
            }
          />
        </div>
      ) : (
        <ul className="mt-8 grid gap-2">
          {cards.map(({ card, progress }) => (
            <li
              key={card.id}
              className="rounded-[12px] border border-border bg-surface px-4 py-3"
            >
              <p className="text-body text-ink">{card.front}</p>
              <p className="mt-1 text-meta text-ink-muted">{card.back}</p>
              {progress && progress.status !== 'new' ? (
                <p className="mt-2 text-meta text-ink-subtle">
                  {progress.status} · due {new Date(progress.dueAt).toLocaleDateString()}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editable ? <AddCardForm deckId={deck.id} /> : null}

      {editable ? (
        <div className="mt-8">
          <ArchiveDeckButton deckId={deck.id} title={deck.title} />
        </div>
      ) : null}
    </div>
  );
}