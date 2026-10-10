'use server';

/**
 * The student side of a quiz.
 *
 * WHY THESE ARE SEPARATE FROM `assess/actions.ts`. Everything in that file is a
 * teacher's action behind `assess:write`, and a student action filed next to it
 * would be one careless `requirePermission` away from being reachable by the
 * wrong role. The gate here is `quiz:take`, which no teacher holds.
 *
 * NOTHING IN THIS FILE RETURNS A SCORE. `submitQuiz` reports that the attempt
 * was recorded, and the number that goes in the gradebook is recomputed on the
 * server from the stored key. A student is told they submitted and nothing
 * more, so there is no code path here that could hand one out by accident.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import type { OnlineAnswer, StudentQuiz, StudentQuizSummary } from '@/lib/api/types';

export interface QuizResult {
  ok: boolean;
  message: string;
}

export async function loadStudentQuizzes(): Promise<StudentQuizSummary[]> {
  const session = await requirePermission('quiz:take');
  const store = await data();
  return store.listStudentQuizzes(session.userId);
}

export async function loadQuiz(attemptId: string): Promise<StudentQuiz | null> {
  const session = await requirePermission('quiz:take');
  const store = await data();
  return store.getStudentQuiz(session.userId, attemptId);
}

/**
 * Open an attempt.
 *
 * Creating the row is the only place `owner_id` is chosen, and the database
 * function does that from the assessment rather than from the request. This
 * action adds the permission gate in front of it and nothing else, because
 * everything worth checking is checked where it cannot be forged.
 */
export async function beginQuiz(input: {
  assessmentId: string;
}): Promise<QuizResult & { attemptId?: string }> {
  const session = await requirePermission('quiz:take');

  if (!input.assessmentId) return { ok: false, message: 'That quiz could not be opened.' };

  try {
    const store = await data();
    const attempt = await store.startQuizAttempt(session.userId, input.assessmentId);
    revalidatePath('/quiz');
    return { ok: true, message: 'Opened.', attemptId: attempt.id };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message.includes('not one of yours')
          ? 'That quiz is not one of yours.'
          : 'That quiz could not be opened. Try again.',
    };
  }
}

/**
 * Save what the student has chosen so far.
 *
 * Written on every step rather than only at the end, because a phone locks, a
 * tab closes and a signal drops, and a quiz lost to any of those is a quiz the
 * student has to sit twice for no reason.
 */
export async function saveAnswers(input: {
  attemptId: string;
  responses: OnlineAnswer[];
}): Promise<QuizResult> {
  const session = await requirePermission('quiz:take');

  if (!input.attemptId) return { ok: false, message: 'That quiz is no longer open.' };

  try {
    const store = await data();
    await store.saveQuizResponses(session.userId, input.attemptId, input.responses);
    return { ok: true, message: 'Saved.' };
  } catch {
    return { ok: false, message: 'Your answers could not be saved. Try again.' };
  }
}

export async function submitQuiz(input: { attemptId: string }): Promise<QuizResult> {
  const session = await requirePermission('quiz:take');

  if (!input.attemptId) return { ok: false, message: 'That quiz is no longer open.' };

  try {
    const store = await data();
    await store.submitQuizAttempt(session.userId, input.attemptId);
    // The teacher reads the mark in their gradebook and the student sees their
    // own list refresh to "submitted", so both sides are invalidated.
    revalidatePath('/quiz');
    revalidatePath('/grades');
    return { ok: true, message: 'Submitted. Your teacher will share your results.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('already submitted')) {
      return { ok: true, message: 'Submitted. Your teacher will share your results.' };
    }
    if (message.includes('no longer open')) {
      return { ok: false, message: 'That quiz is no longer open.' };
    }
    return { ok: false, message: 'That quiz could not be submitted. Try again.' };
  }
}