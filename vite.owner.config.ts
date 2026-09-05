import { defineConfig } from 'vite'
import {
  assertBackendConfigured,
  hashedChunks,
  renameEntry,
  serveEntryAtRoot,
  shared,
} from './vite.shared'

const OUT_DIR = 'dist-owner'

/**
 * The NASEK Campaign Owner Portal.
 *
 * The third build, and the newest of the three. It exists for the same reason
 * `vite.admin.config.ts` does: NASEK has three audiences, and the only honest
 * way to say "a pilgrim never sees the owner portal" is to not ship it to them.
 * Separate entry, separate output directory, separate host — `owner.nasek.om`
 * while the site is on `nasek.om` and administration is on `admin.nasek.om`.
 *
 * Sharing an origin with the public site would mean sharing cookies, storage
 * and CSP with a site open to the whole internet, and would put the portal one
 * guessed path away from anybody browsing campaigns.
 *
 * `VITE_NASEK_APP` is baked in rather than read from the environment, because
 * which application this is, is a property of the config file and not of the
 * machine running the build. `src/services/supabase/client.ts` uses it to pick
 * a distinct auth storage key, so an owner signed in here and a pilgrim signed
 * in on the public site during local development do not adopt each other's
 * session — which would make the role checks impossible to test honestly.
 */
export default defineConfig({
  ...shared,
  plugins: [
    ...shared.plugins,
    // Fails the build rather than shipping a sign-in with no backend behind it.
    assertBackendConfigured('owner'),
    // `/` serves the portal in dev, exactly as it does in production.
    serveEntryAtRoot('owner.html'),
    renameEntry('owner.html', OUT_DIR),
  ],
  define: {
    'import.meta.env.VITE_NASEK_APP': JSON.stringify('owner'),
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    rollupOptions: { input: 'owner.html', output: hashedChunks },
  },
  /*
   * `strictPort`, for the reason the other two configs give at length: the port
   * is part of the contract with Supabase. An invitation link is built from the
   * address the page is served on, Supabase only honours redirect URLs on the
   * project's allow-list, and silently drifting from 5175 to 5176 means the
   * emailed link comes back to an address the project has never heard of.
   * Failing loudly on a taken port names the problem; the alternative is
   * debugging an email.
   */
  server: { port: 5175, strictPort: true, open: false },
  preview: { port: 4175 },
})
