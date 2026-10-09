import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';

import { AssessmentList } from './AssessmentList';

export const metadata: Metadata = {
  title: 'Assessments',
  description: 'Build the assessments a class is marked against.',
};

/**
 * Assessments, read through the seam.
 *
 * `listAssessments` is scoped to one class, so the page renders the first class
 * the teacher owns and lets the list switch. With no classes there is nothing
 * to build against, and it says so rather than showing an empty table.
 */
export default async function AssessPage() {
  const session = await requirePagePermission('assess:write');

  const store = await data();
  const classes = await store.listClasses(session.userId);

  if (classes.length === 0) {
    return (
      <div className="mx-auto max-w-[64rem]">
        <PageHeader
          title="Assessments"
          description="Build the assessments a class is marked against."
        />
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          Assessments belong to a class, and there are none yet. Create a class first.
        </p>
      </div>
    );
  }

  const selected = classes[0];
  const assessments = await store.listAssessments(session.userId, selected.id);
  const students = await store.listStudents(session.userId, selected.id);

  // Every assessment's questions, keyed by assessment, so the builder paints
  // on first render instead of showing an empty page while it fetches. It is one
  // query per assessment rather than one query per assessment the teacher has
  // not opened, because a class's full question set is small and the alternative
  // is a spinner on the screen that matters most.
  const questionsByAssessment: Record<string, Awaited<ReturnType<typeof store.listQuestions>>> = {};
  for (const assessment of assessments) {
    questionsByAssessment[assessment.id] = await store.listQuestions(session.userId, assessment.id);
  }

  return (
    <div className="mx-auto max-w-[64rem]">
      <PageHeader
        title="Assessments"
        description="Build the assessments a class is marked against."
      />
      <AssessmentList
        classes={classes.map((item) => ({ id: item.id, name: item.name }))}
        classId={selected.id}
        assessments={assessments}
        questionsByAssessment={questionsByAssessment}
        students={students
          .filter((student) => student.archivedAt === null)
          .map((student) => ({ id: student.id, name: student.fullName }))}
      />
    </div>
  );
}
