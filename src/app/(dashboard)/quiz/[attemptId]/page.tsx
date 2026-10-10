import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/auth/guards';

import { QuizRunner } from '../QuizRunner';
import { loadQuiz } from '../actions';

export const metadata: Metadata = {
  title: 'Quiz',
  description: 'Answer the questions, then submit.',
};

/**
 * One attempt at one quiz.
 *
 * WHY A SUBMITTED ATTEMPT RENDERS THE CONFIRMATION AND NOT THE RUNNER. Landing
 * back on a finished attempt after submitting, or reopening a link from history,
 * must not present a form that looks live. The attempt is finished and the page
 * says so.
 *
 * WHY A MISSING ATTEMPT IS "NOT FOUND" RATHER THAN A REDIRECT. A student who
 * guesses another id learns nothing about whether that attempt exists, which is
 * the same answer the database gives.
 */
export default async function QuizAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  await requirePagePermission('quiz:take');

  const { attemptId } = await params;
  const quiz = await loadQuiz(attemptId);

  if (!quiz) {
    return (
      <div className="mx-auto max-w-[40rem]">
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          That quiz is not one of yours. It may have been closed, or the link may be wrong.
        </p>
      </div>
    );
  }

  return <QuizRunner quiz={quiz} />;
}