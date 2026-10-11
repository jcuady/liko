/**
 * The printed geometry of the student code block.
 *
 * WHY THIS IS ITS OWN FILE. The number of codes a sheet can carry is not a
 * product decision and not a detector decision, it is arithmetic on millimetres.
 * It has to be answered in three places at once: the sheet has to draw it, the
 * teacher's control has to know what to offer, and the server action has to
 * refuse a shape that would not fit. When those three disagree, the worst case
 * is a block that runs off the right edge of the page and is only discovered
 * after thirty sheets have gone out.
 *
 * WHY THESE NUMBERS. `BUBBLE` is fixed by the detector's minimum shape gate on an
 * A4 page normalised to 1400px, which is why it is not a style value. The inside
 * gap only has to be wide enough that two neighbouring outlines do not merge into
 * one component; the between-digit gap has to clear the 1.6x median that
 * `readIdRow` splits on, and to clear it with room for a crooked photograph, so
 * it is set well above the threshold rather than exactly on it.
 */

/** Bubble edge, in millimetres. Held by the detector's shape gate, not by taste. */
export const CODE_BUBBLE_MM = 11;

/**
 * Edge to edge between two codes in the same group.
 *
 * Small on purpose. At 4mm a two-group block of six needed 183mm inside a 182mm
 * text column and ran off the right edge of the page. 2mm still leaves the ink
 * 1.4mm apart, so two outlines cannot merge into one component.
 */
export const CODE_WITHIN_GAP_MM = 2;

/**
 * Gap from the last code of one group to the first of the next.
 *
 * THE NUMBER THAT MATTERS IS NOT THIS ONE. `readIdRow` measures the distance
 * between two bubble CENTRES, not between two edges, so the ratio it sees is
 * `(BUBBLE + WITHIN + BETWEEN) / (BUBBLE + WITHIN)` and not `BETWEEN / WITHIN`.
 * The first version of this file set 3mm and 9.6mm, which reads as a 3.2 ratio on
 * paper and as 1.69 in the only units that matter, against a threshold of 1.6. The
 * block printed, was detected as a ninth answer row, and was read as two rows of
 * something rather than one row of two groups. The unit test asserted the ratio of
 * the gaps and passed, because that is a different quantity.
 *
 * 13mm puts the centre-to-centre ratio at exactly 2.0, a 25% margin over the
 * threshold, and still fits twelve codes on the page.
 */
export const CODE_DIGIT_GAP_MM = 13;

/** Printable width inside the sheet's side margins: 210mm page less 14mm each side. */
export const SHEET_CONTENT_MM = 182;

/**
 * How much wider one between-group gap is than one inside gap, in the units
 * `readIdRow` actually measures.
 *
 * This is the single number the whole block layout has to satisfy, and it is
 * exported so the test can assert it rather than infer it from two constants.
 */
export function codeBlockSplitRatio(): number {
  const within = CODE_BUBBLE_MM + CODE_WITHIN_GAP_MM;
  const between = within + CODE_DIGIT_GAP_MM;
  return between / within;
}

/** The threshold in `readIdRow`. Duplicated deliberately: see `code-block.test.ts`. */
export const DETECTOR_SPLIT_RATIO = 1.6;

/**
 * How wide a shape prints, in millimetres.
 *
 * The inside gaps are `perGroup - 1` per group, not per block, because the last
 * code in a group has no gap after it inside that group; the between-group gaps
 * are the only ones that cross.
 */
export function codeBlockWidthMm(groups: number, perGroup: number): number {
  const inside = groups * (CODE_BUBBLE_MM * perGroup + CODE_WITHIN_GAP_MM * (perGroup - 1));
  const between = CODE_DIGIT_GAP_MM * (groups - 1);
  return inside + between;
}

/**
 * Whether a shape fits on one line of the sheet.
 *
 * Exported rather than inlined into the control so the control, the print route
 * and the server action all ask the same question. The server action is the one
 * that matters: a shape that does not fit has to be refused at the write, not
 * merely discouraged in the picker.
 */
export function codeBlockFits(groups: number, perGroup: number): boolean {
  return codeBlockWidthMm(groups, perGroup) <= SHEET_CONTENT_MM;
}

/**
 * The widest shape in this family, for a given number of codes per group.
 *
 * Backs the picker's own limit. It asks the geometry rather than carrying a
 * constant, so a change to the bubble size or the page margins moves the ceiling
 * on its own instead of leaving it describing a sheet that no longer exists.
 */
export function maxGroupsFor(perGroup: number): number {
  for (let groups = 3; groups >= 1; groups -= 1) {
    if (codeBlockFits(groups, perGroup)) return groups;
  }
  return 0;
}