import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';
import { ACCEPTED_FILE_TYPES, ACCEPTED_LABEL, MAX_IMPORT_BYTES } from '@/lib/slides/extract';
import { ArrowLeft } from 'lucide-react';

import { SlideEditor } from './SlideEditor';
import { UploadPanel } from './UploadPanel';

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

  /*
   * Only images can be placed on a slide. An image element stores an asset id
   * rather than a URL, so the editor needs the files themselves: a picker built
   * from ids alone could offer an image and then render an empty box.
   */
  const assets = (await store.listDeckAssets(session.userId, deck.id)).filter(
    (asset) => asset.kind === 'image',
  );

  return (
    <div className="pb-16">
      <Link
        href="/slides"
        className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] text-[0.9375rem] text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All decks
      </Link>

      <SlideEditor deck={deck} slides={slides} assets={assets} />

      {/*
        WHY THE PANEL IS A SIBLING OF THE EDITOR AND NOT INSIDE IT. The editor
        owns the slide that is currently open, and an uploaded image can only be
        placed on it by the editor. Mounting the panel here keeps that decision
        with the component that has the state, and the panel reports back
        through `onImageReady` rather than reaching into it.

        WHY THE LIMITS COME FROM THE EXTRACTOR. They are passed in rather than
        written here so the label under the picker cannot drift from the checks
        the server actually applies. They are also plain strings and a number,
        which is what keeps the parsers themselves out of the client bundle.
      */}
      <div className="mt-8">
        <UploadPanel
          deckId={deck.id}
          accept={ACCEPTED_FILE_TYPES}
          maxBytes={MAX_IMPORT_BYTES}
          acceptedLabel={ACCEPTED_LABEL}
        />
      </div>
    </div>
  );
}