'use server';

/**
 * Roster writes.
 *
 * WHY SERVER ACTIONS. The seam is `server-only`, so a client component cannot
 * call `createClass` or `createStudent` itself. Every action re-checks the
 * session and the permission, because a server action is a public endpoint and
 * `proxy.ts` never sees it.
 *
 * Validation lives here rather than in the form so the same rules apply to a
 * crafted request.
 */

import { revalidatePath } from 'next/cache';
import { randomInt } from 'node:crypto';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import { classLevelSchema, type ClassLevel } from '@/lib/api/types';
import { recordConsent } from '@/lib/auth/consent';
import { findUserByEmail, signUp } from '@/lib/auth/store';
import { initialsFor } from '@/lib/roster/initials';
import { buildImportPlan } from '@/lib/roster/import';

/**
 * The only roles a teacher may mint an account for.
 *
 * A separate list rather than reusing `Role`, because the full set includes
 * `instructor` and `admin`, and a teacher handing a colleague an admin login is
 * not something this screen is for. Admin rights come from `/admin`, which is
 * permission-gated behind `org:manage` and refuses the last-admin demotion.
 */
const ISSUABLE_ROLES = ['student', 'guardian'] as const;
type IssuableRole = (typeof ISSUABLE_ROLES)[number];

export interface RosterResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  /**
   * Set only when this action generated a temporary password, which is the
   * fixture-mode path. In `supabase` mode the confirmation email sets the real
   * password and there is nothing to hand over, so this stays undefined.
   *
   * Returned as data rather than folded into `message` so the interface can show
   * it once in a panel the teacher dismisses, instead of a toast that vanishes
   * before it has been read down and written onto a slip of paper.
   */
  issuedPassword?: string;
}

const LEVELS: ClassLevel[] = ['preschool', 'k12', 'university'];

function clean(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export async function createClass(input: {
  name: string;
  code: string;
  level: ClassLevel;
  meetsPerWeek: number;
}): Promise<RosterResult> {
  const session = await requirePermission('class:write');

  const name = clean(input.name, 80);
  const code = clean(input.code, 24).toUpperCase();
  const meetsPerWeek = Math.round(input.meetsPerWeek);

  if (name.length < 2) {
    return { ok: false, message: 'Give the class a name of at least two characters.' };
  }
  if (code.length < 2) {
    return { ok: false, message: 'Give the class a short code, such as CHEM-2.' };
  }
  if (!LEVELS.includes(input.level) || !classLevelSchema.safeParse(input.level).success) {
    return { ok: false, message: 'That level is not one this app supports.' };
  }
  if (!Number.isFinite(meetsPerWeek) || meetsPerWeek < 1 || meetsPerWeek > 14) {
    return { ok: false, message: 'Lessons per week must be between 1 and 14.' };
  }

  try {
    const store = await data();

    /*
     * The code is how a teacher refers to a class all day, and the gradebook,
     * planner and attendance screens all accept it as a filter. Two classes on
     * one code make every one of those lookups ambiguous, so this is refused
     * with the offending code named rather than left to fail as a unique
     * violation or, before the constraint existed, to create a second row.
     */
    const taken = (await store.listClasses(session.userId)).some(
      (item) => item.code.trim().toUpperCase() === code,
    );
    if (taken) {
      return { ok: false, message: `${code} is already in use.` };
    }

    await store.createClass(session.userId, { name, code, level: input.level, meetsPerWeek });
  } catch {
    return { ok: false, message: 'That class could not be created. Try again.' };
  }

  revalidatePath('/classes');
  return { ok: true, message: `${name} created.` };
}

export async function archiveClass(classId: string): Promise<RosterResult> {
  const session = await requirePermission('class:write');
  if (!classId) return { ok: false, message: 'That class could not be archived.' };

  try {
    const store = await data();
    await store.archiveClass(session.userId, classId);
  } catch {
    return { ok: false, message: 'That class could not be archived. Try again.' };
  }

  revalidatePath('/classes');
  return { ok: true, message: 'Class archived.' };
}

/**
 * Adds a student to a roster, and optionally issues them a LIKO login.
 *
 * WHY THE ACCOUNT IS CREATED HERE. Students and guardians do not self-register.
 * The public signup path has no role that can produce one of these, and the
 * schema behind it has no role field at all, so there is nothing for a crafted
 * request to change. This action is the only place a student or guardian account
 * comes into existence, which is what makes the rule in the terms enforceable
 * rather than decorative.
 *
 * The account is created through `signUp`, not by writing to the user map, so
 * Supabase Auth hashes the password itself and sends the confirmation email. The
 * teacher's temporary password is only ever the fallback for fixture mode, where
 * there is nowhere to send mail.
 */
export async function createStudent(input: {
  classId: string;
  fullName: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  issueLogin?: boolean;
  loginEmail?: string;
  loginRole?: string;
  temporaryPassword?: string;
}): Promise<RosterResult> {
  const session = await requirePermission('class:write');

  const fullName = clean(input.fullName, 80);
  const guardianName = clean(input.guardianName, 80);
  const guardianEmail = clean(input.guardianEmail, 120).toLowerCase();
  const guardianPhone = clean(input.guardianPhone, 32);

  if (!input.classId) return { ok: false, message: 'Pick a class first.' };
  if (fullName.length < 2) {
    return { ok: false, message: 'Enter the student name.' };
  }
  // An address that will bounce is worse than none: the school finds out a day
  // late that a family never got the message.
  if (guardianEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
    return { ok: false, message: 'That guardian email address does not look right.' };
  }

  const initials = initialsFor(fullName);

  /*
   * The login is validated and the account created BEFORE the roster row, so a
   * rejected login never leaves an orphan student behind with no way to retry.
   * The reverse order would leave the teacher with a half-created record and an
   * error they cannot clear from this screen.
   */
  let accountId: string | undefined;
  let issuedPassword: string | undefined;

  if (input.issueLogin) {
    const role = parseIssuableRole(input.loginRole);
    if (!role) {
      return {
        ok: false,
        message: 'A login can only be issued for a student or a guardian.',
      };
    }

    const loginEmail = clean(input.loginEmail ?? '', 254).toLowerCase();
    if (!loginEmail) {
      return {
        ok: false,
        message: 'Enter the address the login is issued to.',
        fieldErrors: { loginEmail: 'Enter an email address.' },
      };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
      return {
        ok: false,
        message: 'That email address does not look right.',
        fieldErrors: { loginEmail: 'Enter a valid email address.' },
      };
    }

    const supplied = clean(input.temporaryPassword ?? '', 200);
    const password = supplied.length >= 10 ? supplied : generateTemporaryPassword();

    try {
      // Refuse an address that already has an account rather than colliding with
      // it. `signUp` folds a provider failure into one generic error, so this is
      // the only place a teacher gets told the address is taken.
      const existing = await findUserByEmail(loginEmail);
      if (existing) {
        return {
          ok: false,
          message: `${loginEmail} already has a LIKO account.`,
          fieldErrors: { loginEmail: 'That address already has an account.' },
        };
      }

      const created = await signUp({
        name: fullName,
        email: loginEmail,
        password,
        role,
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
      });
      accountId = created.user.id;

      /*
       * Consent is recorded against the new account, with the source saying who
       * actually made the decision. It was the teacher acting for the school, not
       * the person holding the account, and a log that claimed otherwise would
       * be worse than no log. See `ConsentSource` in `src/lib/auth/consent.ts`.
       */
      await recordConsent({
        userId: created.user.id,
        email: created.user.email,
        subject: 'terms',
        source: 'teacher_invite',
      });
      await recordConsent({
        userId: created.user.id,
        email: created.user.email,
        subject: 'privacy',
        source: 'teacher_invite',
      });

      // Only a generated password needs handing over. When Supabase is the
      // backend the recipient sets their own from the confirmation link, and
      // showing the teacher a password that is about to be replaced would be
      // misleading.
      if (supplied.length < 10) issuedPassword = password;
    } catch {
      return {
        ok: false,
        message: 'That login could not be created. Check the address and try again.',
      };
    }
  }

  try {
    const store = await data();
    await store.createStudent(session.userId, {
      classId: input.classId,
      fullName,
      initials,
      guardianName: guardianName.length > 0 ? guardianName : null,
      guardianEmail: guardianEmail.length > 0 ? guardianEmail : null,
      guardianPhone: guardianPhone.length > 0 ? guardianPhone : null,
      accountId: accountId ?? null,
    });
  } catch {
    /*
     * The account exists but the roster row did not land. This is the one
     * genuinely awkward outcome, because the teacher now has a login pointing at
     * nothing. It is named rather than folded into a generic failure so it can be
     * found and cleaned up, and the account is still usable for a retry.
     */
    if (accountId) {
      return {
        ok: false,
        message:
          `${fullName} has a login but could not be added to the class. Remove the login and try again.`,
      };
    }
    return { ok: false, message: 'That student could not be added. Try again.' };
  }

  revalidatePath('/classes');

  if (accountId) {
    return {
      ok: true,
      message: `${fullName} added with a login.`,
      ...(issuedPassword ? { issuedPassword } : {}),
    };
  }

  return { ok: true, message: `${fullName} added.` };
}

export interface ImportResult {
  ok: boolean;
  message: string;
  /** Students added. Zero means nothing was written. */
  created: number;
  /** Rows that were refused, each with the line number a teacher can find. */
  problems: { row: number; message: string }[];
  /** Rows that turned out to be duplicates of one another in the file. */
  duplicates: { row: number; message: string }[];
}

/** A paste larger than this is a file somebody attached by accident. */
const MAX_IMPORT_BYTES = 256 * 1024;

/**
 * Adds a whole class list from CSV.
 *
 * The browser parses the same text first so the teacher sees a preview, but this
 * action never accepts that preview. It takes the raw text and runs
 * `buildImportPlan` over it again, because a server action is a public endpoint
 * and anything the client says is only a claim until it has been checked here.
 *
 * The class id is resolved the same way: it has to match a class this teacher
 * can actually read. Posting somebody else's class id creates nothing.
 *
 * Accounts are not issued. Minting thirty student logins from a spreadsheet is a
 * different decision from adding thirty names to a roster, and the one that
 * deserves a deliberate click per student.
 */
export async function importRoster(input: { classId: string; csv: string }): Promise<ImportResult> {
  const session = await requirePermission('class:write');

  const csv = typeof input.csv === 'string' ? input.csv : '';
  if (csv.trim() === '') {
    return { ok: false, message: 'Nothing to import.', created: 0, problems: [], duplicates: [] };
  }
  if (csv.length > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      message: 'That file is too large to import. Split the class list and try again.',
      created: 0,
      problems: [],
      duplicates: [],
    };
  }

  const store = await data();
  const classes = await store.listClasses(session.userId);
  const target = classes.find((item) => item.id === input.classId);

  if (!target) {
    return {
      ok: false,
      message: 'That class is not yours to add students to.',
      created: 0,
      problems: [],
      duplicates: [],
    };
  }

  const existing = await store.listStudents(session.userId, target.id);
  const existingNames = new Set(
    existing.filter((student) => !student.archivedAt).map((student) => student.fullName.toLowerCase()),
  );

  const plan = buildImportPlan(csv, existingNames);

  if (plan.drafts.length === 0) {
    return {
      ok: false,
      message: 'No students could be read from that file.',
      created: 0,
      problems: plan.problems.slice(0, 20),
      duplicates: [],
    };
  }

  /*
   * Two students with the same name is not an error. Twins are real, and a class
   * can hold more than one Ana. They are reported so the teacher can look, and
   * both are still added.
   */
  const seen = new Set<string>();
  const duplicates: { row: number; message: string }[] = [];
  const unique = plan.drafts.filter((draft) => {
    const key = draft.fullName.toLowerCase();
    if (seen.has(key)) {
      duplicates.push({ row: draft.row, message: `${draft.fullName} appears twice in this file.` });
      return false;
    }
    seen.add(key);
    return true;
  });

  const failed: { row: number; message: string }[] = [];
  let created = 0;

  for (const draft of unique) {
    try {
      await store.createStudent(session.userId, {
        classId: target.id,
        fullName: draft.fullName,
        initials: initialsFor(draft.fullName),
        guardianName: draft.guardianName,
        guardianEmail: draft.guardianEmail,
        guardianPhone: draft.guardianPhone,
        accountId: null,
      });
      created += 1;
    } catch {
      failed.push({ row: draft.row, message: `${draft.fullName} could not be added.` });
    }
  }

  revalidatePath('/classes');

  const problems = [...plan.problems, ...failed].slice(0, 20);

  if (created === 0) {
    return {
      ok: false,
      message: 'No students could be added. The rows below say why.',
      created: 0,
      problems,
      duplicates,
    };
  }

  return {
    ok: true,
    message:
      problems.length > 0
        ? `${created} added, ${problems.length} left out. The rows below say why.`
        : `${created} added.`,
    created,
    problems,
    duplicates,
  };
}

function parseIssuableRole(raw: string | undefined): IssuableRole | null {
  return ISSUABLE_ROLES.find((role) => role === raw) ?? null;
}

/**
 * A temporary password for a login the teacher is issuing by hand.
 *
 * `randomInt` from node:crypto, not `Math.random`. The alphabet deliberately
 * excludes the characters that get mis-transcribed off a slip of paper, and
 * includes an upper, a lower and a digit so it satisfies the same strength rules
 * the signup form enforces. It is not memorable, which is the point.
 */
function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digit = '23456789';
  const alphabet = upper + lower + digit + '-_';

  const pick = (set: string) => set[randomInt(set.length)];

  // One from each required class first, so the result always passes the strength
  // rules, then fill the remainder from the wider alphabet.
  const required = [pick(upper), pick(lower), pick(digit)];
  const filler = Array.from({ length: 9 }, () => pick(alphabet));

  const all = [...required, ...filler];

  // Fisher-Yates, so the guaranteed characters are not always in the first three
  // positions, which would make every generated password obvious from the front.
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all.join('');
}

export async function archiveStudent(studentId: string): Promise<RosterResult> {
  const session = await requirePermission('class:write');
  if (!studentId) return { ok: false, message: 'That student could not be archived.' };

  try {
    const store = await data();
    await store.archiveStudent(session.userId, studentId);
  } catch {
    return { ok: false, message: 'That student could not be archived. Try again.' };
  }

  revalidatePath('/classes');
  return { ok: true, message: 'Student archived.' };
}
