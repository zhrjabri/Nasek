/*
 * Does the public site actually contain no administration code?
 *
 * "The admin area is separate" is the sort of claim that is true on the day it
 * is made and quietly false three commits later, when someone imports a helper
 * from `src/admin/` because it was the nearest thing that did the job. Nothing
 * would break. Nothing would look different. The public bundle would simply
 * start carrying the administration dashboard again, and no one would find out
 * until they went looking.
 *
 * So it is checked, twice, from two directions:
 *
 *   1. Statically, by walking every import reachable from `src/main.tsx` and
 *      failing if the walk ever arrives inside `src/admin/` or at either
 *      administration dictionary. This catches the mistake at the moment it is
 *      made and needs no build.
 *
 *   2. Against the built output, by searching `dist/` for strings that only the
 *      administration application should contain. This is the one that cannot
 *      be fooled: whatever the import graph says, this reads what would
 *      actually be uploaded.
 *
 *   npm run verify:isolation          # static only
 *   npm run build && npm run verify:isolation   # both
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

// ---------------------------------------------------------------- 1. graph

/** Everything the public entry can reach, followed through the `@/` alias. */
function walk(entry) {
  const seen = new Set()
  const queue = [path.resolve(root, entry)]
  const order = []

  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    order.push(file)

    let source
    try {
      source = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }

    /*
     * Type-only imports are erased by the compiler and reach no bundle, so
     * following one would report a leak that cannot exist. `src/i18n/index.tsx`
     * imports `AdminMessageKey` exactly this way — on purpose, so that
     * `t('admin.users')` stays type-checked in the dashboard while the strings
     * ship only there — and a walker that could not tell the difference would
     * condemn the very technique that makes the separation work.
     */
    const runtime = source
      .replace(/import\s+type\s+[\s\S]*?from\s*['"][^'"]+['"]/g, '')
      .replace(/export\s+type\s+\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]/g, '')

    // Static imports and re-exports, plus dynamic import(). Deliberately not a
    // real parser: it over-collects rather than under-collects, and for this
    // check a false positive is a conversation while a false negative is a leak.
    const specifiers = [
      ...runtime.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g),
    ].map((m) => m[1])

    for (const spec of specifiers) {
      // Bare package names are not ours to follow.
      if (!spec.startsWith('@/') && !spec.startsWith('.')) continue
      const base = spec.startsWith('@/')
        ? path.resolve(root, 'src', spec.slice(2))
        : path.resolve(path.dirname(file), spec)

      const candidate = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
      ].find((c) => fs.existsSync(c) && fs.statSync(c).isFile())

      if (candidate) queue.push(candidate)
    }
  }
  return order
}

const reachable = walk('src/main.tsx')
const rel = (f) => path.relative(root, f).replaceAll('\\', '/')

const adminReachable = reachable.filter((f) => {
  const r = rel(f)
  return r.startsWith('src/admin/') || r === 'src/i18n/adminEn.ts' || r === 'src/i18n/adminAr.ts'
})

check(
  'the public entry reaches no administration module',
  adminReachable.length === 0,
  adminReachable.length ? adminReachable.map(rel).join(', ') : `${reachable.length} modules walked`,
)

// The mirror of the same question: the administration entry must still be able
// to reach its own screens, or this check would pass on an app that was broken
// rather than one that was separated.
const adminGraph = walk('src/admin/main.tsx').map(rel)
check(
  'the administration entry reaches its own dashboard',
  adminGraph.some((f) => f.startsWith('src/admin/tabs/')),
  `${adminGraph.length} modules walked`,
)
check(
  'the administration entry carries its own dictionary',
  adminGraph.includes('src/i18n/adminEn.ts') && adminGraph.includes('src/i18n/adminAr.ts'),
)

// ---------------------------------------------------------------- 2. output

/**
 * Strings that should exist in exactly one of the two builds.
 *
 * Chosen to be things a minifier cannot remove or rename: user-visible copy and
 * a remote procedure name, never an identifier. Minification renames every
 * local symbol, so asserting that `AdminShell` is absent would pass whether the
 * component shipped or not.
 */
const ADMIN_ONLY = [
  'NASEK administration',
  'إدارة ناسِك',
  'admin.overview',
  'Needs your attention',
  'Review permit',
  'Suspend account',
  'is_admin',
  'promote_to_admin',
]

function bundleText(dir) {
  const abs = path.resolve(root, dir)
  if (!fs.existsSync(abs)) return null
  const files = []
  const stack = [abs]
  while (stack.length) {
    for (const entry of fs.readdirSync(stack.pop(), { withFileTypes: true })) {
      const full = path.join(entry.parentPath ?? abs, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (/\.(js|css|html)$/.test(entry.name)) files.push(full)
    }
  }
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
}

const publicBundle = bundleText('dist')
const adminBundle = bundleText('dist-admin')

if (publicBundle === null) {
  console.log('SKIP  built output not checked — run `npm run build` first')
} else {
  const leaked = ADMIN_ONLY.filter((needle) => publicBundle.includes(needle))
  check(
    'the built public site contains no administration string',
    leaked.length === 0,
    leaked.length ? `leaked: ${leaked.join(', ')}` : `${ADMIN_ONLY.length} markers checked`,
  )

  if (adminBundle !== null) {
    // The markers have to be real, or the check above would pass against any
    // two strings that happen to appear nowhere.
    const present = ADMIN_ONLY.filter((needle) => adminBundle.includes(needle))
    check(
      'those strings do appear in the administration build',
      present.length >= 3,
      `${present.length} of ${ADMIN_ONLY.length} present`,
    )
  }
}

/*
 * ------------------------------------------------- 3. no demo sign-in shipped
 *
 * The public site once shipped with no Supabase variables in its build
 * environment. Vite inlines those, so the deployed bundle built no client, and
 * `services/auth/otp.ts` did what it was written to do without one: it
 * generated a six-digit code in the visitor's own browser, stored a derivation
 * of it, and printed it on the sign-in page. Everything upstream passed. The
 * build succeeded, the typecheck succeeded, the harnesses succeeded, and the
 * deployed site authenticated anybody who could read their own screen.
 *
 * `ALLOW_LOCAL_OTP_FALLBACK` is now `import.meta.env.MODE !== 'production'`,
 * which Vite folds to a constant in a production build, so both entry points
 * return `not_configured` before they reach any of it. This reads the built
 * files and checks that they did — because "the gate is written correctly" and
 * "the gate actually removed the code" are different claims, and a bundler
 * setting changed later can quietly separate them.
 *
 * The markers are the fallback's *machinery*, not its wording. The two demo
 * strings in `i18n/` are ordinary entries in a dictionary object and ship
 * whether or not anything can render them, so their presence would prove
 * nothing and their absence could not be relied on.
 */
const FALLBACK_MACHINERY = [
  // deriveCode(): the only thing in the public application that derives a key.
  'PBKDF2',
  'deriveBits',
  // writeDemo(): the only thing that ever put a live code into storage.
  'sessionStorage.setItem',
]

if (publicBundle !== null) {
  const shipped = FALLBACK_MACHINERY.filter((needle) => publicBundle.includes(needle))
  check(
    'the built public site cannot generate a sign-in code of its own',
    shipped.length === 0,
    shipped.length ? `shipped: ${shipped.join(', ')}` : `${FALLBACK_MACHINERY.length} markers checked`,
  )

  // The other half of the same claim: what the gate leaves behind. Without
  // this, a build that dropped the sign-in code entirely would also pass.
  check(
    'and refuses to sign anyone in when it has no backend',
    publicBundle.includes('not_configured'),
  )
}

/*
 * The dashboard is checked for the gate only. It has a second, unrelated
 * no-backend path — `admin/session.ts`'s local passphrase — which legitimately
 * derives a key, so the machinery markers above cannot mean the same thing
 * there.
 */
if (adminBundle !== null) {
  check(
    'the built dashboard refuses to sign anyone in when it has no backend',
    adminBundle.includes('not_configured'),
  )
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
if (failures > 0) process.exitCode = 1
