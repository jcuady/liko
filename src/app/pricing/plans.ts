/**
 * Plan data, shared by the tier cards and the comparison table.
 *
 * Prices are the marketing page's own promise, so they live in one place and
 * both sections read from it. The annual figure is the per month rate paid up
 * front, not a discount hidden in the small print, which is why the toggle
 * swaps a number rather than relabelling the same one.
 *
 * Every feature listed is something the product does or the pages already say
 * it does. Nothing here is aspirational.
 */

export type Cycle = 'monthly' | 'annual';

/** A cell in the comparison table: `true` means included, a string is the wording. */
export type Cell = boolean | string;

export type Plan = {
  /** Used for the `/register?plan=` link, so it has to stay stable. */
  id: string;
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
    id: 'starter',
    name: 'Starter',
    audience: 'One teacher, one class',
    monthly: 0,
    annual: 0,
    unit: 'forever',
    blurb: 'The whole workspace on a single class. No card, no end date.',
    features: [
      'One active class, up to 40 students',
      'Attendance register that queues without signal',
      'Gradebook with a trail behind every mark',
      'One active unit plan',
      'Rubrics attached to marks',
      'CSV and JSON export, whenever you want it',
    ],
    cta: 'Start free',
  },
  {
    id: 'teacher',
    name: 'Teacher',
    audience: 'A teacher running several classes',
    monthly: 12,
    annual: 9,
    unit: 'per month',
    blurb: 'Every class you teach, with nothing counted twice.',
    features: [
      'Unlimited active classes and students',
      'Unlimited unit plans',
      'At-risk flags on every student you teach',
      'Rubrics attached to marks',
      'Class list imported from a spreadsheet',
      'Email support within one business day',
    ],
    cta: 'Start free trial',
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
    blurb: 'One place to see every class you administer.',
    features: [
      'A staff account for every teacher you administer',
      'Every class you administer in one view',
      'Class lists imported by spreadsheet or your LMS',
      'At-risk flags across the whole department',
      'One invoice for the department',
      'Priority email support',
    ],
    cta: 'Start free trial',
  },
];

/** The rate the toggle shows, per cycle. */
export function priceFor(plan: Plan, cycle: Cycle): number {
  return cycle === 'annual' ? plan.annual : plan.monthly;
}

/** Derived from the two prices, so the badge can never disagree with the cards. */
export function savingPercent(plan: Plan): number {
  if (plan.monthly <= 0) return 0;
  return Math.round(((plan.monthly - plan.annual) / plan.monthly) * 100);
}

/** The line under the price. It changes with the cycle, because the bill does. */
export function priceNote(plan: Plan, cycle: Cycle): string {
  if (plan.monthly === 0) return 'Free forever. No card, no end date.';

  const per = plan.perTeacher ? ' per teacher' : '';

  if (cycle === 'annual') {
    const year = plan.annual * 12;
    const saved = (plan.monthly - plan.annual) * 12;
    return `$${year} a year${per}. That is $${saved} less than paying month to month.`;
  }

  return `Billed month to month${per}. Cancel whenever you want.`;
}

export type ComparisonGroup = {
  title: string;
  rows: { label: string; cells: [Cell, Cell, Cell] }[];
};

/**
 * Stated plainly, one cell per plan, in the plan order above. No row says
 * "everything in the plan above", because that hides the one thing a reader
 * comparing plans is trying to find out.
 */
export const COMPARISON: ComparisonGroup[] = [
  {
    title: 'Classes and students',
    rows: [
      { label: 'Active classes', cells: ['1', 'Unlimited', 'Unlimited'] },
      { label: 'Students per class', cells: ['40', 'Unlimited', 'Unlimited'] },
      {
        label: 'Import a class list',
        cells: ['Not included', 'From a spreadsheet', 'From a spreadsheet or your LMS'],
      },
      { label: 'Attendance taken without signal', cells: [true, true, true] },
    ],
  },
  {
    title: 'Teaching and marking',
    rows: [
      { label: 'Active unit plans', cells: ['1', 'Unlimited', 'Unlimited'] },
      {
        label: 'At-risk flags',
        cells: ['Not included', 'Your own classes', 'Every class you administer'],
      },
      { label: 'Rubrics attached to marks', cells: [true, true, true] },
      { label: 'Audit trail behind every mark', cells: [true, true, true] },
    ],
  },
  {
    title: 'School and data',
    rows: [
      { label: 'Export any class as CSV or JSON', cells: [true, true, true] },
      {
        label: 'Staff accounts you administer',
        cells: ['Not included', 'Not included', 'Included'],
      },
      {
        label: 'How you are billed',
        cells: ['Not billed', 'By card, monthly or annual', 'One annual invoice'],
      },
      {
        label: 'Support',
        cells: ['Documentation', 'Email, one business day', 'Priority email'],
      },
    ],
  },
];