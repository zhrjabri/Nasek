import { defineConfig } from 'vite'
import { hashedChunks, serveEntryAtRoot, shared } from './vite.shared'

/**
 * The visual harness: the owner portal and the administration, rendered with
 * mock rows so their screens can be photographed without a login.
 *
 * Deliberately missing `assertBackendConfigured`. The other three configs
 * refuse to build without a Supabase connection, because a deployed bundle
 * with no backend authenticates nobody while looking like it works. This one
 * inverts that: it must be built with `--mode harness`, which blanks
 * `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.harness`), so
 * `isSupabaseConfigured` is false, no client is constructed, and every write
 * path returns before it reaches a network call.
 *
 * It is not in `npm run build` and has no `dist` of its own that anything
 * deploys. `npm run harness` serves it on 5177.
 */
export default defineConfig({
  ...shared,
  plugins: [...shared.plugins, serveEntryAtRoot('harness.html')],
  define: { 'import.meta.env.VITE_NASEK_APP': JSON.stringify('harness') },
  build: {
    outDir: 'dist-harness',
    emptyOutDir: true,
    rollupOptions: { input: 'harness.html', output: hashedChunks },
  },
  server: { port: 5177, strictPort: true, open: false },
  preview: { port: 4177, strictPort: true },
})
