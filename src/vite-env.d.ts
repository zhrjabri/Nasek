/// <reference types="vite/client" />

/**
 * The environment NASEK reads at build time.
 *
 * Declared rather than inferred so that a missing variable is a compile error
 * at the point of use and not `undefined` discovered in a browser. Everything
 * here is `VITE_`-prefixed, which means Vite inlines it into the bundle and
 * every visitor can read it: only values that are safe to publish belong in
 * this list. The Supabase *anon* key is one of those by design — it grants
 * nothing on its own, because row-level security decides what the person behind
 * it may see. A service-role key is not, and must never appear here.
 */
interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xxxx.supabase.co. Optional — absent means local-only mode. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon/publishable key. Public by design. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Which of the two applications this bundle is. Set by the Vite config, not the shell. */
  readonly VITE_NASEK_APP?: 'web' | 'admin'
  /**
   * The deployed address of the public site, e.g. `https://nasek.vercel.app/`.
   *
   * Optional, and absent is the normal state in development: `authRedirectTarget()`
   * then falls back to the origin the page is actually served on. In a deployed
   * build it is what stops a sign-in email pointing at `localhost` — see
   * `services/auth/redirect.ts`.
   */
  readonly VITE_SITE_URL?: string
  /** The same thing for the administration dashboard. Read only by the admin build. */
  readonly VITE_ADMIN_URL?: string
  /**
   * The address of the administration account, e.g. `ops@nasek.om`.
   *
   * Read only by the admin build, and only to answer "which account is this
   * password for?" — the dashboard asks for a password and nothing else, so the
   * identifier has to come from somewhere. It is public like everything else
   * here and that is fine: an address grants nothing, and `is_admin()` inside
   * Postgres is what actually decides whether the dashboard opens. Leave it
   * unset and the login screen asks for the address as well.
   */
  readonly VITE_ADMIN_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
