import { describe, expect, it } from 'vitest';

import {
  countDue,
  formatInterval,
  isDue,
  newSchedule,
  previewIntervals,
  review,
  type Recall,
  type Schedule,
} from './scheduler';

const T0 = new Date('2026-01-05T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function at(days: number): Date {
  return new Date(T0.getTime() + days * DAY);
}

function daysBetween(a: Schedule, b: Date): number {
  return Math.round((new Date(a.dueAt).getTime() - b.getTime()) / DAY);
}

/** Drives a card from new to `review` so the graduation path can be tested. */
function graduated(recall: Recall = 'good', now: Date = T0): Schedule {
  const first = review(newSchedule(now), recall, now);
  return review(first, recall, now);
}

/**
 * A card already in `review`, built explicitly rather than by overloading a
 * field on a graduated card.
 *
 * Overriding `intervalDays` alone leaves `dueAt` pointing at the old one, so
 * `isDue` and `countDue` disagree with the interval and the test asserts
 * against a schedule that cannot exist.
 */
function matureCard(intervalDays: number, easeFactor = 2.5, repetitions = 3, lapses = 0): Schedule {
  return {
    status: 'review',
    easeFactor,
    intervalDays,
    stepIndex: 0,
    repetitions,
    lapses,
    dueAt: new Date(T0.getTime() + intervalDays * DAY).toISOString(),
    lastReviewedAt: T0.toISOString(),
  };
}

describe('newSchedule', () => {
  it('is due immediately and has never been reviewed', () => {
    const s = newSchedule(T0);
    expect(s.status).toBe('new');
    expect(isDue(s, T0)).toBe(true);
    expect(s.lastReviewedAt).toBeNull();
  });

  it('starts at the SM-2 default ease', () => {
    expect(newSchedule(T0).easeFactor).toBe(2.5);
  });
});

describe('learning steps', () => {
  it('brings a forgotten card back in a minute rather than tomorrow', () => {
    // The reason learning steps exist at all: raw SM-2 would day this card.
    const s = review(newSchedule(T0), 'again', T0);
    expect(s.status).toBe('learning');
    expect(new Date(s.dueAt).getTime() - T0.getTime()).toBe(60 * 1000);
  });

  it('sends hard up one rung rather than graduating the card', () => {
    const s = review(newSchedule(T0), 'hard', T0);
    expect(s.status).toBe('learning');
    expect(s.stepIndex).toBe(1);
    expect(new Date(s.dueAt).getTime() - T0.getTime()).toBe(10 * 60 * 1000);
  });

  it('graduates a card answered right the first time', () => {
    // A card somebody gets right on a first sighting should not have to wait
    // ten minutes to graduate. That was the change that also split the four
    // answers apart on a new card.
    const s = review(newSchedule(T0), 'good', T0);
    expect(s.status).toBe('review');
    expect(s.intervalDays).toBe(1);
  });

  it('grows away from the one day it graduated at', () => {
    // Two good answers on a new card: the first graduates it to a day, the second
    // has to push it further out or the first interval was the last one.
    const s = graduated();
    expect(s.status).toBe('review');
    expect(s.intervalDays).toBeGreaterThan(1);
  });

  it('sends easy out to three days on its first sighting', () => {
    const s = review(newSchedule(T0), 'easy', T0);
    expect(s.status).toBe('review');
    expect(s.intervalDays).toBe(3);
  });

  it('orders the four answers on a first sighting as again, hard, good, easy', () => {
    /*
     * This test used to assert the opposite: that hard and good graduated at
     * the same interval. It was pinned that way to correct a comment that
     * described behaviour the code did not have, and pinning it turned a wrong
     * comment into a wrong specification.
     *
     * A comment is a claim to check. A test that enshrines it is a wall.
     */
    const gap = (recall: Recall) =>
      new Date(review(newSchedule(T0), recall, T0).dueAt).getTime() - T0.getTime();

    expect(gap('again')).toBeLessThan(gap('hard'));
    expect(gap('hard')).toBeLessThan(gap('good'));
    expect(gap('good')).toBeLessThan(gap('easy'));
  });

  it('drops back to the first step when the card is forgotten mid-ladder', () => {
    // Mid-ladder means hard on a new card, because that is now the answer that
    // moves a card up the ladder instead of out of it.
    const learned = review(newSchedule(T0), 'hard', T0);
    const s = review(learned, 'again', T0);
    expect(s.stepIndex).toBe(0);
    expect(s.status).toBe('learning');
  });
});

describe('graduated cards', () => {
  it('grows the interval by the ease factor on a good answer', () => {
    const mature: Schedule = matureCard(10);
    const s = review(mature, 'good', T0);
    // 10 * 2.5 = 25
    expect(s.intervalDays).toBe(25);
    expect(daysBetween(s, T0)).toBe(25);
  });

  it('grows more slowly on hard than on good', () => {
    const mature: Schedule = matureCard(10);
    expect(review(mature, 'hard', T0).intervalDays).toBeLessThan(
      review(mature, 'good', T0).intervalDays,
    );
  });

  it('grows fastest on easy', () => {
    const mature: Schedule = matureCard(10);
    expect(review(mature, 'easy', T0).intervalDays).toBeGreaterThan(
      review(mature, 'good', T0).intervalDays,
    );
  });

  it('never shrinks below the previous interval on a success', () => {
    const mature: Schedule = matureCard(30);
    expect(review(mature, 'hard', T0).intervalDays).toBeGreaterThanOrEqual(30);
  });

  it('counts each successful review', () => {
    const mature: Schedule = matureCard(10, 2.5, 4);
    expect(review(mature, 'good', T0).repetitions).toBe(5);
  });
});

describe('lapses', () => {
  it('returns a forgotten card now instead of at its old interval', () => {
    // The bug this guards: carrying a 30-day interval across a lapse leaves a
    // deck of cards the student has just failed sitting unseen for a month.
    const mature: Schedule = matureCard(30);
    const s = review(mature, 'again', T0);
    expect(s.status).toBe('relearning');
    expect(isDue(s, T0)).toBe(false);
    expect(new Date(s.dueAt).getTime() - T0.getTime()).toBe(60 * 1000);
    expect(s.repetitions).toBe(0);
  });

  it('counts the lapse', () => {
    const mature: Schedule = matureCard(10, 2.5, 3, 2);
    expect(review(mature, 'again', T0).lapses).toBe(3);
  });

  it('lowers the ease factor so the card comes back more often', () => {
    const mature: Schedule = matureCard(10, 2.5);
    expect(review(mature, 'again', T0).easeFactor).toBe(2.3);
  });

  it('recovers through relearning and graduates again', () => {
    const lapsed = review(matureCard(30), 'again', T0);
    const back = review(lapsed, 'good', T0);
    const again = review(back, 'good', T0);
    expect(again.status).toBe('review');
    expect(again.lapses).toBe(1);
  });
});

describe('bounds', () => {
  it('never lets ease fall below the SM-2 floor', () => {
    let s: Schedule = matureCard(5, 1.35);
    for (let i = 0; i < 10; i++) s = review(s, 'again', T0);
    expect(s.easeFactor).toBe(1.3);
  });

  it('never lets ease run away upwards', () => {
    let s: Schedule = matureCard(5, 2.95);
    for (let i = 0; i < 10; i++) s = review(s, 'easy', T0);
    expect(s.easeFactor).toBe(3);
  });

  it('caps the interval at a year', () => {
    const mature: Schedule = matureCard(300, 3);
    const s = review(mature, 'easy', T0);
    expect(s.intervalDays).toBe(365);
    expect(daysBetween(s, T0)).toBe(365);
  });

  it('never produces a zero or negative interval', () => {
    const odd: Schedule = matureCard(0);
    for (const recall of ['again', 'hard', 'good', 'easy'] as const) {
      expect(review(odd, recall, T0).intervalDays).toBeGreaterThan(0);
    }
  });
});

describe('purity', () => {
  it('does not mutate the schedule it was given', () => {
    const before = graduated('good', T0);
    const snapshot = JSON.stringify(before);
    review(before, 'easy', T0);
    review(before, 'again', T0);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('depends only on the injected clock, not the system date', () => {
    // Two runs of the same answers at two different wall-clock moments must
    // produce identical schedules. This is what the injected clock buys.
    const a = review(graduated('good', T0), 'good', T0);
    const b = review(graduated('good', at(900)), 'good', at(900));
    expect(a.intervalDays).toBe(b.intervalDays);
    expect(new Date(a.dueAt).getTime() - T0.getTime()).toBe(
      new Date(b.dueAt).getTime() - at(900).getTime(),
    );
  });
});

describe('previewIntervals', () => {
  it('offers four distinct hints on a mature card', () => {
    const mature: Schedule = matureCard(20);
    const hints = previewIntervals(mature, T0);
    expect(Object.keys(hints).sort()).toEqual(['again', 'easy', 'good', 'hard']);
    expect(new Set(Object.values(hints)).size).toBe(4);
  });

  it('promises exactly what the scheduler will do', () => {
    // A hint that disagrees with the outcome is worse than no hint, so each one
    // is checked against the schedule `review` actually produces.
    for (const base of [matureCard(20), matureCard(3), newSchedule(T0)]) {
      const hints = previewIntervals(base, T0);
      for (const recall of ['again', 'hard', 'good', 'easy'] as const) {
        expect(hints[recall], `${recall} on a ${base.intervalDays}d card`).toBe(
          formatInterval(review(base, recall, T0), T0),
        );
      }
    }
  });

  it('orders the four answers by how far out they push the card', () => {
    // The labels have to keep the same order as the intervals, or a student
    // reads a hint that argues with the button it sits under.
    const base = matureCard(20);
    const gap = (recall: Recall) =>
      new Date(review(base, recall, T0).dueAt).getTime() - T0.getTime();
    expect(gap('again')).toBeLessThan(gap('hard'));
    expect(gap('hard')).toBeLessThan(gap('good'));
    expect(gap('good')).toBeLessThan(gap('easy'));
  });

  it('gives a different label exactly when it schedules a different interval', () => {
    // The regression that printed "2mo" under both Good and Easy: two buttons
    // that schedule different intervals behind one identical label.
    //
    // Stated as an implication rather than "always four". Past roughly a
    // hundred days, Good and Easy both hit the one-year cap and genuinely
    // schedule the same thing, so sharing a label there is the correct answer.
    // Zero is absent because a graduated card is never at zero days.
    const answers = ['again', 'hard', 'good', 'easy'] as const;

    for (const interval of [1, 3, 7, 14, 20, 45, 100, 200, 300]) {
      const base = matureCard(interval);
      const hints = previewIntervals(base, T0);
      const gaps = answers.map(
        (a) => new Date(review(base, a, T0).dueAt).getTime() - T0.getTime(),
      );

      for (let i = 0; i < answers.length; i++) {
        for (let j = i + 1; j < answers.length; j++) {
          if (gaps[i] === gaps[j]) continue;
          expect(hints[answers[i]!], `${interval}d: ${answers[i]} vs ${answers[j]}`).not.toBe(
            hints[answers[j]!],
          );
        }
      }
    }
  });

  it('gives a new card four different labels', () => {
  /*
   * THE CASE THAT SLIPPED THROUGH.
   *
   * Every other label test used `matureCard`, which is already in `review`. A
   * card nobody has seen took a different path through the scheduler, and on
   * that path three of the four answers produced the same ten-minute rung. The
   * suite was green and the browser showed "Hard 10m, Good 10m, Easy 10m".
   *
   * A test that only checks states the product spends most of its time in is
   * a test that misses the state a student meets first.
   */
  const hints = previewIntervals(newSchedule(T0), T0);
  expect(new Set(Object.values(hints)).size).toBe(4);
  expect(Object.values(hints).sort()).toEqual(['10m', '1d', '1m', '3d']);
});

it('separates all four answers anywhere below the cap', () => {
    for (const interval of [1, 3, 7, 14, 20, 45, 100]) {
      const hints = previewIntervals(matureCard(interval), T0);
      expect(new Set(Object.values(hints)).size, `card at ${interval}d`).toBe(4);
    }
  });

  it('shows minutes on a new card for the answers that are minutes', () => {
    // `again` and `hard` keep the card in the ladder, so they read in minutes.
    // `good` and `easy` graduate it, so they read in days. Every hint is in the
    // unit its own answer actually schedules.
    const hints = previewIntervals(newSchedule(T0), T0);
    expect(hints.again).toBe('1m');
    expect(hints.hard).toBe('10m');
    expect(hints.good).toBe('1d');
    expect(hints.easy).toBe('3d');
  });
});

it('never produces a fractional interval', () => {
  // `interval_days` is an integer column. A 2.5 that reaches Postgres becomes a
  // 3, and the student is shown the 2.5. The drift is invisible until somebody
  // compares the two, so it is asserted rather than assumed.
  let s: Schedule = { ...matureCard(1), easeFactor: 2.5 };
  for (const recall of ['hard', 'good', 'easy'] as const) {
    for (let i = 0; i < 6; i++) {
      s = review(s, recall, T0);
      expect(Number.isInteger(s.intervalDays), `${recall} produced ${s.intervalDays}`).toBe(true);
    }
  }
});

describe('countDue', () => {
  it('splits due, learning and total', () => {
    const schedules = [
      { schedule: newSchedule(T0) },
      // `hard` is what keeps a new card in the ladder now, so it is the one
      // that produces a learning row worth counting.
      { schedule: review(newSchedule(T0), 'hard', T0) },
      { schedule: matureCard(10) },
    ];
    // Counted a day on, when the learning card has come round again but the
    // graduated one, due in ten days, has not.
    const counts = countDue(schedules, at(1));
    expect(counts.due).toBe(1);
    expect(counts.learning).toBe(1);
    expect(counts.total).toBe(3);
  });

  it('returns zeroes rather than negatives for an empty deck', () => {
    expect(countDue([], T0)).toEqual({ due: 0, learning: 0, total: 0 });
  });

  it('counts a card whose due time has passed as due', () => {
    const mature: Schedule = matureCard(10);
    expect(countDue([{ schedule: mature }], at(11))).toMatchObject({ due: 1 });
    expect(countDue([{ schedule: mature }], at(9))).toMatchObject({ due: 0 });
  });
});