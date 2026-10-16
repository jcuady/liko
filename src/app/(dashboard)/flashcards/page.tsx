import type { Metadata } from 'next';
import Link from 'next/link';
import { Layers } from 'lucide-react';

import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '@/components/ui/feedback';
import { requirePagePermission } from '@/lib/auth/guards';

import { NewDeckButton } from './NewDeckButton';
import { loadDecks, loadShareableClasses } from './actions';

export const metadata: Metadata = {
  title: 'Flashcards',
  description: 'Decks you can study, and the ones your teacher has shared with your class.',
};

/**
 * Decks a student can study and a teacher can publish.
 *
 * One list for both roles, because the two are the same objects seen from
 * different sides. A deck the caller wrote and a deck their teacher shared into
 * their class appear in the same place, and only the card counts differ: both
 * say how many cards are due, because both are the reason a person opens this
 * page.
 *
 * The gate is `flashcard:read`, which every role holds at some scope, so a
 * teacher reaching this URL sees the decks they can edit rather than the
 * forbidden screen. What they cannot do is review, and the deck says so.
 */
export default async function FlashcardsPage() {
  await requirePagePermission('flashcard:read');
  const decks = await loadDecks();

  // Gated separately and read separately: a student may study without holding
  // `flashcard:write`, and asking for classes they cannot publish into would
  // fail the whole page for a button they can never use.
  const classes = await loadShareableClasses().catch(() => [] as { id: string; name: string }[]);

  const shared = decks.filter((row) => !row.editable).length;

  return (
    <div className="mx-auto max-w-[52rem]">
      <PageHeader
        title="Flashcards"
        description="Decks you can study, and the ones your teacher has shared with your class."
        action={<NewDeckButton classes={classes} />}
      />

      {decks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No decks yet"
          description="A deck is a set of question and answer cards. Make one, or wait for a teacher to share one with your class."
        />
      ) : (
        <>
          <ul className="grid gap-3">
            {decks.map(({ deck, due, learning, cards, editable }) => (
              <li key={deck.id}>
                <Link
                  href={`/flashcards/${deck.id}`}
                  className="flex items-center gap-4 rounded-[16px] border border-border bg-surface p-5 transition-colors hover:bg-surface-sunken"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-h4">{deck.title}</p>
                    <p className="mt-1 truncate text-meta text-ink-muted">
                      {cards} {cards === 1 ? 'card' : 'cards'}
                      {deck.subject ? ` · ${deck.subject}` : ''}
                      {!editable ? ' · shared with your class' : ''}
                    </p>
                  </div>

                  {/* Due counts are rendered only when they mean something. A
                      zero on every card of a deck the student cannot review
                      would be a number about a study session they may not
                      start. */}
                  {due + learning > 0 ? (
                    <p className="shrink-0 rounded-full bg-accent-subtle px-3 py-1 text-meta text-accent">
                      {due + learning} to review
                    </p>
                  ) : (
                    <p className="shrink-0 text-meta text-ink-subtle">All caught up</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {shared > 0 ? (
            <p className="mt-6 text-meta text-ink-muted">
              {shared} of these {shared === 1 ? 'deck was' : 'decks were'} shared into your class.
              You can study {shared === 1 ? 'it' : 'them'}, and editing stays with whoever made{' '}
              {shared === 1 ? 'it' : 'them'}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}