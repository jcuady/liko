'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { archiveDeck } from '../actions';

/**
 * Archives a deck.
 *
 * Archiving hides the deck from both lists and takes its cards out of every
 * review session. The progress rows go with it, so this is not reversible from
 * here, which is why it asks and says so rather than firing on a stray click.
 */
export function ArchiveDeckButton({ deckId, title }: { deckId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Archive size={15} aria-hidden="true" />
          Archive deck
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {title}?</DialogTitle>
          <DialogDescription>
            The deck leaves both lists and stops appearing in any review session. Its
            cards go with it, including how far each student had got. This cannot be
            undone from here.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-meta text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await archiveDeck({ deckId });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setOpen(false);
                router.push('/flashcards');
              })
            }
          >
            {pending ? 'Archiving…' : 'Archive deck'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}