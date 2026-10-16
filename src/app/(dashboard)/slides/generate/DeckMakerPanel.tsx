'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { queryKeys } from '@/lib/query/keys';

import { aiStatusAction, generateDeckAction } from './actions';

/**
 * The prompt box, and what the teacher is allowed to spend.
 *
 * WHY THE METER IS ABOVE THE BOX AND NOT IN A SETTINGS PAGE. Generation is
 * refused when the allowance runs out, and a refusal the teacher cannot see
 * coming reads as the product being broken. The number that will refuse them
 * belongs next to the thing that spends it.
 *
 * WHY THE STATUS IS POLLED WHILE THE PANEL IS OPEN. The provider's free tier can
 * be exhausted by everyone else on the key between one render and the next, and
 * the honest state for that is "unknown until you try". Polling keeps the
 * panel truthful without pretending to a guarantee it cannot make.
 */

interface Usage {
  used: number;
  limit: number;
  remaining: number;
  available: boolean;
  reason: string;
  configured: boolean;
  model: string;
  windowMinutes: number;
}

export function DeckMakerPanel({ classId }: { classId: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = React.useState('');
  const [title, setTitle] = React.useState('');

  const status = useQuery({
    queryKey: queryKeys.aiStatus(),
    queryFn: aiStatusAction,
    // Fast enough that a panel left open does not sit on a stale number, slow
    // enough that it is not a request per keystroke.
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const usage = status.data as Usage | undefined;

  const generate = useMutation({
    mutationFn: () => generateDeckAction({ prompt, deckTitle: title, classId }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        // A refusal changes what the meter says, so the number is refetched
        // rather than left showing a count that is no longer true.
        await queryClient.invalidateQueries({ queryKey: queryKeys.aiStatus() });
        return;
      }
      toast.success(result.message);
      setPrompt('');
      if (result.deckId) router.push(`/slides/${result.deckId}`);
      else router.push('/slides');
    },
    onError: () => toast.error('The deck could not be made. Try again in a moment.'),
  });

  const exhausted = usage ? usage.remaining <= 0 : false;
  const running = generate.isPending;

  return (
    <section className="rounded-[16px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3">Make a deck from a description</h2>

        <p className="text-[0.8125rem] text-ink-subtle" role="status" aria-live="polite">
          {status.isLoading
            ? 'Checking what is left'
            : usage
              ? usage.configured
                ? `${usage.remaining} of ${usage.limit} left this hour`
                : 'Not configured on this deployment'
              : ''}
        </p>
      </div>

      {/*
        A bar rather than a sentence. The sentence is the fallback; the bar is
        the thing a teacher glances at without reading, and it is the only part
        of this that changes at a glance as the allowance runs down.
      */}
      {usage?.configured ? (
        <div className="mt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={usage.limit}
            aria-valuenow={usage.used}
            aria-label="Generations used this hour"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{
                width: `${Math.min(100, Math.round((usage.used / usage.limit) * 100))}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {!usage?.configured && usage?.reason ? (
        <p className="mt-3 text-[0.875rem] text-ink-muted">{usage.reason}</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.875rem] font-medium text-ink" htmlFor="deck-prompt">
            What should the slides be about
          </label>
          {/*
           * WHY 16px AND NOT 15 ON A PHONE.
           *
           * iOS Safari zooms the whole page when a field is focused below 16px,
           * and it does not zoom back out. A teacher typing a lesson plan on a
           * phone ends up looking at a zoomed page they cannot leave without
           * losing their place. The desktop size is kept at the house
           * 0.9375rem, which is where this was caught.
           *
           * Written in braces deliberately. A bare block comment in the children
           * of a JSX element is text, not a comment, so this paragraph was being
           * rendered on the page and read out by the screen reader that the rest
           * of this component is written for.
           */}
          <Textarea
            id="deck-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Ten slides on covalent bonding for Year 10, with worked examples at the end"
            className="w-full rounded-[12px] border border-border-strong bg-surface px-3.5 py-3 text-[1rem] text-ink transition-colors duration-150 placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25 sm:text-[0.9375rem]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[0.875rem] font-medium text-ink" htmlFor="deck-title">
            Name it (optional)
          </label>
          <Input
            id="deck-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            placeholder="Bonding"
            className="h-11 w-full max-w-sm rounded-[12px] border border-border-strong bg-surface px-3.5 text-base text-ink transition-colors duration-150 placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25 lg:text-[0.9375rem]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => generate.mutate()}
            disabled={running || exhausted || !prompt.trim()}
          >
            {running ? 'Making slides' : 'Make the deck'}
          </Button>

          {exhausted ? (
            <span className="text-[0.875rem] text-ink-muted">
              You have used all {usage?.limit} for this hour. It resets on its own.
            </span>
          ) : (
            <span className="text-[0.875rem] text-ink-muted">
              Every slide it makes is yours to change afterwards.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}