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
  /**
   * Which build this bundle is. Set by the Vite config, not the shell.
   *
   * `harness` is the development-only visual harness and never ships; it is
   * named here so that `client.ts` can give it an auth storage key of its own
   * rather than falling through to the customer's.
   */
  readonly VITE_NASEK_APP?: 'web' | 'owner' | 'admin' | 'harness'
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
   * And for the Campaign Owner Portal. Read only by the owner build.
   *
   * This is where an invitation link points. An owner is created by an
   * administrator and emailed a link; if this is unset the link is built from
   * whatever origin the *administrator's* browser happened to be on, which is
   * the administration host — and the owner lands on an application that will
   * not let them in.
   */
  readonly VITE_OWNER_URL?: string
  /*
   * There is deliberately nothing here about administration any more.
   *
   * `VITE_ADMIN_EMAIL` used to name the account the dashboard signed in as,
   * because the dashboard asked for a password and had to be told whose. The
   * dashboard now opens on a single access code checked by the `admin-access`
   * Edge Function, and every value that decision needs — the code, and
   * optionally `NASEK_ADMIN_EMAIL` to name the account it opens — is a secret
   * of that function.
   *
   * That is the whole point of the change, so it is worth being blunt about the
   * rule it establishes: no `VITE_` variable is a secret. Vite inlines every
   * one of them into the JavaScript each visitor downloads. Anything that must
   * not be readable belongs in an Edge Function's environment, and nowhere in
   * this file.
   */
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
