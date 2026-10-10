'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeftIcon, CheckIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { Badge, Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { OnlineAnswer, StudentQuiz } from '@/lib/api/types';

import { saveAnswers, submitQuiz } from './actions';

/**
 * Sitting a quiz.
 *
 * ONE QUESTION PER SCREEN. A list of eight questions with eight sets of options
 * is a page nobody answers on a phone, and the questions that get scrolled past
 * are the questions that get skipped. One at a time also means "where am I" is
 * always answerable, and Back is always one tap away rather than a scroll.
 *
 * ANSWERS ARE SAVED ON EVERY STEP, not at the end. A phone locks, a tab closes,
 * a signal drops in a stairwell. A quiz lost to any of those is a quiz sat twice
 * for no reason, and the student's own network is not something the product can
 * assume.
 *
 * THERE IS NO SCORE ANYWHERE ON THIS SCREEN. The attempt is scored on the server
 * from the stored key and the mark lands in the teacher's gradebook. Showing a
 * number here would put the answer key on the student's own device, which is the
 * one place a quiz sitting unfinished could be read from.
 */

type Phase = 'answer' | 'review' | 'done';

export function QuizRunner({ quiz }: { quiz: StudentQuiz }) {
  const router = useRouter();
  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>('answer');
  const [saved, setSaved] = React.useState(false);
  const [responses, setResponses] = React.useState<OnlineAnswer[]>(quiz.responses);

  const questions = quiz.questions;
  const total = questions.length;
  const question = questions[index];

  const save = useMutation({
    mutationFn: saveAnswers,
    onSuccess: (result) => {
      setSaved(result.ok);
      if (!result.ok) toast.error(result.message);
    },
  });

  const submit = useMutation({
    mutationFn: submitQuiz,
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setPhase('done');
      router.refresh();
    },
    onError: () => toast.error('That quiz could not be submitted. Try again.'),
  });

  const chosenFor = React.useCallback(
    (at: number) => responses.find((item) => item.questionIndex === at)?.optionKeys ?? [],
    [responses],
  );

  const record = (at: number, optionKeys: string[]) => {
    // One array, computed once. An empty selection is stored as an empty answer
    // rather than dropped, so "answered nothing" survives a reload instead of
    // quietly becoming "never reached this question".
    const next: OnlineAnswer[] = [
      ...responses.filter((item) => item.questionIndex !== at),
      { questionIndex: at, optionKeys },
    ].sort((a, b) => a.questionIndex - b.questionIndex);

    setResponses(next);
    setSaved(false);
    save.mutate({ attemptId: quiz.attemptId, responses: next });
  };

  function choose(key: string) {
    if (!question) return;
    const current = chosenFor(index);
    if (question.kind === 'single') {
      record(index, [key]);
      return;
    }
    record(
      index,
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  const answeredCount = questions.filter((q, at) => chosenFor(at).length > 0).length;

  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-[40rem]">
        <Card>
          <CardContent className="flex flex-col items-start gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success-subtle text-success">
              <CheckIcon size={22} weight="bold" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-h3">Submitted</h1>
              <p className="mt-2 text-body text-ink-muted">
                Your teacher will share your results. There is nothing else to do here.
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/quiz">Back to quizzes</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="mx-auto max-w-[40rem]">
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          This quiz has no questions yet.
        </p>
      </div>
    );
  }

  if (phase === 'review') {
    return (
      <div className="mx-auto max-w-[40rem]">
        <header className="mb-6">
          <h1 className="text-h3">Check your answers</h1>
          <p className="mt-2 text-body text-ink-muted">
            {answeredCount} of {total} answered. Once you submit, this attempt is finished.
          </p>
        </header>

        <Card className="mb-5">
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {questions.map((item, at) => {
                const answered = chosenFor(at).length > 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setIndex(at);
                        setPhase('answer');
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-border bg-surface-sunken px-4 py-3 text-left transition-colors duration-150 hover:border-border-strong"
                    >
                      <span className="text-[0.9375rem] text-ink">
                        Question {at + 1}
                        <span className="block text-meta text-ink-muted">{item.prompt}</span>
                      </span>
                      <Badge tone={answered ? 'success' : 'warning'}>
                        {answered ? 'Answered' : 'Blank'}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button
            type="button"
            variant="primary"
            disabled={submit.isPending}
            onClick={() => submit.mutate({ attemptId: quiz.attemptId })}
          >
            {submit.isPending ? 'Submitting' : 'Submit quiz'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setPhase('answer')}>
            <ArrowLeftIcon size={16} aria-hidden="true" />
            Back to the questions
          </Button>
        </div>
      </div>
    );
  }

  const chosen = chosenFor(index);

  return (
    <div className="mx-auto max-w-[40rem]">
      <header className="mb-5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-h4">{quiz.title}</h1>
          <p className="shrink-0 text-meta text-ink-muted">
            Question {index + 1} of {total}
          </p>
        </div>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-label="Quiz progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <p className="sr-only" aria-live="polite">
          {saved ? 'Answers saved' : 'Not saved yet'}
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-[1.0625rem] font-medium text-ink">{question.prompt}</legend>
            <p className="text-meta text-ink-muted">
              {question.kind === 'single'
                ? 'Choose one.'
                : 'Choose every answer that applies.'}
            </p>

            <div className="mt-1 flex flex-col gap-2">
              {question.options.map((option) => {
                const checked = chosen.includes(option.key);
                return (
                  <label
                    key={option.key}
                    className="flex min-h-[3rem] cursor-pointer items-center gap-3 rounded-[12px] border border-border-strong bg-surface px-4 py-3 transition-colors duration-150 hover:border-accent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-ring/25 has-checked:border-accent has-checked:bg-accent-subtle"
                  >
                    <input
                      type={question.kind === 'single' ? 'radio' : 'checkbox'}
                      name={`question-${index}`}
                      value={option.key}
                      checked={checked}
                      onChange={() => choose(option.key)}
                      className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="text-[0.9375rem] text-ink">{option.text}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={index === 0}
          onClick={() => setIndex((at) => Math.max(0, at - 1))}
        >
          <ArrowLeftIcon size={16} aria-hidden="true" />
          Previous
        </Button>

        {index === total - 1 ? (
          <Button type="button" variant="primary" onClick={() => setPhase('review')}>
            Review and submit
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            className="sm:ml-auto"
            onClick={() => setIndex((at) => Math.min(total - 1, at + 1))}
          >
            Next question
          </Button>
        )}
      </div>
    </div>
  );
}