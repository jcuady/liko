'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { Badge, Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { StudentQuizSummary } from '@/lib/api/types';

import { beginQuiz } from './actions';

/**
 * The quizzes a student can sit.
 *
 * WHY THE ROW IS NOT A LINK. Starting a quiz writes a row, so it is a button
 * that says what it does. A link that quietly created an attempt on click would
 * leave a student with an open attempt they never meant to open, and no way to
 * tell that apart from one they did.
 *
 * WHY NOTHING HERE SHOWS A SCORE. There is nothing to show: the attempt is
 * scored on the server and the gradebook is the teacher's. A student who has
 * submitted sees that they submitted.
 */

function dueText(dueOn: string | null): string | null {
  if (!dueOn) return null;
  const date = new Date(`${dueOn}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return `Due ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

export function QuizList({ quizzes }: { quizzes: StudentQuizSummary[] }) {
  const router = useRouter();

  const start = useMutation({
    mutationFn: beginQuiz,
    onSuccess: (result) => {
      if (!result.ok || !result.attemptId) {
        toast.error(result.message);
        return;
      }
      router.push(`/quiz/${result.attemptId}`);
    },
    onError: () => toast.error('That quiz could not be opened. Try again.'),
  });

  return (
    <ul className="flex flex-col gap-3">
      {quizzes.map((quiz) => {
        const due = dueText(quiz.dueOn);
        const inProgress = quiz.status === 'in_progress';
        const submitted = quiz.status === 'submitted';
        const action = inProgress ? 'Resume' : submitted ? 'Sit again' : 'Start';

        return (
          <li key={quiz.assessmentId}>
            <Card>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[1.0625rem] font-medium text-ink">{quiz.title}</h2>
                    {inProgress ? (
                      <Badge tone="accent">In progress</Badge>
                    ) : submitted ? (
                      <Badge tone="success">Submitted</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-meta text-ink-muted">
                    {quiz.className} &middot; {quiz.questionCount}{' '}
                    {quiz.questionCount === 1 ? 'question' : 'questions'}
                    {due ? ` · ${due}` : ''}
                  </p>
                </div>

                <Button
                  type="button"
                  variant={inProgress ? 'primary' : 'secondary'}
                  disabled={start.isPending}
                  onClick={() => start.mutate({ assessmentId: quiz.assessmentId })}
                >
                  {start.isPending ? 'Opening' : action}
                  <ArrowRightIcon size={16} aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}