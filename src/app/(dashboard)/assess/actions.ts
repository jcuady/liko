'use server';

/**
 * Assessment writes.
 *
 * WHY SERVER ACTIONS. The seam is `server-only`, so a client component cannot
 * call `createAssessment` itself. This module is also imported by the gradebook
 * route, so the weight and type rules hold whether an assessment is created
 * from the builder or from beside the marks it will produce.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import { scoreAnswers } from '@/lib/omr/omr';
import {
  questionInputSchema,
  type QuestionRecord,
  type ScannedAnswer,
  type AssessmentRecord,
  type AssessmentType,
} from '@/lib/api/types';
import { isAssessmentType } from './options';

export interface AssessmentResult {
  ok: boolean;
  message: string;
}

/** Upper bound on one save, so a runaway client cannot write an unbounded set. */
const MAX_QUESTIONS = 60;

/**
 * Read path for the client cache. Goes through the seam, never a bare fetch.
 */
export async function loadAssessments(classId: string): Promise<AssessmentRecord[]> {
  const session = await requirePermission('assess:write');
  const store = await data();
  return store.listAssessments(session.userId, classId);
}

export async function createAssessment(input: {
  classId: string;
  title: string;
  type: AssessmentType;
  weight: number;
  maxScore: number;
  dueOn: string;
  standardCodes: string;
}): Promise<AssessmentResult> {
  const session = await requirePermission('assess:write');

  const title = input.title.trim().slice(0, 120);
  const weight = Number(input.weight);
  const maxScore = Number(input.maxScore);

  if (!input.classId) return { ok: false, message: 'Pick a class first.' };
  if (title.length < 2) return { ok: false, message: 'Give the assessment a title.' };
  if (!isAssessmentType(input.type)) {
    return { ok: false, message: 'That assessment type is not one this app supports.' };
  }
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    return { ok: false, message: 'Weight must be greater than 0 and at most 100.' };
  }
  if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 1000) {
    return { ok: false, message: 'Maximum score must be between 1 and 1000.' };
  }
  if (input.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) {
    return { ok: false, message: 'That due date could not be read.' };
  }

  const standardCodes = input.standardCodes
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code.length > 0)
    .slice(0, 20);

  try {
    const store = await data();
    await store.createAssessment(session.userId, {
      classId: input.classId,
      title,
      type: input.type,
      weight,
      maxScore,
      dueOn: input.dueOn.length > 0 ? input.dueOn : null,
      standardCodes,
    });
  } catch {
    return { ok: false, message: 'That assessment could not be created. Try again.' };
  }

  revalidatePath('/assess');
  revalidatePath('/grades');
  return { ok: true, message: `${title} created.` };
}

/**
 * Questions for one assessment, in print order.
 */
export async function loadQuestions(assessmentId: string): Promise<QuestionRecord[]> {
  const session = await requirePermission('assess:write');
  const store = await data();
  return store.listQuestions(session.userId, assessmentId);
}

/**
 * The class roster, for the student a scanned sheet gets assigned to.
 *
 * A bubble sheet carries a score and nothing that identifies whose it is, so
 * the name has to come from somewhere the machine cannot reach. This is that
 * somewhere.
 */
export async function loadStudentsForClass(classId: string) {
  const session = await requirePermission('assess:write');
  const store = await data();
  const students = await store.listStudents(session.userId, classId);
  return students
    .filter((student) => student.archivedAt === null)
    .map((student) => ({ id: student.id, name: student.fullName }));
}

/**
 * Replace an assessment's question set.
 *
 * Whole-set on purpose, see `saveQuestions` on the seam. The builder edits a
 * list, so a save that is not the whole list can only be correct if the client
 * and the server agree perfectly about deletions, and two implementations of
 * "deleted" is exactly where a question survives that nobody can see.
 */
export async function saveQuestionSet(input: {
  assessmentId: string;
  questions: {
    id?: string;
    kind: 'single' | 'multiple';
    prompt: string;
    options: { key: string; text: string }[];
    answerKey: string[];
    points: number;
  }[];
}): Promise<AssessmentResult & { questions?: QuestionRecord[] }> {
  const session = await requirePermission('assess:write');

  if (!input.assessmentId) return { ok: false, message: 'Pick an assessment first.' };
  if (input.questions.length > MAX_QUESTIONS) {
    return { ok: false, message: `An assessment can hold at most ${MAX_QUESTIONS} questions.` };
  }

  const store = await data();

  // Ownership before content. See `getAssessment` on the seam for why RLS is not
  // sufficient on its own here.
  const assessment = await store.getAssessment(session.userId, input.assessmentId);
  if (!assessment) {
    return { ok: false, message: 'That assessment is not one of yours.' };
  }

  const validated: (Omit<QuestionRecord, 'id' | 'ownerId'> & { id?: string })[] = [];
  for (const [index, raw] of input.questions.entries()) {
    const parsed = questionInputSchema.safeParse({ ...raw, assessmentId: input.assessmentId });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false,
        message: `Question ${index + 1}: ${first?.message ?? 'could not be read.'}`,
      };
    }
    validated.push({
      id: raw.id,
      assessmentId: input.assessmentId,
      position: index,
      kind: parsed.data.kind,
      prompt: parsed.data.prompt.trim().slice(0, 500),
      options: parsed.data.options.map((option) => ({
        key: option.key.trim().toUpperCase().slice(0, 4),
        text: option.text.trim().slice(0, 400),
      })),
      answerKey: parsed.data.answerKey.map((key) => key.trim().toUpperCase().slice(0, 4)),
      points: parsed.data.points,
    });
  }

  try {
    const questions = await store.saveQuestions(session.userId, validated);
    revalidatePath('/assess');
    revalidatePath('/grades');
    return {
      ok: true,
      message: `${questions.length === 0 ? 'No questions' : `${questions.length} question${questions.length === 1 ? '' : 's'}`} saved.`,
      questions,
    };
  } catch {
    return { ok: false, message: 'Those questions could not be saved. Try again.' };
  }
}

/**
 * Write a mark produced by a scan.
 *
 * The score is not trusted from the client even though the client computed it:
 * it is recomputed here from the stored questions and the marks that were read,
 * because a server action is a public endpoint and this one decides what goes
 * in a gradebook. A client that claimed 50/50 on four questions worth 1 would
 * otherwise be believed.
 */
export async function saveScannedGrade(input: {
  assessmentId: string;
  studentId: string;
  scanDetail: ScannedAnswer[];
  maxScore: number;
}): Promise<AssessmentResult> {
  const session = await requirePermission('assess:write');

  if (!input.assessmentId) return { ok: false, message: 'Pick an assessment first.' };
  if (!input.studentId) return { ok: false, message: 'Assign the sheet to a student before saving.' };
  if (!Number.isFinite(input.maxScore) || input.maxScore <= 0) {
    return { ok: false, message: 'That assessment has no questions to score against.' };
  }

  const store = await data();

  const assessment = await store.getAssessment(session.userId, input.assessmentId);
  if (!assessment) return { ok: false, message: 'That assessment is not one of yours.' };

  const questions = await store.listQuestions(session.userId, input.assessmentId);
  if (questions.length === 0) {
    return { ok: false, message: 'Add questions to this assessment before scanning against it.' };
  }

  const optionKeys = questions[0]!.options.map((option) => option.key);
  const scanned = scanSheetFromMarks(input.scanDetail, questions, optionKeys);

  try {
    await store.upsertGrade(session.userId, {
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      score: scanned.score,
      maxScore: scanned.maxScore,
      source: 'scan',
      scanDetail: input.scanDetail,
    });
  } catch {
    return { ok: false, message: 'That result could not be saved. Try again.' };
  }

  revalidatePath('/assess');
  revalidatePath('/grades');
  revalidatePath('/overview');
  return {
    ok: true,
    message: `${scanned.score} out of ${scanned.maxScore} recorded.`,
  };
}

/**
 * Re-score a set of read marks against the stored questions.
 *
 * Runs on the server so the number in the gradebook is the one the questions
 * imply. The client runs the same function to show a preview, and the two agree
 * because they are the same function, not because they were kept in step.
 */
function scanSheetFromMarks(
  detail: ScannedAnswer[],
  questions: QuestionRecord[],
  optionKeys: string[],
): { score: number; maxScore: number } {
  const answers = detail
    .filter((item) => item.questionIndex >= 0 && item.questionIndex < questions.length)
    .map((item) => ({
      questionIndex: item.questionIndex,
      optionKeys: item.optionKeys.filter((key) => optionKeys.includes(key)),
    }));

  const result = scoreAnswers(
    questions.map((question) => ({
      id: question.id,
      kind: question.kind,
      answerKey: question.answerKey,
      points: question.points,
    })),
    answers,
  );

  return { score: result.score, maxScore: result.maxScore };
}
