import { randomInt } from 'node:crypto';

import { INVITE_TTL_DAYS } from '@/lib/api/types';

/**
 * Invitation codes.
 *
 * WHY THIS IS ONE MODULE AND NOT A LINE IN EACH ADAPTER.
 *
 * Both data adapters mint codes, and a code is the entire credential that lets
 * somebody sit a seat in a school. Two copies of that generator would be two
 * copies to weaken by accident, so the generator lives here and both adapters
 * call it.
 *
 * `randomInt` from node:crypto, not `Math.random`, following the same rule as
 * the temporary passwords in `classes/actions.ts`. `Math.random` is a
 * predictable generator: seed it, replay the stream, and every code that
 * adapter ever produced falls out in order. This one cannot be replayed.
 *
 * The alphabet drops I, O, 0 and 1. A code is read off a screen and typed by
 * hand, and a 1 for an I turns an invitation into a support ticket. What remains
 * is still uppercase alphanumeric, which is what the column check accepts:
 * `code ~ '^[A-Z0-9]{8}'`.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const CODE_LENGTH = 8;

/**
 * Eight characters from a 32 letter alphabet, so about 1.1 trillion codes.
 *
 * No counter, no sequence, no shortened id: a code that can be guessed by
 * counting is a code that can be guessed.
 */
export function newInviteCode(): string {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * When a code minted now stops working.
 *
 * Set explicitly on insert rather than left to the column default so the value
 * is the same one the console shows the administrator. The column defaults to
 * the same fourteen days, so the two paths cannot disagree.
 */
export function inviteExpiry(now: Date = new Date()): string {
  const ttlMs = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ttlMs).toISOString();
}