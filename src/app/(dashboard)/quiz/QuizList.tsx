'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { formatCalendarDayShort } from '@/lib/dates';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { toast } from '@/lib/toast';

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

/**
 * WHY THE DAY IS NOT CONVERTED TO AN INSTANT. `dueOn` is a calendar day, the
 * day the quiz is due, and a calendar day belongs to no zone in particular.
 * Reading it as midnight in the reader's zone and writing it back in the
 * reader's zone gives the right answer for the reader and a different answer
 * for the server, and the two renders disagree.
 */
function dueText(dueOn: string | null): string | null {
  if (!dueOn) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn.trim())) return null;
  return `Due ${formatCalendarDayShort(dueOn)}`;
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
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}