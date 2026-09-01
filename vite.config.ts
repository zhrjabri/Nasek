import { defineConfig } from 'vite'
import { hashedChunks, shared } from './vite.shared'

/**
 * The public NASEK site.
 *
 * Its entry is `index.html` → `src/main.tsx`, and that graph does not reach
 * `src/admin/` at any depth. Nothing here excludes the administration code —
 * there is no ignore list, no alias to a stub, no dead-code elimination being
 * relied upon. It is simply not imported, which is the only kind of exclusion
 * that cannot be defeated by a bundler setting someone changes later.
 *
 * `npm run verify:isolation` proves it against the built output rather than
 * against this comment.
 */
export default defineConfig({
  ...shared,
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: 'index.html', output: hashedChunks },
  },
  /*
   * `strictPort` because the port is part of the contract with Supabase.
   *
   * Vite's default is to quietly step to the next free port when this one is
   * taken. For an ordinary app that is a kindness; here it silently breaks
   * sign-in, because `authRedirectTarget()` is built from the address the page
   * is actually served on, and Supabase only honours redirect URLs that appear
   * on the project's allow-list. Drifting from 5173 to 5175 means the emailed
   * link comes back to an address the project has never heard of, and Supabase
   * falls back to the Site URL — landing the person on the wrong application
   * with no error anywhere.
   *
   * Failing loudly on a taken port is far better: the message names the
   * problem, and the fix is to free the port rather than to debug an email.
   */
  server: { port: 5173, strictPort: true, open: false },
  preview: { port: 4173 },
})
