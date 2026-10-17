import { describe, expect, it } from 'vitest';

import { fixtures } from './fixtures';

/**
 * The one boundary `notifications` had no answer for.
 *
 * The table shipped with select, update and delete policies, all own-only, and
 * nothing that could create a row. The bell was wired to realtime for rows
 * nothing could produce, which is a surface that reads as live and is not.
 *
 * These tests are about the new insert path and nothing else: that fixture mode
 * and Postgres now tell the same story about who may write into whose inbox.
 * The Postgres half is proved in `rls-settling-test.mjs`, because only that
 * script talks to a real database with a real signed-in account.
 */

const TEACHER = 'usr_demo_maya';
const STUDENT = 'usr_demo_noor';

async function expectRefusal(run: () => Promise<unknown>): Promise<void> {
  await expect(run()).rejects.toThrow();
}

describe('createNotification', () => {
  it('lets a teacher notify a student on their own roster', async () => {
    const store = fixtures;

    const note = await store.createNotification(TEACHER, {
      recipientId: STUDENT,
      kind: 'schedule_updated',
      title: 'Your timetable changed',
      body: 'Chemistry moved to Thursday.',
      url: '/schedule',
    });

    expect(note.userId).toBe(STUDENT);
    expect(note.readAt).toBeNull();
  });

  it('puts the note in the recipient list and not in anybody else', async () => {
    const store = fixtures;

    const note = await store.createNotification(TEACHER, {
      recipientId: STUDENT,
      kind: 'class_linked',
      title: 'You are on a class',
      body: 'Biology has been added to your week.',
      url: null,
    });

    const theirs = await store.listNotifications(STUDENT);
    const mine = await store.listNotifications(TEACHER);

    expect(theirs.some((row) => row.id === note.id)).toBe(true);
    expect(mine.some((row) => row.id === note.id)).toBe(false);
  });

  it('refuses a note addressed to the writer', async () => {
    const store = fixtures;

    // The database refuses it with `user_id <> auth.uid()`. A teacher who owns
    // a class therefore cannot hand themselves one either, which is the half of
    // the rule that is easy to forget when only the "teaches them" half is
    // written down.
    await expectRefusal(() =>
      store.createNotification(TEACHER, {
        recipientId: TEACHER,
        kind: 'schedule_updated',
        title: 'For me',
        body: 'Nobody should be able to write this.',
        url: null,
      }),
    );
  });

  it('refuses a note addressed to somebody the writer does not teach', async () => {
    const store = fixtures;

    // A student holds `class:read` at `own`, so they see their own roster row.
    // Writing into it is a different question and the answer is no.
    await expectRefusal(() =>
      store.createNotification(STUDENT, {
        recipientId: 'usr_demo_ana',
        kind: 'schedule_updated',
        title: 'Not yours',
        body: 'A student cannot write into a classmate.',
        url: null,
      }),
    );
  });

  it('leaves the existing read, dismiss and delete rules alone', async () => {
    const store = fixtures;

    const note = await store.createNotification(TEACHER, {
      recipientId: STUDENT,
      kind: 'schedule_updated',
      title: 'Readable only by them',
      body: 'The read policy is unchanged by the insert policy.',
      url: null,
    });

    await store.markNotificationRead(STUDENT, note.id);
    const after = await store.listNotifications(STUDENT);
    expect(after.find((row) => row.id === note.id)?.readAt).not.toBeNull();

    // Marking it read as somebody else must not reach the row.
    await store.markNotificationRead(TEACHER, note.id);
    const stillMine = await store.listNotifications(STUDENT);
    expect(stillMine.find((row) => row.id === note.id)?.readAt).not.toBeNull();
  });
});

/**
 * `getStudent` is the other half of the producer, and it was wrong.
 *
 * `saveScheduleEntry` resolves the recipient through it and then writes a note.
 * A null here is a silent no-op: the class still saves, the note is never
 * created, and nothing says so. So the questions below are not about a getter,
 * they are about whether the notification has a producer at all.
 */
describe('getStudent as the producer resolves its recipient', () => {
  const ROSTER_ROW = 'stu_001';

  it('resolves the demo student for the demo teacher', async () => {
    /*
     * The seeded classes carry the synthetic `demo-owner`, which is nobody's
     * account id, so a raw `cls.ownerId === userId` refuses the row to the very
     * teacher the demo is built around. The database has no such id and would
     * return the row, which is the dangerous direction: a fixture stricter than
     * Postgres does not announce itself, it just makes a working feature look
     * broken everywhere the fixture is what runs.
     */
    const resolved = await fixtures.getStudent(TEACHER, ROSTER_ROW);
    expect(resolved, 'the demo teacher cannot resolve the demo student').not.toBeNull();
    expect(resolved?.accountId).toBe(STUDENT);
  });

  it('still refuses a student and a parent, who are demo accounts too', async () => {
    /*
     * `isDemoStaff` rather than `isDemoAccount`, and this is the reason. The
     * demo set contains a student and a guardian, and widening the escape to
     * every demo account would hand a parent, or a student, authority over a
     * child on somebody else's roster, which is the exact over-read
     * `isDemoStaff` exists to prevent.
     *
     * The row named here is `stu_101`, on the second class. The demo student's
     * own row is `stu_001`, and asking about that one tests nothing: they are
     * entitled to resolve themselves, which is an account link rather than an
     * ownership grant.
     */
    const SOMEONE_ELSES_ROW = 'stu_101';
    await expect(fixtures.getStudent(STUDENT, SOMEONE_ELSES_ROW)).resolves.toBeNull();
    await expect(fixtures.getStudent('usr_demo_parent', SOMEONE_ELSES_ROW)).resolves.toBeNull();
  });

  it('resolves a student to themselves, which is not an ownership grant', async () => {
    const own = await fixtures.getStudent(STUDENT, ROSTER_ROW);
    expect(own?.accountId).toBe(STUDENT);
  });
});