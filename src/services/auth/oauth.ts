import { supabase, supabaseAnonKey, supabaseUrl } from '@/services/supabase/client'
import { authRedirectTarget } from './redirect'

/**
 * Continue with Google.
 *
 * The fastest way into NASEK for the majority of pilgrims, and the one that
 * skips the part of the one-time-code flow people actually lose: leaving the
 * site to open an inbox. Nothing else changes — the account that comes back is
 * an ordinary `auth.users` row, `handle_new_user` gives it a profile with the
 * role hard-coded to 'customer', and every policy treats it identically to an
 * account created by email. A Google sign-in is not a different kind of
 * account; it is a different way of proving the same address.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BUTTON IS CONDITIONAL
 *
 * An OAuth provider that is not configured in the Supabase dashboard does not
 * fail politely. `signInWithOAuth` happily builds a URL, the browser leaves the
 * site, and Supabase answers `?error=provider is not enabled` — so the person
 * is bounced out of NASEK and back with an error, having done nothing wrong.
 * Offering a button that cannot work is worse than offering no button.
 *
 * `GET /auth/v1/settings` reports what is enabled, is unauthenticated, and is
 * the same endpoint `npm run verify:backend` reads. Asking it once per page
 * load and caching the answer means the button appears the moment somebody
 * enables Google in the dashboard, with no rebuild and no configuration flag in
 * this repository to get out of step with the project.
 * ---------------------------------------------------------------------------
 */

export type OAuthProvider = 'google'

/** Providers NASEK has a button for, in the order they are shown. */
const SUPPORTED: OAuthProvider[] = ['google']

let cached: Promise<OAuthProvider[]> | null = null

/**
 * Which social sign-ins this project has actually configured.
 *
 * Returns an empty list on any failure — no backend, an offline browser, a
 * malformed answer. The email code path works in every one of those cases, so
 * a sign-in screen that quietly shows one fewer option is a far better outcome
 * than one that shows an error nobody can act on.
 */
export function availableOAuthProviders(): Promise<OAuthProvider[]> {
  if (!supabase || !supabaseUrl) return Promise.resolve([])
  if (cached) return cached

  cached = (async () => {
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: supabaseAnonKey },
      })
      if (!response.ok) return []
      const settings = (await response.json()) as { external?: Record<string, boolean> }
      return SUPPORTED.filter((name) => settings.external?.[name] === true)
    } catch {
      return []
    }
  })()

  return cached
}

/**
 * Hand off to the provider.
 *
 * Resolves only if the redirect could not be started; on success the browser
 * has already left the page, so there is nothing to return to. The caller
 * should keep its button in a loading state and let the navigation happen.
 *
 * `redirectTo` is computed from the running page — the same value the emailed
 * code uses — so the public site returns to the public site and the
 * administration dashboard to the dashboard. It must be on the project's
 * redirect allow-list or Supabase substitutes the Site URL, which for a
 * two-application project is right at most half the time.
 *
 * `prompt: 'select_account'` because a shared or family device is normal here,
 * and Google's default is to sign in silently as whoever it saw last — which
 * looks, from inside NASEK, like the wrong person's dashboard opening by
 * itself.
 */
export async function startOAuth(
  provider: OAuthProvider,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'offline' }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: authRedirectTarget(),
      queryParams: { prompt: 'select_account' },
    },
  })

  if (!error) return { ok: true }
  return {
    ok: false,
    error: /not enabled|unsupported/i.test(error.message) ? 'unavailable' : 'failed',
  }
}
