import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { requirePagePermission } from '@/lib/auth/guards';
import { can } from '@/lib/auth/rbac';
import { isDemoStaff } from '@/lib/auth/store';
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

  /*
   * MAY THIS ACCOUNT CHANGE THE ROSTER, AS OPPOSED TO READING IT.
   *
   * Reading and writing are different grants and they are decided by different
   * things, so they get different names. `rosterVisible` below answers "may
   * this account read the names on it". This answers "may this account change
   * it", and it has two parts.
   *
   * THE PERMISSION. Every one of the five writes on this page, `createClass`,
   * `archiveClass`, `createStudent`, `importRoster` and `archiveStudent`, calls
   * `requirePermission('class:write')` before it looks at any record. A student
   * holds that at `no` and a guardian holds `no`, so for those two roles every
   * one of those calls throws, and the button under it reports "That class
   * could not be created. Try again." for an action the application had already
   * refused. That is not a copy problem, it is a control that cannot work.
   *
   * THE RECORD. Permission is not enough. The `own rows` policy is
   * `owner_id = auth.uid()`, and both archive calls filter on `owner_id` as
   * well, so an administrator who may read a class in the organisation still
   * cannot change it: the update matches zero rows, and Postgres does not call
   * a zero-row update an error. The result would be a toast saying "Class
   * archived." over a class that is still there, with no way to tell the two
   * apart. So the button belongs where the write will actually land.
   *
   * The demo staff escape is the same one `rosterVisible` uses, and it exists
   * for one reason: the seeded classes carry the synthetic owner `demo-owner`,
   * which is nobody's account id. In the fixture store every write succeeds
   * regardless of ownership, and in Postgres the seeded classes are owned by
   * the instructor's real account id, so the owner test alone would be correct
   * there. `isDemoStaff` cannot fire against a real account, because it matches
   * the fixed demo ids only.
   */
  const mayWrite = can(session.role, 'class:write');

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
     *
     * AND `isDemoStaff`, BECAUSE OWNERSHIP ALONE DENIES THE DEMO ITS OWN ROSTER.
     * This was the one seam left without the escape the fixture adapter applies
     * everywhere else — `rosterOwner`, `ownedClass`, `ownedDeck`, `getStudent`,
     * `listClasses`, `createFlashcardDeck` all special-case it. The seeded
     * classes carry the synthetic `demo-owner`, which is nobody's account id, so
     * comparing it to the caller made every demo teacher read as a stranger to
     * the classes they run the school on.
     *
     * The failure was silent and it was not cosmetic. The page then offered
     * "Add student" and "Import CSV" on a class whose roster it refused to
     * render, so a write could succeed and its result could never be seen or
     * checked — the same dangerous direction noted in `rosterOwner`, where the
     * fixture is stricter than Postgres and nothing fails loudly.
     *
     * `isDemoStaff` rather than `isDemoAccount`, so the demo student and the demo
     * parent keep only their own reach. And it cannot fire against a real
     * account: it matches the fixed demo ids, so under `LIKO_DATA_MODE=supabase`
     * this is the ownership test alone, unchanged.
     *
     * AND `accountId`, BECAUSE OWNERSHIP ALONE ALSO DENIES A PARENT THEIR CHILD.
     * The second clause here is the one the matrix calls `linked`: a student or a
     * guardian account reaches a class through the row their login is attached
     * to, and that row's `owner_id` is the TEACHER's account id, never their own.
     * So for exactly the roles the `linked` scope exists to serve, ownership was
     * false and the page printed "Roster not visible to you" over a roster it
     * had just been sent. The roster is already in hand by this point, so the
     * honest test is whether a row on it is attached to the caller.
     *
     * Still independent of whether an administrator *should* see children's
     * records: they own nothing and are attached to nothing, so this stays false
     * for them exactly as it did before.
     */
    rosterVisible:
      classRecord.ownerId === session.userId ||
      isDemoStaff(session.userId) ||
      (byClass.get(classRecord.id) ?? []).some(
        (student) => student.accountId === session.userId,
      ),
    /*
     * The write grant, which is narrower than the read grant above. A linked
     * student or guardian reads the roster they are attached to and holds
     * `class:write` at `no`, so they see the names and none of the controls.
     * An administrator reads the classes in the organisation and owns none of
     * them, so they see the class and none of the controls either.
     */
    mayManage:
      mayWrite &&
      (classRecord.ownerId === session.userId || isDemoStaff(session.userId)),
  }));

  return (
    <div className="mx-auto max-w-[72rem]">
      <PageHeader
        title="Classes"
        description="Every class you teach, with roster, term, and progress attached."
      />
      <ClassesManager classes={summaries} role={session.role} />
    </div>
  );
}
