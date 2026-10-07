/**
 * Error normalisation.
 *
 * Supabase returns a `message` that is safe to log but useless in a UI: it can
 * name a constraint, a column, or the fact that a row already exists. Passing
 * any of that to a form would leak schema and let a caller probe for records
 * that are not theirs, so nothing from the provider reaches the interface
 * unchanged.
 */

export class DataError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.cause = cause;
  }
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const NOT_NULL_VIOLATION = '23502';
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * Maps a PostgREST error to a stable code plus safe copy.
 *
 * `42501` deserves its own case because it is what RLS returns when a row
 * belongs to someone else. The caller must treat it as "not found", never as
 * "forbidden": telling a caller that a record exists but is not theirs confirms
 * it exists.
 */
export function mapSupabaseError(error: { message?: string; code?: string }): DataError {
  const code = error?.code ?? '';

  switch (code) {
    case INSUFFICIENT_PRIVILEGE:
      return new DataError('NOT_FOUND', 'That record does not exist.', error);

    case UNIQUE_VIOLATION:
      return new DataError(
        'ALREADY_EXISTS',
        'That record already exists. Refresh and try again.',
        error,
      );

    case FOREIGN_KEY_VIOLATION:
      return new DataError(
        'INVALID_REFERENCE',
        'That record refers to something that no longer exists.',
        error,
      );

    case NOT_NULL_VIOLATION:
      return new DataError('MISSING_FIELD', 'A required field was empty.', error);

    default:
      return new DataError('UNKNOWN', 'Something went wrong. Try again.', error);
  }
}