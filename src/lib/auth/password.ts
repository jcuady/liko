import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * `promisify` collapses Node's overloads to the three-argument form and drops
 * the options bag, so the four-argument call is re-typed here rather than cast
 * away at each site.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/**
 * Password hashing and reset tokens.
 *
 * scrypt with N=16384, r=8, p=1 and a 32-byte random salt per password.
 * Verification is constant-time so a wrong password cannot be distinguished
 * from a wrong prefix by timing.
 *
 * If the project adopts argon2id later, only this file changes.
 */

const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scrypt(password, salt, expected.length, { N, r, p });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export interface PasswordCheck {
  ok: boolean;
  problems: string[];
}

/**
 * Client-facing strength rules, mirrored by the Zod schema so the UI and the
 * server agree on what counts as acceptable.
 */
export function checkPasswordStrength(password: string): PasswordCheck {
  const problems: string[] = [];

  if (password.length < 10) problems.push('Use at least 10 characters.');
  if (!/[a-z]/.test(password)) problems.push('Add a lowercase letter.');
  if (!/[A-Z]/.test(password)) problems.push('Add an uppercase letter.');
  if (!/[0-9]/.test(password)) problems.push('Add a number.');
  if (/^(.)\1+$/.test(password)) problems.push('Avoid a single repeated character.');

  return { ok: problems.length === 0, problems };
}
