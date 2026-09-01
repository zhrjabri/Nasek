import { supabase } from '@/services/supabase/client'

/**
 * Coming back from a link in an email.
 *
 * NASEK asks for a six-digit code, and on a project with editable email
 * templates that is exactly what arrives. Supabase's *default* templates render
 * `{{ .ConfirmationURL }}` and nothing else, and on newer projects those
 * templates cannot be changed without configuring custom SMTP — so the email a
 * pilgrim actually receives is a link. Before this file existed, clicking it
 * signed them in at Supabase and then dropped them on a page that had no idea
 * anything had happened, because `detectSessionInUrl` was off and no redirect
 * target was ever supplied.
 *
 * This is the other half of the door. It handles both shapes Supabase can
 * return, because which one arrives depends on project configuration this code
 * does not control:
 *
 *   * `?code=…`   — the PKCE flow, which is what NASEK asks for. Exchanged for
 *                   a session using a verifier held in this browser.
 *   * `#access_token=…` — the implicit flow, in case a project or an older link
 *                   produces one. Adopted directly.
 *
 * Errors arrive in either place too, and are reported rather than swallowed: an
 * expired link and a link opened in a different browser are different problems
 * with different fixes, and "nothing happened" tells the person neither.
 */

export type RedirectOutcome =
  | { kind: 'none' }
  | { kind: 'signed-in' }
  | { kind: 'error'; reason: 'expired' | 'wrong_browser' | 'failed'; detail?: string }

/**
 * Where Supabase should send someone after it verifies their link.
 *
 * Computed from the running page rather than configured, so the public site
 * returns to the public site and the administration dashboard to the
 * dashboard — two origins, two destinations, no shared constant to get wrong.
 * The search and hash are dropped: this has to be a stable, allow-listed URL,
 * and `#/signin` on the end would make it a different one each time.
 */
export function authRedirectTarget(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}${window.location.pathname}`
}

/** Strip auth material from the address bar without touching the router's hash. */
function cleanUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const key of ['code', 'error', 'error_code', 'error_description', 'state']) {
    url.searchParams.delete(key)
  }
  // Only clear the fragment when it is auth material rather than a route —
  // wiping `#/campaigns` would throw the person back to the home page.
  if (url.hash && !url.hash.startsWith('#/')) url.hash = ''
  window.history.replaceState({}, '', url.toString())
}

/*
 * Is this fragment authentication material, or a route?
 *
 * `HashRouter` owns the fragment, so the two share one slot and have to be told
 * apart. The discriminator is the leading slash: every route this app produces
 * begins `#/` — `#/signin`, `#/campaigns?type=hajj` — and Supabase's implicit
 * flow appends its parameters to a URL that has no fragment at all, producing
 * `#access_token=…`. A route can therefore never be mistaken for a token, no
 * matter what a query parameter inside it happens to contain.
 *
 * Searching the raw fragment for `access_token=` instead — which an earlier
 * version did — would have made any page whose own query mentioned those words
 * look like a sign-in.
 */
function authFragment(): URLSearchParams | null {
  const hash = window.location.hash
  if (!hash || hash.startsWith('#/')) return null
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const carries =
    params.has('access_token') || params.has('error_description') || params.has('error_code')
  return carries ? params : null
}

/**
 * Complete a sign-in that began in an email, if this page load is one.
 *
 * Returns `none` for an ordinary page load, which is the overwhelming majority
 * of them — so it is cheap to call unconditionally at app start.
 */
export async function completeAuthRedirect(): Promise<RedirectOutcome> {
  if (!supabase || typeof window === 'undefined') return { kind: 'none' }

  const query = new URLSearchParams(window.location.search)
  const hash = authFragment() ?? new URLSearchParams()

  // ---------------------------------------------------------------- errors
  const errorCode = query.get('error_code') ?? hash.get('error_code')
  const errorDescription = query.get('error_description') ?? hash.get('error_description')
  if (errorCode || errorDescription) {
    cleanUrl()
    const text = (errorDescription ?? errorCode ?? '').toLowerCase()
    return {
      kind: 'error',
      reason: /expired|invalid/.test(text) ? 'expired' : 'failed',
      detail: errorDescription ?? errorCode ?? undefined,
    }
  }

  // ------------------------------------------------------------------ PKCE
  const code = query.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    cleanUrl()
    if (!error) return { kind: 'signed-in' }
    /*
     * The characteristic PKCE failure, and worth naming precisely. The verifier
     * is written to this browser's storage when the code is requested, so a
     * link requested on a laptop and opened on a phone cannot complete — the
     * phone has no verifier. That is not a broken link and telling someone to
     * request another one would send them round the same loop for ever.
     */
    const missingVerifier = /verifier|code challenge|invalid request/i.test(error.message)
    return {
      kind: 'error',
      reason: missingVerifier ? 'wrong_browser' : 'failed',
      detail: error.message,
    }
  }

  // -------------------------------------------------------------- implicit
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    cleanUrl()
    return error
      ? { kind: 'error', reason: 'failed', detail: error.message }
      : { kind: 'signed-in' }
  }

  return { kind: 'none' }
}

/** Is this page load an arrival from an email link? Cheap, synchronous. */
export function isAuthRedirect(): boolean {
  if (typeof window === 'undefined') return false
  const query = new URLSearchParams(window.location.search)
  if (query.has('code') || query.has('error_description') || query.has('error_code')) return true
  return authFragment() !== null
}
