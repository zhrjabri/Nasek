/*
 * Is the Supabase project going to send people back to the right place?
 *
 *   npm run auth:urls              # report — no token needed, changes nothing
 *   npm run auth:urls -- --apply   # set Site URL and Redirect URLs
 *
 * This exists because the failure it catches is invisible from inside the app.
 * `authRedirectTarget()` can compute a perfectly correct address and hand it to
 * Supabase as `emailRedirectTo`, and if that address is not on the project's
 * allow-list Supabase does not refuse it, does not warn, and does not report an
 * error to the caller — it quietly substitutes the project's Site URL and
 * carries on. The person clicks a link in their inbox and arrives somewhere
 * else entirely, which looks exactly like a bug in the application and is not
 * one. Nothing in a build, a typecheck or a test run can see it, because the
 * decision is made inside a service this repository does not contain.
 *
 * So the report asks the project itself, from outside, using the same anon key
 * the browser gets. `GET /auth/v1/verify` with a deliberately invalid token
 * answers with a 303 whose `Location` is the redirect that *would* have been
 * used — an allow-listed address comes back unchanged, a rejected one comes
 * back as the Site URL. No email is sent, no token is spent, nothing is
 * written.
 *
 * `--apply` needs a personal access token, because changing project
 * configuration is a management operation and the anon key cannot do it:
 *
 *   https://supabase.com/dashboard/account/tokens
 *   SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:urls -- --apply
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Read `.env` directly — this runs outside Vite, so `import.meta.env` is not a thing. */
function readEnv() {
  const file = path.join(root, '.env')
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...readEnv(), ...process.env }
const projectUrl = env.VITE_SUPABASE_URL?.trim()
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
const apply = process.argv.includes('--apply')

if (!projectUrl || !anonKey) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')
  process.exit(1)
}

const projectRef = new URL(projectUrl).hostname.split('.')[0]

/*
 * The same canonicalisation `resolveRedirectTarget()` performs in the browser.
 *
 * It has to be the same one, or this script would cheerfully register
 * `https://nasek.example` while the app asks for `https://nasek.example/`, and
 * then report a healthy configuration that does not work.
 */
function canonical(raw) {
  const url = new URL(raw)
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/index\.html$/, '')
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`
  return url.toString()
}

// ------------------------------------------------------------- the wanted set

/*
 * One entry per application, and all three of them.
 *
 * 5175 is the Campaign Owner Portal, and it was missing along with
 * `VITE_OWNER_URL` below — this script predates the portal and was never taught
 * about it. The effect was worse than an omission: the owner portal is the one
 * application whose *entire* first contact with a person is an emailed link, so
 * an invitation redirect that is not on the allow-list is silently replaced by
 * the Site URL and a new owner lands on the customer website. And because the
 * script only checked the two addresses it knew, it printed "every address
 * NASEK sends is one this project will honour" while that was untrue.
 *
 * The ports are the ones the Vite configs pin with `strictPort`, so they cannot
 * drift out from under this list.
 */
const DEV = [
  'http://localhost:5173/', // customer site
  'http://localhost:5174/', // administration dashboard
  'http://localhost:5175/', // campaign owner portal
]

const siteUrl = env.VITE_SITE_URL?.trim() ? canonical(env.VITE_SITE_URL.trim()) : null
const ownerUrl = env.VITE_OWNER_URL?.trim() ? canonical(env.VITE_OWNER_URL.trim()) : null
const adminUrl = env.VITE_ADMIN_URL?.trim() ? canonical(env.VITE_ADMIN_URL.trim()) : null
const deployed = [siteUrl, ownerUrl, adminUrl].filter(Boolean)

/*
 * Development stays on the list alongside production, deliberately.
 *
 * The two are not alternatives: one project backs both `npm run dev` and the
 * deployed site, and dropping the localhost entries to tidy up breaks every
 * developer's sign-in with the same silent substitution this script exists to
 * find.
 *
 * Each address is listed twice — exact, and with `**`. The exact form is what
 * the app actually sends; the wildcard covers a host that appends a path, and a
 * `?code=` or `#access_token=` arriving on the end.
 */
const wanted = [...DEV, ...deployed].flatMap((u) => [u, `${u}**`])

/*
 * The Site URL is the fallback for everything not on the list, so it should be
 * the public site once there is one. Until then it stays on the public dev
 * port — never `localhost:3000`, which is Supabase's own default and matches
 * nothing this repository serves.
 */
const wantedSiteUrl = siteUrl ?? DEV[0]

// -------------------------------------------------------------------- probing

/**
 * What would Supabase actually do with this `redirect_to`?
 *
 * The invalid token is the point: verification fails, and the failure is
 * reported by redirecting to the address that would have been used on success.
 * That makes the allow-list decision observable without sending anything.
 */
async function probe(target) {
  const url =
    `${projectUrl}/auth/v1/verify` +
    `?token=nasek-allowlist-probe&type=signup&redirect_to=${encodeURIComponent(target)}`

  const res = await fetch(url, { headers: { apikey: anonKey }, redirect: 'manual' })
  const location = res.headers.get('location')
  if (!location) return { ok: false, landedOn: `HTTP ${res.status}, no redirect` }

  const landedOn = location.split('#')[0]
  return { ok: landedOn === target, landedOn }
}

/** The Site URL, read by asking for somewhere that cannot possibly be listed. */
async function discoverSiteUrl() {
  const { landedOn } = await probe('https://not-on-any-allow-list.invalid/')
  return landedOn
}

const sameUrl = (a, b) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

async function report() {
  const actualSiteUrl = await discoverSiteUrl()

  console.log(`\nProject   ${projectRef}`)
  console.log(`Site URL  ${actualSiteUrl}`)
  console.log(
    sameUrl(actualSiteUrl, wantedSiteUrl)
      ? '          ^ matches what .env asks for'
      : `          ^ EXPECTED ${wantedSiteUrl}`,
  )

  console.log('\nRedirect targets this project would honour:\n')
  let bad = 0
  for (const target of [...DEV, ...deployed]) {
    const { ok, landedOn } = await probe(target)
    if (!ok) bad += 1
    console.log(`  ${ok ? 'OK      ' : 'REJECTED'}  ${target}${ok ? '' : `  -> ${landedOn}`}`)
  }

  if (deployed.length === 0) {
    console.log(
      '\n  VITE_SITE_URL is not set in .env, so only the development addresses\n' +
        '  were checked. A production build made now would put whatever origin\n' +
        '  it is opened on into the email.',
    )
  }
  return bad
}

// ------------------------------------------------------------------- applying

const MANAGEMENT = 'https://api.supabase.com/v1'

async function management(method, body) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!token) {
    console.error(
      '\n--apply needs a personal access token:\n\n' +
        '  https://supabase.com/dashboard/account/tokens\n\n' +
        '  SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:urls -- --apply\n',
    )
    process.exit(1)
  }

  const res = await fetch(`${MANAGEMENT}/projects/${projectRef}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`\n${method} config/auth failed: HTTP ${res.status}\n${text.slice(0, 400)}\n`)
    process.exit(1)
  }
  return text ? JSON.parse(text) : {}
}

async function applyConfig() {
  const current = await management('GET')

  /*
   * The existing list is merged into, never replaced.
   *
   * A project accumulates entries this repository knows nothing about — a
   * colleague's tunnel, a preview domain, a second front end. Overwriting the
   * field would silently break each of them, and that breakage would look
   * exactly like the bug being fixed here.
   */
  const existing = (current.uri_allow_list ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const merged = [...new Set([...existing, ...wanted])]
  const added = merged.filter((u) => !existing.includes(u))

  console.log(`\nSite URL      ${current.site_url}  ->  ${wantedSiteUrl}`)
  console.log(
    added.length
      ? `Allow-list:\n${added.map((u) => `  + ${u}`).join('\n')}`
      : 'Allow-list:   already complete.',
  )

  if (sameUrl(current.site_url ?? '', wantedSiteUrl) && added.length === 0) {
    console.log('\nNothing to change.')
    return
  }

  await management('PATCH', { site_url: wantedSiteUrl, uri_allow_list: merged.join(',') })
  console.log('\nApplied. Re-checking from outside:')
}

// ------------------------------------------------------------------------ run

async function main() {
  if (apply) await applyConfig()
  const bad = await report()

  if (bad > 0) {
    console.log(
      '\nA REJECTED address is silently replaced by the Site URL — the sign-in\n' +
        'still "works", it just lands somewhere else. Run with --apply to fix.\n',
    )
    process.exitCode = 1
  } else {
    console.log('\nEvery address NASEK sends is one this project will honour.\n')
  }
}

void main()
