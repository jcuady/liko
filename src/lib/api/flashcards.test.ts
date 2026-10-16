import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from './fixtures';

/**
 * The boundaries the database enforces with row level security.
 *
 * Fixture mode has no RLS, so every question a policy answers in Postgres is
 * answered by the adapter instead. These tests assert the adapter answers the
 * same way. They are not about the adapter being tidy; they are the only thing
 * standing between a demo and a boundary that the real deployment would refuse
 * and the fixture would happily allow.
 *
 * A failure here does not always mean the demo shows too much. It means the two
 * adapters have stopped telling the same story, which is the one thing this
 * seam exists to prevent.
 */

const STUDENT = 'usr_demo_noor';
const TEACHER = 'demo-owner';

const SHARED_DECK = 'deck_fc_chem_terms';
const STUDENT_DECK = 'deck_fc_own_revision';
const SHARED_CARD = 'card_fc_01';

function expectRefusal(run: () => Promise<unknown>) {
  return run().then(
    () => {
      throw new Error('expected the call to be refused');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      return error as Error;
    },
  );
}

describe('flashcard reads', () => {
  it('shows a student their own deck and the one shared into their class', async () => {
    const ids = (await fixtures.listFlashcardDecks(STUDENT)).map((deck) => deck.id);
    expect(ids).toContain(SHARED_DECK);
    expect(ids).toContain(STUDENT_DECK);
  });

  it("does not show a teacher a student's private deck", async () => {
    const ids = (await fixtures.listFlashcardDecks(TEACHER)).map((deck) => deck.id);
    expect(ids).toContain(SHARED_DECK);
    expect(ids).not.toContain(STUDENT_DECK);
  });

  it('lets a student read the cards of a deck shared into their class', async () => {
    const cards = await fixtures.listFlashcards(STUDENT, SHARED_DECK);
    expect(cards.map((card) => card.id)).toContain(SHARED_CARD);
  });

  it('refuses a deck that is neither theirs nor in their class', async () => {
    await expectRefusal(() => fixtures.listFlashcards(STUDENT, 'deck_does_not_exist'));
  });
});

describe('flashcard writes', () => {
  it('lets a student add a card to their own deck', async () => {
    const card = await fixtures.createFlashcard(STUDENT, STUDENT_DECK, {
      front: 'What is entropy?',
      back: 'A measure of the number of microstates a system can occupy.',
      hint: '',
      tags: [],
    });
    expect(card.deckId).toBe(STUDENT_DECK);
    expect(card.ownerId).toBe(STUDENT);
  });

  /*
   * The half that matters most. A student may study a teacher's deck and may
   * not change it: the database refuses through the "cards writable by deck
   * author" policy, and a fixture that allowed it would put an Add button on a
   * screen whose real counterpart fails on save.
   */
  it("refuses a student adding a card to a teacher's shared deck", async () => {
    await expectRefusal(() =>
      fixtures.createFlashcard(STUDENT, SHARED_DECK, {
        front: 'smuggled',
        back: 'smuggled',
        hint: '',
        tags: [],
      }),
    );
  });

  it("refuses a student editing a card in a teacher's shared deck", async () => {
    await expectRefusal(() =>
      fixtures.updateFlashcard(STUDENT, SHARED_CARD, {
        front: 'rewritten',
        back: 'rewritten',
        hint: '',
        tags: [],
      }),
    );
  });

  /*
   * Sharing is gated on owning a class, not on holding a role. A student owns no
   * class at all, so the option is not merely hidden in the interface: the write
   * is refused by the server, which is what makes hiding it honest rather than
   * cosmetic.
   */
  it('refuses a student sharing a deck into any class', async () => {
    const error = await expectRefusal(() =>
      fixtures.createFlashcardDeck(STUDENT, {
        title: 'Sneaky',
        subject: '',
        description: '',
        classId: 'cls_demo_01',
      }),
    );
    expect(error.message).toMatch(/class you own/i);
  });

  it('lets a student make a deck of their own with no class', async () => {
    const deck = await fixtures.createFlashcardDeck(STUDENT, {
      title: 'Biology: cells',
      subject: 'Biology',
      description: '',
      classId: null,
    });
    expect(deck.classId).toBeNull();
    expect(deck.sharedAt).toBeNull();
  });

  it('records a share date the moment a deck names a class', async () => {
    const deck = await fixtures.createFlashcardDeck(TEACHER, {
      title: 'Shared with the class',
      subject: '',
      description: '',
      classId: 'cls_demo_01',
    });
    // The constraint in the schema forbids a class with no share date, so the
    // adapter has to write both or the database refuses the insert.
    expect(deck.classId).toBe('cls_demo_01');
    expect(deck.sharedAt).not.toBeNull();
  });
});

describe('flashcard progress', () => {
  const base = {
    cardId: SHARED_CARD,
    status: 'new' as const,
    easeFactor: 2.5,
    intervalDays: 0,
    stepIndex: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: new Date().toISOString(),
    lastReviewedAt: null,
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    // The fixture store is a process singleton, so a row written by one test is
    // visible to the next. Progress is reset rather than left to accumulate.
    (fixtures as unknown as { reset?: () => void }).reset?.();
  });

  it('writes a schedule against the caller, ignoring the student id passed in', async () => {
    await fixtures.saveFlashcardProgress(STUDENT, {
      ...base,
      // Deliberately somebody else's id. The adapter resolves the roster row
      // from the session, so this must not land on them.
      studentId: 'stu_002',
    });

    const rows = await fixtures.listFlashcardProgress(STUDENT, SHARED_DECK);
    expect(rows.every((row) => row.studentId === 'stu_001')).toBe(true);
  });

  it("refuses a schedule for a teacher, who has no roster row", async () => {
    await expectRefusal(() => fixtures.saveFlashcardProgress(TEACHER, { ...base, studentId: 'stu_001' }));
  });

  it('reads only the schedules for the deck asked about', async () => {
    await fixtures.saveFlashcardProgress(STUDENT, { ...base, studentId: 'stu_001' });
    const shared = await fixtures.listFlashcardProgress(STUDENT, SHARED_DECK);
    const own = await fixtures.listFlashcardProgress(STUDENT, STUDENT_DECK);

    expect(shared.map((row) => row.cardId)).toContain(SHARED_CARD);
    expect(own.map((row) => row.cardId)).not.toContain(SHARED_CARD);
  });

  it('returns nothing for a teacher rather than failing the page', async () => {
    // A teacher has no roster row, so there is no schedule of theirs to read.
    // Throwing here would make the deck page fail for someone who only wanted
    // to look at the cards.
    await expect(fixtures.listFlashcardProgress(TEACHER, SHARED_DECK)).resolves.toEqual([]);
  });
});
/**
 * The load-bearing claims in the migration, asserted against the file itself.
 *
 * `pnpm check:sql` proves the schema parses, that every reference resolves and
 * that every table has row level security. It cannot tell whether a policy is
 * the right one. These are the three properties the whole feature rests on, and
 * each is the kind of thing a later "simplify this" would break silently,
 * because every version of it still parses.
 */
describe('flashcard schema invariants', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260101000000_initial_schema.sql'),
    'utf8',
  );

  it('keys a schedule on the card AND the student', () => {
    // One card in a shared deck has one schedule per student. A primary key of
    // (card_id) alone would let the first review of the day reset the class.
    expect(sql).toMatch(/primary key \(card_id, student_id\)/);
  });

  it('gives progress no owner column, so the generic owner policy cannot reach it', () => {
    // `flashcard_progress` is deliberately absent from the loop that stamps
    // `own rows` on every tenant table, because its owner is a student reached
    // through students.account_id and not through auth.uid().
    const table = sql.slice(sql.indexOf('create table if not exists public.flashcard_progress'));
    expect(table.slice(0, table.indexOf(');'))).not.toMatch(/owner_id/);
  });

  it('restricts progress to the student the row is about', () => {
    expect(sql).toMatch(
      /progress readable and writable by its student[\s\S]*?s\.account_id = \(select auth\.uid\(\)\)/,
    );
  });

  it('gates sharing on owning a class rather than on a role', () => {
    // A student owns no class, so the write is refused structurally. A role
    // check would have needed to read profiles from inside a policy.
    expect(sql).toMatch(/c\.owner_id = \(select auth\.uid\(\)\)/);
  });
});
