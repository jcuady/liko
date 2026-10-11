import { describe, expect, it } from 'vitest';

import {
  CODE_BUBBLE_MM,
  CODE_DIGIT_GAP_MM,
  CODE_WITHIN_GAP_MM,
  DETECTOR_SPLIT_RATIO,
  SHEET_CONTENT_MM,
  codeBlockFits,
  codeBlockSplitRatio,
  codeBlockWidthMm,
  maxGroupsFor,
} from './code-block';

/**
 * The printed geometry of the code block.
 *
 * This is arithmetic about millimetres, and the consequence of getting it wrong
 * is not a wrong number on a screen. A block too wide for the page runs off the
 * right edge, and the codes that fall off it are the ones a child was told to
 * shade. So the limits are pinned here as literals rather than left to the
 * picker to discover.
 *
 * One of these shapes shipped broken first: two groups of six at 4mm inside gaps
 * needed 183mm in a 182mm column. Nothing caught it, because nothing in the repo
 * knew how wide the column was until this file existed.
 */

describe('code block geometry', () => {
  it('measures a block from its bubbles and its gaps', () => {
    // Two groups of six: 12 bubbles, 10 inside gaps, 1 between-group gap.
    expect(codeBlockWidthMm(2, 6)).toBe(2 * (CODE_BUBBLE_MM * 6 + CODE_WITHIN_GAP_MM * 5) + CODE_DIGIT_GAP_MM);
    // One group has no between-group gap at all.
    expect(codeBlockWidthMm(1, 8)).toBe(CODE_BUBBLE_MM * 8 + CODE_WITHIN_GAP_MM * 7);
  });

  it('fits the two shapes that carry the most codes a class can use', () => {
    // Two groups of six carries twelve. Three groups of four also carries
    // twelve, and is the shape a class that prefers three short groups uses.
    expect(codeBlockFits(2, 6)).toBe(true);
    expect(codeBlockFits(3, 4)).toBe(true);
    expect(codeBlockWidthMm(2, 6)).toBeLessThanOrEqual(SHEET_CONTENT_MM);
    expect(codeBlockWidthMm(3, 4)).toBeLessThanOrEqual(SHEET_CONTENT_MM);
  });

  it('refuses the shapes that would run off the edge of the paper', () => {
    // Two groups of eight is sixteen codes and needs 227mm in a 182mm column.
    expect(codeBlockWidthMm(2, 8)).toBeGreaterThan(SHEET_CONTENT_MM);
    expect(codeBlockFits(2, 8)).toBe(false);
    expect(codeBlockFits(3, 6)).toBe(false);
    expect(codeBlockFits(3, 8)).toBe(false);
  });

  it('leaves room to spare on the widest shape it accepts', () => {
    // The three-of-four shape is the tightest one offered, and it still fits
    // with margin rather than exactly flush. A sheet printed edge to edge is a
    // sheet whose last bubble is one printer's margin away from being cropped.
    const slack = SHEET_CONTENT_MM - codeBlockWidthMm(3, 4);
    expect(slack).toBeGreaterThan(0);
    expect(slack).toBeLessThan(CODE_BUBBLE_MM);
  });

  /*
   * The geometry has to satisfy the detector as well as the paper, and the
   * quantity that matters is the ratio of CENTRE-TO-CENTRE distances, because
   * that is what `readIdRow` computes. Comparing the two raw gaps is a different
   * number: 3mm and 9.6mm look like 3.2x on paper and measure 1.69 against a 1.6
   * threshold, which is not enough. That shipped, printed a block that read as a
   * ninth answer row, and was caught only by the end-to-end proof.
   */
  it('splits a printed block with margin over the detector threshold', () => {
    expect(codeBlockSplitRatio()).toBeGreaterThan(DETECTOR_SPLIT_RATIO);
    // Not just above it. A phone photograph skews the centres, which moves the
    // median, and a ratio that clears the threshold by 2% clears it on a desk and
    // not on a phone.
    expect(codeBlockSplitRatio()).toBeGreaterThan(DETECTOR_SPLIT_RATIO * 1.15);
  });

  it('keeps the inside gap wide enough that two outlines cannot merge', () => {
    // The printed stroke is 0.6mm on each edge, so the ink has to be more than
    // 1.2mm apart or two bubbles become one component and one digit.
    expect(CODE_WITHIN_GAP_MM).toBeGreaterThan(1.2);
  });

  it('reports the widest block for each number of bubbles per group', () => {
    expect(maxGroupsFor(2)).toBe(3);
    expect(maxGroupsFor(4)).toBe(3);
    expect(maxGroupsFor(6)).toBe(2);
    expect(maxGroupsFor(8)).toBe(1);
  });

  it('never reports a width that its own fit check would then reject', () => {
    for (const perGroup of [2, 3, 4, 5, 6, 7, 8]) {
      const widest = maxGroupsFor(perGroup);
      expect(widest, `${perGroup} codes per group`).toBeGreaterThanOrEqual(1);
      expect(codeBlockFits(widest, perGroup), `${widest} x ${perGroup}`).toBe(true);
    }
  });
});