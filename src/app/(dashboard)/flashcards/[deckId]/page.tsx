import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '@/components/ui/feedback';
import { requirePagePermission } from '@/lib/auth/guards';
import { can } from '@/lib/auth/rbac';
import { formatDay } from '@/lib/dates';
import { tenantTimeZone } from '@/lib/tenant-zone';

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
 * THE TWO HALVES ARE CHOSEN BY TWO DIFFERENT THINGS, AND BOTH ARE ASKED FOR.
 *
 * Ownership says whose deck it is: a student owns a deck and a teacher may own
 * one, and only the owner may change it. The matrix says what this account may
 * do at all: `flashcard:write` is `no` for a guardian and `flashcard:review`
 * belongs to students, because a review writes a schedule row that belongs to a
 * student and a teacher owns no roster row.
 *
 * Ownership alone was not enough, and this page used to rely on it. It asked
 * the server for one flag, "editable", which meant only "you own this", and
 * then offered the write controls on the strength of it. That is right by
 * accident: the owner of a deck is the account that created it, and creating
 * one needs `flashcard:write`, so the owner has always held the permission. It
 * is right until it is not: an account that loses the permission and keeps the
 * deck is offered a control the server refuses, which reads as a broken
 * product rather than as a boundary.
 *
 * So the server now sends the FACTS, `owned` and `hasCards`, and this page
 * asks the matrix for the GRANTS. The rule lives in one place, and the page
 * that offers the control is the page that decides whether to offer it.
 *
 * REVIEW IS NOT OFFERED TO EVERYONE WHO CAN OPEN THE PAGE. A teacher opening a
 * deck they wrote sees the cards and no session. Showing a "Start review"
 * button there would offer a save the database refuses, which is the
 * broken-product failure rather than the permission-boundary one.
 */
export default async function DeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const session = await requirePagePermission('flashcard:read');
  const { deckId } = await params;

  const detail = await loadDeck(deckId);
  if (!detail) notFound();

  const { deck, cards, due, learning, owned, hasCards } = detail;
  const pending = due + learning;

  /*
   * THE GRANTS, FROM THE MATRIX.
   *
   * `mayWrite` needs the permission AND the ownership, because they are
   * different grants: a guardian may not write a deck, and a teacher who does
   * not own this one may not change it either.
   */
  const mayWrite = can(session.role, 'flashcard:write') && owned;
  const mayReview = can(session.role, 'flashcard:review') && hasCards;

  /*
   * THE INSTITUTION'S ZONE. A date rendered on the server is rendered once,
   * so it cannot be a hydration error, but it can still be the wrong day: the
   * server runs in UTC and the day a card was due is the school's day.
   */
  const timeZone = await tenantTimeZone(session.userId);

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
          (owned ? 'Your deck.' : 'Shared into your class by your teacher.')
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-meta text-ink-muted">
        <span>
          {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        </span>
        {mayReview ? (
          <span aria-live="polite">
            {pending > 0 ? `${pending} to review` : 'All caught up'}
          </span>
        ) : (
          <span>{owned ? 'Only students can review a deck.' : 'Shared with your class.'}</span>
        )}
      </div>

      {mayReview ? <ReviewSession deckId={deck.id} cards={cards} startedAt={new Date().toISOString()} /> : null}

      {cards.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={undefined}
            title={owned ? 'No cards yet' : 'This deck has no cards'}
            description={
              owned
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
                  {progress.status} · due {formatDay(progress.dueAt, timeZone)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {mayWrite ? <AddCardForm deckId={deck.id} /> : null}

      {mayWrite ? (
        <div className="mt-8">
          <ArchiveDeckButton deckId={deck.id} title={deck.title} />
        </div>
      ) : null}
    </div>
  );
}