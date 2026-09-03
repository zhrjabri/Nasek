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
import {
  authRedirectTarget,
  completeAuthRedirect,
  isAuthRedirect,
  parseSignInLink,
  resolveRedirectTarget,
} from '@/services/auth/redirect'

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

  /*
   * The configured deployed address, which is the half the running origin
   * cannot supply.
   *
   * `authRedirectTarget()` reads `VITE_SITE_URL` at build time, so the choice
   * between the two sources cannot be flipped at runtime and cannot be
   * exercised through that function. `resolveRedirectTarget()` is the same
   * decision with the value passed in, which is why it is separated out — the
   * branch that only runs in a production build is the one worth pinning here,
   * because it is the one nobody can click on locally.
   */
  const origin = 'http://localhost:5174'

  check(
    'a configured site URL beats the origin the page is served on',
    resolveRedirectTarget('https://nasek.example.com/', origin, '/') ===
      'https://nasek.example.com/',
    resolveRedirectTarget('https://nasek.example.com/', origin, '/'),
  )
  check(
    'a configured URL with no trailing slash gains one',
    resolveRedirectTarget('https://nasek.example.com', origin, '/') ===
      'https://nasek.example.com/',
    resolveRedirectTarget('https://nasek.example.com', origin, '/'),
  )
  check(
    'a configured sub-path keeps its path and gains a slash',
    resolveRedirectTarget('https://example.github.io/Nasek', origin, '/') ===
      'https://example.github.io/Nasek/',
    resolveRedirectTarget('https://example.github.io/Nasek', origin, '/'),
  )
  check(
    'a query or fragment pasted into the variable is dropped',
    resolveRedirectTarget('https://nasek.example.com/?utm=x#/signin', origin, '/') ===
      'https://nasek.example.com/',
    resolveRedirectTarget('https://nasek.example.com/?utm=x#/signin', origin, '/'),
  )

  /*
   * A static host serves the same page at `/` and at `/index.html`, and only
   * one of them can reasonably be on the allow-list. Someone arriving on the
   * explicit filename — a bookmark, a link with the name in it — must still
   * produce the registered address, or their sign-in silently lands elsewhere.
   */
  check(
    'a trailing index.html is normalised away',
    resolveRedirectTarget(undefined, 'https://nasek.example.com', '/index.html') ===
      'https://nasek.example.com/',
    resolveRedirectTarget(undefined, 'https://nasek.example.com', '/index.html'),
  )

  // Development: nothing configured, so the address really is the address.
  check(
    'no configured URL falls back to the running origin',
    resolveRedirectTarget(undefined, origin, '/') === 'http://localhost:5174/',
    resolveRedirectTarget(undefined, origin, '/'),
  )
  check(
    'a blank variable counts as unset rather than as an empty URL',
    resolveRedirectTarget('   ', origin, '/') === 'http://localhost:5174/',
    resolveRedirectTarget('   ', origin, '/'),
  )

  /*
   * A typo in a deployment variable is a deployment mistake, not a reason for
   * every sign-in on the site to throw. It degrades to the previous behaviour,
   * which is wrong in an email but still leaves the app working while someone
   * finds it.
   */
  check(
    'a malformed configured URL degrades to the origin instead of throwing',
    resolveRedirectTarget('nasek.example.com', origin, '/') === 'http://localhost:5174/',
    resolveRedirectTarget('nasek.example.com', origin, '/'),
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

  console.log('')
  console.log('--- reading a link someone pasted in ------------------------')
  console.log('')

  const base = 'https://abcd.supabase.co/auth/v1/verify'
  const confirm = `${base}?token=abc123hash&type=signup&redirect_to=http%3A%2F%2Flocalhost%3A5173%2F`

  const signup = parseSignInLink(confirm)
  check(
    'a Confirm-signup link yields its token and type',
    signup?.tokenHash === 'abc123hash' && signup?.type === 'signup',
    JSON.stringify(signup),
  )

  const magic = parseSignInLink(
    `${base}?token=xyz789&type=magiclink&redirect_to=http%3A%2F%2Flocalhost%3A5173%2F`,
  )
  check(
    'a Magic Link link yields its token and type',
    magic?.type === 'magiclink' && magic?.tokenHash === 'xyz789',
  )

  check(
    'the newer token_hash parameter is understood too',
    parseSignInLink(`${base}?token_hash=hash999&type=email`)?.tokenHash === 'hash999',
  )

  // People paste with whitespace, and mail clients wrap links in redirectors.
  check(
    'surrounding whitespace and newlines are tolerated',
    parseSignInLink(`  ${confirm}  `)?.tokenHash === 'abc123hash',
  )
  check(
    'a link wrapped in a mail-client redirector is unwrapped',
    parseSignInLink(
      `https://mail.example.com/redirect?url=${encodeURIComponent(confirm)}`,
    )?.tokenHash === 'abc123hash',
  )
  check(
    'a link buried in pasted surrounding text is still found',
    parseSignInLink(`Follow this link: ${confirm} to finish signing up`)?.tokenHash === 'abc123hash',
  )
  check(
    'a link with no type defaults to magiclink rather than being refused',
    parseSignInLink(`${base}?token=notype`)?.type === 'magiclink',
  )

  /*
   * A link copied out of a rendered email carries HTML entities. The token
   * survived them; the type did not, and silently became `magiclink`. Since
   * GoTrue looks a token up by hash *and* type, a perfectly good signup link
   * was rejected as "invalid or has expired".
   */
  const escaped = `${base}?token=abc123hash&amp;type=signup&amp;redirect_to=x`
  const fromHtml = parseSignInLink(escaped)
  check(
    'an HTML-escaped link keeps its type instead of defaulting to magiclink',
    fromHtml?.type === 'signup' && fromHtml?.tokenHash === 'abc123hash',
    JSON.stringify(fromHtml),
  )
  check(
    'numeric entities are decoded too',
    parseSignInLink(`${base}?token=t1&#38;type=recovery`)?.type === 'recovery',
  )

  check('empty input yields nothing', parseSignInLink('') === null)
  check('unrelated text yields nothing', parseSignInLink('hello there') === null)
  check('a URL with no token yields nothing', parseSignInLink('https://nasek.om/#/signin') === null)

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
