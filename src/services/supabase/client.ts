import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './schema'

/**
 * The Supabase connection.
 *
 * NASEK was built as a static prototype with no server: credentials, trips and
 * moderation decisions all lived in `localStorage`, which meant every guard in
 * the app was a guard the visitor's own browser was asked to enforce. Supabase
 * is what moves those guards somewhere the visitor does not control — Postgres
 * row-level security, evaluated against a signed token, before a single row is
 * returned.
 *
 * Configuration is deliberately optional. When the two variables below are
 * absent the client is `null` and the app falls back to exactly the behaviour
 * it had before: on-device credentials, on-device state, everything working
 * offline. That keeps three promises at once — a clone of this repository still
 * runs with no setup, an existing browser's saved session is not invalidated by
 * the upgrade, and there is never a half-configured state where some data comes
 * from a server and some from the browser.
 *
 * Only the *anon* key belongs here. It is public by design and reaches every
 * visitor's browser; it grants nothing on its own, because every table's
 * policies are written against the authenticated user behind it. The service
 * role key must never appear in this directory — it bypasses row-level
 * security entirely, and anything holding it belongs on a server.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/**
 * The two values, re-exported for the one thing the client cannot answer.
 *
 * `GET /auth/v1/settings` reports which sign-in methods a project actually has
 * configured, and supabase-js has no method for it — see
 * `services/auth/oauth.ts`, which uses it to decide whether "Continue with
 * Google" is a button that would work or a button that would fail. Both are
 * public: the key is compiled into every visitor's bundle by design.
 */
export const supabaseUrl = url ?? ''
export const supabaseAnonKey = anonKey ?? ''

/**
 * Storage key for the auth session.
 *
 * The public site and the administration dashboard are separate deployments on
 * separate hosts, so they already have separate storage. Naming the key anyway
 * means that running both on `localhost` during development does not have one
 * app's sign-in silently adopt the other's session, which would make the role
 * checks impossible to test.
 */
const storageKey =
  import.meta.env.VITE_NASEK_APP === 'admin' ? 'nasek.auth.admin' : 'nasek.auth.web'

export const supabase: SupabaseClient<Database> | null =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: {
          storageKey,
          persistSession: true,
          autoRefreshToken: true,
          /*
           * The implicit flow, not PKCE, and the reason is the phone in
           * someone's hand.
           *
           * PKCE is the better default almost everywhere: the emailed token is
           * useless without a verifier held by the browser that asked for it,
           * so an intercepted link buys an attacker nothing. But that same
           * property means the link can only ever be completed on the device
           * that requested it — and email is read on phones. Someone signing in
           * on a laptop and opening the message on their handset gets a token
           * their handset cannot use, which is indistinguishable from a broken
           * link.
           *
           * The implicit flow issues a plain token hash instead, which
           * `verifyEmailLink()` can redeem from anywhere. That is what makes
           * "paste the link from your email" work at all, and during local
           * development it is the only thing that can: a link pointing at
           * `localhost` is meaningless on a phone, so following it is never an
           * option there.
           *
           * The cost is that a completed link puts a token in the URL fragment,
           * where it reaches browser history. `completeAuthRedirect()` strips it
           * on arrival, and the token is single-use and short-lived.
           */
          flowType: 'implicit',
          /*
           * Handled by `completeAuthRedirect()` rather than automatically.
           *
           * The automatic version inspects the URL as the client is
           * constructed, before the app has rendered, and silently swallows
           * whatever it finds. With a hash router in play the URL shapes are
           * unusual enough that a mis-parse is plausible, and a mis-parse would
           * be invisible: no session, no error, no clue. Doing it explicitly
           * means every outcome — signed in, expired link, wrong browser — has
           * somewhere to be reported.
           */
          detectSessionInUrl: false,
        },
      })
    : null

/** True when a real backend is behind the app. Drives every fallback in `services/auth`. */
export const isSupabaseConfigured = supabase !== null

/**
 * The client, or a thrown error.
 *
 * Call this from code paths that have already checked `isSupabaseConfigured`
 * and cannot proceed without a backend. It converts a nullable client into a
 * non-null one at a single, named place rather than scattering `!` assertions
 * that would silently produce `undefined is not a function` at runtime.
 */
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  return supabase
}
