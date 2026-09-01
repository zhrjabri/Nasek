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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
