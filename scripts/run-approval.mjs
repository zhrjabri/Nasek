/*
 * Build the campaign-approval harness, then give it a DOM to run in.
 *
 * Two things are different from `run-interaction.mjs`, and both come from the
 * same fact: this harness talks to a stand-in PostgREST over a real socket.
 *
 *   1. It builds itself. `VITE_SUPABASE_URL` is inlined at build time — that is
 *      how `services/supabase/client.ts` decides whether a client exists at all
 *      — so the stand-in's address has to be known before Vite runs, and an
 *      inline `VAR=x npm run …` is not portable to Windows. Setting it here
 *      keeps the package script to one command on every platform.
 *
 *   2. It overrides `.env.harness`, which blanks the connection on purpose. That
 *      blanking is right for every other harness: they assert the offline
 *      fallback. This one asserts the *configured* path, so it supplies a
 *      configuration — pointed at 127.0.0.1, with a key that is not a key.
 *
 * The port is fixed because the URL is compiled in. `NASEK_STANDIN_PORT` moves
 * both halves together if it ever collides with something.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const PORT = process.env.NASEK_STANDIN_PORT ?? '54329'

/*
 * Node running Vite's own bin, rather than `npx` through a shell.
 *
 * `npx` is `npx.cmd` on Windows and needs a shell to resolve, and spawning a
 * shell is how a harness starts depending on which one is installed. The bin is
 * a plain JavaScript file in `node_modules`; `process.execPath` is the Node
 * already running this.
 */
const build = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build',
    '--ssr',
    'scripts/verify-approval.tsx',
    '--outDir',
    '.verify',
    '--mode',
    'harness',
    '--logLevel',
    'warn',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      // The stand-in, and a key that grants nothing anywhere: the harness is
      // asserting the request, and the server answering it is three files away.
      VITE_SUPABASE_URL: `http://127.0.0.1:${PORT}`,
      VITE_SUPABASE_ANON_KEY: 'stand-in-anon-key',
      NASEK_STANDIN_PORT: PORT,
    },
  },
)

if (build.status !== 0) {
  console.error('\nThe approval harness did not build.\n')
  process.exit(build.status ?? 1)
}

// ------------------------------------------------------------------ the DOM

const dom = new JSDOM('<!doctype html><html lang="ar" dir="rtl"><body></body></html>', {
  url: 'https://admin.nasek.om/',
  pretendToBeVisual: true,
})

// Arabic, because that is the language the dashboard opens in and the language
// of every label this harness looks for.
dom.window.localStorage.setItem('nasek.lang', 'ar')

globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
})
for (const key of [
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'Node',
  'getComputedStyle',
]) {
  globalThis[key] = dom.window[key]
}
globalThis.localStorage = dom.window.localStorage
globalThis.sessionStorage = dom.window.sessionStorage
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

class NoLayoutResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoLayoutResizeObserver
dom.window.ResizeObserver = NoLayoutResizeObserver

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/*
 * React's own development warnings count as failures, as they do in the
 * interaction harness — a duplicate key or an update during render is exactly
 * the class of defect a screen that reloads itself after every decision can
 * grow.
 */
const ignorable = ['ResizeObserver', 'Not implemented: Window']
globalThis.__reactErrors = []
const realError = console.error
console.error = (...args) => {
  const text = args.map(String).join(' ')
  realError(...args)
  if (!ignorable.some((allowed) => text.includes(allowed))) {
    globalThis.__reactErrors.push(text.split('\n')[0].trim())
  }
}

process.env.NASEK_STANDIN_PORT = PORT
await import('../.verify/verify-approval.js')
