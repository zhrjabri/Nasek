/*
 * Arriving back from a link in an email.
 *
 * `services/auth/redirect.ts` decides, on every single page load, whether the
 * address bar contains authentication material. It has to be right in both
 * directions and the failure modes are opposite:
 *
 *   * Too eager, and every ordinary page load is treated as a sign-in. NASEK
 *     uses `HashRouter`, so `#/signin` and `#/campaigns` are routes, not
 *     tokens — a check that mistook them for tokens would break the whole site.
 *   * Too shy, and a real link is ignored. The person clicks, lands on the home
 *     page signed out, and concludes the email was broken.
 *
 * Neither shows up in a typecheck, and neither can be exercised by clicking
 * around without a live inbox. So the URL shapes are pinned here.
 */
import { authRedirectTarget, completeAuthRedirect, isAuthRedirect } from '@/services/auth/redirect'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

/** Put the harness at a given address, the way a browser would be. */
function at(href: string) {
  const url = new URL(href)
  ;(globalThis as unknown as { window: unknown }).window = {
    location: {
      href: url.href,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    },
    history: { replaceState: () => {} },
  }
}

async function main() {
  console.log('\n--- what counts as an arrival from an email -----------------\n')

  at('http://localhost:5173/')
  check('a bare page load is not a redirect', isAuthRedirect() === false)

  // The one that would break the entire site if it were wrong.
  at('http://localhost:5173/#/signin')
  check('a hash route is not a redirect', isAuthRedirect() === false, '#/signin')
  at('http://localhost:5173/#/campaigns?type=hajj')
  check('a hash route with its own query is not a redirect', isAuthRedirect() === false)
  at('http://localhost:5173/#/booking/abc123')
  check('a deep hash route is not a redirect', isAuthRedirect() === false)

  at('http://localhost:5173/?code=abc123')
  check('a PKCE code is a redirect', isAuthRedirect() === true)
  at('http://localhost:5173/?code=abc123#/signin')
  check('a PKCE code alongside a hash route is a redirect', isAuthRedirect() === true)
  at('http://localhost:5173/#access_token=xyz&refresh_token=abc&type=magiclink')
  check('an implicit-flow fragment is a redirect', isAuthRedirect() === true)
  at('http://localhost:5173/?error_code=otp_expired&error_description=Email+link+is+invalid')
  check('an error in the query is a redirect', isAuthRedirect() === true)
  at('http://localhost:5173/#error_description=Email+link+has+expired')
  check('an error in the fragment is a redirect', isAuthRedirect() === true)

  // A route whose own query mentions the words is still a route. The leading
  // `#/` is what settles it, so even an exact parameter spelling cannot make a
  // route look like a sign-in.
  at('http://localhost:5173/#/campaigns?q=access_token')
  check('a route merely mentioning the words is not a redirect', isAuthRedirect() === false)
  at('http://localhost:5173/#/campaigns?q=access_token=1')
  check('nor one containing the exact parameter spelling', isAuthRedirect() === false)
  at('http://localhost:5173/#/search?error_description=whatever')
  check('nor a route with an error-shaped query of its own', isAuthRedirect() === false)

  console.log('\n--- where Supabase is told to send people --------------------\n')

  at('http://localhost:5173/#/signin?next=%2Fdashboard')
  check(
    'the redirect target drops the route and the query',
    authRedirectTarget() === 'http://localhost:5173/',
    String(authRedirectTarget()),
  )
  at('http://localhost:5174/#/overview')
  check(
    'the administration app returns to its own origin',
    authRedirectTarget() === 'http://localhost:5174/',
    String(authRedirectTarget()),
  )
  at('https://nasek.example.om/nasek/#/campaigns')
  check(
    'a site served from a sub-path keeps that sub-path',
    authRedirectTarget() === 'https://nasek.example.om/nasek/',
    String(authRedirectTarget()),
  )

  console.log('\n--- with no backend configured ------------------------------\n')

  // The harness builds with `--mode harness`, so there is no Supabase client.
  // Every shape must resolve to "nothing to do" rather than throwing: the
  // handler runs on every page load of the offline prototype too.
  for (const href of [
    'http://localhost:5173/',
    'http://localhost:5173/?code=abc123',
    'http://localhost:5173/#access_token=xyz&refresh_token=abc',
    'http://localhost:5173/?error_code=otp_expired',
  ]) {
    at(href)
    const outcome = await completeAuthRedirect()
    check(`no backend, no crash: ${href.slice(21) || '/'}`, outcome.kind === 'none', outcome.kind)
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
