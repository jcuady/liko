import { assertRealDataMode } from '@/lib/data-mode';
import { findUserById, isDemoAccount, isDemoStaff, setAccountRole } from '@/lib/auth/store';
import {
  BUILT_IN_POLICIES,
  validatePolicy,
  type GradingPolicy,
} from '@/lib/grading/policy';
import { DataError } from './errors';
import { newInviteCode, inviteExpiry } from '@/lib/security/invite-code';
import { scoreAnswers } from '@/lib/omr/omr';
import { codeBlockFits, codeBlockWidthMm, SHEET_CONTENT_MM } from '@/lib/omr/code-block';
import {
  demoAssessments,
  demoAttendance,
  demoBehaviour,
  demoGrades,
  demoHistory,
  demoPlans,
  demoPolicies,
  demoProfiles,
  demoOrg,
  demoMemberships,
  demoDecks,
  demoFlashcardDecks,
  demoFlashcards,
  demoSlides,
  demoQuestions,
  secondClassStudents,
} from '@/lib/fixtures/workspace-seed';
import {
  heatmap,
  stats,
  students as fixtureStudents,
} from '@/lib/fixtures/workspace';
import type {
  AssessmentRecord,
  AttendanceStatus,
  AttendanceWrite,
  AttemptRecord,
  AttemptSummary,
  BehaviourLogRecord,
  ClassRecord,
  DeckRecord,
  FlashcardDeckRecord,
  FlashcardProgressRecord,
  FlashcardRecord,
  GradeRecord,
  GradingPolicyRecord,
  HeatCell,
  HistoryRecord,
  InviteRecord,
  LessonPlanRecord,
  MemberRecord,
  OrgRecord,
  ProfileRecord,
  QuestionRecord,
  SlideRecord,
  Stat,
  StudentQuiz,
  StudentQuizQuestion,
  StudentQuizSummary,
  StudentRecord,
} from './types';
import type { WorkspaceData, DeckAssetRecord } from './client';
import type {
  CalendarEventRecord,
  NotificationRecord,
  ScheduleEntryRecord,
  TermRecord,
} from './types';

/*
 * Values, not types: both are compared against, and an unknown value read from
 * a row has to read as the default rather than as a member of the closed set.
 */
import { SLIDE_THEMES, normaliseElements } from './types';

/**
 * Fixture adapter.
 *
 * Serves the built-in demo workspace so the marketing page, the hero device
 * mockups and the Playwright suite run with no network and no database.
 *
 * Every read passes through `assertRealDataMode`, so if `LIKO_DATA_MODE` is ever
 * `supabase` and this file is reached anyway, it throws on the first call rather
 * than quietly showing one teacher another set of demo names.
 *
 * The old `client.ts` this replaces simulated latency with a fixed sleep and
 * then returned fixtures. The delay is gone: it made every screen feel broken
 * without testing anything, and the real path's timing now comes from the
 * network.
 */

const CLASS_ID = 'cls_demo_01';
const SECOND_CLASS_ID = 'cls_demo_02';
const OWNER = 'demo-owner';

/**
 * The student demo account, and the roster row it is a login for.
 *
 * Both ids are fixed strings in `src/lib/auth/store.ts` and `workspace.ts`, named
 * here rather than imported so this file does not reach across into the shape of
 * the demo data for a constant that only ever means one thing.
 */
const DEMO_STUDENT_ACCOUNT = 'usr_demo_noor';
const LINKED_STUDENT_ID = 'stu_001';

function guard(operation: string): void {
  assertRealDataMode(operation);
}

interface FixtureStore {
  classes: ClassRecord[];
  students: StudentRecord[];
  attendance: Map<string, Record<string, AttendanceStatus>>;
  assessments: AssessmentRecord[];
  questions: QuestionRecord[];
  grades: GradeRecord[];
  attempts: AttemptRecord[];
  plans: LessonPlanRecord[];
  behaviour: BehaviourLogRecord[];
  history: HistoryRecord[];
  policies: GradingPolicyRecord[];
  /** Keyed by user id. The demo account is seeded; anyone else starts blank. */
  profiles: Map<string, ProfileRecord>;
  /**
   * Keyed by id. The demo school is seeded; every account registered during a
   * session gets its own, which is what a real signup produces.
   */
  orgs: Map<string, OrgRecord>;
  memberships: MemberRecord[];
  /** Issued invitations. Empty at boot, because a demo workspace has no admin who asked for one. */
  invites: InviteRecord[];
  decks: DeckRecord[];
  slides: SlideRecord[];
  /** Flashcard study material. Seeded so the demo student has something due. */
  flashDecks: FlashcardDeckRecord[];
  flashcards: FlashcardRecord[];
  /** Keyed `${cardId}:${studentId}`, mirroring the table's composite key. */
  flashProgress: Map<string, FlashcardProgressRecord>;
  /** Files brought into a deck. Seeded so the editor and the suite have something to render. */
  assets: DeckAssetRecord[];
  schedule: ScheduleEntryRecord[];
  terms: TermRecord[];
  events: CalendarEventRecord[];
  notifications: NotificationRecord[];
  /**
   * Generation history, per person.
   *
   * Present in the fixture adapter for one reason: the meter has to render
   * something other than "8 of 8 left" on a demo workspace, or the one surface
   * that tells a teacher what is left is never exercised by the suite. The
   * Supabase adapter reads a real table with the same shape.
   */
  aiGenerations: { userId: string; created_at: string; model: string }[];
}

function createStore(): FixtureStore {
  return {
    classes: [
      {
        id: CLASS_ID,
        ownerId: OWNER,
        name: 'Chemistry, Period 2',
        code: 'CHEM-2',
        level: 'k12',
        meetsPerWeek: 5,
        archivedAt: null,
        gradingPolicyId: null,
      },
      {
        // Grades on UK degree classes, so the demo shows a real choice rather
        // than every class sitting on the percentage default.
        id: SECOND_CLASS_ID,
        ownerId: OWNER,
        name: 'Biology, Period 4',
        code: 'BIO-4',
        level: 'k12',
        meetsPerWeek: 4,
        archivedAt: null,
        gradingPolicyId: 'pol_demo_uk',
      },
    ],
    students: [
      /*
       * `accountId` is null on every row except one, which is the honest
       * default: most students on a roster never need to sign in, and a demo that
       * pre-linked every child to a login would misrepresent the normal state.
       *
       * One row is linked, because without it no student could ever sit a quiz
       * in a demo and the whole student-facing half of the product would be
       * unreachable to anyone running one. `scripts/seed.mjs` links the same
       * account to the same student on the real project, so the fixture and the
       * database tell an identical story about who the student demo account is.
       */
      ...fixtureStudents.map((student) => ({
        id: student.id,
        classId: CLASS_ID,
        ownerId: OWNER,
        fullName: student.name,
        initials: student.initials,
        guardianName: null,
        guardianEmail: null,
        guardianPhone: null,
        archivedAt: null,
        accountId: student.id === LINKED_STUDENT_ID ? DEMO_STUDENT_ACCOUNT : null,
      })),
      ...secondClassStudents.map((student) => ({
        id: student.id,
        classId: SECOND_CLASS_ID,
        ownerId: OWNER,
        fullName: student.name,
        initials: student.initials,
        guardianName: null,
        guardianEmail: null,
        guardianPhone: null,
        archivedAt: null,
        accountId: null,
      })),
    ],
    attendance: demoAttendance(),
    assessments: demoAssessments,
    questions: demoQuestions,
    grades: demoGrades,
    attempts: [],
    plans: demoPlans,
    behaviour: demoBehaviour,
    history: demoHistory,
    policies: demoPolicies,
    profiles: new Map(demoProfiles.map((profile) => [profile.id, profile])),
    orgs: new Map([[demoOrg.id, { ...demoOrg }]]),
    memberships: demoMemberships.map((member) => ({ ...member })),
    invites: [],
    decks: demoDecks.map((deck) => ({ ...deck })),
    /*
     * Flashcards. Seeded against the demo student so the review session has
     * something to show on a fresh boot.
     *
     * Progress starts EMPTY on purpose. The scheduler owns when a card is due;
     * seeding a schedule here would be a stored value that only stays right
     * until the first review, which is the exact class of value this codebase
     * refuses to keep. A card with no row is `new`, and `new` is a real state
     * the scheduler can produce.
     */
    flashDecks: demoFlashcardDecks.map((deck) => ({ ...deck })),
    flashcards: demoFlashcards.map((card) => ({ ...card, tags: [...card.tags] })),
    flashProgress: new Map(),
    /*
     * The seeded slides predate elements, so they carry none. They are
     * normalised on the way in rather than trusted, which is the same seam the
     * Supabase mapper crosses, and a demo slide that renders through the legacy
     * layout is a demo of the fallback rather than a hole in the demo.
     */
    slides: demoSlides.map((slide) => ({
      ...slide,
      theme: SLIDE_THEMES.includes(slide.theme) ? slide.theme : 'viridian',
      elements: normaliseElements(slide.elements),
    })),
    assets: demoDeckAssets.map((asset) => ({ ...asset })),
    /*
     * The demo week is deliberately full enough to look like a real one rather
     * than a row of placeholders, because the grid is the screen a student
     * judges the product by and an almost-empty week reads as a broken feature.
     */
    schedule: demoSchedule.map((entry) => ({ ...entry })),
    terms: [],
    events: demoCalendarEvents.map((event) => ({ ...event })),
    notifications: demoNotifications.map((note) => ({ ...note })),
    /*
     * Three recent generations against the demo teacher, so the meter renders a
     * part-spent bar rather than a full one. A demo workspace that always reads
     * "8 of 8 left" never exercises the state a teacher will actually meet.
     */
    aiGenerations: [
      { userId: OWNER, model: 'gemini', created_at: minutesAgoIso(12) },
      { userId: OWNER, model: 'gemini', created_at: minutesAgoIso(40) },
      { userId: OWNER, model: 'gemini', created_at: minutesAgoIso(75) },
    ],
  };
}

/** An ISO timestamp `minutes` in the past, for seeding relative history. */
function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * A 1x1 transparent PNG, inlined.
 *
 * WHY A DATA URI AND NOT A PATH. There is no bucket behind the fixtures, so a
 * path would render as a broken image and the editor's image element would look
 * untested rather than demoed. One real image, repeated at different sizes, is
 * enough to show that the element places an asset correctly.
 */
const FIXTURE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Three assets on the demo deck: two images the editor can place and one
 * document whose text a teacher can turn into slides. All three are needed,
 * because they render through different parts of the panel and testing only one
 * would leave the other branches to be found by hand.
 *
 * WHY ONE OF THE IMAGES IS A REAL FILE RATHER THAN THE DATA URI ABOVE. A
 * transparent pixel proves an image element places an asset; it does not prove
 * `fit` does anything, because a one pixel square is `cover` and `contain` at
 * the same time. The renderer cannot be judged on it.
 */
const demoDeckAssets: DeckAssetRecord[] = [
  {
    id: 'ast_demo_reaction_curve',
    deckId: 'deck_demo_reaction_rates',
    ownerId: OWNER,
    kind: 'image',
    filename: 'reaction-curve.png',
    mime: 'image/png',
    byteSize: 20480,
    storagePath: `${OWNER}/deck_demo_reaction_rates/ast_demo_reaction_curve/reaction-curve.png`,
    // An image has no text. Storing an empty string rather than null would make
    // a caller unable to tell an empty extraction from an image.
    extractedText: null,
    createdAt: '2026-01-08T09:05:00.000Z',
    url: FIXTURE_IMAGE,
  },
  {
    id: 'ast_demo_chapter_notes',
    deckId: 'deck_demo_reaction_rates',
    ownerId: OWNER,
    kind: 'document',
    filename: 'chapter-4-notes.txt',
    mime: 'text/plain',
    byteSize: 1840,
    // A document is not stored, so it has no path and no URL. That is the shape
    // the real adapter produces too, and it is why the editor cannot render one
    // as an image.
    storagePath: null,
    extractedText:
      'Collision theory\n\nReaction rate depends on how often particles collide and how hard they hit.\n\nA catalyst gives the collisions more energy without raising the temperature.',
    createdAt: '2026-01-08T09:12:00.000Z',
    url: null,
  },
  {
    id: 'ast_demo_classroom_photo',
    deckId: 'deck_demo_reaction_rates',
    ownerId: OWNER,
    kind: 'image',
    filename: 'classroom-demo.jpg',
    mime: 'image/jpeg',
    byteSize: 48000,
    storagePath: `${OWNER}/deck_demo_reaction_rates/ast_demo_classroom_photo/classroom-demo.jpg`,
    extractedText: null,
    createdAt: '2026-01-08T09:18:00.000Z',
    // A file that ships with the app, so the renderer draws something a teacher
    // can actually see rather than an empty box.
    url: '/marketing/liko-flow-pill.jpg',
  },
];

/**
 * WHY THE STORE LIVES ON `globalThis`.
 *
 * A module-level `const store` is per *bundle*, not per process. Next gives a
 * page and the server action it calls separate copies of a shared module, so a
 * `createClass` write updated the action's copy while the page re-render read
 * the page's copy. The dialog reported success and nothing appeared: creating a
 * class, or adding a student, silently did nothing until a server restart.
 *
 * Storing it on the global object makes it a real singleton for the life of the
 * process, which is what an in-memory demo workspace has to be. In `supabase`
 * mode this file is unreachable, so nothing here is load-bearing in production.
 */
const globalScope = globalThis as typeof globalThis & {
  __likoFixtureStore?: FixtureStore;
};

/**
 * The demo student's week.
 *
 * WHY THIS IS NOT EMPTY. The weekly grid is the screen a student judges the
 * product by. A demo with one class on it reads as a feature that does not work,
 * so the week below is shaped like a real one: five days, back to back, with a
 * gap and a double slot, because a grid that has never rendered a collision is
 * a grid whose collision styling has never been seen either.
 *
 * THE DOUBLE SLOT IS REAL. The comment above claimed one and the times did not
 * actually overlap, so `detectConflicts` returned nothing and the banner on
 * `/schedule` was unreachable in the demo, in fixture mode and in the database
 * alike: a screen with no way to ever be seen. `Clinic` below starts 30 minutes
 * into `Technology` and runs 30 minutes past it, which is the one genuine
 * overlap in the week. Every other pair is either back to back or separated by a
 * real gap, because `detectConflicts` is strict and an abutting changeover is not
 * a clash.
 *
 * Times are minutes from midnight, the same unit the database stores, because
 * the fixtures are not allowed to be more forgiving than Postgres about it.
 */
const demoSchedule: ScheduleEntryRecord[] = [
  entry(1, 7 * 60, 'Filipino', 'Dela Cruz', 'Room 201'),
  entry(1, 8 * 60 + 30, 'Mathematics', 'Santos', 'Room 204'),
  entry(1, 10 * 60, 'English', 'Reyes', 'Room 118'),
  entry(2, 7 * 60 + 30, 'Science', 'Lopez', 'Lab 2'),
  entry(2, 9 * 60, 'Mathematics', 'Santos', 'Room 204'),
  entry(2, 10 * 60 + 30, 'History', 'Aquino', 'Room 210'),
  entry(3, 8 * 60, 'Science', 'Lopez', 'Lab 2'),
  entry(3, 9 * 60 + 30, 'English', 'Reyes', 'Room 118'),
  entry(3, 13 * 60, 'Technology', 'Cruz', 'Lab 1'),
  // The genuine double booking. Starts half an hour into Technology and runs half
  // an hour past its end, so the two overlap rather than merely sit close.
  entry(3, 13 * 60 + 30, 'Clinic', 'School nurse', null),
  entry(4, 7 * 60 + 30, 'Filipino', 'Dela Cruz', 'Room 201'),
  entry(4, 9 * 60, 'Mathematics', 'Santos', 'Room 204'),
  entry(4, 10 * 60 + 30, 'Physical Education', 'Ramos', 'Gym'),
  entry(5, 8 * 60, 'English', 'Reyes', 'Room 118'),
  entry(5, 10 * 60, 'Values Education', 'Torres', 'Room 105'),
];

function entry(
  dayOfWeek: number,
  startMinute: number,
  title: string,
  teacherName: string | null,
  room: string | null,
): ScheduleEntryRecord {
  return {
    id: `sch_demo_${dayOfWeek}_${startMinute}`,
    studentId: LINKED_STUDENT_ID,
    ownerId: OWNER,
    dayOfWeek,
    startMinute,
    endMinute: startMinute + 60,
    title,
    teacherName,
    room,
    source: 'manual',
    createdAt: '2026-01-05T00:00:00.000Z',
  };
}

/** Two dated things, so the calendar is not empty on first sight either. */
const demoCalendarEvents: CalendarEventRecord[] = [
  {
    id: 'evt_demo_1',
    ownerId: OWNER,
    studentId: LINKED_STUDENT_ID,
    title: 'Science quiz: electricity',
    notes: 'Chapters 4 to 6. Bring a calculator.',
    startsAt: '2026-03-12T09:00:00.000Z',
    endsAt: null,
    allDay: false,
    kind: 'assessment',
    createdByRole: 'instructor',
    createdAt: '2026-03-02T00:00:00.000Z',
  },
  {
    id: 'evt_demo_2',
    ownerId: OWNER,
    studentId: LINKED_STUDENT_ID,
    title: 'Project draft due',
    notes: null,
    startsAt: '2026-03-18T00:00:00.000Z',
    endsAt: null,
    allDay: true,
    kind: 'deadline',
    createdByRole: 'student',
    createdAt: '2026-03-05T00:00:00.000Z',
  },
];

/**
 * Three notes in the demo student's inbox, so the bell is not an empty circle.
 *
 * An inbox seeded empty is the same failure as an empty week: the feature is
 * there, it renders, and it renders nothing, so nobody can tell a working bell
 * from a missing one. Two are unread and one is read, because the badge, the
 * highlighted row and the "Mark all as read" state are three different renders
 * and a demo that only shows one of them shows the emptiest.
 *
 * These are rows that already exist, not rows this session wrote, so they do
 * not go through `createNotification` and its refusal rules. Nobody is writing
 * them here; the teacher wrote them before the demo started.
 */
const demoNotifications: NotificationRecord[] = [
  {
    id: 'ntf_demo_1',
    userId: DEMO_STUDENT_ACCOUNT,
    kind: 'schedule_updated',
    title: 'Your timetable changed',
    body: 'Chemistry was added to your week.',
    url: '/schedule',
    readAt: null,
    createdAt: '2026-03-09T08:12:00.000Z',
  },
  {
    id: 'ntf_demo_2',
    userId: DEMO_STUDENT_ACCOUNT,
    kind: 'class_linked',
    title: 'You are on a class',
    body: 'Biology has been added to your week.',
    url: '/classes',
    readAt: null,
    createdAt: '2026-03-08T14:40:00.000Z',
  },
  {
    id: 'ntf_demo_3',
    userId: DEMO_STUDENT_ACCOUNT,
    kind: 'schedule_updated',
    title: 'Your timetable changed',
    body: 'Physics moved to Thursday afternoon.',
    url: '/schedule',
    readAt: '2026-03-08T15:02:00.000Z',
    createdAt: '2026-03-07T11:05:00.000Z',
  },
];

const store: FixtureStore = (globalScope.__likoFixtureStore ??= createStore());

/**
 * The five scales that ship with the product, presented as records so the seam
 * hands every caller one list whether a scale is built in or authored. Mirrors
 * `builtInPolicies` in `client.ts`; both adapters must return the same shape.
 */
function builtInPolicies(): GradingPolicyRecord[] {
  return BUILT_IN_POLICIES.map((policy: GradingPolicy) => ({
    id: policy.id,
    ownerId: 'built-in',
    name: policy.label,
    kind: policy.kind,
    bands: [...policy.bands],
    builtIn: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  }));
}

function seededKey(classId: string, date: string): string {
  return `${classId}:${date}`;
}

/**
 * The roster row this account is a login for.
 *
 * `students.account_id` is the same link the database uses, which is what keeps
 * the two adapters telling the same story about who is who.
 */
function studentForUser(userId: string): StudentRecord | null {
  return (
    store.students.find((row) => row.accountId === userId && row.archivedAt === null) ?? null
  );
}

/**
 * The composite key of a schedule row.
 *
 * The same shape as the table's primary key, so a lookup here and a lookup
 * there cannot drift. Written out rather than nested because `${a}:${b}` is
 * the one place the two are allowed to agree by convention.
 */
function progressKey(cardId: string, studentId: string): string {
  return `${cardId}:${studentId}`;
}

/**
 * A deck the caller may read: their own, or one shared into their class.
 *
 * WHY NOT THE OWNERSHIP FILTER. `ownedDeck` answers "may I change this". A
 * review session only reads, and a student who cannot open the deck their
 * teacher shared has no product at all. Keeping the two apart is what stops the
 * read check from being written as the write check and the other way round.
 */
function readableDeck(store: FixtureStore, userId: string, deckId: string): FlashcardDeckRecord {
  const deck = store.flashDecks.find((row) => row.id === deckId);
  const student = studentForUser(userId);
  const permitted =
    deck !== undefined &&
    (deck.ownerId === userId || (student !== null && deck.classId === student.classId));
  if (!permitted) throw new DataError('NOT_FOUND', 'That deck does not exist.');
  return deck;
}

/**
 * A fixture id that has never been issued before.
 *
 * WHY NOT `store.x.length + 1`. Because the array shrinks. Archive a row and the
 * next insert reuses the id of the row that just went, and since the write path
 * treats a colliding id as an update, the new row silently overwrote an
 * unrelated existing one instead of raising anything. The counter only ever goes
 * up, so a fixture id can be deleted and never reissued.
 */
let fixtureSequence = 0;
function fixtureId(prefix: string, scope: string): string {
  fixtureSequence += 1;
  return `${prefix}_${fixtureSequence}_${scope}`;
}

/**
 * Resolves a roster row a caller is allowed to act on, or throws NOT_FOUND.
 *
 * WHY THIS EXISTS RATHER THAN A BARE LOOKUP. The Supabase adapter deliberately
 * ignores `userId` on the student's own rows because RLS answers the access
 * question in the database. Fixture mode has no RLS, so it has to answer it
 * here, or a demo would happily show one student another student's week. A
 * missing row and a forbidden row both raise NOT_FOUND on purpose: a caller who
 * probes ids should not be able to tell the two apart.
 */
function requireStudentFor(userId: string, studentId: string): StudentRecord {
  const row = store.students.find((candidate) => candidate.id === studentId);

  // RLS branch one, verbatim: the roster row's own account.
  const isThatStudent = row !== undefined && row.accountId === userId && row.archivedAt === null;
  if (isThatStudent) return row as StudentRecord;

  /*
   * RLS branch two, verbatim: the staff account that owns the student's class.
   * On the real project the schedule row carries that owner in `owner_id`,
   * `rosterOwner` resolves it from the roster, and the policy grants it to
   * `auth.uid()`.
   *
   * `row.ownerId` is the roster row's class owner. In the fixture workspace that
   * is the synthetic `demo-owner`, which is not any account's id, so comparing it
   * to `userId` denied the teacher who does own the class and every teacher's
   * view of a student's week landed on the error boundary instead of on a grid.
   * `isDemoStaff` is the same escape `ownedClass` and `ownedDeck` already use,
   * narrowed to teachers and administrators so the demo student and the demo
   * parent keep only their own reach.
   */
  const isOwningTeacher =
    row !== undefined && !studentForUser(userId) && (isDemoStaff(userId) || row.ownerId === userId);
  if (isOwningTeacher) return row as StudentRecord;

  // A missing row and a forbidden row are reported identically on purpose: a
  // caller who probes ids should not be able to tell the two apart.
  throw new DataError('NOT_FOUND', 'That student is no longer on a roster.');
}

/** One student's attempts at one assessment, newest first. */
function attemptsFor(store: FixtureStore, studentId: string, assessmentId: string): AttemptRecord[] {
  return store.attempts
    .filter((row) => row.studentId === studentId && row.assessmentId === assessmentId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * The attempt, but only if this account is the student sitting it.
 *
 * Returns null rather than throwing, so a forged id is indistinguishable from an
 * id that never existed. That matches the RLS read on the real project, where the
 * same query returns no rows.
 */
function ownedAttempt(
  store: FixtureStore,
  userId: string,
  attemptId: string,
): AttemptRecord | null {
  const attempt = store.attempts.find((row) => row.id === attemptId);
  const student = studentForUser(userId);
  if (!attempt || !student || attempt.studentId !== student.id) return null;
  return attempt;
}

/**
 * The organisation this account is currently acting in.
 *
 * Newest active membership first, matching the `order('created_at', desc)` in
 * `supabaseOrgFor`. That order is load-bearing rather than cosmetic: an account
 * holds two active memberships once it accepts an invitation, and taking the
 * first row here while the database takes the latest would mean the demo
 * workspace and the real project sent the same person to two different schools.
 */
function activeMembership(store: FixtureStore, userId: string): MemberRecord | null {
  const rows = store.memberships
    .filter((row) => row.userId === userId && row.status === 'active')
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
  return rows[0] ?? null;
}

/** Active admins of one organisation, which is the count that keeps a tenant recoverable. */
function countAdmins(store: FixtureStore, orgId: string): number {
  return store.memberships.filter(
    (row) => row.orgId === orgId && row.role === 'admin' && row.status === 'active',
  ).length;
}

/** People currently holding a seat, which is what `active_seat_count` counts. */
function activeSeatCount(store: FixtureStore, orgId: string): number {
  return store.memberships.filter(
    (row) => row.orgId === orgId && row.status === 'active',
  ).length;
}

/**
 * THE BLOCK, in a second place.
 *
 * Byte for byte the sentence `redeem_org_invite` raises, so the demo workspace
 * refuses a join in the same words the database does. A fixture that said
 * something softer would be worse than no block at all: the refusal is the part
 * of this flow a school administrator actually meets, and it has to read the
 * same whether the app is pointed at fixtures or at a database.
 *
 * The middle noun pluralises on the LIMIT, which is what the SQL does too, since
 * that is the number the sentence is about.
 */
function noRoomLeft(org: OrgRecord, active: number): DataError {
  return new DataError(
    'CONFLICT',
    `There is no room left: ${org.name} has ${active} active ` +
      `${org.seatLimit === 1 ? 'seat' : 'seats'} of ${org.seatLimit} seats. ` +
      'Ask an administrator to raise the seat limit, then use this code again.',
  );
}

/**
 * The organisation whose invitations this account may read or issue.
 *
 * The inner check behind `org:manage` at the action, for the same reason
 * `requireOrgManager` exists: a server action is a public endpoint, and the role
 * in the session is only half the answer to which school was meant.
 */
function requireOrgAdmin(store: FixtureStore, userId: string): OrgRecord {
  const caller = activeMembership(store, userId);
  if (caller?.role !== 'admin') {
    throw new DataError('FORBIDDEN', 'Only an admin can invite people to this organisation.');
  }

  const org = store.orgs.get(caller.orgId);
  if (!org) throw new DataError('NOT_FOUND', 'This account has no organisation yet.');
  return org;
}

/**
 * The organisation a newly registered account belongs to.
 *
 * One person, one organisation, and they administer it. Created on first use and
 * cached on the store so the id is stable for the life of the process.
 */
function personalOrg(userId: string, store: FixtureStore): { org: OrgRecord; membership: MemberRecord } {
  const existing = store.memberships.find((row) => row.userId === userId);
  if (existing) {
    const found = store.orgs.get(existing.orgId);
    if (found) return { org: found, membership: existing };
  }

  const orgId = `org_personal_${userId}`;
  const createdAt = new Date().toISOString();
  const org: OrgRecord = {
    id: orgId,
    name: 'My workspace',
    slug: `starter-${userId.slice(-8)}`,
    plan: 'starter',
    seatLimit: 1,
    billingEmail: null,
    createdAt,
    // A solo workspace is one person, so there is no principal, no grade span and
    // no enrolment to record. Every field is null and the status is the default,
    // which is also the state a school starts in before anyone fills the form in.
    profile: {
      countryCode: null,
      sector: null,
      gradeMin: null,
      gradeMax: null,
      enrolment: null,
      timezone: null,
      contactName: null,
      contactRole: null,
      verificationStatus: 'unverified',
      verifiedAt: null,
    },
  };

  const membership: MemberRecord = {
    id: `mem_personal_${userId}`,
    userId,
    orgId,
    fullName: '',
    email: '',
    role: 'admin',
    status: 'active',
    joinedAt: createdAt,
  };

  store.orgs.set(orgId, org);
  store.memberships.push(membership);

  return { org, membership };
}

/**
 * Refuses a membership write that is not made by an active admin of the same
 * organisation.
 *
 * The actions gate on `user:manage` already; this is the inner check, because a
 * server action is a public endpoint and the role in the session is only half the
 * answer to whose organisation a member id belongs to.
 */
function requireOrgManager(store: FixtureStore, userId: string, memberId: string): MemberRecord {
  const caller = activeMembership(store, userId);
  if (caller?.role !== 'admin') {
    throw new DataError('FORBIDDEN', 'Only an admin can manage people in this organisation.');
  }

  const target = store.memberships.find((row) => row.id === memberId);
  if (!target || target.orgId !== caller.orgId) {
    // Deliberately the same shape as a genuine miss: a crafted id from another
    // school should be indistinguishable from one that never existed.
    throw new DataError('NOT_FOUND', 'That person is not in your organisation.');
  }

  return target;
}

export const fixtures: WorkspaceData = {
  async listClasses(userId) {
    guard('listClasses');
    /*
     * The seeded demo workspace belongs to the demo accounts. Anyone who
     * registered during a demo session sees only the classes they created
     * themselves, which is both what really happens and what lets first-run
     * onboarding mean anything: otherwise a brand new teacher appears to own a
     * full roster and the wizard skips itself as already answered.
     *
     * "THE DEMO ACCOUNTS" IS NOT ONE KIND OF ACCOUNT. The seeded users include a
     * student and a guardian as well as the teachers, and this used to hand all
     * of them the entire class store. Two things were wrong with that at once.
     *
     * It told a student they were enrolled in a class they are not on: only the
     * first class has a linked account, so `stu_001` was shown the second class
     * as well. And it MASKED the production bug of the same name. The Supabase
     * adapter was filtering `owner_id` and returning an empty array to every
     * student, while this one returned two classes, so fixture mode, the demo
     * and the whole Playwright suite all looked healthy while the real student
     * landing page rendered empty. A fixture that is more permissive than the
     * database does not just differ from it; it hides the failures in it.
     *
     * So a student or guardian now sees the one class they are actually on, the
     * same answer the `linked read classes` policy gives.
     */
    if (isDemoAccount(userId)) {
      const enrolled = studentForUser(userId);
      if (enrolled) return store.classes.filter((row) => row.id === enrolled.classId);
      return store.classes;
    }
    return store.classes.filter((row) => row.ownerId === userId);
  },

  async listStudents(userId, classId) {
    guard('listStudents');
    ownedClass(store, userId, classId);
    return store.students.filter((student) => student.classId === classId);
  },

  async listStats(): Promise<Stat[]> {
    guard('listStats');
    return stats;
  },

  async getHeatmap(): Promise<HeatCell[]> {
    guard('getHeatmap');
    return heatmap;
  },

  async getAttendance(_userId, classId, date) {
    guard('getAttendance');
    /*
     * NO FALLBACK, AND THE FALLBACK THAT WAS HERE WAS A DIVERGENCE.
     *
     * This used to read `store.attendance.get(key) ?? attendance`, where
     * `attendance` is the static mixed-state map from `fixtures/workspace.ts`.
     * That map was written for the landing page's miniature — its own comment
     * says so — and the miniature now renders `sample-class.ts` instead. What
     * the fallback was left doing was answering for a date the store has no
     * register for, which the Supabase adapter does NOT do: it returns the
     * rows and nothing else, so a date with no register is empty and every
     * student reads "not set".
     *
     * So the fixture showed a teacher a register full of marks for a date
     * that does not exist, and the first write to that date REPLACED that
     * invented register with one real row, which made every other student's
     * mark vanish. The e2e suite could therefore have passed against a
     * register the product would never show, and the one spec that writes to
     * an unseeded date is the one that noticed.
     *
     * A fixture that disagrees with production is worse than no fixture,
     * because every assertion made against it is a claim about a product
     * that does not exist. This one now says what production says.
     */
    return store.attendance.get(seededKey(classId, date)) ?? {};
  },

  /*
   * These four took a classId and ignored it, so switching class in the
   * gradebook, planner, or assessment list kept showing the previous class's
   * rows. The Supabase adapter has always filtered correctly, which is exactly
   * why the fixture quietly disagreed with production instead of the other way
   * round.
   */
  async listAssessments(userId, classId) {
    guard('listAssessments');
    ownedClass(store, userId, classId);
    return store.assessments.filter((row) => row.classId === classId);
  },

  async listGrades(userId, classId) {
    guard('listGrades');
    ownedClass(store, userId, classId);
    const assessmentIds = new Set(
      store.assessments.filter((row) => row.classId === classId).map((row) => row.id),
    );
    return store.grades.filter((row) => assessmentIds.has(row.assessmentId));
  },

  async listLessonPlans(_userId, classId) {
    guard('listLessonPlans');
    return store.plans.filter((row) => row.classId === classId);
  },

  async listBehaviourLogs(_userId, classId) {
    guard('listBehaviourLogs');
    return store.behaviour.filter((row) => row.classId === classId);
  },

  async getStudentHistory(_userId, studentId) {
    guard('getStudentHistory');
    return store.history.filter((entry) => entry.studentId === studentId);
  },

  async markAttendance(_userId, write: AttendanceWrite) {
    guard('markAttendance');
    const key = seededKey(write.classId, write.date);
    const existing = store.attendance.get(key) ?? {};
    for (const mark of write.marks) {
      existing[mark.studentId] = mark.status;
    }
    store.attendance.set(key, existing);
  },

  async createClass(userId, input) {
    guard('createClass');
    const record: ClassRecord = {
      id: `cls_${store.classes.length + 1}`,
      // The real owner, not the demo owner, or a class a teacher just created
      // would be invisible to them: `listClasses` hands out the seeded demo
      // workspace only to the demo accounts.
      ownerId: userId,
      gradingPolicyId: null,
      ...input,
      archivedAt: null,
    };
    store.classes = [...store.classes, record];
    return record;
  },

  async archiveClass(_userId, classId) {
    guard('archiveClass');
    store.classes = store.classes.map((row) =>
      row.id === classId ? { ...row, archivedAt: new Date().toISOString() } : row,
    );
  },

  async createStudent(_userId, input) {
    guard('createStudent');
    const record: StudentRecord = {
      ...input,
      id: `stu_${store.students.length + 1}`,
      ownerId: OWNER,
      archivedAt: null,
    };
    store.students = [...store.students, record];
    return record;
  },

  async archiveStudent(_userId, studentId) {
    guard('archiveStudent');
    store.students = store.students.map((row) =>
      row.id === studentId ? { ...row, archivedAt: new Date().toISOString() } : row,
    );
  },

  async createAssessment(_userId, input) {
    guard('createAssessment');
    const record: AssessmentRecord = {
      ...input,
      id: `asm_${store.assessments.length + 1}`,
      ownerId: OWNER,
      archivedAt: null,
      // Always born without a code block. The block depends on the class size,
      // and the class is not settled when an assessment is created.
      idFormatEnabled: false,
      idFormatGroups: null,
      idFormatCodes: null,
    };
    store.assessments = [...store.assessments, record];
    return record;
  },

  async setAssessmentIdFormat(_userId, assessmentId, shape) {
    guard('setAssessmentIdFormat');
    const index = store.assessments.findIndex((row) => row.id === assessmentId);
    if (index === -1) throw new DataError('NOT_FOUND', 'That assessment no longer exists.');

    /*
     * The shape is refused here exactly as the database check refuses it, rather
     * than being clamped. A teacher who asked for nine codes per digit has made a
     * mistake, and silently turning that into eight would print a sheet whose
     * block the scan route is then told to expect a different size of.
     */
    if (shape && (shape.groups < 1 || shape.groups > 3 || shape.perGroup < 2 || shape.perGroup > 8)) {
      throw new DataError('VALIDATION', 'That code block size cannot be printed.');
    }
    if (shape && !codeBlockFits(shape.groups, shape.perGroup)) {
      throw new DataError(
        'VALIDATION',
        `That code block is ${Math.round(codeBlockWidthMm(shape.groups, shape.perGroup))}mm wide and the ` +
          `sheet has ${SHEET_CONTENT_MM}mm to print in.`,
      );
    }

    store.assessments = store.assessments.map((row, at) =>
      at !== index
        ? row
        : shape
          ? { ...row, idFormatEnabled: true, idFormatGroups: shape.groups, idFormatCodes: shape.perGroup }
          : { ...row, idFormatEnabled: false, idFormatGroups: null, idFormatCodes: null },
    );
  },

  async upsertGrade(_userId, input) {
    guard('upsertGrade');
    const existing = store.grades.find(
      (row) =>
        row.assessmentId === input.assessmentId && row.studentId === input.studentId,
    );

    if (existing) {
      Object.assign(existing, input, {
        source: input.source ?? 'manual',
        scanDetail: input.source === 'scan' ? (input.scanDetail ?? null) : null,
        gradedAt: new Date().toISOString(),
      });
      return existing;
    }

    const record: GradeRecord = {
      id: `grd_${store.grades.length + 1}`,
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      ownerId: OWNER,
      score: input.score,
      maxScore: input.maxScore,
      rubric: [],
      feedback: input.feedback ?? null,
      source: input.source ?? 'manual',
      scanDetail: input.source === 'scan' ? (input.scanDetail ?? null) : null,
      gradedAt: new Date().toISOString(),
    };
    store.grades = [...store.grades, record];
    return record;
  },

  async getAssessment(_userId, assessmentId) {
    guard('getAssessment');
    return store.assessments.find((row) => row.id === assessmentId) ?? null;
  },

  async listQuestions(_userId, assessmentId) {
    guard('listQuestions');
    return store.questions
      .filter((row) => row.assessmentId === assessmentId)
      .sort((a, b) => a.position - b.position);
  },

  /*
   * The student half, mirroring what the SQL functions do on the real project.
   *
   * WHY THE CALLER'S ID IS USED HERE AND IGNORED THERE. In Supabase mode `auth.uid()`
   * decides which student is asking and this adapter must not be able to say
   * otherwise. Fixtures have no auth.uid(), so the account has to be resolved to a
   * roster row by the same link the database uses: `students.account_id`. The two
   * adapters therefore answer the same question from different sources, and both
   * refuse an assessment outside the caller's own class.
   */
  async listStudentQuizzes(userId) {
    guard('listStudentQuizzes');
    const student = studentForUser(userId);
    if (!student) return [];

    const quizzes = store.assessments
      .filter((assessment) => assessment.classId === student.classId)
      .map((assessment): StudentQuizSummary => {
        const attempts = attemptsFor(store, student.id, assessment.id);
        const open = attempts.find((attempt) => attempt.status === 'in_progress') ?? null;
        const latest = attempts[0] ?? null;
        return {
          assessmentId: assessment.id,
          title: assessment.title,
          className: store.classes.find((row) => row.id === student.classId)?.name ?? '',
          dueOn: assessment.dueOn,
          questionCount: store.questions.filter((row) => row.assessmentId === assessment.id).length,
          attemptId: open ? open.id : null,
          status: latest ? latest.status : null,
          submittedAt: latest ? latest.submittedAt : null,
          attemptNumber: attempts.filter((attempt) => attempt.status === 'submitted').length,
        };
      })
      // A quiz with no questions cannot be sat, so it is not on the list either.
      .filter((quiz) => quiz.questionCount > 0);

    return quizzes;
  },

  async getStudentQuiz(userId, attemptId) {
    guard('getStudentQuiz');
    const attempt = ownedAttempt(store, userId, attemptId);
    if (!attempt) return null;

    const assessment = store.assessments.find((row) => row.id === attempt.assessmentId);
    const questions = store.questions
      .filter((row) => row.assessmentId === attempt.assessmentId)
      .sort((a, b) => a.position - b.position)
      // Built field by field rather than by spreading the record, because a
      // spread would carry `answerKey` straight onto the student's payload the
      // first time a field was added to `QuestionRecord`.
      .map(
        (question): StudentQuizQuestion => ({
          id: question.id,
          kind: question.kind,
          prompt: question.prompt,
          options: question.options.map((option) => ({ key: option.key, text: option.text })),
        }),
      );

    const siblings = attemptsFor(store, attempt.studentId, attempt.assessmentId).filter(
      (row) => row.id !== attempt.id && row.status === 'submitted',
    ).length;

    return {
      attemptId: attempt.id,
      assessmentId: attempt.assessmentId,
      title: assessment?.title ?? '',
      className: store.classes.find((row) => row.id === assessment?.classId)?.name ?? '',
      dueOn: assessment?.dueOn ?? null,
      questions,
      responses: attempt.responses,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      attemptNumber: siblings + (attempt.status === 'submitted' ? 1 : 0),
    } satisfies StudentQuiz;
  },

  async startQuizAttempt(userId, assessmentId) {
    guard('startQuizAttempt');
    const student = studentForUser(userId);
    const assessment = store.assessments.find((row) => row.id === assessmentId);

    // The SQL function refuses in one sentence and so does this: the assessment
    // has to be one the caller is actually on the roster of.
    if (!student || !assessment || assessment.classId !== student.classId) {
      throw new DataError('FORBIDDEN', 'That quiz is not one of yours.');
    }

    // `ownerId` is read from the assessment, never from the caller, matching
    // `start_quiz_attempt` where it comes from a row the caller cannot edit.
    const record: AttemptRecord = {
      id: `att_${store.attempts.length + 1}`,
      assessmentId,
      studentId: student.id,
      ownerId: assessment.ownerId,
      status: 'in_progress',
      responses: [],
      score: null,
      maxScore: null,
      startedAt: new Date().toISOString(),
      submittedAt: null,
    };
    store.attempts = [...store.attempts, record];
    return { ...record };
  },

  async saveQuizResponses(userId, attemptId, responses) {
    guard('saveQuizResponses');
    const attempt = ownedAttempt(store, userId, attemptId);
    if (!attempt) throw new DataError('NOT_FOUND', 'That attempt does not exist.');
    if (attempt.status !== 'in_progress') {
      throw new DataError('CONFLICT', 'That attempt is no longer open for answers.');
    }

    // Only the field the column grant allows. The write builds a new record
    // rather than assigning onto the old one, so widening this later to set a
    // score is a visible edit rather than an inherited one.
    const updated: AttemptRecord = { ...attempt, responses };
    store.attempts = store.attempts.map((row) => (row.id === attemptId ? updated : row));
    return { ...updated };
  },

  async submitQuizAttempt(userId, attemptId) {
    guard('submitQuizAttempt');
    const attempt = ownedAttempt(store, userId, attemptId);
    if (!attempt) throw new DataError('NOT_FOUND', 'That attempt does not exist.');
    if (attempt.status === 'submitted') {
      throw new DataError('CONFLICT', 'That attempt was already submitted.');
    }

    const questions = store.questions
      .filter((row) => row.assessmentId === attempt.assessmentId)
      .sort((a, b) => a.position - b.position);

    // The same recomputation the Supabase adapter does, from the stored key and
    // never from anything the client sent.
    const result = scoreAnswers(
      questions.map((question) => ({
        id: question.id,
        kind: question.kind,
        answerKey: question.answerKey,
        points: question.points,
      })),
      attempt.responses.map((response) => ({
        questionIndex: response.questionIndex,
        optionKeys: response.optionKeys,
      })),
    );

    const submittedAt = new Date().toISOString();
    const updated: AttemptRecord = {
      ...attempt,
      status: 'submitted',
      score: result.score,
      maxScore: result.maxScore,
      submittedAt,
    };
    store.attempts = store.attempts.map((row) => (row.id === attemptId ? updated : row));

    await fixtures.upsertGrade(attempt.ownerId, {
      assessmentId: attempt.assessmentId,
      studentId: attempt.studentId,
      score: result.score,
      maxScore: result.maxScore,
      source: 'online',
      scanDetail: null,
    });

    return { ...updated };
  },

  async listAttempts(userId, assessmentId) {
    guard('listAttempts');
    const rows = store.attempts
      .filter((row) => row.ownerId === userId && row.assessmentId === assessmentId)
      .map(
        (row): AttemptSummary => ({
          id: row.id,
          studentId: row.studentId,
          studentName:
            store.students.find((student) => student.id === row.studentId)?.fullName ??
            'Unknown student',
          status: row.status,
          score: row.score,
          maxScore: row.maxScore,
          startedAt: row.startedAt,
          submittedAt: row.submittedAt,
        }),
      );

    // Newest per student, matching the Supabase adapter, so the two cannot
    // disagree about which attempt the mark came from.
    const newest = new Map<string, AttemptSummary>();
    for (const row of rows) {
      if (!newest.has(row.studentId)) newest.set(row.studentId, row);
    }
    return [...newest.values()];
  },

  async saveQuestions(_userId, questions) {
    guard('saveQuestions');
    if (questions.length === 0) return [];
    const assessmentId = questions[0]!.assessmentId;

    // Whole-set replace, mirroring the Supabase adapter: rows the caller dropped
    // are deleted rather than left behind, so the fixture cannot drift into
    // agreeing with production on updates while disagreeing on deletions.
    const kept = new Set(questions.map((q) => q.id).filter(Boolean));
    store.questions = [
      ...store.questions.filter(
        (row) => row.assessmentId !== assessmentId || (row.id && kept.has(row.id)),
      ),
      ...questions.map((question, index) => ({
        ...question,
        id: question.id ?? `qst_${assessmentId}_${index + 1}`,
        ownerId: OWNER,
        assessmentId,
        position: question.position ?? index,
      })),
    ];
    return store.questions
      .filter((row) => row.assessmentId === assessmentId)
      .sort((a, b) => a.position - b.position);
  },

  async saveLessonPlan(_userId, input) {
    guard('saveLessonPlan');
    if (input.id) {
      const existing = store.plans.find((row) => row.id === input.id);
      if (existing) {
        Object.assign(existing, input);
        return existing;
      }
    }
    const record: LessonPlanRecord = {
      ...input,
      id: `plan_${store.plans.length + 1}`,
      ownerId: OWNER,
    };
    store.plans = [record, ...store.plans];
    return record;
  },

  async addBehaviourLog(_userId, input) {
    guard('addBehaviourLog');
    store.behaviour = [
      {
        id: `log_${store.behaviour.length + 1}`,
        ...input,
        ownerId: OWNER,
        createdAt: new Date().toISOString(),
      },
      ...store.behaviour,
    ];

    /*
     * A behaviour entry is also a line on the cumulative record. The history page
     * deliberately puts the entry form beside the timeline it feeds, and promises
     * the entry stays on the record. Writing only `behaviour` meant the note was
     * saved, the toast said it was, and the timeline never showed it.
     */
    await fixtures.appendHistory(_userId, {
      studentId: input.studentId,
      eventType: input.severity === 'note' ? 'note' : 'intervention',
      payload: { entry: input.entry, severity: input.severity },
    });
  },

  async appendHistory(_userId, input) {
    guard('appendHistory');
    store.history = [
      {
        id: `hist_${store.history.length + 1}`,
        studentId: input.studentId,
        ownerId: OWNER,
        eventType: input.eventType,
        payload: input.payload ?? {},
        occurredAt: new Date().toISOString(),
      },
      ...store.history,
    ];
  },

  async listPolicies(userId) {
    guard('listPolicies');
    /*
     * Authored scales belong to the account that wrote them, exactly as classes
     * do. Returning the whole list handed every newly registered teacher the
     * demo organisation's two custom scales on the onboarding screen, which is
     * both a data leak and a wrong first impression: those are not scales they
     * wrote and cannot edit.
     */
    return [
      ...builtInPolicies(),
      ...store.policies.filter((policy) => isDemoAccount(userId) || policy.ownerId === userId),
    ];
  },

  async savePolicy(userId, input) {
    guard('savePolicy');
    const problems = validatePolicy(input);
    if (problems.length > 0) {
      throw new DataError('INVALID', problems[0]);
    }

    if (input.id) {
      const existing = store.policies.find((policy) => policy.id === input.id);
      if (!existing) {
        throw new DataError('NOT_FOUND', 'That scale no longer exists.');
      }
      if (!isDemoAccount(userId) && existing.ownerId !== userId) {
        throw new DataError('FORBIDDEN', 'That scale belongs to another account.');
      }
      Object.assign(existing, { name: input.name, kind: input.kind, bands: input.bands });
      return existing;
    }

    const record: GradingPolicyRecord = {
      id: `pol_${store.policies.length + 1}`,
      ownerId: userId,
      name: input.name,
      kind: input.kind,
      bands: input.bands,
      builtIn: false,
      createdAt: new Date().toISOString(),
    };
    store.policies = [...store.policies, record];
    return record;
  },

  async setClassPolicy(_userId, classId, policyId) {
    guard('setClassPolicy');
    store.classes = store.classes.map((row) =>
      row.id === classId ? { ...row, gradingPolicyId: policyId } : row,
    );
  },

  async getProfile(userId) {
    guard('getProfile');

    const saved = store.profiles.get(userId);
    if (saved) return saved;

    /*
     * One profile per account, not one profile for the process.
     *
     * This was a single object, so every teacher who registered inherited the
     * demo account's school, subjects, and scale, which made `/welcome` see the
     * setup as already answered and redirect every new account straight past the
     * wizard. The profile follows the person, exactly as the `profiles` row does
     * in Supabase.
     *
     * The name and address come from the auth store, mirroring the
     * `handle_new_user` trigger, which copies them out of the signup metadata.
     */
    const account = await findUserById(userId);

    /*
     * The lookup above awaits, and `findUserById` seeds the demo accounts on
     * first use, which hashes with scrypt. A request that arrived in that gap
     * can already have written a real profile, so the cache is re-read before
     * this synthesised record is stored. Without the re-read, a stale
     * synthesise lands last and overwrites the name and answers the teacher
     * had just saved, which surfaced as a registration losing its name whenever
     * two requests for the same account overlapped.
     */
    const written = store.profiles.get(userId);
    if (written) return written;

    const synthesised: ProfileRecord = {
      id: userId,
      email: account?.email ?? '',
      fullName: account?.name ?? '',
      role: account?.role ?? 'instructor',
      schoolName: null,
      subjects: [],
      defaultGradeLevel: null,
      gradingPolicyId: null,
      orgId: null,
    };

    store.profiles.set(userId, synthesised);
    return synthesised;
  },

  async updateProfile(userId, input) {
    guard('updateProfile');
    const existing = await fixtures.getProfile(userId);
    // `getProfile` synthesises a record rather than returning null, so this cast
    // is only satisfying the seam's nullable signature. Spreading the union
    // directly would widen every field of `ProfileRecord` to optional.
    const record: ProfileRecord = { ...(existing as ProfileRecord), ...input };
    store.profiles.set(userId, record);
    return record;
  },

  /*
   * Tenancy.
   *
   * The demo accounts are one school's staff. An account registered during a
   * session is its own organisation with itself as the only admin, which is what
   * a real signup produces, and it keeps the admin page from showing a new
   * teacher a roster of strangers they did not invite.
   */
  async getOrg(userId) {
    guard('getOrg');
    const membership = activeMembership(store, userId);
    if (membership) {
      const org = store.orgs.get(membership.orgId);
      if (org) return { ...org };
    }
    if (isDemoAccount(userId)) return { ...(store.orgs.get(demoOrg.id) as OrgRecord) };
    return { ...personalOrg(userId, store).org };
  },

  async updateOrg(userId, input) {
    guard('updateOrg');

    const membership = activeMembership(store, userId);
    if (membership?.role !== 'admin') {
      throw new DataError('FORBIDDEN', 'Only an admin can change the organisation.');
    }

    const org = store.orgs.get(membership.orgId);
    if (!org) throw new DataError('NOT_FOUND', 'This account has no organisation yet.');

    org.name = input.name;
    org.plan = input.plan;
    org.billingEmail = input.billingEmail;

    /*
     * The seat limit cannot be lowered below the people already sitting on
     * seats. A limit below the current headcount is not a stricter limit, it is
     * an organisation that has already broken its own rule, and the admin who
     * set it would then have no way to fix anything else about it. The same
     * refusal exists on the Supabase path, in `updateOrg` there.
     */
    const seated = store.memberships.filter(
      (row) => row.orgId === org.id && row.status === 'active',
    ).length;
    if (input.seatLimit < seated) {
      throw new DataError(
        'CONFLICT',
        `This workspace already has ${seated} active ${seated === 1 ? 'person' : 'people'}. ` +
          `A limit below that cannot be applied.`,
      );
    }
    org.seatLimit = input.seatLimit;

    /*
     * The institutional profile is merged rather than replaced, because every
     * field on it is independently optional and a form that saves three fields
     * should not blank the other five. The verification status is NOT writable
     * here: nothing in the product may mark a school as checked.
     */
    if (input.profile) {
      org.profile = { ...org.profile, ...input.profile };
    }

    return { ...org };
  },

  async listMembers(userId) {
    guard('listMembers');

    const membership = activeMembership(store, userId);
    if (!membership) return [];
    const org = store.orgs.get(membership.orgId);
    if (!org) return [];

    const rows = store.memberships.filter((row) => row.orgId === org.id);
    // Names and addresses are read from the profiles those accounts already
    // have, so a change to someone's name shows up here instead of leaving a
    // second copy in this table to drift out of step with it.
    const profiles = await Promise.all(rows.map((row) => fixtures.getProfile(row.userId)));

    return rows.map((row, index) => ({
      ...row,
      fullName: profiles[index]?.fullName || row.fullName,
      email: profiles[index]?.email || row.email,
    }));
  },

  async setMemberRole(userId, memberId, role) {
    guard('setMemberRole');
    const member = requireOrgManager(store, userId, memberId);

    // Demoting the last admin would leave the organisation with nobody who can
    // manage it and nobody who could restore that. Refused with a reason rather
    // than performed.
    if (member.role === 'admin' && role !== 'admin' && countAdmins(store, member.orgId) === 1) {
      throw new DataError('CONFLICT', 'This is the only admin. Promote someone else first.');
    }

    member.role = role;

    // The account's own role follows, because that is what the permission matrix
    // and the session are checked against. Writing only the membership would
    // leave the console promising a change it had not actually made.
    await setAccountRole(member.userId, role);
    const profile = store.profiles.get(member.userId);
    if (profile) profile.role = role;
  },

  async setMemberStatus(userId, memberId, status) {
    guard('setMemberStatus');
    const member = requireOrgManager(store, userId, memberId);

    if (member.userId === userId && status === 'suspended') {
      throw new DataError('CONFLICT', 'You cannot suspend your own access.');
    }
    if (member.role === 'admin' && status === 'suspended' && countAdmins(store, member.orgId) === 1) {
      throw new DataError('CONFLICT', 'This is the only admin. Promote someone else first.');
    }

    member.status = status;

    /*
     * Suspension has to reach the session too. The session carries a copy of
     * the account role, so without this a suspended colleague would keep working
     * until their token expired, which is the opposite of what a suspension is
     * for.
     */
    const profile = store.profiles.get(member.userId);
    if (profile) profile.orgId = status === 'active' ? member.orgId : null;
  },

  async listInvites(userId) {
    guard('listInvites');
    const org = requireOrgAdmin(store, userId);

    return store.invites
      .filter((row) => row.orgId === org.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({ ...row }));
  },

  async createInvite(userId, input) {
    guard('createInvite');
    const org = requireOrgAdmin(store, userId);

    /*
     * No seat check here, and the Supabase path has none either: a code can sit
     * unclaimed until it expires, so counting at issue time would refuse people
     * who never joined. The seat is spent in `redeemInvite`, which is where the
     * database spends it too.
     */
    const invite: InviteRecord = {
      id: `inv_${crypto.randomUUID()}`,
      orgId: org.id,
      email: input.email,
      role: input.role,
      // The same generator the Supabase path uses, so a demo code is as
      // unguessable as a real one and a test cannot learn to predict them.
      code: newInviteCode(),
      createdBy: userId,
      createdAt: new Date().toISOString(),
      expiresAt: inviteExpiry(),
      acceptedAt: null,
      acceptedBy: null,
    };

    store.invites.push(invite);
    return { ...invite };
  },

  async redeemInvite(userId, code) {
    guard('redeemInvite');

    const normalised = code.trim().toUpperCase();

    /*
     * The same four refusals, in the same order, with the same wording as
     * `redeem_org_invite`. Order matters because each refusal is a different
     * answer for the person holding the code: an unused code handed to somebody
     * who already joined is "you are already part of that school", and reporting
     * "no room left" instead would send them to the wrong person.
     */
    const invite = store.invites.find(
      (row) =>
        row.code === normalised &&
        row.acceptedAt === null &&
        new Date(row.expiresAt).getTime() > Date.now(),
    );
    if (!invite) {
      throw new DataError(
        'CONFLICT',
        'That invitation code is not valid, has expired, or has already been used.',
      );
    }

    const org = store.orgs.get(invite.orgId);
    if (!org) throw new DataError('NOT_FOUND', 'This account has no organisation yet.');

    // Any membership, not just an active one: the SQL check is `exists`, because a
    // suspended member still belongs to the school and re-accepting would give
    // them a second row to be counted twice.
    const already = store.memberships.some(
      (row) => row.orgId === org.id && row.userId === userId,
    );
    if (already) {
      throw new DataError('CONFLICT', 'You are already part of that school.');
    }

    const active = activeSeatCount(store, org.id);
    if (active >= org.seatLimit) throw noRoomLeft(org, active);

    const profile = store.profiles.get(userId);
    const joinedAt = new Date().toISOString();
    store.memberships.push({
      id: `mem_${crypto.randomUUID()}`,
      userId,
      orgId: org.id,
      fullName: profile?.fullName ?? '',
      email: profile?.email ?? '',
      role: invite.role,
      status: 'active',
      joinedAt,
    });

    /*
     * `accepted_at` is what makes a code single use, and it is written after the
     * seat check rather than before it: a refused redemption must leave the code
     * usable, because the sentence it was refused with ends by telling the person
     * to use it again.
     */
    invite.acceptedAt = joinedAt;
    invite.acceptedBy = userId;

    return { orgId: org.id, orgName: org.name };
  },

  /*
   * Slide decks.
   *
   * Ownership follows the classes: the demo workspace's deck belongs to the demo
   * accounts, and an account registered during a session sees only what it
   * created. An editor that opened onto somebody else's lesson would be worse
   * than an empty one.
   */
  async listDecks(userId) {
    guard('listDecks');
    const rows = isDemoAccount(userId) ? store.decks : store.decks.filter((d) => d.ownerId === userId);
    return rows
      .filter((deck) => deck.archivedAt === null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((deck) => ({ ...deck }));
  },

  async createDeck(userId, input) {
    guard('createDeck');
    const now = new Date().toISOString();
    const deck: DeckRecord = {
      id: `deck_${store.decks.length + 1}`,
      ownerId: userId,
      title: input.title,
      description: input.description,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.decks = [...store.decks, deck];

    // A deck with no slides cannot be opened, so a new one opens with a title
    // slide. That is also what the teacher is about to replace.
    store.slides = [
      ...store.slides,
      {
        id: `sld_${store.slides.length + 1}`,
        deckId: deck.id,
        ownerId: userId,
        position: 0,
        layout: 'title',
        theme: 'viridian',
        elements: null,
        title: input.title,
        body: '',
        notes: '',
        updatedAt: now,
      },
    ];

    return { ...deck };
  },

  async updateDeck(userId, deckId, input) {
    guard('updateDeck');
    const deck = ownedDeck(store, userId, deckId);
    deck.title = input.title;
    deck.description = input.description;
    deck.updatedAt = new Date().toISOString();
    return { ...deck };
  },

  async archiveDeck(userId, deckId) {
    guard('archiveDeck');
    const deck = ownedDeck(store, userId, deckId);
    // Soft delete, like everything else that has history behind it.
    deck.archivedAt = new Date().toISOString();
  },

  /*
   * Flashcards.
   *
   * Fixture mode has no RLS, so every access question the database answers in a
   * policy is answered here instead. That is the whole reason these methods
   * exist rather than a shared helper over the store: a demo that quietly
   * handed one student another's deck would be the fixture lying about the
   * boundary the real adapter enforces.
   */
  async listFlashcardDecks(userId) {
    guard('listFlashcardDecks');
    const student = studentForUser(userId);

    return store.flashDecks
      .filter((deck) => deck.archivedAt === null)
      .filter((deck) => deck.ownerId === userId || (student && deck.classId === student.classId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((deck) => ({ ...deck }));
  },

  async createFlashcardDeck(userId, input) {
    guard('createFlashcardDeck');
    /*
     * The database refuses to share into a class the writer does not own. The
     * check is repeated here so fixture mode refuses it the same way rather
     * than granting a student a publish button the real adapter would deny.
     *
     * `isDemoStaff` is the escape `ownedClass` and `ownedDeck` already use, and
     * it is deliberately the narrower helper rather than `isDemoAccount`. The
     * seeded demo store is owned by a synthetic owner, so a raw
     * `ownerId === userId` comparison refuses every demo teacher every time and
     * sharing becomes unreachable in fixture mode, in the demo, and in this
     * suite. Widening it to `isDemoAccount` would over-correct: the demo set
     * includes a student and a guardian, and a student owns no class, so that
     * would hand them a publish into a class the database would refuse. Staff
     * is exactly the set that owns a class.
     */
    if (
      input.classId &&
      !isDemoStaff(userId) &&
      !store.classes.some((cls) => cls.id === input.classId && cls.ownerId === userId)
    ) {
      throw new DataError('FORBIDDEN', 'You can only share a deck into a class you own.');
    }

    const now = new Date().toISOString();
    const deck: FlashcardDeckRecord = {
      id: fixtureId('deck_fc', userId),
      ownerId: userId,
      classId: input.classId,
      title: input.title,
      subject: input.subject,
      description: input.description,
      sharedAt: input.classId ? now : null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.flashDecks = [...store.flashDecks, deck];
    return { ...deck };
  },

  async updateFlashcardDeck(userId, deckId, input) {
    guard('updateFlashcardDeck');
    const deck = store.flashDecks.find((row) => row.id === deckId && row.ownerId === userId);
    if (!deck) throw new DataError('NOT_FOUND', 'That deck does not exist.');
    if (input.classId && !store.classes.some((cls) => cls.id === input.classId && cls.ownerId === userId)) {
      throw new DataError('FORBIDDEN', 'You can only share a deck into a class you own.');
    }

    const now = new Date().toISOString();
    deck.title = input.title;
    deck.subject = input.subject;
    deck.description = input.description;
    deck.classId = input.classId;
    deck.sharedAt = input.classId ? now : null;
    deck.updatedAt = now;
    return { ...deck };
  },

  async archiveFlashcardDeck(userId, deckId) {
    guard('archiveFlashcardDeck');
    const deck = store.flashDecks.find((row) => row.id === deckId && row.ownerId === userId);
    if (!deck) throw new DataError('NOT_FOUND', 'That deck does not exist.');
    deck.archivedAt = new Date().toISOString();
  },

  async listFlashcards(userId, deckId) {
    guard('listFlashcards');
    readableDeck(store, userId, deckId);
    return store.flashcards.filter((card) => card.deckId === deckId).map((card) => ({ ...card, tags: [...card.tags] }));
  },

  async createFlashcard(userId, deckId, input) {
    guard('createFlashcard');
    // Only the deck's author writes to it. A student may study a shared deck and
    // may not add a card to it, which is the same split the RLS policy makes.
    const deck = store.flashDecks.find((row) => row.id === deckId && row.ownerId === userId);
    if (!deck) throw new DataError('FORBIDDEN', 'You cannot add cards to this deck.');

    const now = new Date().toISOString();
    const card: FlashcardRecord = {
      id: fixtureId('card_fc', userId),
      deckId,
      ownerId: userId,
      front: input.front,
      back: input.back,
      hint: input.hint,
      tags: [...input.tags],
      createdAt: now,
      updatedAt: now,
    };
    store.flashcards = [...store.flashcards, card];
    return { ...card, tags: [...card.tags] };
  },

  async updateFlashcard(userId, cardId, input) {
    guard('updateFlashcard');
    const card = store.flashcards.find((row) => row.id === cardId);
    const deck = card ? store.flashDecks.find((row) => row.id === card.deckId) : undefined;
    if (!card || !deck || deck.ownerId !== userId) {
      throw new DataError('FORBIDDEN', 'You cannot edit this card.');
    }
    card.front = input.front;
    card.back = input.back;
    card.hint = input.hint;
    card.tags = [...input.tags];
    card.updatedAt = new Date().toISOString();
    return { ...card, tags: [...card.tags] };
  },

  async deleteFlashcard(userId, cardId) {
    guard('deleteFlashcard');
    const card = store.flashcards.find((row) => row.id === cardId);
    const deck = card ? store.flashDecks.find((row) => row.id === card.deckId) : undefined;
    if (!card || !deck || deck.ownerId !== userId) {
      throw new DataError('FORBIDDEN', 'You cannot delete this card.');
    }
    store.flashcards = store.flashcards.filter((row) => row.id !== cardId);

    // Progress cascades with the card in the database. Reproduced here so the
    // two adapters do not disagree about what deleting a card destroys.
    const student = studentForUser(userId);
    if (student) store.flashProgress.delete(progressKey(cardId, student.id));
  },

  async listFlashcardProgress(userId, deckId) {
    guard('listFlashcardProgress');
    const student = studentForUser(userId);
    // No roster row means no schedule, which is what a teacher opening this
    // gets. Returning an empty list lets the page say so rather than fail.
    if (!student) return [];
    readableDeck(store, userId, deckId);

    const cardIds = new Set(
      store.flashcards.filter((card) => card.deckId === deckId).map((card) => card.id),
    );
    return [...store.flashProgress.values()]
      .filter((row) => row.studentId === student.id && cardIds.has(row.cardId))
      .map((row) => ({ ...row }));
  },

  async saveFlashcardProgress(userId, progress) {
    guard('saveFlashcardProgress');
    const student = studentForUser(userId);
    if (!student) throw new DataError('FORBIDDEN', 'Only a student has a review schedule.');

    // The roster row comes from the session, exactly as it does in the Supabase
    // adapter, and the id in `progress` is ignored. Validating the caller's
    // claim instead would make the two adapters disagree about who owns a
    // schedule, which is the one difference the fixture exists to prevent.
    store.flashProgress.set(progressKey(progress.cardId, student.id), {
      ...progress,
      studentId: student.id,
      updatedAt: new Date().toISOString(),
    });
  },

  async listSlides(userId, deckId) {
    guard('listSlides');
    return deckSlides(store, userId, deckId).map((slide) => ({ ...slide }));
  },

  async createSlide(userId, deckId, input) {
    guard('createSlide');
    const deck = ownedDeck(store, userId, deckId);
    const siblings = deckSlides(store, userId, deckId);
    const now = new Date().toISOString();

    const slide: SlideRecord = {
      id: `sld_${store.slides.length + 1}`,
      deckId: deck.id,
      ownerId: userId,
      // Appended, never inserted at a chosen index, so two people adding at
      // once cannot collide on the same position.
      position: siblings.length,
      layout: input.layout ?? 'bullets',
      theme: 'viridian',
      // Null rather than an empty list: a new slide has a layout and nothing on
      // it yet, which is exactly what a slide written before elements existed
      // looks like to the renderer.
      elements: null,
      title: input.title ?? '',
      body: input.body ?? '',
      notes: input.notes ?? '',
      updatedAt: now,
    };

    store.slides = [...store.slides, slide];
    deck.updatedAt = now;
    return { ...slide };
  },

  async updateSlide(userId, slideId, input) {
    guard('updateSlide');
    const slide = ownedSlide(store, userId, slideId);

    slide.layout = input.layout;
    slide.title = input.title;
    slide.body = input.body;
    slide.notes = input.notes;
    slide.updatedAt = new Date().toISOString();

    const deck = store.decks.find((row) => row.id === slide.deckId);
    if (deck) deck.updatedAt = slide.updatedAt;

    return { ...slide };
  },

  async getSlide(userId, slideId) {
    guard('getSlide');
    return { ...ownedSlide(store, userId, slideId) };
  },

  async listAiUsage(userId) {
    guard('listAiUsage');
    // Only this person's rows, and only the recent window, which is what the
    // Supabase adapter does with a `user_id` filter and a `created_at` floor.
    return store.aiGenerations
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((row) => ({ created_at: row.created_at }));
  },

  async recordAiGeneration(userId, input) {
    guard('recordAiGeneration');
    store.aiGenerations.push({
      userId,
      model: input.model,
      created_at: new Date().toISOString(),
    });
  },

  async updateSlideContent(userId, slideId, input) {
    guard('updateSlideContent');
    const slide = ownedSlide(store, userId, slideId);

    // Normalised on the way in here as well as in the action, so the fixture and
    // the database agree that a stored element list is always the closed set.
    slide.elements = normaliseElements(input.elements);
    slide.theme = SLIDE_THEMES.includes(input.theme) ? input.theme : 'viridian';
    slide.updatedAt = new Date().toISOString();

    const deck = store.decks.find((row) => row.id === slide.deckId);
    if (deck) deck.updatedAt = slide.updatedAt;

    return { ...slide };
  },

  async deleteSlide(userId, slideId) {
    guard('deleteSlide');
    const slide = ownedSlide(store, userId, slideId);

    store.slides = store.slides.filter((row) => row.id !== slideId);
    resequenceSlides(store, userId, slide.deckId);

    const deck = store.decks.find((row) => row.id === slide.deckId);
    if (deck) deck.updatedAt = new Date().toISOString();
  },

  async moveSlide(userId, slideId, toIndex) {
    guard('moveSlide');
    const slide = ownedSlide(store, userId, slideId);
    const siblings = deckSlides(store, userId, slide.deckId);

    const from = siblings.findIndex((row) => row.id === slideId);
    if (from === -1) throw new DataError('NOT_FOUND', 'That slide no longer exists.');

    const target = Math.max(0, Math.min(toIndex, siblings.length - 1));
    if (target === from) return;

    const reordered = [...siblings];
    reordered.splice(from, 1);
    reordered.splice(target, 0, slide);

    reordered.forEach((row, index) => {
      row.position = index;
    });

    const deck = store.decks.find((row) => row.id === slide.deckId);
    if (deck) deck.updatedAt = new Date().toISOString();
  },

  async createDeckAsset(userId, deckId, input) {
    guard('createDeckAsset');
    const deck = ownedDeck(store, userId, deckId);
    const id = `ast_${store.assets.length + 1}`;
    const now = new Date().toISOString();

    const asset: DeckAssetRecord = {
      id,
      deckId: deck.id,
      ownerId: userId,
      kind: input.kind,
      filename: input.filename,
      mime: input.mime,
      byteSize: input.byteSize,
      // No bucket exists behind the fixtures, so the path is recorded the way
      // the real adapter records one and the URL is the inlined image. What the
      // panel renders is the same either way.
      storagePath: input.kind === 'image' ? `${userId}/${deckId}/${id}/${input.filename}` : null,
      extractedText: input.extractedText ?? null,
      createdAt: now,
      url: input.kind === 'image' ? FIXTURE_IMAGE : null,
    };

    store.assets = [...store.assets, asset];
    deck.updatedAt = now;
    return { ...asset };
  },

  async listDeckAssets(userId, deckId) {
    guard('listDeckAssets');
    ownedDeck(store, userId, deckId);

    // Scoped by owner as well as by deck, matching the Supabase adapter. A deck
    // id in the query is not proof of ownership, and an adapter that trusted it
    // would hide a leak that only appears against the real database.
    return store.assets
      .filter((asset) => asset.deckId === deckId)
      .filter((asset) => isDemoAccount(userId) || asset.ownerId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((asset) => ({ ...asset }));
  },

  async deleteDeckAsset(userId, assetId) {
    guard('deleteDeckAsset');
    const asset = store.assets.find((row) => row.id === assetId);
    if (!asset || (!isDemoAccount(userId) && asset.ownerId !== userId)) {
      throw new DataError('NOT_FOUND', 'That file is no longer there.');
    }

    store.assets = store.assets.filter((row) => row.id !== assetId);

    const deck = store.decks.find((row) => row.id === asset.deckId);
    if (deck) deck.updatedAt = new Date().toISOString();
  },

  /*
   * Schedule, terms, dated events and notifications.
   *
   * THE SAME RESOLUTION CHAIN AS THE DATABASE. A student's own rows are reached
   * through `students.account_id`, which is what `studentForUser` resolves and
   * what the RLS policies resolve in Postgres. The Supabase adapter ignores the
   * `userId` on these methods because RLS already answered the question; this one
   * has no RLS, so it has to answer it, or fixture mode would show a student
   * somebody else's week.
   */
  async getMyStudentRecord(userId) {
    guard('getMyStudentRecord');
    /*
     * `studentForUser` is the fixture mirror of the `students.account_id` filter
     * in the Supabase adapter above and of the RLS policy it satisfies. A caller
     * who is not on a roster gets null, which the page renders as an empty state
     * rather than as an error.
     */
    return studentForUser(userId);
  },

  async listSchedule(userId, studentId) {
    guard('listSchedule');
    requireStudentFor(userId, studentId);
    return store.schedule
      .filter((row) => row.studentId === studentId)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
  },

  async saveScheduleEntry(userId, input) {
    guard('saveScheduleEntry');
    const student = requireStudentFor(userId, input.studentId);

    /*
     * THE EXISTING ROW IS RESOLVED BEFORE THE INPUT IS TRUSTED, WHICH IT WAS NOT
     * AT FIRST. `requireStudentFor` proved the caller may act on
     * `input.studentId`, and then the row found by `input.id` was overwritten
     * whatever student it belonged to. So a caller who passed their own student
     * id and somebody else's row id wrote over that other student's week.
     * Supabase never had this, because `.eq('id', input.id)` runs under RLS.
     */
    if (input.id) {
      const existing = store.schedule.find((entry) => entry.id === input.id);
      if (existing && existing.studentId !== input.studentId) {
        throw new DataError('NOT_FOUND', 'That class is no longer on your timetable.');
      }
    }

    const row: ScheduleEntryRecord = {
      id: input.id ?? fixtureId('sch', input.studentId),
      studentId: input.studentId,
      ownerId: student.ownerId,
      dayOfWeek: input.dayOfWeek,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      title: input.title,
      teacherName: input.teacherName ?? null,
      room: input.room ?? null,
      source: input.source ?? 'manual',
      createdAt: new Date().toISOString(),
    };
    const at = store.schedule.findIndex((entry) => entry.id === row.id);
    if (at === -1) store.schedule.push(row);
    else store.schedule[at] = row;
    return row;
  },

  async replaceSchedule(userId, studentId, entries) {
    guard('replaceSchedule');
    const student = requireStudentFor(userId, studentId);
    // Wholesale, matching the adapter: confirming a photograph is a statement of
    // what the week is, not an edit to one row of it.
    store.schedule = store.schedule.filter((row) => row.studentId !== studentId);
    const rows = entries.map((entry, index) => ({
      id: `sch_${studentId}_${index}`,
      studentId,
      ownerId: student.ownerId,
      dayOfWeek: entry.dayOfWeek,
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
      title: entry.title,
      teacherName: entry.teacherName ?? null,
      room: entry.room ?? null,
      source: entry.source ?? 'manual',
      createdAt: new Date().toISOString(),
    }));
    store.schedule.push(...rows);
    return rows;
  },

  async deleteScheduleEntry(userId, entryId) {
    guard('deleteScheduleEntry');
    const entry = store.schedule.find((row) => row.id === entryId);
    if (entry) requireStudentFor(userId, entry.studentId);
    store.schedule = store.schedule.filter((row) => row.id !== entryId);
  },

  async listTerms(userId) {
    guard('listTerms');
    return store.terms
      .filter((row) => row.ownerId === userId)
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  },

  async saveTerm(userId, input) {
    guard('saveTerm');
    const row: TermRecord = {
      id: input.id ?? fixtureId('term', userId),
      ownerId: userId,
      name: input.name,
      kind: input.kind,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      createdAt: new Date().toISOString(),
    };
    const at = store.terms.findIndex((term) => term.id === row.id);
    if (at === -1) store.terms.push(row);
    else store.terms[at] = row;
    return row;
  },

  async deleteTerm(userId, termId) {
    guard('deleteTerm');
    store.terms = store.terms.filter((row) => !(row.id === termId && row.ownerId === userId));
  },

  async listCalendarEvents(userId, studentId, from, to) {
    guard('listCalendarEvents');
    if (studentId) requireStudentFor(userId, studentId);
    return store.events
      .filter((row) => row.studentId === studentId)
      .filter((row) => row.startsAt >= from && row.startsAt <= to)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },

  async saveCalendarEvent(userId, input) {
    guard('saveCalendarEvent');
    if (input.studentId) requireStudentFor(userId, input.studentId);
    const row: CalendarEventRecord = {
      id: input.id ?? fixtureId('evt', userId),
      ownerId: userId,
      studentId: input.studentId ?? null,
      title: input.title,
      notes: input.notes ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      allDay: input.allDay ?? false,
      kind: input.kind,
      createdByRole: input.createdByRole,
      createdAt: new Date().toISOString(),
    };
    const at = store.events.findIndex((event) => event.id === row.id);
    if (at === -1) store.events.push(row);
    else store.events[at] = row;
    return row;
  },

  async deleteCalendarEvent(userId, eventId) {
    guard('deleteCalendarEvent');
    const event = store.events.find((row) => row.id === eventId);
    /*
     * CHECKED, WHICH IT WAS NOT AT FIRST. This originally filtered on the id
     * alone and ignored `userId`, so any signed-in fixture user could delete any
     * calendar event by guessing its id. Production is protected by the
     * `calendar_events` RLS policy, which means fixture mode was strictly more
     * permissive than the database it stands in for, and the two sibling
     * deletes beside this one already checked. A fixture adapter that is looser
     * than production is not a convenience, it is a place where a real
     * authorisation bug stays invisible.
     */
    if (event) {
      if (event.studentId) requireStudentFor(userId, event.studentId);
      else if (event.ownerId !== userId) {
        throw new DataError('NOT_FOUND', 'That event is no longer on the calendar.');
      }
    }
    store.events = store.events.filter((row) => row.id !== eventId);
  },

  async listNotifications(userId) {
    guard('listNotifications');
    /*
     * CAPPED AT 50, MATCHING THE SUPABASE ADAPTER. The production read has had a
     * `.limit(50)` on it and this one did not, so fixture mode would show a
     * longer list than production can ever return. The usual seam failure is the
     * fixtures being looser; here they were stricter about nothing and looser
     * about the ceiling, in the same place.
     */
    return store.notifications
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  },

  async markNotificationRead(userId, notificationId) {
    guard('markNotificationRead');
    const row = store.notifications.find(
      (note) => note.id === notificationId && note.userId === userId,
    );
    if (row) row.readAt = new Date().toISOString();
  },

  async getStudent(userId, studentId) {
    guard('getStudent');
    /*
     * Visible AND actionable, in that order. `listStudents` is bounded by
     * `ownedClass`, so a caller who may read a roster row may act on it; this
     * answers the same question for one row rather than for a whole class.
     */
    const row = store.students.find((student) => student.id === studentId);
    if (!row || row.archivedAt !== null) return null;

    if (row.accountId === userId) return row;
    if (row.ownerId === userId) return row;

    /*
     * `isDemoStaff`, and this is the same escape `createFlashcardDeck` and
     * `listClasses` already use, for the same reason: the seeded classes and
     * roster rows carry the synthetic `demo-owner`, which is nobody's account
     * id, so the comparison below refuses the row to the very teacher the demo
     * is built around.
     *
     * IT WAS A SILENT NO-OP, NOT AN ERROR. `saveScheduleEntry` resolves the
     * recipient through this method and then writes a note, so a null here made
     * the notification feature have no producer at all in fixture mode, the
     * demo, and the whole Playwright suite, while the database returned the row
     * and would have written the note. That is the dangerous direction of a seam
     * disagreement: the fixture is stricter than Postgres, so nothing fails
     * loudly and a working feature simply never appears.
     *
     * Narrower than `isDemoAccount` on purpose, even though `ownedClass` beside
     * it uses the broader one. Reading a roster is not authority over it: a demo
     * student or parent may legitimately see a class, and must not be handed the
     * right to write into somebody's inbox because of it.
     */
    if (isDemoStaff(userId)) return row;

    const ownsTheirClass = store.classes.some(
      (cls) => cls.id === row.classId && cls.ownerId === userId,
    );
    return ownsTheirClass ? row : null;
  },

  async createNotification(userId, input) {
    guard('createNotification');
    /*
     * The same refusal the policy makes, stated in the same terms.
     *
     * The database admits an insert only when the recipient is somebody the
     * writer teaches, and never the writer themselves. Repeating it here is the
     * point: a fixture that skipped the check would let fixture mode, the demo
     * and the whole suite send a notification the real adapter would refuse.
     *
     * `isDemoStaff` rather than `isDemoAccount`, for the same reason
     * `createFlashcardDeck` uses it. The demo set contains a student and a
     * guardian, and neither owns a class, so widening this to every demo
     * account would let a student write into any classmate's inbox.
     */
    if (input.recipientId === userId) {
      throw new DataError('FORBIDDEN', 'You cannot notify yourself.');
    }
    if (!isDemoStaff(userId)) {
      const teachesRecipient = store.students.some(
        (student) =>
          student.accountId === input.recipientId &&
          student.archivedAt === null &&
          store.classes.some((cls) => cls.id === student.classId && cls.ownerId === userId),
      );
      if (!teachesRecipient) {
        throw new DataError('FORBIDDEN', 'You can only notify a student on your own roster.');
      }
    }

    const now = new Date().toISOString();
    const note: NotificationRecord = {
      id: fixtureId('ntf', userId),
      userId: input.recipientId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      url: input.url,
      readAt: null,
      createdAt: now,
    };
    store.notifications = [note, ...store.notifications];
    return { ...note };
  },
};

/** Slides of one deck, in presentation order. */
function deckSlides(store: FixtureStore, userId: string, deckId: string): SlideRecord[] {
  return store.slides
    .filter((slide) => slide.deckId === deckId)
    .filter((slide) => isDemoAccount(userId) || slide.ownerId === userId)
    .sort((a, b) => a.position - b.position);
}

/** Renumbers a deck so positions are contiguous, with no gap or duplicate. */
function resequenceSlides(store: FixtureStore, userId: string, deckId: string): void {
  deckSlides(store, userId, deckId).forEach((slide, index) => {
    slide.position = index;
  });
}

/**
 * The class, but only if this account owns it.
 *
 * WHY THREE READS NEED THIS. `listStudents`, `listGrades` and `listAssessments`
 * all took a `userId` and then ignored it, filtering on `classId` alone. The
 * Supabase adapter filters on `owner_id` as well, so the fixtures were strictly
 * more permissive: a caller who guessed or was handed somebody else's class id
 * read that class's roster, gradebook and assessments, in fixture mode, while
 * the same call in production returns nothing.
 *
 * Nothing in the app exploited it, because class ids arrive from `listClasses`,
 * which IS owner scoped. That is exactly why it was worth closing anyway: the
 * class of defect that hid the empty-classes bug was a fixture disagreeing with
 * production in the permissive direction, and "no caller can reach it" is a
 * statement about today's callers rather than about the method.
 *
 * A class that is not this account's is reported as one that does not exist, so
 * a crafted id cannot confirm that somebody else's class is real. That matches
 * `ownedDeck` beside this and the RLS read on the real project.
 */
function ownedClass(store: FixtureStore, userId: string, classId: string): ClassRecord {
  const record = store.classes.find((row) => row.id === classId);
  if (!record || (!isDemoAccount(userId) && record.ownerId !== userId)) {
    throw new DataError('NOT_FOUND', 'That class does not exist.');
  }
  return record;
}

function ownedDeck(store: FixtureStore, userId: string, deckId: string): DeckRecord {
  const deck = store.decks.find((row) => row.id === deckId);
  // A deck that is not this account's is reported exactly as one that does not
  // exist, so a crafted id cannot confirm that somebody else's deck is real.
  if (!deck || (!isDemoAccount(userId) && deck.ownerId !== userId)) {
    throw new DataError('NOT_FOUND', 'That deck does not exist.');
  }
  return deck;
}

function ownedSlide(store: FixtureStore, userId: string, slideId: string): SlideRecord {
  const slide = store.slides.find((row) => row.id === slideId);
  if (!slide || (!isDemoAccount(userId) && slide.ownerId !== userId)) {
    throw new DataError('NOT_FOUND', 'That slide does not exist.');
  }
  return slide;
}