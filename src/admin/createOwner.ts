import { supabase, supabaseAnonKey, supabaseUrl } from '@/services/supabase/client'

/**
 * Creating a campaign owner, from the dashboard's side.
 *
 * Everything that matters happens in the `admin-create-owner` Edge Function:
 * it re-checks with Postgres that the caller really is an administrator,
 * creates the auth account with the temporary password, calls
 * `admin_create_provider` to write the company row, and removes the account
 * again if the company cannot be written. This file posts a form and reports
 * what came back. No email is sent by any of it.
 *
 * The caller's own access token goes with the request, and that is the point
 * rather than a formality — it is what the function checks `is_admin()` against.
 * A request without it, or with a pilgrim's, is refused before it reaches
 * anything privileged.
 *
 * The temporary password travels in the body of that one HTTPS request and
 * nowhere else: it is not stored, logged, or returned, and the dialog forgets
 * it as soon as the request finishes.
 */

export {
  TEMPORARY_PASSWORD_MIN_LENGTH,
  temporaryPasswordProblem,
  type TemporaryPasswordProblem,
} from '../../supabase/functions/admin-create-owner/password.ts'

export interface NewOwnerInput {
  /** The address the owner signs in with. Nothing is sent to it. */
  email: string
  /** Set by the administrator and passed on by them. Never stored by NASEK. */
  temporaryPassword: string
  contactName: string
  companyName: string
  tagline: string
  description: string
  wilayahId: string
  governorate: string
  experienceYears: number
  /** Contact and WhatsApp only. Not a sign-in identity. */
  phone: string
  commercialRegistration: string
  permitNumber: string
  /** ISO date, or empty for a permit that does not expire. */
  permitExpiry: string
  /** Object path in the private `provider-licences` bucket. Required. */
  licencePath: string
  licenceFileName: string
  licenceMime: string
  /**
   * Approved outright, or placed in the queue.
   *
   * `verified` is the ordinary case: an administrator creating a company has
   * the permit in front of them, so the verification has already happened by
   * the time they press the button. `pending` is for taking one on
   * provisionally — the paperwork is coming, the account can exist meanwhile.
   */
  verification: 'verified' | 'pending'
}

export type CreateOwnerError =
  | 'offline'
  | 'forbidden'
  | 'permit_required'
  | 'bad_request'
  | 'weak_password'
  | 'email_exists'
  /** The company was refused; the new account was removed again. */
  | 'create_failed'
  /** The company was refused and the new account could not be removed. */
  | 'cleanup_failed'
  /** No answer. Whether anything was created is not known. */
  | 'unreachable'
  | 'failed'

export async function createOwnerAccount(
  input: NewOwnerInput,
): Promise<{ ok: true } | { ok: false; error: CreateOwnerError; detail?: string }> {
  if (!supabase || !supabaseUrl) return { ok: false, error: 'offline' }

  const { data: auth } = await supabase.auth.getSession()
  const token = auth.session?.access_token
  if (!token) return { ok: false, error: 'forbidden' }

  let payload: { ok?: boolean; error?: string; detail?: string }
  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/functions/v1/admin-create-owner`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          // The administrator's own session, not the anon key. This is what the
          // function checks `is_admin()` with.
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      },
    )
    payload = (await response.json()) as typeof payload
  } catch {
    // A network failure, a function that is not deployed, a CORS refusal, a
    // gateway timeout with an HTML body. Any of those could also be a request
    // that finished after the connection dropped, so this does not claim that
    // nothing was created.
    return { ok: false, error: 'unreachable' }
  }

  if (payload?.ok) return { ok: true }

  const known: Record<string, CreateOwnerError> = {
    forbidden: 'forbidden',
    permit_required: 'permit_required',
    // A path outside the caller's folder cannot come from this dialog.
    permit_not_yours: 'failed',
    bad_request: 'bad_request',
    weak_password: 'weak_password',
    email_exists: 'email_exists',
    account_failed: 'failed',
    create_failed: 'create_failed',
    cleanup_failed: 'cleanup_failed',
  }

  return { ok: false, error: known[payload?.error ?? ''] ?? 'failed', detail: payload?.detail }
}
