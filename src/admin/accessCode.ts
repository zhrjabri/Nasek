import { supabase, supabaseAnonKey, supabaseUrl } from '@/services/supabase/client'

/**
 * The administration access code, from the browser's side.
 *
 * Everything that decides anything happens somewhere else. This file posts a
 * string to an Edge Function and, if that function hands back a credential,
 * redeems it through the ordinary Supabase client. It holds no secret, performs
 * no comparison, and cannot be edited into granting anything — which is the
 * entire point, and the reason the old `src/admin/access.ts` (PBKDF2 over a
 * hash compiled into this bundle) could not be what the requirement asked for.
 *
 * THE SHAPE OF THE EXCHANGE
 *
 *   1. POST { code } to `admin-access`. The function holds the code's secret in
 *      its own environment, compares in constant time, rate-limits by source,
 *      and checks in the database that the account it is about to open really
 *      holds `role = 'admin'`.
 *   2. It answers with a single-use magic-link token hash — never the code,
 *      never the service role key, never a session it minted itself.
 *   3. `verifyOtp` redeems that hash for an ordinary signed Supabase session,
 *      exactly as clicking a link in an email would.
 *   4. `loadAdminSession()` then does what it has always done: ask `is_admin()`
 *      inside Postgres, and let row-level security scope every query after it.
 *
 * Step 4 is the one that matters, and it is unchanged. The code is a door; the
 * authorisation is still Postgres. Someone who defeats every line of this file
 * ends up holding a session that reads what a pilgrim's reads.
 */

export type AccessCodeError =
  | 'offline'
  | 'empty'
  | 'invalid_code'
  | 'rate_limited'
  | 'not_configured'
  | 'no_admin'
  | 'ambiguous_admin'
  | 'session_failed'
  | 'unavailable'

/**
 * Reasons the function reports that map straight onto one of ours.
 *
 * Anything it says that is not on this list becomes `unavailable`, because an
 * unrecognised error is a deployment problem and should read as one rather than
 * as "your code is wrong" — which is the message that sends somebody hunting
 * for a typo in a correct secret.
 */
const KNOWN: Record<string, AccessCodeError> = {
  invalid_code: 'invalid_code',
  rate_limited: 'rate_limited',
  not_configured: 'not_configured',
  no_admin: 'no_admin',
  ambiguous_admin: 'ambiguous_admin',
  not_an_admin: 'no_admin',
  lookup_failed: 'unavailable',
  link_failed: 'unavailable',
}

/**
 * Exchange a typed code for an administration session.
 *
 * Returns only whether it worked and, when it did not, which of a small set of
 * situations it was. Nothing about the code itself comes back — not its length,
 * not how close it was, not whether one is configured on a project that has an
 * administrator. There is nothing to learn here by trying.
 */
export async function redeemAccessCode(
  code: string,
): Promise<{ ok: true } | { ok: false; error: AccessCodeError }> {
  const trimmed = code.trim()
  if (!trimmed) return { ok: false, error: 'empty' }
  if (!supabase || !supabaseUrl) return { ok: false, error: 'offline' }

  let payload: { ok?: boolean; error?: string; email?: string; tokenHash?: string }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/admin-access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        /*
         * The anon key, because Supabase's function gateway wants one. It is
         * public and grants nothing — the same key already compiled into this
         * bundle — and the function's own checks are what decide the outcome.
         */
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ code: trimmed }),
    })
    payload = (await response.json()) as typeof payload
  } catch {
    // A network failure, a function that is not deployed, a CORS refusal. All
    // three are "the door did not answer", which is a different thing from "the
    // door said no" and has to read differently.
    return { ok: false, error: 'unavailable' }
  }

  if (!payload?.ok || !payload.tokenHash) {
    return { ok: false, error: KNOWN[payload?.error ?? ''] ?? 'unavailable' }
  }

  /*
   * Redeem the token for a real session.
   *
   * `magiclink` is what `generateLink` produced, and `email` is the type name
   * the same token answers to on some versions of the client. Trying both is
   * two lines and removes a whole class of "the code was accepted but nothing
   * happened" that would otherwise depend on a library version.
   */
  const first = await supabase.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: 'magiclink',
  })
  if (!first.error && first.data.session) return { ok: true }

  const second = await supabase.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: 'email',
  })
  if (!second.error && second.data.session) return { ok: true }

  return { ok: false, error: 'session_failed' }
}
