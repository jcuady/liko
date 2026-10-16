'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { addCard } from '../actions';

/**
 * Adds a card to a deck the caller owns.
 *
 * FRONT AND BACK ARE BOTH REQUIRED, and the button stays disabled until both
 * have something in them. A card with an empty back is the one artefact this
 * feature cannot repair: a review session reaches it, reveals nothing, and the
 * student has to guess. Refusing it here is cheaper than grading around it.
 */
export function AddCardForm({ deckId }: { deckId: string }) {
  const router = useRouter();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = front.trim().length > 0 && back.trim().length > 0;

  const onSubmit = () => {
    if (!valid) {
      setError('A card needs a front and a back.');
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await addCard({ deckId, front, back, hint });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Cleared on success only. A failed save keeps what was typed, because
      // making someone retype a card to work around a network blip is the
      // thing this form exists to avoid.
      setFront('');
      setBack('');
      setHint('');
      router.refresh();
    });
  };

  return (
    <section className="mt-10 rounded-[16px] border border-border bg-surface p-6">
      <h2 className="text-h4">Add a card</h2>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="card-front">Front</Label>
          <Input
            id="card-front"
            value={front}
            onChange={(event) => setFront(event.target.value)}
            placeholder="What is a catalyst?"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="card-back">Back</Label>
          <Input
            id="card-back"
            value={back}
            onChange={(event) => setBack(event.target.value)}
            placeholder="A substance that changes the rate of a reaction without being consumed."
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="card-hint">Hint (optional)</Label>
          <Input
            id="card-hint"
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder="Think about what happens to it at the end."
          />
        </div>

        {error ? (
          <p role="alert" className="text-meta text-danger">
            {error}
          </p>
        ) : null}

        <div>
          <Button size="sm" onClick={onSubmit} disabled={!valid || pending}>
            <Plus size={16} aria-hidden="true" />
            {pending ? 'Adding…' : 'Add card'}
          </Button>
        </div>
      </div>
    </section>
  );
}