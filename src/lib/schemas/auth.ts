import { z } from 'zod';

/**
 * Input validation. Every server action and route handler parses through one of
 * these before the value reaches the API client.
 */

/**
 * Email is normalised before validation, not after. Zod 4 applies string
 * overwrites such as `.trim()` after the base checks, so a padded or mixed-case
 * address would fail `.email()` if the order were reversed. Piping makes the
 * order explicit: trim, lowercase, then check.
 */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().min(1, 'Enter your email.'))
  .pipe(z.email('Enter a valid email address.'))
  .pipe(z.string().max(254, 'That email address is too long.'));

const password = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.')
  .regex(/[a-z]/, 'Add a lowercase letter.')
  .regex(/[A-Z]/, 'Add an uppercase letter.')
  .regex(/[0-9]/, 'Add a number.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(200),
});

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your full name.')
    .max(80, 'That name is too long.'),
  email,
  password,
});

export const forgotPasswordSchema = z.object({ email });

/*
 * `resetPasswordSchema` and `profileSchema` were removed here.
 *
 * `resetPasswordSchema` took a token and a confirmation field, which described
 * the old homegrown reset flow. Supabase Auth now issues the recovery session
 * and the reset form posts only the new password twice, so the schema no longer
 * matched the request. `profileSchema` had no importer at any point.
 *
 * Both were unreferenced, so this removes a second, weaker credential contract
 * sitting next to the live one, which is a maintenance trap as much as dead
 * weight.
 */

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;