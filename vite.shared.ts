import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import type { Plugin, UserConfig } from 'vite'

/**
 * The half of the build configuration that is genuinely the same for both
 * NASEK applications.
 *
 * There are two builds now — the public site and the administration dashboard —
 * and they are separate deployments to separate hosts. What they must not
 * become is two divergent toolchains: the same React, the same Tailwind, the
 * same `@` alias and the same asset strategy, so a component that renders
 * correctly in one renders correctly in the other.
 */

export const projectRoot = path.resolve(import.meta.dirname)

export const shared = {
  // Relative asset URLs, so a build works from any sub-path. GitHub Pages
  // serves from /<repo-name>/, where absolute /assets/... would 404.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(projectRoot, './src') },
  },
} satisfies UserConfig

/**
 * Rollup output naming.
 *
 * Split chunks are named by hash alone. Rollup's default names them after the
 * module they came from, which on the public site used to publish
 * "AdminAccessPage" and "AdminDashboardPage" straight into the deployed
 * directory listing. Those modules no longer exist in that build at all, so
 * this matters far less than it did — but a directory listing that says nothing
 * about what is inside it is still worth keeping.
 *
 * Only `chunkFileNames`. Naming *entries* by hash too would seem tidier and
 * quietly breaks `npm run verify:*`, which build each harness with `--ssr` and
 * then run the file by the name Rollup would otherwise have given it. The
 * harnesses are the regression net for everything else here; a build setting
 * that disables them is a bad trade at any price.
 */
export const hashedChunks = {
  chunkFileNames: 'assets/[hash].js',
}

/**
 * Serve a non-root HTML entry at `/` during development.
 *
 * `renameEntry` below handles this for builds. The dev server needs its own
 * answer, because `build.rollupOptions.input` is a build setting and the dev
 * server ignores it entirely — it serves whatever `index.html` it finds at the
 * project root, which for the administration app is the *public* site.
 *
 * That was live for a while and was worse than a cosmetic mismatch. The
 * dashboard was reachable only at `/admin.html`, while `/` on the same port
 * quietly served the pilgrim-facing app — so `npm run dev:admin` opened the
 * wrong application, and `authRedirectTarget()` (origin + pathname) resolved to
 * a URL that served the public site. An administrator clicking a link in an
 * email would have landed on the public app on the administration port.
 *
 * Rewriting the request keeps one address meaning one thing in both dev and
 * production, which is the only way the redirect URLs registered with Supabase
 * can be correct in both.
 */
export function serveEntryAtRoot(entry: string): Plugin {
  return {
    name: 'nasek-serve-entry-at-root',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url ?? '/').split('?')
        if (pathname === '/' || pathname === '/index.html') {
          req.url = `/${entry}${query ? `?${query}` : ''}`
        }
        next()
      })
    },
  }
}

/**
 * Publish a non-root HTML entry as the directory's `index.html`.
 *
 * The administration app's entry is `admin.html`, because two entry files
 * cannot both be called `index.html` in one project root. A static host,
 * though, serves `/` from `index.html` and nothing else — leaving the file
 * named `admin.html` would mean the dashboard answered on
 * `admin.nasek.om/admin.html` and gave a 404 on the bare domain, which is
 * exactly the sort of papercut that gets "fixed" by putting the admin app back
 * inside the public one.
 */
export function renameEntry(from: string, outDir: string, to = 'index.html'): Plugin {
  return {
    name: 'nasek-rename-entry',
    apply: 'build',
    closeBundle() {
      const dir = path.resolve(projectRoot, outDir)
      const source = path.join(dir, from)
      if (!fs.existsSync(source)) {
        throw new Error(`renameEntry: expected ${source} to exist after the build.`)
      }
      fs.renameSync(source, path.join(dir, to))
    },
  }
}

/**
 * Refuse to build a deployable bundle that has no backend behind it.
 *
 * This is here because of a live production incident, and the shape of that
 * incident is the argument for it. `nasek.vercel.app` was built without
 * `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` ever reaching the build
 * environment. Vite inlines those at build time, so the deployed JavaScript
 * constructed no Supabase client at all — and every fallback in
 * `src/services/auth` did precisely what it was written to do, which was to
 * carry on without one. The sign-in screen generated a six-digit code in the
 * visitor's own browser and printed it on the page. Anyone could sign in as
 * anyone, no email was ever requested from Supabase, and there was no error
 * anywhere: the build passed, the typecheck passed, the harnesses passed, the
 * deployment succeeded.
 *
 * That is the failure worth engineering against. A missing variable is a
 * ten-second fix once you know, and undetectable until someone happens to look
 * at the sign-in page — so the build is where it has to be caught, before there
 * is anything to deploy.
 *
 * Only `mode === 'production'`, so the two things that legitimately run without
 * a backend keep working: `npm run dev` on a fresh clone, and the `--mode
 * harness` builds behind `npm run verify`, which exist to exercise the
 * no-backend paths.
 *
 * The deployed-address variable is a warning rather than an error. Missing, the
 * app falls back to the origin the page is served from, which is right for a
 * production domain and wrong for a preview build — bad, but not the silent
 * catastrophe above, and not worth failing a build someone is running for a
 * host this repository has not been told about.
 */
export function assertBackendConfigured(app: 'web' | 'admin'): Plugin {
  const siteVar = app === 'admin' ? 'VITE_ADMIN_URL' : 'VITE_SITE_URL'

  return {
    name: 'nasek-assert-backend-configured',
    apply: 'build',
    configResolved(config) {
      if (config.mode !== 'production') return

      const value = (key: string) => String(config.env[key] ?? '').trim()
      const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !value(k))

      if (missing.length) {
        throw new Error(
          [
            '',
            `Refusing to build the ${app} application for production: ${missing.join(' and ')} ${
              missing.length > 1 ? 'are' : 'is'
            } not set.`,
            '',
            'Vite inlines these at BUILD time. A bundle built without them has no',
            'Supabase client, so sign-in would fall back to a code generated in the',
            "visitor's browser and shown on the page — a deployment that authenticates",
            'nobody while looking like it works.',
            '',
            'Set them in the build environment of whatever is running this:',
            '',
            '  Vercel   Project -> Settings -> Environment Variables (Production),',
            '           then redeploy. Setting them after a build changes nothing.',
            '  GitHub   Repository -> Settings -> Secrets and variables -> Actions',
            '  Locally  cp .env.example .env, then fill both in',
            '',
            'Only the anon / publishable key belongs here. Never the service_role key.',
            '',
          ].join('\n'),
        )
      }

      if (!value(siteVar)) {
        config.logger.warn(
          `\n[nasek] ${siteVar} is not set. Sign-in emails will point at whatever origin\n` +
            '        the page happens to be served from — correct on the production domain,\n' +
            '        wrong on a preview deployment, whose origin is never on the Supabase\n' +
            '        redirect allow-list. See docs/DEPLOYMENT.md.\n',
        )
      }
    },
  }
}
