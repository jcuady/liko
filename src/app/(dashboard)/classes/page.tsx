import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { requirePermission, requireSession } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';

import { ClassesManager, type ClassSummary } from './ClassesManager';

export const metadata: Metadata = {
  title: 'Classes',
  description: 'Every class you teach, in one place.',
};

/**
 * Roster, read through the seam.
 *
 * WHY THE FAN-OUT. `listClasses` returns the class records but not how many
 * students sit in each, and a count shown next to a class has to be the real
 * one. `listStudents` is scoped to a class, so the counts come from a `map`
 * over the classes. The number is honest even though it costs one read per
 * class, because a roster that says "0 students" on a class of thirty is worse
 * than a slightly slower page.
 */
export default async function ClassesPage() {
  const session = await requireSession();
  await requirePermission('class:read');

  const store = await data();
  const classes = await store.listClasses(session.userId);

  const summaries: ClassSummary[] = await Promise.all(
    classes.map(async (classRecord) => ({
      id: classRecord.id,
      name: classRecord.name,
      code: classRecord.code,
      level: classRecord.level,
      meetsPerWeek: classRecord.meetsPerWeek,
      students: await store.listStudents(session.userId, classRecord.id),
    })),
  );

  return (
    <div className="mx-auto max-w-[72rem]">
      <PageHeader
        title="Classes"
        description="Every class you teach, with roster, term, and progress attached."
      />
      <ClassesManager classes={summaries} />
    </div>
  );
}
