/**
 * Spaced repetition.
 *
 * SM-2 as published by Wozniak, with the two additions that make it usable in a
 * product rather than in a paper:
 *
 *  - Learning steps. Raw SM-2 sends a failed card back the next day, which is
 *    the wrong interval for something the student has just been shown. A card
 *    being learned comes back in minutes and graduates to days.
 *  - An injected clock. `review()` takes `now`, so nothing here reads the system
 *    date. That is what makes the intervals testable at all, and it is the same
 *    rule the rest of this codebase follows: a value that depends on time takes
 *    the time as an argument rather than reaching for it.
 *
 * Nothing in this module is persisted. The caller owns the row.
 */

export type Recall = 'again' | 'hard' | 'good' | 'easy';

export type CardStatus = 'new' | 'learning' | 'review' | 'relearning';

/** Minutes until the next look at a card still in learning or relearning. */
const LEARNING_STEPS_MINUTES = [1, 10] as const;

/**
 * Days a lapse costs before the card is shown again, as a floor on the
 * interval. Without it a repeatedly-failed card keeps its old 30-day interval
 * on the way back in, which is how a deck stops being revised at all.
 */
const RELEARN_INTERVAL_DAYS = 1;

/** Longest interval the scheduler will hand out, in days. */
const MAX_INTERVAL_DAYS = 365;

/** SM-2 defines 1.3 as the floor for the ease factor; below it a card stops recovering. */
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const DEFAULT_EASE = 2.5;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface Schedule {
  status: CardStatus;
  easeFactor: number;
  /** Days until the next look, once the card has graduated to `review`. */
  intervalDays: number;
  /** Index into LEARNING_STEPS_MINUTES. Meaningless outside learning steps. */
  stepIndex: number;
  /** Consecutive successful reviews. Reset by a lapse. */
  repetitions: number;
  /** How many times this card has been forgotten after graduating. */
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
}

export function newSchedule(now: Date): Schedule {
  return {
    status: 'new',
    easeFactor: DEFAULT_EASE,
    intervalDays: 0,
    stepIndex: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: now.toISOString(),
    lastReviewedAt: null,
  };
}

function clampEase(ease: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, round(ease)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function at(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString();
}

function inMinutes(now: Date, minutes: number): string {
  return at(now, minutes * MINUTE_MS);
}

/** True when the card should be shown at `now`. */
export function isDue(schedule: Schedule, now: Date): boolean {
  return new Date(schedule.dueAt).getTime() <= now.getTime();
}

/**
 * Applies one recall to a schedule and returns the next one. Pure: `now` is
 * the only source of time, and the input is never mutated.
 */
export function review(current: Schedule, recall: Recall, now: Date): Schedule {
  const lastReviewedAt = now.toISOString();

  // A card the student has not seen yet, or one being relearned, walks the
  // learning ladder rather than jumping straight to a day-long interval.
  if (current.status === 'new' || current.status === 'learning' || current.status === 'relearning') {
    return step(current, recall, now, lastReviewedAt);
  }

  return graduate(current, recall, now, lastReviewedAt);
}

function step(
  current: Schedule,
  recall: Recall,
  now: Date,
  lastReviewedAt: string,
): Schedule {
  const nextStep = current.stepIndex + 1;

  if (recall === 'again') {
    return {
      ...current,
      status: 'learning',
      stepIndex: 0,
      dueAt: inMinutes(now, LEARNING_STEPS_MINUTES[0]),
      lastReviewedAt,
    };
  }

  const lastStep = nextStep >= LEARNING_STEPS_MINUTES.length;

  if (lastStep) {
    /*
     * Out of the ladder, and `easy` is the only answer that reaches a different
     * interval here.
     *
     * `hard` and `good` both graduate at one day, and that is deliberate rather
     * than an oversight. The previous version of this comment claimed `hard`
     * graduated "a day early" against a `good` that graduated later, which the
     * code never did: both branches were `1`. A first graduating interval has no
     * room below a day that is still a real interval, and dropping `hard` to
     * the top learning step would punish the answer for getting a card out of
     * the ladder at all.
     *
     * The four buttons still differ on a first sighting, just not through the
     * day count: `again` returns to the one minute step while all three
     * successes advance one rung.
     */
    const days = recall === 'easy' ? 3 : 1;
    return {
      ...current,
      status: 'review',
      stepIndex: 0,
      intervalDays: days,
      repetitions: current.repetitions + 1,
      dueAt: at(now, days * DAY_MS),
      lastReviewedAt,
    };
  }

  const minutes = LEARNING_STEPS_MINUTES[nextStep];
  if (minutes === undefined) {
    // Unreachable while the ladder has two steps, but the indexed access is
    // checked rather than asserted so adding a step cannot silently ship NaN.
    return { ...current, dueAt: at(now, DAY_MS), lastReviewedAt };
  }

  return {
    ...current,
    status: current.status === 'relearning' ? 'relearning' : 'learning',
    stepIndex: nextStep,
    dueAt: inMinutes(now, minutes),
    lastReviewedAt,
  };
}

function graduate(
  current: Schedule,
  recall: Recall,
  now: Date,
  lastReviewedAt: string,
): Schedule {
  if (recall === 'again') {
    return {
      ...current,
      status: 'relearning',
      stepIndex: 0,
      // The interval is not carried across the lapse. A card that was three
      // weeks out and has just been forgotten is due again now, not in three.
      intervalDays: RELEARN_INTERVAL_DAYS,
      repetitions: 0,
      lapses: current.lapses + 1,
      easeFactor: clampEase(current.easeFactor - 0.2),
      dueAt: inMinutes(now, LEARNING_STEPS_MINUTES[0]),
      lastReviewedAt,
    };
  }

  const easeFactor = clampEase(adjustedEase(current.easeFactor, recall));
  const repetitions = current.repetitions + 1;

  let intervalDays: number;
  if (recall === 'hard') {
    // Below the ease multiplier on purpose: "hard" means it nearly failed.
    intervalDays = round(Math.max(current.intervalDays + 1, current.intervalDays * 1.2));
  } else if (recall === 'easy') {
    intervalDays = round(Math.max(current.intervalDays + 1, current.intervalDays * easeFactor * 1.3));
  } else {
    intervalDays = round(Math.max(current.intervalDays + 1, current.intervalDays * easeFactor));
  }

  return {
    ...current,
    status: 'review',
    stepIndex: 0,
    easeFactor,
    intervalDays: Math.min(MAX_INTERVAL_DAYS, Math.max(1, intervalDays)),
    repetitions,
    dueAt: at(now, Math.min(MAX_INTERVAL_DAYS, Math.max(1, intervalDays)) * DAY_MS),
    lastReviewedAt,
  };
}

/**
 * SM-2's ease adjustment, mapped onto four answers.
 *
 * The published formula is `EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))`
 * over q in 0..5. The published scores do not line up with four buttons, so
 * the curve is applied at the grade each answer stands for: hard is SM-2's 3,
 * good is 4, easy is 5.
 */
function adjustedEase(ease: number, recall: Exclude<Recall, 'again'>): number {
  const q = recall === 'hard' ? 3 : recall === 'good' ? 4 : 5;
  return ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
}

/**
 * What the four buttons will do to this card, for the interval hints printed
 * under them. Computed from the same code path as `review`, so a hint can never
 * promise an interval the scheduler will not actually use.
 */
export function previewIntervals(
  current: Schedule,
  now: Date,
): Record<Recall, string> {
  return {
    again: formatInterval(review(current, 'again', now), now),
    hard: formatInterval(review(current, 'hard', now), now),
    good: formatInterval(review(current, 'good', now), now),
    easy: formatInterval(review(current, 'easy', now), now),
  };
}

/**
 * The human interval printed under a review button, measured from `now`.
 *
 * Measured from `now` rather than from the schedule's own `lastReviewedAt`:
 * that field is the timestamp of a review that has not happened yet, which is
 * what this whole function exists to describe.
 *
 * Three units, not six. An earlier ladder stepped days to months to years and
 * printed "2mo" under both Good and Easy on a twenty-day card: two buttons
 * scheduling different intervals behind one identical label, with no way for
 * the student to tell them apart. Weeks did not fix it either, only moved the
 * collision to shorter cards.
 *
 * The ladder is unnecessary because the scheduler caps every interval at
 * `MAX_INTERVAL_DAYS`, so minutes, hours and days span the whole range a card
 * can ever occupy and two different intervals cannot round to the same label.
 */
export function formatInterval(schedule: Schedule, now: Date): string {
  const minutes = Math.max(
    1,
    Math.round((new Date(schedule.dueAt).getTime() - now.getTime()) / MINUTE_MS),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${round(hours / 24)}d`;
}

/** Counts for the deck header. Derived, never stored. */
export interface DueCounts {
  due: number;
  learning: number;
  total: number;
}

export function countDue(
  schedules: { schedule: Schedule }[],
  now: Date,
): DueCounts {
  let due = 0;
  let learning = 0;
  for (const { schedule } of schedules) {
    if (schedule.status === 'learning' || schedule.status === 'relearning') {
      if (isDue(schedule, now)) learning++;
    } else if (isDue(schedule, now)) {
      due++;
    }
  }
  return { due, learning, total: schedules.length };
}

/**
 * The fields a schedule and a stored progress row have in common.
 *
 * `Schedule` is exactly this plus `cardId`, `studentId` and `updatedAt`, so the
 * two conversions below are a projection rather than a mapping. Written out so
 * that adding a field to one shape and forgetting the other is a type error
 * here instead of a row that silently keeps a stale value.
 */
export interface ScheduleFields {
  status: CardStatus;
  easeFactor: number;
  intervalDays: number;
  stepIndex: number;
  repetitions: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
}

/** The schedule of a card this student has never opened. */
export function freshSchedule(now: Date): Schedule {
  return newSchedule(now);
}

/**
 * Reads a stored row as a schedule.
 *
 * A row that is absent is a card the student has never reviewed, and `new` is a
 * real state the scheduler produces rather than a placeholder invented here.
 */
export function toSchedule(row: ScheduleFields | null, now: Date): Schedule {
  if (!row) return newSchedule(now);
  return { ...row };
}