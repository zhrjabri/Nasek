/**
 * The rule for a temporary password an administrator sets on a new campaign
 * owner's account.
 *
 * One file, imported by both sides: the "Add campaign owner" dialog checks it
 * before anything is uploaded, and `admin-create-owner` checks it again before
 * an account exists. Two copies of a rule drift, and the drift shows up as a
 * form that accepts what the server refuses — after the permit has already
 * gone to Storage. No imports, so Deno and Vite can both load it.
 *
 * Length first, as in `services/auth/password.ts`, and longer than the eight
 * characters an owner may choose for themselves: this password is typed by one
 * person and passed on to another, so it spends time written down somewhere.
 * The other checks refuse the handful of choices that are long but not secret —
 * the owner's own address, and a key held down.
 *
 * Supabase applies the project's own policy on top (and HaveIBeenPwned, when
 * leaked-password protection is on); whatever it refuses comes back as
 * `weak_password` with nothing created.
 */

export const TEMPORARY_PASSWORD_MIN_LENGTH = 12

/** bcrypt reads 72 bytes and ignores the rest; GoTrue refuses anything longer. */
export const TEMPORARY_PASSWORD_MAX_BYTES = 72

/** Fewer distinct characters than this is a pattern, not a password. */
const MIN_DISTINCT_CHARACTERS = 6

export type TemporaryPasswordProblem =
  | 'short'
  | 'long'
  | 'spaces'
  | 'simple'
  | 'is_email'
  | 'mismatch'

export function temporaryPasswordProblem(
  password: unknown,
  confirm: unknown,
  email: string,
): TemporaryPasswordProblem | null {
  if (typeof password !== 'string') return 'short'
  const characters = [...password]
  if (characters.length < TEMPORARY_PASSWORD_MIN_LENGTH) return 'short'
  if (new TextEncoder().encode(password).length > TEMPORARY_PASSWORD_MAX_BYTES) return 'long'
  // Leading or trailing space is almost always a copy-paste accident, and one
  // the owner will never reproduce when they type it in.
  if (password !== password.trim()) return 'spaces'
  if (new Set(characters).size < MIN_DISTINCT_CHARACTERS) return 'simple'

  const address = email.trim().toLowerCase()
  const lowered = password.toLowerCase()
  if (address && (lowered === address || lowered === address.split('@')[0])) return 'is_email'

  if (password !== confirm) return 'mismatch'
  return null
}
