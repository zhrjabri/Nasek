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
           * PKCE rather than the implicit flow, for a reason specific to this
           * app: NASEK uses `HashRouter`, so the fragment already means
           * something. The implicit flow returns the session *in* the fragment
           * — `#access_token=…` — which the router would try to read as a
           * route, and which would sit in the address bar as a bearer token
           * the browser keeps in history. PKCE returns `?code=…` in the query
           * string instead, where nothing collides and the code is single-use
           * and worthless without the verifier held in this browser.
           */
          flowType: 'pkce',
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
