import { supabase, supabaseAnonKey, supabaseUrl } from '@/services/supabase/client'

/**
 * Taking on a campaign owner, from the dashboard's side.
 *
 * Everything that matters happens in the `admin-create-owner` Edge Function:
 * it re-checks with Postgres that the caller really is an administrator, creates
 * the auth account with the service role, sends the invitation, and calls
 * `admin_create_provider` to write the company row. This file posts a form and
 * reports what came back.
 *
 * The caller's own access token goes with the request, and that is the point
 * rather than a formality — it is what the function checks `is_admin()` against.
 * A request without it, or with a pilgrim's, is refused before it reaches
 * anything privileged.
 */

export interface NewOwnerInput {
  /** The person who will sign in. Also where the invitation is sent. */
  email: string
  contactName: string
  companyName: string
  tagline: string
  description: string
  wilayahId: string
  governorate: string
  experienceYears: number
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
  | 'is_admin_account'
  | 'invite_failed'
  | 'exists'
  | 'failed'

export async function createOwnerAccount(
  input: NewOwnerInput,
): Promise<
  | {
      ok: true
      /**
       * Whether the invitation actually went.
       *
       * False means the company exists and the account exists, but the message
       * did not — a sender domain in test mode, a rate limit, SMTP unset. The
       * owner is real and can be let in once delivery works; the dashboard says
       * so rather than reporting a plain success.
       */
      invited: boolean
      /** The mail provider's own words, when there are any. */
      deliveryError?: string
    }
  | { ok: false; error: CreateOwnerError; detail?: string }
> {
  if (!supabase || !supabaseUrl) return { ok: false, error: 'offline' }

  const { data: auth } = await supabase.auth.getSession()
  const token = auth.session?.access_token
  if (!token) return { ok: false, error: 'forbidden' }

  let payload: {
    ok?: boolean
    error?: string
    detail?: string
    invited?: boolean
    deliveryError?: string
  }
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
    // A network failure, a function that is not deployed, a CORS refusal — all
    // "the endpoint did not answer", which is a different problem from "the
    // endpoint said no" and has to read differently.
    return { ok: false, error: 'failed' }
  }

  if (payload?.ok) {
    return {
      ok: true,
      invited: payload.invited === true,
      deliveryError: payload.deliveryError,
    }
  }

  const detail = payload?.detail ?? ''
  const known: Record<string, CreateOwnerError> = {
    forbidden: 'forbidden',
    permit_required: 'permit_required',
    is_admin_account: 'is_admin_account',
    invite_failed: 'invite_failed',
  }

  // `create_failed` carries the database's own message, and one of those is
  // worth recognising: an address that already runs a company is a mistake an
  // administrator can correct, not a system failure.
  if (payload?.error === 'create_failed' && /already has a registered campaign/i.test(detail)) {
    return { ok: false, error: 'exists', detail }
  }

  return { ok: false, error: known[payload?.error ?? ''] ?? 'failed', detail }
}
