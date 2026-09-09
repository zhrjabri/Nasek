/*
 * Does the customer website actually contain no owner or administration code?
 *
 * NASEK is three applications — the public site, the Campaign Owner Portal and
 * the administration dashboard — and the separation between them is the sort of
 * claim that is true on the day it is made and quietly false three commits
 * later, when someone imports a helper from `src/owner/` because it was the
 * nearest thing that did the job. Nothing would break. Nothing would look
 * different. The customer bundle would simply start carrying a portal a pilgrim
 * must never see, and no one would find out until they went looking.
 *
 * So it is checked, twice, from two directions:
 *
 *   1. Statically, by walking every import reachable from `src/main.tsx` and
 *      failing if the walk ever arrives inside `src/owner/` or `src/admin/`, or
 *      at any of their dictionaries. This catches the mistake at the moment it
 *      is made and needs no build.
 *
 *   2. Against the built output, by searching `dist/` for strings that only the
 *      other two applications should contain — including the navigation and
 *      authentication wording that would give either of them away. This is the
 *      one that cannot be fooled: whatever the import graph says, this reads
 *      what would actually be uploaded.
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

/*
 * And none of the owner portal, which is the newer half of the same rule.
 *
 * `src/owner/` was `src/pages/ProviderDashboardPage.tsx` and friends until the
 * three applications were split apart, so this is exactly the import somebody
 * would re-add without thinking — the dashboard is "just another page" right up
 * until you notice it has shipped to every pilgrim.
 */
const ownerReachable = reachable.filter((f) => {
  const r = rel(f)
  return r.startsWith('src/owner/') || r === 'src/i18n/ownerEn.ts' || r === 'src/i18n/ownerAr.ts'
})

check(
  'the public entry reaches no campaign owner module',
  ownerReachable.length === 0,
  ownerReachable.length ? ownerReachable.map(rel).join(', ') : `${reachable.length} modules walked`,
)

// The mirror of the same question: each of the other two entries must still be
// able to reach its own screens, or the checks above would pass on an app that
// was broken rather than one that was separated.
const adminGraph = walk('src/admin/main.tsx').map(rel)
check(
  'the administration entry reaches its own dashboard',
  adminGraph.some((f) => f.startsWith('src/admin/tabs/')),
  `${adminGraph.length} modules walked`,
)
check(
  'the administration entry carries its own dictionaries',
  adminGraph.includes('src/i18n/adminEn.ts') &&
    adminGraph.includes('src/i18n/adminAr.ts') &&
    // It manages owners and their campaigns, so it needs their words too.
    adminGraph.includes('src/i18n/ownerEn.ts'),
)

const ownerGraph = walk('src/owner/main.tsx').map(rel)
check(
  'the owner entry reaches its own dashboard',
  ownerGraph.includes('src/owner/DashboardPage.tsx'),
  `${ownerGraph.length} modules walked`,
)
check(
  'the owner entry carries its own dictionary',
  ownerGraph.includes('src/i18n/ownerEn.ts') && ownerGraph.includes('src/i18n/ownerAr.ts'),
)
/*
 * The owner portal must not reach administration either.
 *
 * Less obvious than the customer rule and worth stating: an owner is a
 * customer of NASEK's, not a member of staff, and the portal has no business
 * carrying a moderation screen any more than the public site does.
 */
const ownerToAdmin = ownerGraph.filter(
  (f) => f.startsWith('src/admin/') || f === 'src/i18n/adminEn.ts' || f === 'src/i18n/adminAr.ts',
)
check(
  'the owner entry reaches no administration module',
  ownerToAdmin.length === 0,
  ownerToAdmin.join(', ') || 'clean',
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

/**
 * Strings that should exist in the owner portal and nowhere a customer looks.
 *
 * The brief for the three-application split was specific: no Campaign Owner
 * login, registration, links, buttons or portal references anywhere on the
 * customer website, and a pilgrim should not even learn the portal exists. That
 * is a claim about the shipped bundle, so it is checked against the shipped
 * bundle.
 *
 * Chosen, like the administration markers, to be things a minifier cannot
 * remove or rename — user-visible copy and route paths, never an identifier.
 */
const OWNER_ONLY = [
  'Campaign Owner Portal',
  'بوابة أصحاب الحملات',
  'owner.portal',
  'Campaign owner dashboard',
  'prov.myCampaigns',
  'Send for review',
  'resubmit_provider',
]

/**
 * Wording the customer site must not carry at all.
 *
 * Not about the other two applications this time, but about this one: the
 * customer site has exactly one authentication control and no account creation,
 * so a "Create account" button or a password field appearing here is a
 * regression in its own right — most likely someone restoring a screen that was
 * deliberately removed.
 */
const CUSTOMER_MUST_NOT_HAVE = [
  // English copy, and the dictionary keys that would come back with the screens
  // they belong to. Keys are as reliable a marker as copy and rather more
  // precise: they ship verbatim, a minifier cannot touch them, and they name
  // exactly one screen each.
  'Create account',
  'Continue with Google',
  'nav.signUp',
  'auth.signUpTitle',
  'auth.signUpChoose',
  'auth.continueGoogle',
  'auth.termsAgree',
]

/*
 * Two markers that look obvious and are not usable, recorded so nobody adds
 * them back:
 *
 *   'إنشاء حساب'      a substring of `auth.creating` — "جارٍ إنشاء حسابك…",
 *                     the perfectly legitimate busy label on the code form.
 *   'signInWithOAuth' a method on the Supabase client itself. It is in every
 *                     bundle that imports supabase-js and says nothing at all
 *                     about whether this application offers OAuth.
 *
 * Both produced a failing check against a correct build, which is the worst
 * kind: it teaches whoever sees it that this harness cries wolf.
 */

const publicBundle = bundleText('dist')
const ownerBundle = bundleText('dist-owner')
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

  const leakedOwner = OWNER_ONLY.filter((needle) => publicBundle.includes(needle))
  check(
    'the built public site contains no campaign owner string',
    leakedOwner.length === 0,
    leakedOwner.length ? `leaked: ${leakedOwner.join(', ')}` : `${OWNER_ONLY.length} markers checked`,
  )

  const unwanted = CUSTOMER_MUST_NOT_HAVE.filter((needle) => publicBundle.includes(needle))
  check(
    'the built public site offers no account creation, password or Google sign-in',
    unwanted.length === 0,
    unwanted.length
      ? `found: ${unwanted.join(', ')}`
      : `${CUSTOMER_MUST_NOT_HAVE.length} markers checked`,
  )

  if (adminBundle !== null) {
    // The markers have to be real, or the checks above would pass against any
    // set of strings that happen to appear nowhere.
    const present = ADMIN_ONLY.filter((needle) => adminBundle.includes(needle))
    check(
      'those administration strings do appear in the administration build',
      present.length >= 3,
      `${present.length} of ${ADMIN_ONLY.length} present`,
    )
  }

  if (ownerBundle !== null) {
    const present = OWNER_ONLY.filter((needle) => ownerBundle.includes(needle))
    check(
      'those owner strings do appear in the owner build',
      present.length >= 3,
      `${present.length} of ${OWNER_ONLY.length} present`,
    )

    /*
     * And the owner portal carries no administration wording either — the
     * built-output mirror of the import-graph check above.
     */
    const adminInOwner = ADMIN_ONLY.filter((needle) => ownerBundle.includes(needle))
    check(
      'the built owner portal contains no administration string',
      adminInOwner.length === 0,
      adminInOwner.length ? `leaked: ${adminInOwner.join(', ')}` : 'clean',
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
  /*
   * There used to be a third marker here, `sessionStorage.setItem`, standing in
   * for "put a live code into storage". It is gone, and the reasoning is worth
   * keeping so nobody restores it.
   *
   * It failed in both directions. Too loose: the owner portal acquired an
   * unrelated reason to write to session storage — remembering that an invited
   * owner still owes a password — and the build failed for a change that had
   * nothing to do with sign-in codes. Too strict, once replaced with the
   * literal `DEMO_KEY`: minification keeps the key string and the *clear-down*
   * half of `writeDemo`, so the public bundle legitimately contains
   *
   *     const x="nasek.otp.pending"; function w(a){try{a||sessionStorage.removeItem(x)}catch{}}
   *
   * which deletes a key and could not create one. Both were markers about
   * plumbing rather than about the property.
   *
   * The property is that no deployed bundle can *derive* a valid code without
   * the server, and `deriveCode()` is the only thing that ever could. PBKDF2
   * and deriveBits are its irreducible parts: no code exists to be stored if
   * none can be produced. The positive half — that the app says so rather than
   * failing silently — is asserted separately, by the "refuses to sign anyone
   * in when it has no backend" checks below.
   */
]

/*
 * ------------------------------------------------- one contact address, retired
 *
 * NASEK publishes one address to write to, and `src/data/contact.ts` is where it
 * lives. It has been rewritten more than once, and each time the copies scattered
 * through the footer, the About page and the owner portal's status screens had to
 * be found by hand — which is how the portal came to go on offering an address
 * the customer site had already stopped using.
 *
 * So the retired ones are named here and asserted against the built output of all
 * three applications. A comment mentioning one is harmless and never reaches a
 * bundle; a rendered `mailto:` does, and that is what this catches.
 */
const RETIRED_CONTACT = ['aljabrialzahra1@gmail.com', 'support@nasek.om', 'hello@nasek.om']

for (const [app, bundle] of [
  ['public site', publicBundle],
  ['owner portal', ownerBundle],
  ['administration', adminBundle],
]) {
  if (bundle === null) continue
  const stale = RETIRED_CONTACT.filter((address) => bundle.includes(address))
  check(
    `the built ${app} publishes no retired contact address`,
    stale.length === 0,
    stale.length ? `still shipping: ${stale.join(', ')}` : `${RETIRED_CONTACT.length} checked`,
  )
}

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

/*
 * The owner portal gets the full gate check, because unlike the dashboard it
 * has no second no-backend path of its own: it signs in with a password against
 * Supabase or it does not sign anyone in at all.
 */
if (ownerBundle !== null) {
  const shipped = FALLBACK_MACHINERY.filter((needle) => ownerBundle.includes(needle))
  check(
    'the built owner portal cannot generate a sign-in code of its own',
    shipped.length === 0,
    shipped.length ? `shipped: ${shipped.join(', ')}` : `${FALLBACK_MACHINERY.length} markers checked`,
  )
}

/*
 * ------------------------------------------------ the notification boundary
 *
 * A campaign owner found their company's approvals in the Customer Dashboard.
 * Nothing had leaked — the rows were addressed to their own profile, and the
 * policy has always been `user_id = auth.uid()` — but a notification recorded a
 * person and never an audience, so one profile meant one undifferentiated inbox
 * rendered by whichever of the three applications happened to be open.
 *
 * `20260909000100` is the fix, and these read the shipped SQL rather than a
 * database, for the same reason the rest of this file reads the built bundle:
 * the claim is about what NASEK would deploy. A later migration that quietly
 * restored `using (user_id = auth.uid())` on its own would put the owner rows
 * back within reach of any customer, and nothing else in `npm run verify` would
 * notice.
 *
 * What this cannot check is a live project — `verify:backend` does that — or a
 * signed-in customer's view, which needs a JWT and therefore an account. See
 * docs/SUPABASE.md for the rolled-back `set_config` simulation that proves that
 * one without creating anybody.
 */
console.log('\n--- the notification audience boundary ----------------------\n')

const audienceMigration = (() => {
  try {
    return fs.readFileSync(
      path.join(root, 'supabase/migrations/20260909000100_notification_audience.sql'),
      'utf8',
    )
  } catch {
    return null
  }
})()

if (audienceMigration === null) {
  check('the notification audience migration is in the repository', false, 'file missing')
} else {
  const policy = audienceMigration.slice(audienceMigration.indexOf('create policy notifications_own'))

  check(
    'the read policy still requires the row to be the caller’s own',
    /create policy notifications_own[\s\S]{0,400}?user_id = auth\.uid\(\)/.test(audienceMigration),
  )
  check(
    'an owner-audience row needs the reader to own a company',
    policy.includes("when 'owner' then public.is_provider_owner()"),
  )
  check(
    'an admin-audience row needs is_admin()',
    policy.includes("when 'admin' then public.is_admin()"),
  )
  check(
    'the audience column is NOT NULL, so no row escapes classification',
    /audience public\.notification_audience not null/.test(audienceMigration),
  )
  check(
    'the browser may write only whether a notification has been read',
    audienceMigration.includes('revoke update on public.notifications from authenticated') &&
      audienceMigration.includes('grant update (read) on public.notifications to authenticated'),
  )
  check(
    'nothing in the migration deletes a notification',
    !/delete\s+from\s+public\.notifications|truncate/i.test(audienceMigration),
  )
}

/*
 * And the three applications, each asking for its own audience.
 *
 * The policy is the security half and cannot be the whole fix: for somebody who
 * genuinely owns a company the owner rows are legitimately theirs, so Postgres
 * must return them, and only the client knows which of that person's two
 * dashboards is asking.
 */
const catalogueSource = fs.readFileSync(
  path.join(root, 'src/services/data/catalogue.ts'),
  'utf8',
)
check(
  'the snapshot asks Postgres for one audience rather than filtering afterwards',
  catalogueSource.includes(".eq('audience', APP_AUDIENCE)"),
)
check(
  'and marking everything read is scoped to that audience too',
  /update\(\{ read: true \}\)[\s\S]{0,300}?\.eq\('audience', APP_AUDIENCE\)/.test(catalogueSource),
)
for (const app of ['admin', 'owner']) {
  check(
    `the ${app} build reads the ${app} inbox`,
    new RegExp(`VITE_NASEK_APP === '${app}'[\\s\\S]{0,40}?'${app}'`).test(catalogueSource),
  )
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
if (failures > 0) process.exitCode = 1
