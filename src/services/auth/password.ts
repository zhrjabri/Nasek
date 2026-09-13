import { supabase } from '@/services/supabase/client'
import { authRedirectTarget } from './redirect'
import { toE164 } from './phone'

/**
 * Passwords, for the two roles that have a reason to hold one.
 *
 * NASEK's pilgrims still sign in with a one-time code and nothing else, and
 * that is not a compromise — for someone who will use this site around one trip
 * in their life, a password is pure cost, and the "forgot password" flow every
 * password system needs is *already* the code flow. Nothing below is offered to
 * a customer.
 *
 * Campaign owners and administrators are different, and the difference is how
 * often and how urgently they sign in. An owner manages a live inventory of
 * seats; an administrator is the person who gets called when something is
 * wrong. Making either of them wait on an inbox — with an email provider's
 * rate limits and delivery delays between them and their own dashboard — is a
 * bad trade at exactly the wrong moment. A password is a second, independent
 * route in, and for administrators it is the factor that a TOTP code is a
 * *second* factor to.
 *
 * The one-time code still works for both. It is the recovery path, it is how
 * accounts created before this existed get in, and removing it would mean an
 * owner who forgets a password has no way back.
 */

export type PasswordError =
  | 'offline'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'rate_limited'
  /** The account exists but the address is already taken by another one. */
  | 'email_taken'
  /**
   * The project has no SMS provider configured, so Supabase will not accept a
   * phone number at all. Its own message is "Unsupported phone provider" or
   * "Phone signups are disabled".
   *
   * Worth its own value rather than folding into 'failed': it is a NASEK
   * configuration state, not something the person at the keyboard did or can
   * fix, and the interface says so instead of blaming them.
   */
  | 'phone_disabled'
  | 'failed'

/** Minimum length. Supabase enforces its own floor; this is NASEK's, and higher. */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Is this a password worth accepting?
 *
 * Length only, deliberately. Composition rules ("one capital, one symbol")
 * measurably push people towards `Password1!` and away from length, which is
 * the only property that actually costs an attacker anything. Supabase can
 * additionally check candidates against HaveIBeenPwned — enable
 * "Leaked password protection" in the dashboard; this returns whatever it says.
 */
export function passwordProblem(password: string, confirm?: string): 'short' | 'mismatch' | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'short'
  if (confirm !== undefined && password !== confirm) return 'mismatch'
  return null
}

/** Supabase's error text, reduced to something the interface can act on. */
function classify(message: string): PasswordError {
  const text = message.toLowerCase()
  if (/invalid login|invalid credentials|bad credential/.test(text)) return 'invalid_credentials'
  if (/email not confirmed|not confirmed/.test(text)) return 'email_not_confirmed'
  if (/password.*(weak|short|least|characters)|pwned|leaked/.test(text)) return 'weak_password'
  if (/rate|too many|seconds/.test(text)) return 'rate_limited'
  if (/already registered|already exists|user already/.test(text)) return 'email_taken'
  if (/unsupported phone provider|phone.*(disabled|not enabled)|sms.*not/.test(text)) {
    return 'phone_disabled'
  }
  return 'failed'
}

// -------------------------------------------------------------- setting one

/**
 * Set (or replace) the password on the session that is already open.
 *
 * Used at the end of a registration that had to fall back to a one-time code —
 * an owner whose address already had a pilgrim account, for instance. Proving
 * control of an address is exactly the authority a password reset rests on, so
 * this grants nothing that the code flow did not already grant.
 */
export async function setPassword(password: string): Promise<{ ok: boolean; error?: PasswordError }> {
  if (!supabase) return { ok: false, error: 'offline' }
  const { error } = await supabase.auth.updateUser({ password })
  return error ? { ok: false, error: classify(error.message) } : { ok: true }
}

/**
 * Send a campaign owner a link to set a new password.
 *
 * The reason the owner portal can offer email-and-password *only* and still
 * have a way back in. A pilgrim's recovery path is the one-time code, which is
 * also their sign-in; an owner's sign-in is a password, so recovery has to be
 * something else — and a reset link proves control of exactly the same address
 * a code would, while ending in a password rather than in a session with none.
 *
 * Always resolves, and never reports whether the address was found. Supabase
 * behaves the same way at the API and for the same reason: an honest "no such
 * account" here would let anyone discover which companies are registered on
 * NASEK, one address at a time.
 *
 * `redirectTo` is the site's own recovery route, which has to be on the
 * project's redirect allow-list — `npm run auth:urls` checks that from the
 * outside.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) return
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: authRedirectTarget(),
  })
}

// ----------------------------------------------------------------- signing in

export interface PasswordSignInResult {
  ok: boolean
  /**
   * The account has a second factor enrolled and the session is not yet at
   * `aal2`. The password was correct; it is simply not sufficient on its own.
   */
  mfaRequired?: boolean
  factorId?: string
  error?: PasswordError
}

/**
 * Email and password, then the second factor if the account has one.
 *
 * Supabase issues a session at assurance level `aal1` even when a factor is
 * enrolled, which is easy to misread as "signed in" — the call succeeded, a
 * token exists, `getSession()` returns it. What it does not do is satisfy any
 * policy written against `aal2`, and more importantly it is not what the person
 * asked for when they turned two-factor on.
 *
 * `getAuthenticatorAssuranceLevel()` is the honest question: it compares the
 * level this session *has* against the level this account *should* reach, and
 * `nextLevel === 'aal2'` while `currentLevel === 'aal1'` is exactly the "one
 * factor down, one to go" state.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PasswordSignInResult> {
  if (!supabase) return { ok: false, error: 'offline' }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) return { ok: false, error: classify(error.message) }

  const pending = await pendingMfaFactor()
  return pending ? { ok: false, mfaRequired: true, factorId: pending } : { ok: true }
}

/**
 * The same door, opened with a phone number instead of an address.
 *
 * `supabase.auth.signInWithPassword({ phone, password })` — Supabase's own
 * phone identity, checked by Supabase against the same hashed password as the
 * email form. NASEK does not see the password, does not store it, and does not
 * compare it: there is no query anywhere in this repository that reads a
 * credential off `providers` or `profiles`, and there must never be one. The
 * number on a company record is contact information; it is not what this
 * authenticates against.
 *
 * The number is normalised to E.164 first, because that is the only shape
 * Supabase matches on and "9123 4567", "+968 9123 4567" and "0096891234567"
 * are all the same number to the person typing it.
 *
 * Until the project has an SMS provider configured this returns
 * `phone_disabled` rather than a generic failure — see `classify`.
 */
export async function signInWithPhonePassword(
  phone: string,
  password: string,
): Promise<PasswordSignInResult> {
  if (!supabase) return { ok: false, error: 'offline' }

  const e164 = toE164(phone)
  if (!e164) return { ok: false, error: 'invalid_credentials' }

  const { error } = await supabase.auth.signInWithPassword({ phone: e164, password })
  if (error) return { ok: false, error: classify(error.message) }

  const pending = await pendingMfaFactor()
  return pending ? { ok: false, mfaRequired: true, factorId: pending } : { ok: true }
}

/**
 * Attach a phone number to the account that is already signed in.
 *
 * This is what makes `signInWithPhonePassword` work later: Supabase will only
 * match a number it holds on the auth identity, and registration creates that
 * identity from an email address. It sends a confirmation code to the number,
 * which `confirmPhoneChange` redeems.
 *
 * Returns `phone_disabled` when the project has no SMS provider yet. That is
 * not a failed registration and callers must not treat it as one — the account
 * exists, the company is registered, and email-and-password sign-in works. Only
 * the phone door is not open yet.
 */
export async function attachPhone(
  phone: string,
): Promise<{ ok: boolean; error?: PasswordError }> {
  if (!supabase) return { ok: false, error: 'offline' }

  const e164 = toE164(phone)
  if (!e164) return { ok: false, error: 'failed' }

  const { error } = await supabase.auth.updateUser({ phone: e164 })
  return error ? { ok: false, error: classify(error.message) } : { ok: true }
}

/** Redeem the code `attachPhone` sent, which is what confirms the number. */
export async function confirmPhoneChange(
  phone: string,
  token: string,
): Promise<{ ok: boolean; error?: PasswordError }> {
  if (!supabase) return { ok: false, error: 'offline' }

  const e164 = toE164(phone)
  if (!e164) return { ok: false, error: 'failed' }

  const { error } = await supabase.auth.verifyOtp({
    phone: e164,
    token: token.trim(),
    type: 'phone_change',
  })
  return error ? { ok: false, error: classify(error.message) } : { ok: true }
}

/**
 * The factor this session still owes, if any.
 *
 * Returns null both when there is no factor and when the session already
 * satisfies it, because the caller wants the same thing in both cases: let them
 * through.
 */
export async function pendingMfaFactor(): Promise<string | null> {
  if (!supabase) return null

  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!level || level.nextLevel !== 'aal2' || level.currentLevel === 'aal2') return null

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verified = factors?.totp?.find((f) => f.status === 'verified')
  return verified?.id ?? null
}

/** Finish a two-factor sign-in with the code from the authenticator app. */
export async function verifyMfaCode(
  factorId: string,
  code: string,
): Promise<{ ok: boolean; error?: 'wrong_code' | 'failed' }> {
  if (!supabase) return { ok: false, error: 'failed' }
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\D/g, ''),
  })
  if (!error) return { ok: true }
  return { ok: false, error: /invalid|incorrect|expired/i.test(error.message) ? 'wrong_code' : 'failed' }
}

// ------------------------------------------------------------------ enrolling

export interface MfaEnrolment {
  factorId: string
  /** `otpauth://` URI — what the QR code encodes. */
  uri: string
  /** The same secret in the form somebody can type in by hand. */
  secret: string
  /** SVG markup for the QR code, as Supabase returns it. */
  qrSvg: string
}

/**
 * Begin enrolling an authenticator app.
 *
 * The factor exists in `unverified` state from this moment and does nothing
 * until a code from it is confirmed — so an abandoned enrolment cannot lock
 * anyone out of their own account, which is the failure everyone fears about
 * two-factor and the reason people put off turning it on.
 */
export async function enrolMfa(): Promise<
  { ok: true; enrolment: MfaEnrolment } | { ok: false; error: string }
> {
  if (!supabase) return { ok: false, error: 'offline' }

  // Unverified leftovers from an abandoned attempt would otherwise accumulate,
  // and Supabase caps how many factors an account may hold.
  const { data: existing } = await supabase.auth.mfa.listFactors()
  for (const stale of existing?.all?.filter((f) => f.status === 'unverified') ?? []) {
    await supabase.auth.mfa.unenroll({ factorId: stale.id })
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `NASEK ${new Date().toISOString().slice(0, 10)}`,
  })
  if (error || !data) return { ok: false, error: error?.message ?? 'Enrolment failed' }

  return {
    ok: true,
    enrolment: {
      factorId: data.id,
      uri: data.totp.uri,
      secret: data.totp.secret,
      qrSvg: data.totp.qr_code,
    },
  }
}

/** Confirm an enrolment with the first code the app produces. */
export async function confirmMfa(
  factorId: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'offline' }
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\D/g, ''),
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Turn two-factor off. Requires a session that already satisfies it. */
export async function unenrolMfa(factorId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  return !error
}

/** Whether this account has a confirmed authenticator, for the settings panel. */
export async function mfaStatus(): Promise<{ enrolled: boolean; factorId: string | null }> {
  if (!supabase) return { enrolled: false, factorId: null }
  const { data } = await supabase.auth.mfa.listFactors()
  const verified = data?.totp?.find((f) => f.status === 'verified')
  return { enrolled: !!verified, factorId: verified?.id ?? null }
}
