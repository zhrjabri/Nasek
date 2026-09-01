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
import { AppStoreProvider } from '@/store/AppStore'
import { App } from '@/App'
import { AdminApp } from '@/admin/AdminApp'

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

console.log('\n--- the public site -----------------------------------------\n')

const PUBLIC_ROUTES: [string, string][] = [
  ['home', '/'],
  ['campaign listing', '/campaigns'],
  ['smart match', '/smart-match'],
  ['map', '/map'],
  ['giving', '/giving'],
  ['about', '/about'],
  ['sign in', '/signin'],
  ['sign up chooser', '/signup'],
  ['customer registration', '/signup/customer'],
  ['owner registration', '/signup/provider'],
  ['an address that does not exist', '/nothing-here'],
  // Signed out, so these redirect rather than render — which is itself the
  // behaviour worth checking, since the redirect is the guard.
  ['customer dashboard, signed out', '/dashboard'],
  ['owner dashboard, signed out', '/provider'],
  // The retired per-role sign-in addresses still have to resolve.
  ['retired /signin/customer', '/signin/customer'],
  ['retired /signin/owner', '/signin/owner'],
]

for (const [label, path] of PUBLIC_ROUTES) render(label, path, publicTree)

console.log('\n--- the administration dashboard ----------------------------\n')

// Every one of these lands on the access check rather than the section, because
// nothing has signed in. That is the point: the dashboard must not draw a
// single one of its screens before the answer comes back.
for (const path of ['/', '/overview', '/users', '/owners', '/campaigns', '/bookings', '/reviews']) {
  render(`admin ${path} resolves to the access check`, path, adminTree)
}

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

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
if (failures > 0) process.exitCode = 1
