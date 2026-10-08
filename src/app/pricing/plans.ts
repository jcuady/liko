/**
 * Plan data, shared by the tier cards and the comparison table.
 *
 * Prices are the marketing page's own promise, so they live in one place and
 * both sections read from it. The annual figure is the per month rate paid up
 * front, not a discount hidden in the small print, which is why the toggle
 * swaps a number rather than relabelling the same one.
 *
 * EVERY ROW HERE IS A THING THE PRODUCT DOES.
 *
 * That rule used to be stated and not enforced. The page used to promise CSV and
 * JSON export, class lists imported from a spreadsheet or an LMS, rubrics
 * attached to marks, invoicing for departments, and email support within a
 * business day. None of those exist: there is no export code, no import code, no
 * rubric anywhere in the source, no billing, and no support queue. Worse, the
 * tiers implied capability differences that are not enforced either, so a
 * Starter account could create as many classes as a School one could and the
 * table would still say it could not.
 *
 * A pricing page is a set of promises made to people before they have paid
 * anything. Claiming a feature that does not exist is not a marketing problem,
 * it is the kind of thing that ends in a regulator or a chargeback, so the
 * honest version of this page is narrower. Plan gating is a real gap, recorded
 * in PROJECT_STATUS.md, and it is not going to be papered over with copy.
 *
 * NOTE ON `monthly`/`annual`. They are the rates that will apply when billing
 * opens. Nothing is charged today and no card is taken; see EARLY_ACCESS.
 */

export type Cycle = 'monthly' | 'annual';

/** A cell in the comparison table: `true` means included, a string is the wording. */
export type Cell = boolean | string;

/**
 * Mirrors the check constraint on `organizations.plan`.
 *
 * The database is the durable vocabulary, so the page uses its words rather than
 * inventing a second set. This was previously `'starter' | 'teacher' | 'school'`
 * here against `'solo' | 'school' | 'district'` in SQL, with only `school`
 * overlapping, which meant two of the three ids on this page could not have been
 * written to the column they refer to and one legal value had no card.
 */
export type PlanId = 'solo' | 'teacher' | 'school';

export const PLAN_IDS: readonly PlanId[] = ['solo', 'teacher', 'school'];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export type Plan = {
  /** Used for the `/register?plan=` link, and stored on the organisation. */
  id: PlanId;
  name: string;
  audience: string;
  /** Per month, billed monthly. Zero means the plan is free. */
  monthly: number;
  /** Per month, billed as one annual payment. */
  annual: number;
  /** What the number is charged per, set after it. */
  unit: string;
  /** Charged per teacher rather than per account owner. */
  perTeacher?: boolean;
  blurb: string;
  features: string[];
  cta: string;
  recommended?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: 'solo',
    name: 'Solo',
    audience: 'One teacher, one class',
    monthly: 0,
    annual: 0,
    unit: 'forever',
    blurb: 'The whole workspace, for a teacher running a single class.',
    features: [
      'Classes at preschool, K-12 or university level',
      'Roster with guardian names, emails and phone numbers',
      'Attendance register that queues without signal',
      'Gradebook graded on percentage, letter, GPA or GWA',
      'Lesson plans and a slides deck per class',
      'Student history showing on-track, watch and at-risk',
    ],
    cta: 'Create a free account',
  },
  {
    id: 'teacher',
    name: 'Teacher',
    audience: 'A teacher running several classes',
    monthly: 12,
    annual: 9,
    unit: 'per month',
    blurb: 'Everything in Solo, for a teacher whose timetable filled up.',
    features: [
      'Everything in Solo, without a per-class ceiling',
      'Assessments, quizzes and exams with weighted marks',
      'Milestone grading alongside letter and point scales',
      'Every change to a mark is kept, with who made it',
      'Push notifications when a student is flagged at risk',
      'Works offline and syncs when the connection returns',
    ],
    cta: 'Create a free account',
    recommended: true,
  },
  {
    id: 'school',
    name: 'School',
    audience: 'A department head or administrator',
    monthly: 24,
    annual: 18,
    unit: 'per teacher, per month',
    perTeacher: true,
    blurb: 'One place to administer every class in a department.',
    features: [
      'Everything in Teacher, across every class you administer',
      'A staff account for each teacher you onboard',
      'The admin console: people, classes, organisation and access',
      'Role separation between instructor and administrator',
      'Tenant isolation, so one school cannot read another',
      'Append-only consent records that an account cannot edit',
    ],
    cta: 'Create a free account',
  },
];

/**
 * Stated on the page rather than buried. Until billing opens every plan costs
 * nothing, no card is taken, and the tiers above differ only in the price that
 * will eventually apply.
 */
export const EARLY_ACCESS =
  'Early access: every plan is free today and no card is taken. The prices above are what each plan will cost when billing opens, and we will ask before that happens.';

/** The rate the toggle shows, per cycle. */
export function priceFor(plan: Plan, cycle: Cycle): number {
  return cycle === 'annual' ? plan.annual : plan.monthly;
}

/** Derived from the two prices, so the badge can never disagree with the cards. */
export function savingPercent(plan: Plan): number {
  if (plan.monthly <= 0) return 0;
  return Math.round(((plan.monthly - plan.annual) / plan.monthly) * 100);
}

/**
 * The line under the price.
 *
 * It cannot say "billed monthly" or "cancel whenever you want", because neither
 * is true yet. What it can say is that nothing is charged, which is a better
 * sentence than a promise about an invoice that does not exist.
 */
export function priceNote(plan: Plan, cycle: Cycle): string {
  if (plan.monthly === 0) return 'Free, and no card is taken.';
  const per = plan.perTeacher ? ' per teacher' : '';
  return `Will be $${priceFor(plan, cycle)}${per} a month when billing opens.`;
}

export type ComparisonGroup = {
  title: string;
  rows: { label: string; cells: [Cell, Cell, Cell] }[];
};

/**
 * Stated plainly, one cell per plan, in the plan order above. No row says
 * "everything in the plan above", because that hides the one thing a reader
 * comparing plans is trying to find out.
 *
 * REWRITTEN, because it was the least truthful part of the page. It used to
 * promise export, spreadsheet and LMS import, rubrics, invoicing and support
 * tiers, none of which exist, and it used to differentiate the plans by limits
 * that nothing enforces.
 *
 * What replaces it differentiates on things that are true: how many accounts
 * you administer, whether you get the admin console, and how much of each
 * school's data you can see. The limit row says the same thing in all three
 * columns precisely because there is no limit yet, rather than pretending the
 * first column is capped.
 */
export const COMPARISON: ComparisonGroup[] = [
  {
    title: 'Your workspace',
    rows: [
      {
        label: 'Accounts you can administer',
        cells: ['Your own', 'Your own', 'Everyone in your school'],
      },
      {
        label: 'Admin console',
        cells: ['Not included', 'Not included', 'Included'],
      },
      {
        label: 'Classes you can open',
        cells: ['Every class you own', 'Every class you own', 'Every class you administer'],
      },
      {
        label: 'Whether other schools can see your classes',
        cells: ['No', 'No', 'No'],
      },
    ],
  },
  {
    title: 'Teaching and marking',
    rows: [
      { label: 'Preschool, K-12 and university levels', cells: [true, true, true] },
      {
        label: 'Grading scales',
        cells: [
          'Percentage, letter, GPA, GWA',
          'Percentage, letter, GPA, GWA',
          'Percentage, letter, GPA, GWA',
        ],
      },
      { label: 'Slides decks with present mode', cells: [true, true, true] },
      { label: 'Attendance taken without signal', cells: [true, true, true] },
      {
        label: 'At-risk flags on students',
        cells: ['Your own students', 'Your own students', 'Every student you administer'],
      },
    ],
  },
  {
    title: 'Pricing',
    rows: [
      {
        label: 'What you pay today',
        cells: ['Nothing', 'Nothing', 'Nothing'],
      },
      {
        label: 'What it will cost',
        cells: ['Nothing', '$9 to $12 a month', '$18 to $24 per teacher a month'],
      },
      { label: 'Card details needed to sign up', cells: [false, false, false] },
    ],
  },
];