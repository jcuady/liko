import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';
import type { StudentRecord } from '@/lib/api/types';

import { ClassesManager, type ClassSummary } from './ClassesManager';

export const metadata: Metadata = {
  title: 'Classes',
  description: 'Every class you teach, in one place.',
};

/**
 * Roster, read through the seam.
 *
 * WHY ONE QUERY AND NOT ONE PER CLASS. This used to fan out over the classes
 * and read each roster separately, which made the page cost 1 + N round trips
 * before it could render a list of five classes. `listStudentsForClasses` takes
 * the whole set in one `in(...)` read, and the rows are grouped back into
 * per-class rosters here.
 *
 * The rows are still real student records rather than counts. The roster panel
 * renders a name, a guardian, and a contact address for whichever class the
 * teacher selects on the client, and that selection happens without another
 * server round trip, so every roster has to arrive whole.
 *
 * Ordering is per class, not per page. `listStudents` sorts by `full_name`
 * within one class; a single query over several classes cannot express that, so
 * each roster is sorted here and a class's students stay alphabetical.
 */
export default async function ClassesPage() {
  const session = await requirePagePermission('class:read');

  const store = await data();
  const classes = await store.listClasses(session.userId);

  const students = await store.listStudentsForClasses(
    session.userId,
    classes.map((classRecord) => classRecord.id),
  );

  const byClass = new Map<string, StudentRecord[]>();
  for (const student of students) {
    const roster = byClass.get(student.classId);
    if (roster) roster.push(student);
    else byClass.set(student.classId, [student]);
  }
  for (const roster of byClass.values()) {
    roster.sort((left, right) => left.fullName.localeCompare(right.fullName));
  }

  const summaries: ClassSummary[] = classes.map((classRecord) => ({
    id: classRecord.id,
    name: classRecord.name,
    code: classRecord.code,
    level: classRecord.level,
    meetsPerWeek: classRecord.meetsPerWeek,
    students: byClass.get(classRecord.id) ?? [],
  }));

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
