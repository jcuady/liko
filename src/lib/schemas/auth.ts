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
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().min(1, 'Enter your email.'))
  .pipe(z.email('Enter a valid email address.'))
  .pipe(z.string().max(254, 'That email address is too long.'));

/** Local alias so the schemas below read as one word each. */
const email = emailSchema;

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

/**
 * A consent tick.
 *
 * WHY A LITERAL AND NOT A BOOLEAN. `registerAction` is a public endpoint, so the
 * only trustworthy value is the one a real form post produces for a *checked*
 * `<input type="checkbox">`, which is the string `"on"`. Booleans invite the
 * mistake of coercing: `Boolean(formData.get('acceptedTerms'))` is `true` for
 * the string `"false"`, so a crafted post claiming refusal would be recorded as
 * acceptance. A literal has no coercion that inverts its meaning. An unchecked
 * box posts nothing at all, a tampered post posts anything, and all of those
 * land on the same refusal.
 */
const consent = (message: string) => z.literal('on', { error: message });

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your full name.')
    .max(80, 'That name is too long.'),
  email,
  password,
  acceptedTerms: consent('Accept the terms to create an account.'),
  acceptedPrivacy: consent('Accept the privacy notice to create an account.'),
});

/**
 * WHY THERE IS NO `role` FIELD HERE.
 *
 * Students and guardians do not self-register. A student or guardian account is
 * created by the teacher who owns the class, through `/classes`, and lands in
 * that teacher's organisation as a member.
 *
 * Omitting the field is the enforcement, not an oversight: Zod strips unknown
 * keys, so a crafted post carrying `role: "student"` is parsed successfully and
 * the role is *discarded*. `registerAction` then passes the fixed value
 * `instructor`. A schema that merely validated the role would need a check that
 * admits two values, and that check would be the thing to get wrong.
 */

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