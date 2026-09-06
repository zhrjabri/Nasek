/*
 * Does every route actually render?
 *
 * The other harnesses check decisions — filters, scoring, moderation, codes.
 * None of them would notice a component that throws the moment React tries to
 * draw it: a bad import, a destructured undefined, a hook called from the wrong
 * place. Those are invisible to a typechecker and to a build, and `curl`
 * returning 200 says only that the HTML shell was served, not that anything
 * inside it worked.
 *
 * So this renders each route to a string, with `MemoryRouter` standing in for
 * the real one, and fails on anything that throws. It is not a substitute for
 * opening a browser — effects never run, so nothing here exercises data
 * loading, focus, or the session reconciliation. What it does cover is the
 * first paint of every screen in both applications, which is where a broken
 * refactor shows up first and most catastrophically.
 */
import { StrictMode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { adminEn } from '@/i18n/adminEn'
import { adminAr } from '@/i18n/adminAr'
import { ownerEn } from '@/i18n/ownerEn'
import { ownerAr } from '@/i18n/ownerAr'
import { AppStoreProvider } from '@/store/AppStore'
import { App } from '@/App'
import { AdminApp } from '@/admin/AdminApp'
import { OwnerApp } from '@/owner/OwnerApp'
import { OwnerLoginPage } from '@/owner/LoginPage'
import { SetPasswordPage } from '@/owner/SetPasswordPage'
import { DashboardPage as OwnerDashboardPage } from '@/owner/DashboardPage'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

/** Render one route and report what came back, or what went wrong. */
function render(label: string, path: string, tree: (path: string) => React.ReactElement) {
  try {
    const html = renderToStaticMarkup(tree(path))
    // A route that renders nothing at all is a failure that returns no error:
    // a mistyped path falls through to a catch-all, and an empty string means
    // even that did not draw.
    check(label, html.length > 120, `${html.length} chars`)
  } catch (reason) {
    check(label, false, reason instanceof Error ? reason.message : String(reason))
  }
}

const publicTree = (path: string) => (
  <StrictMode>
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <AppStoreProvider>
          <App />
        </AppStoreProvider>
      </I18nProvider>
    </MemoryRouter>
  </StrictMode>
)

const adminTree = (path: string) => (
  <StrictMode>
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider extra={{ en: adminEn, ar: adminAr }}>
        <AppStoreProvider>
          <AdminApp />
        </AppStoreProvider>
      </I18nProvider>
    </MemoryRouter>
  </StrictMode>
)


/*
 * The owner portal, which had no entry in this harness at all until a blank
 * white page in production went looking for one.
 *
 * It takes no router, because the portal has none — the tree below is what
 * `src/owner/main.tsx` mounts, minus the toast host. Effects never run under
 * `renderToStaticMarkup`, so what this covers is exactly what was missing:
 * that the very first frame does not throw.
 */
const ownerTree = () => (
  <StrictMode>
    <I18nProvider extra={{ en: ownerEn, ar: ownerAr }}>
      <AppStoreProvider>
        <OwnerApp />
      </AppStoreProvider>
    </I18nProvider>
  </StrictMode>
)

console.log('\n--- the public site -----------------------------------------\n')

const PUBLIC_ROUTES: [string, string][] = [
  ['home', '/'],
  ['campaign listing', '/campaigns'],
  ['smart match', '/smart-match'],
  ['map', '/map'],
  ['giving', '/giving'],
  ['about', '/about'],
  ['sign in', '/signin'],
  ['an address that does not exist', '/nothing-here'],

  // Signed out, so this redirects rather than renders — which is itself the
  // behaviour worth checking, since the redirect is the guard.
  ['customer dashboard, signed out', '/dashboard'],

  /*
   * Addresses this site used to answer on and no longer owns.
   *
   * Two registrations, a role chooser, two per-role sign-ins and the whole
   * owner portal. Every one has to resolve to *something* — a bookmark that
   * returns "not found" is indistinguishable from a broken site — and none may
   * throw, which is what a route pointing at a deleted module would do.
   */
  ['retired /signin/customer', '/signin/customer'],
  ['retired /signin/owner', '/signin/owner'],
  ['retired /signup', '/signup'],
  ['retired /signup/customer', '/signup/customer'],
  ['retired /signup/provider', '/signup/provider'],
  ['retired /provider', '/provider'],
  ['retired /provider/pending', '/provider/pending'],
  ['the owner portal is not on this host', '/owner'],
  ['nor any address under it', '/owner/signin'],
]

for (const [label, path] of PUBLIC_ROUTES) render(label, path, publicTree)

console.log('\n--- the administration dashboard ----------------------------\n')

// Every one of these lands on the access check rather than the section, because
// nothing has signed in. That is the point: the dashboard must not draw a
// single one of its screens before the answer comes back.
for (const path of ['/', '/overview', '/users', '/owners', '/campaigns', '/bookings', '/reviews', '/security']) {
  render(`admin ${path} resolves to the access check`, path, adminTree)
}


console.log('\n--- the campaign owner portal -------------------------------\n')

render('the owner portal draws its first frame', '/', () => ownerTree())


/*
 * Each screen the gate can land on, not merely the frame it starts on.
 *
 * The first-frame check above passes on a portal that renders a blank page in
 * a browser, because the frame it draws is the spinner and every screen after
 * it arrives from an effect that `renderToStaticMarkup` never runs.
 */
const ownerScreen = (node: React.ReactElement) => (
  <StrictMode>
    <I18nProvider extra={{ en: ownerEn, ar: ownerAr }}>
      <AppStoreProvider>{node}</AppStoreProvider>
    </I18nProvider>
  </StrictMode>
)

render('the owner sign-in screen', '/', () =>
  ownerScreen(<OwnerLoginPage onSignedIn={() => {}} />),
)
render('the owner sign-in screen, after a dead invitation link', '/', () =>
  ownerScreen(<OwnerLoginPage onSignedIn={() => {}} linkError="expired" />),
)
render('the set-password screen an invitation lands on', '/', () =>
  ownerScreen(<SetPasswordPage onDone={() => {}} />),
)
render('the owner dashboard, which only a verified owner ever sees', '/', () =>
  ownerScreen(<OwnerDashboardPage />),
)
console.log('\n--- what the public site must not contain -------------------\n')

/*
 * The isolation harness reads the built bundle. This reads the rendered markup,
 * which is a different question and a sharper one: not "was the code shipped"
 * but "did any of it reach the page".
 */
const homeHtml = renderToStaticMarkup(publicTree('/'))
const signInHtml = renderToStaticMarkup(publicTree('/signin'))
for (const [label, needle] of [
  ['no link to an administration route', '/admin'],
  ['no administration wording', 'administration'],
  ['no administration wording in Arabic', 'الإدارة'],
] as const) {
  const found = homeHtml.toLowerCase().includes(needle.toLowerCase())
  check(label, !found, found ? `found "${needle}"` : '')
}
check(
  'the sign-in page offers no administrator door',
  !signInHtml.toLowerCase().includes('administrat'),
)

/*
 * The one door, and everything it must not offer.
 *
 * `/signin` *is* customer registration now — verifying a code on an unknown
 * address creates the account — so the promises that used to be made about a
 * separate sign-up screen are made about this one. It collects an address and
 * nothing else, which is a promise about the product rather than a detail of
 * one form: a pilgrim should reach a campaign without filling anything in
 * first. It is the kind of promise that erodes one well-meant field at a time —
 * a name here, a wilayah there, each defensible on its own — so it is asserted
 * rather than trusted.
 *
 * Read off the rendered markup, which is where a reinstated field would
 * actually appear. `type="tel"`, `autocomplete="name"` and a password input are
 * the three shapes the removed fields had.
 */
for (const [label, needle] of [
  ['the sign-in page asks for no phone number', 'type="tel"'],
  ['the sign-in page asks for no name', 'autocomplete="name"'],
  ['the sign-in page asks for no password', 'type="password"'],
] as const) {
  const found = signInHtml.includes(needle)
  check(label, !found, found ? `found ${needle}` : '')
}
check(
  'the sign-in page asks for exactly one thing',
  (signInHtml.match(/<input/g) ?? []).length === 1,
  `${(signInHtml.match(/<input/g) ?? []).length} input(s)`,
)
check(
  'and that one thing is an email address',
  signInHtml.includes('type="email"'),
)

/*
 * ------------------------------------------------ the three doors, separated
 *
 * NASEK is three applications and the customer website must carry no trace of
 * the other two — no link, no button, no wording. `verify:isolation` proves
 * that against the built bundle; this proves it against the rendered page,
 * which is the sharper question of the two: not "was the code shipped" but
 * "did any of it reach the screen".
 *
 * The home page and the sign-in page are checked because they are where such a
 * link would go back: a "for campaign owners" band on the home page and an
 * "are you a campaign owner?" line under the sign-in form are exactly the two
 * things that were removed, and exactly the two a well-meaning change would
 * restore.
 */
const OFF_LIMITS: [string, string][] = [
  ['owner portal link', '/owner'],
  ['provider route', '/provider'],
  ['account-creation link', '/signup'],
  ['mention of a campaign owner', 'campaign owner'],
  ['Arabic mention of the owner portal', 'أصحاب الحملات'],
]

for (const [what, needle] of OFF_LIMITS) {
  for (const [page, html] of [
    ['home', homeHtml],
    ['sign-in', signInHtml],
  ] as const) {
    const found = html.toLowerCase().includes(needle.toLowerCase())
    check(`the ${page} page carries no ${what}`, !found, found ? `found "${needle}"` : '')
  }
}

/*
 * And the footer, which every page carries.
 *
 * It had a whole "For campaign owners" column — the portal, its registration
 * and its sign-in. Checking the home page covers it, since the footer renders
 * there too; naming it separately is what makes a failure legible.
 */
check(
  'the footer offers no campaign owner column',
  !homeHtml.includes('footer.forProviders') && !homeHtml.toLowerCase().includes('list your campaign'),
)

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
if (failures > 0) process.exitCode = 1
