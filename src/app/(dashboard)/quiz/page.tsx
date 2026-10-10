import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { requirePagePermission } from '@/lib/auth/guards';

import { QuizList } from './QuizList';
import { loadStudentQuizzes } from './actions';

export const metadata: Metadata = {
  title: 'Quizzes',
  description: 'The quizzes your teacher has set for your class.',
};

/**
 * A student's quizzes.
 *
 * One list, one job: see what there is, see where you got to, start or resume.
 * There is no filter and no sort, because a class has one handful of quizzes
 * and a student opening this page wants the next one, not a way to rearrange
 * them.
 *
 * The gate is `quiz:take`, which no teacher holds. A teacher reaching this URL
 * gets the forbidden page rather than an empty list, which is the point: an
 * empty list would read as "your teacher has not set anything" when the truth
 * is that they may not look.
 */
export default async function QuizPage() {
  await requirePagePermission('quiz:take');

  const quizzes = await loadStudentQuizzes();

  return (
    <div className="mx-auto max-w-[52rem]">
      <PageHeader
        title="Quizzes"
        description="The quizzes your teacher has set for your class."
      />

      {quizzes.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          Nothing to sit yet. When your teacher publishes a quiz it appears here.
        </p>
      ) : (
        <QuizList quizzes={quizzes} />
      )}
    </div>
  );
}