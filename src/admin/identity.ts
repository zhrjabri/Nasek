/**
 * Which account the administration dashboard signs in as.
 *
 * The dashboard asks for a password and nothing else. That is a deliberate
 * shape — an administrator is the person called when something is already
 * wrong, and the address they would type is the same one every time — but it
 * leaves a question the form can no longer answer: a password authenticates
 * *an account*, and Supabase needs to be told which.
 *
 * So the address is configuration rather than input. It is set once, at build
 * time, and the login screen carries it silently. Typing it is not what made
 * the dashboard safe; `is_admin()` running inside Postgres against a signed JWT
 * is, and that check is untouched by this. Anyone can read this value out of
 * the bundle, and reading it grants exactly what knowing an email address has
 * always granted: nothing.
 *
 * Left unset, the screen falls back to asking for the address alongside the
 * password. That keeps an existing deployment working after this change rather
 * than locking its administrators out of their own dashboard over a missing
 * variable — but it is the fallback, and `npm run verify:admin` says so.
 */

/**
 * Read a configured address, or decide it is not one.
 *
 * Pure and exported so `npm run verify:auth` can put the awkward values through
 * it — an unset variable, whitespace, a value someone pasted with the label
 * still attached — without a build per case. The constants below are this
 * function applied once to the environment.
 */
export function parseAdminEmail(raw: string | undefined): {
  email: string
  misconfigured: boolean
} {
  const configured = (raw ?? '').trim().toLowerCase()
  if (!configured) return { email: '', misconfigured: false }
  // Deliberately the same shape the sign-in forms accept, so a value that would
  // be refused there is refused here instead of at the worst moment.
  const valid = /^\S+@\S+\.\S+$/.test(configured)
  return { email: valid ? configured : '', misconfigured: !valid }
}

const parsed = parseAdminEmail(import.meta.env.VITE_ADMIN_EMAIL)

/** The administrator's address, or '' when none is configured. */
export const ADMIN_EMAIL = parsed.email

/**
 * Whether the dashboard can sign in on a password alone.
 *
 * False both when the variable is absent and when what it holds is not an
 * address — the second case matters more, because it is the one that would
 * otherwise fail as "invalid credentials" and send somebody hunting for a
 * password problem that does not exist.
 */
export const hasFixedAdminIdentity = ADMIN_EMAIL !== ''

/** Set, but not to anything that could be an address. Worth saying out loud. */
export const adminIdentityMisconfigured = parsed.misconfigured
