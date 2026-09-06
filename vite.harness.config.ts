import { defineConfig, type Plugin } from 'vite'
import { hashedChunks, serveEntryAtRoot, shared } from './vite.shared'

/**
 * Refuse to run this config in any mode but `harness`.
 *
 * The inverse of `assertBackendConfigured`, and for the inverse reason. The
 * three application configs fail when a production build has *no* backend,
 * because a bundle without one authenticates nobody while looking like it
 * works. This one fails when it *has* one.
 *
 * `--mode harness` loads `.env.harness`, which blanks `VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_ANON_KEY`, so `isSupabaseConfigured` is false and no client is
 * ever constructed. Drop the flag — `vite build --config vite.harness.config.ts`
 * on its own — and Vite loads `.env` instead, inlining the real project into a
 * bundle that mounts the owner and administration screens with a mocked
 * administrator already signed in.
 *
 * Nothing deploys `dist-harness` and it is git-ignored, so that was a mistake
 * waiting for someone rather than a live hole. It is now impossible instead of
 * merely unlikely: one flag, checked in both `serve` and `build`, because a dev
 * server pointed at the real project is the same mistake with a shorter reach.
 */
function requireHarnessMode(): Plugin {
  return {
    name: 'nasek-require-harness-mode',
    configResolved(config) {
      if (config.mode === 'harness') return
      throw new Error(
        [
          '',
          `Refusing to run the visual harness in mode "${config.mode}".`,
          '',
          'This config must be run with --mode harness, which loads .env.harness',
          'and blanks the Supabase connection. Without it Vite loads .env, and the',
          'harness — which mounts the owner and administration screens with a',
          'mocked administrator — would be built against the real project.',
          '',
          '  npm run harness',
          '',
          'is the only supported way to run it.',
          '',
        ].join('\n'),
      )
    },
  }
}

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
  plugins: [requireHarnessMode(), ...shared.plugins, serveEntryAtRoot('harness.html')],
  define: { 'import.meta.env.VITE_NASEK_APP': JSON.stringify('harness') },
  build: {
    outDir: 'dist-harness',
    emptyOutDir: true,
    rollupOptions: { input: 'harness.html', output: hashedChunks },
  },
  server: { port: 5177, strictPort: true, open: false },
  preview: { port: 4177, strictPort: true },
})
