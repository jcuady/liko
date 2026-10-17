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
    /*
     * WHETHER THE ROSTER IS OURS TO READ, WHICH IS NOT THE SAME AS BEING EMPTY.
     *
     * `classes` carries an admin policy, so an administrator lists every class
     * in the organisation. `students` has only "own rows" and "linked reads own
     * student row", neither of which admits an administrator, so every roster
     * read for a class they do not teach returns nothing.
     *
     * That arrives here as an empty array, and an empty array rendered as a
     * count is a lie: the page said "0 students" about a class of eight, in the
     * same breath as a header saying "8 students in total". RLS cannot report a
     * denial, so the count cannot be inferred from the data. It has to be
     * carried alongside it, from the one fact that does distinguish the two.
     *
     * This is deliberately independent of whether an administrator *should* see
     * children's records. If that policy widens, this can be relaxed; until then
     * the page must not state a number it was not permitted to read.
     */
    rosterVisible: classRecord.ownerId === session.userId,
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
