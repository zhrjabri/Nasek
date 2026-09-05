import { defineConfig } from 'vite'
import {
  assertBackendConfigured,
  hashedChunks,
  renameEntry,
  serveEntryAtRoot,
  shared,
} from './vite.shared'

const OUT_DIR = 'dist-admin'

/**
 * The NASEK administration dashboard.
 *
 * A separate build with its own entry, its own output directory and its own
 * `public/`, so it can be deployed to its own host — `admin.nasek.om` while the
 * site is on `nasek.om`. Nothing about it needs to sit under a path of the
 * public site, and it deliberately does not: sharing an origin would mean
 * sharing cookies, storage and CSP with a site open to the whole internet.
 *
 * `VITE_NASEK_APP` is baked in rather than read from the environment, because
 * which application this is, is a property of the config file, not of the
 * machine running it. `src/services/supabase/client.ts` uses it to pick a
 * distinct auth storage key, so running both apps on localhost during
 * development does not have one adopt the other's session — which would make
 * the role checks impossible to test honestly.
 */
export default defineConfig({
  ...shared,
  publicDir: 'public-admin',
  plugins: [
    ...shared.plugins,
    // Fails the build rather than shipping a sign-in with no backend behind it.
    assertBackendConfigured('admin'),
    // `/` serves the dashboard in dev, exactly as it does in production.
    serveEntryAtRoot('admin.html'),
    renameEntry('admin.html', OUT_DIR),
  ],
  define: {
    'import.meta.env.VITE_NASEK_APP': JSON.stringify('admin'),
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    rollupOptions: { input: 'admin.html', output: hashedChunks },
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
  server: { port: 5174, strictPort: true, open: false },
  preview: { port: 4174 },
})
