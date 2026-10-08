import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';

import { Gradebook } from './Gradebook';

export const metadata: Metadata = {
  title: 'Gradebook',
  description: 'Marks that keep the reasoning behind them.',
};

/**
 * The gradebook, read through the seam.
 *
 * `listGrades` and `listAssessments` are both scoped to a class, so they are
 * read together for the selected class. Marks are stored raw; the scale is a
 * view over them, so changing it never rewrites a stored mark.
 *
 * The scale list is read here rather than in the client because a class names
 * the scale it is graded on, and the first paint should show that choice rather
 * than a percentage default that changes a frame later.
 */
export default async function GradesPage() {
  const session = await requirePagePermission('grade:read');

  const store = await data();
  const classes = await store.listClasses(session.userId);

  if (classes.length === 0) {
    return (
      <div className="mx-auto max-w-[72rem]">
        <PageHeader
          title="Gradebook"
          description="Marks that keep the rubric reasoning attached, so any number can be explained later."
        />
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          Marks belong to a class, and there are none yet. Create a class first.
        </p>
      </div>
    );
  }

  const selected = classes[0];
  const [roster, assessments, grades, policies] = await Promise.all([
    store.listStudents(session.userId, selected.id),
    store.listAssessments(session.userId, selected.id),
    store.listGrades(session.userId, selected.id),
    store.listPolicies(session.userId),
  ]);

  return (
    <div className="mx-auto max-w-[72rem]">
      <PageHeader
        title="Gradebook"
        description="Marks that keep the rubric reasoning attached, so any number can be explained later."
      />
      <Gradebook
        classes={classes.map((item) => ({
          id: item.id,
          name: item.name,
          gradingPolicyId: item.gradingPolicyId,
        }))}
        classId={selected.id}
        policies={policies}
        students={roster.map((student) => ({
          id: student.id,
          fullName: student.fullName,
          initials: student.initials,
        }))}
        assessments={assessments}
        grades={grades}
      />
    </div>
  );
}
