'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toSchedule, previewIntervals, isDue, type Recall } from '@/lib/srs/scheduler';
import { gradeCard, type StudyCard } from '../actions';

/**
 * One card, one question, four answers.
 *
 * WHY THE SCHEDULER IS IN THIS BUNDLE. It is a pure function of the stored row
 * and an injected clock, so it runs identically on the server and in the
 * browser. It is here only to draw the four interval hints under the buttons;
 * the schedule that is actually written comes back from `gradeCard`, which runs
 * the same code server-side. A hint computed here and a row written there are
 * the same computation, so they cannot disagree.
 *
 * WHY THE HINTS COME FROM `previewIntervals` AND NOT A SECOND RULE. Each hint
 * is `formatInterval(review(...))`, so the number under a button is the number
 * that button produces. A hand-written "1 day / 6 days" table would be a
 * second copy of the algorithm and would be wrong the moment the algorithm moved.
 */

type Tone = 'primary' | 'secondary' | 'danger';

const ANSWERS: { recall: Recall; label: string; tone: Tone }[] = [
  { recall: 'again', label: 'Again', tone: 'danger' },
  { recall: 'hard', label: 'Hard', tone: 'secondary' },
  { recall: 'good', label: 'Good', tone: 'primary' },
  { recall: 'easy', label: 'Easy', tone: 'secondary' },
];

export function ReviewSession({
  deckId,
  cards,
  startedAt,
}: {
  deckId: string;
  cards: StudyCard[];
  /** The instant the server judged the deck against. Injected, never `Date.now()`. */
  startedAt: string;
}) {
  // Queued once, on mount. The session's membership is fixed when it opens:
  // a card answered Easy is due later and must not reappear in this sitting,
  // and re-deriving the queue on every render would do exactly that.
  const [queue, setQueue] = useState<StudyCard[]>(() => {
    const at = new Date(startedAt);
    return cards.filter(({ progress }) => isDue(toSchedule(progress, at), at));
  });
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);
  const liveRef = useRef<HTMLDivElement>(null);

  const current = queue[0];
  const schedule = useMemo(
    () => toSchedule(current?.progress ?? null, new Date(startedAt)),
    [current, startedAt],
  );
  const hints = useMemo(
    () => (current ? previewIntervals(schedule, new Date(startedAt)) : null),
    [current, schedule, startedAt],
  );

  useEffect(() => {
    // Move focus to the card on every advance so a screen reader is told the
    // question changed rather than being left on a button that has gone.
    liveRef.current?.focus();
  }, [current?.card.id]);

  const answer = useCallback(
    async (recall: Recall) => {
      if (!current || saving) return;
      setSaving(true);

      const result = await gradeCard({ cardId: current.card.id, deckId, recall });

      setSaving(false);
      if (!result.ok) return;

      setDone((count) => count + 1);
      setRevealed(false);
      setQueue((rest) => rest.slice(1));
    },
    [current, deckId, saving],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (!revealed) {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          setRevealed(true);
        }
        return;
      }
      const index = ['1', '2', '3', '4'].indexOf(event.key);
      if (index >= 0) {
        event.preventDefault();
        void answer(ANSWERS[index]!.recall);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, answer]);

  if (queue.length === 0) {
    return (
      <div className="rounded-[16px] border border-border bg-surface px-6 py-12 text-center">
        <p className="text-h4">Session complete</p>
        <p className="mt-2 text-body">
          {done === 0
            ? 'Nothing was due in this deck. Add cards, or come back when the next one is scheduled.'
            : `You reviewed ${done} ${done === 1 ? 'card' : 'cards'}. The next one is scheduled on the card itself.`}
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Review session" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-meta text-ink-muted">
          {queue.length} left · {done} reviewed
        </p>
        <p className="text-meta text-ink-subtle">Space to reveal · 1 to 4 to answer</p>
      </div>

      {/* tabIndex -1 so the advance focus lands here rather than on the first
          button, which would let a stray Space press answer the card. */}
      <div
        ref={liveRef}
        tabIndex={-1}
        className="rounded-[16px] border border-border bg-surface p-8 outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <p className="text-label">Front</p>
        <p className="mt-3 text-h4">{current!.card.front}</p>

        {revealed ? (
          <>
            <div className="mt-6 border-t border-border pt-6">
              <p className="text-label">Back</p>
              <p className="mt-3 text-body text-ink">{current!.card.back}</p>
              {current!.card.hint ? (
                <p className="mt-3 text-meta text-ink-subtle">Hint: {current!.card.hint}</p>
              ) : null}
            </div>
          </>
        ) : (
          <Button className="mt-8" onClick={() => setRevealed(true)} disabled={saving}>
            <Eye size={16} aria-hidden="true" />
            Show answer
          </Button>
        )}
      </div>

      {revealed && hints ? (
        <div className="grid gap-2 sm:grid-cols-4">
          {ANSWERS.map((option, index) => (
            <Button
              key={option.recall}
              variant={option.tone}
              size="md"
              disabled={saving}
              onClick={() => void answer(option.recall)}
              className="flex-col gap-0.5"
            >
              <span>
                {option.label}
                <span className="ml-1.5 text-meta opacity-70" aria-hidden="true">
                  {index + 1}
                </span>
              </span>
              <span className="text-meta opacity-70">{hints[option.recall]}</span>
            </Button>
          ))}
        </div>
      ) : null}

      {revealed ? (
        <p className="text-meta text-ink-subtle">
          The interval under each button is what that answer schedules.
        </p>
      ) : null}
    </section>
  );
}
