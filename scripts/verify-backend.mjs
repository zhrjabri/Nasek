/*
 * Is the Supabase project actually set up, and actually locked down?
 *
 * Run this after applying the migrations. It talks to the real project using
 * the same anon key the browser gets — which is the point. Every check below
 * asks the question from the position of a stranger who has read the JavaScript
 * bundle and now has the key, because that is exactly who the row-level
 * security policies exist to stop.
 *
 *   npm run verify:backend
 *
 * A pass here means: the schema is applied, the reference data is seeded, and
 * an unauthenticated holder of the public key can read the catalogue and
 * nothing else. It does not test a signed-in user's view — for that, see
 * docs/SUPABASE.md §8.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Read .env directly. This runs outside Vite, so import.meta.env is not a thing.
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
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')
  process.exit(1)
}

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

const rest = (p, init = {}) =>
  fetch(`${url}/rest/v1/${p}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
  })

/** A table an anonymous caller may read: expect 200 and an array. */
async function readable(table, label) {
  const res = await rest(`${table}?select=*&limit=1`)
  const body = await res.text()
  check(label, res.status === 200, `HTTP ${res.status}${res.status !== 200 ? ` ${body.slice(0, 90)}` : ''}`)
  return res.status === 200 ? JSON.parse(body) : null
}

/**
 * A table row-level security should hide from an anonymous caller.
 *
 * The expected answer is 200 with zero rows, not an error. That distinction is
 * the whole design: a policy does not refuse the query, it narrows what the
 * query can see, so an attacker learns nothing about what exists.
 */
async function hidden(table, label) {
  const res = await rest(`${table}?select=*&limit=1`)
  const body = await res.text()
  if (res.status === 404) {
    check(label, false, 'table does not exist — migrations not applied')
    return
  }
  if (res.status === 401 || res.status === 403) {
    // Also acceptable, and equally closed.
    check(label, true, `HTTP ${res.status}, refused outright`)
    return
  }
  let rows = []
  try {
    rows = JSON.parse(body)
  } catch {
    check(label, false, `unparseable: ${body.slice(0, 90)}`)
    return
  }
  check(label, Array.isArray(rows) && rows.length === 0, `${rows.length} row(s) returned`)
}

async function main() {
  console.log(`\nProject: ${url}\n`)
  console.log('--- is the schema there? ------------------------------------\n')

  const wilayat = await readable('wilayat', 'the wilayat reference table exists and is public')
  if (wilayat) {
    const all = await rest('wilayat?select=id')
    const rows = await all.json()
    check(
      'all 22 wilayat are seeded',
      Array.isArray(rows) && rows.length === 22,
      `${Array.isArray(rows) ? rows.length : '?'} rows`,
    )
  }

  await readable('campaigns', 'the campaign catalogue is readable without signing in')
  await readable('providers_public', 'the public view of campaign owners exists')
  // Reviews are public too, and their policy calls is_admin() — the same shape
  // of dependency that broke the catalogue for signed-out visitors.
  await readable('reviews', 'published reviews are readable without signing in')

  /*
   * The view that puts a name under a review.
   *
   * Every byline on the site reads `user_name`, which lives on `profiles` and
   * is unreachable from a client query — so without this view they are all
   * blank. The application falls back to the bare table when it is missing, so
   * a failure here is cosmetic rather than fatal; it still means
   * 20260903000100_reviews_public.sql has not been applied.
   */
  {
    const res = await rest('reviews_public?select=user_name&limit=1')
    check(
      "reviews carry their author's name (reviews_public)",
      res.status === 200,
      res.status === 404 || res.status === 400
        ? 'not found — apply 20260903000100_reviews_public.sql'
        : `HTTP ${res.status}`,
    )
  }

  /*
   * A hidden review must not escape through the view.
   *
   * `reviews_public` is a definer view, so it does not consult `reviews_read`
   * and has to reproduce that policy's predicate itself. If it ever stopped
   * doing so, every review an administrator had taken down would be published
   * to anonymous visitors — which is precisely what a definer view makes
   * possible, and why this is asserted rather than assumed.
   */
  {
    const res = await rest('reviews_public?select=id&hidden=is.true&limit=1')
    const body = await res.text()
    let rows = []
    try {
      rows = JSON.parse(body)
    } catch {
      rows = []
    }
    check(
      'hidden reviews stay hidden in the public view',
      res.status !== 200 || (Array.isArray(rows) && rows.length === 0),
      `HTTP ${res.status}, ${Array.isArray(rows) ? rows.length : '?'} row(s)`,
    )
  }

  console.log('\n--- what a stranger with the public key can NOT read ---------\n')

  await hidden('profiles', 'the account directory is closed')
  await hidden('bookings', 'bookings are closed')
  await hidden('travellers', 'passport and civil-ID numbers are closed')
  await hidden('notifications', 'notifications are closed')
  await hidden('admin_audit', 'the administration audit trail is closed')

  /*
   * The permit scans. This is the check that used to lie.
   *
   * `providers` holds the uploaded trade permit, the owner's private phone
   * number and the account id behind the company. The old assertion here read
   *
   *     permit.status === 200 || permit.status === 404 || permit.status === 401
   *
   * which is every status this request can plausibly return — so it passed
   * while the table was genuinely world-readable, and went on passing for as
   * long as it existed. A test that cannot fail is worse than no test: it
   * occupies the place where the real one would have gone.
   *
   * The table must now refuse an anonymous caller outright. `providers_read` is
   * scoped to the owner and administrators, and SELECT is revoked from `anon`,
   * so the expected answer is 401 — not an empty array, and certainly not rows.
   */
  const permit = await rest('providers?select=licence_image&limit=1')
  const permitBody = await permit.text()
  check(
    'the providers table itself is closed to the public key',
    permit.status === 401 || permit.status === 403,
    `HTTP ${permit.status} ${permitBody.slice(0, 90)}`,
  )

  /*
   * And the queue of proposed changes to that evidence.
   *
   * `provider_profile_changes` holds a company's next legal name and the path
   * to its next permit, so an anonymous read would leak both — and would leak
   * them *before* an administrator has agreed the change is legitimate. The
   * policy is owner-or-admin and SELECT is granted only to `authenticated`, so
   * 401 is the expected answer here too.
   */
  const proposals = await rest('provider_profile_changes?select=proposed&limit=1')
  const proposalsBody = await proposals.text()
  if (proposals.status === 404) {
    // PostgREST answers 404 for a table it cannot see in its schema cache, which
    // on this project means the migration has not been applied rather than that
    // the table is open. Reported as its own failure so the message names the
    // actual fix.
    check('provider_profile_changes exists', false, 'not found — apply 20260906000100')
  } else {
    check(
      'proposed owner profile changes are closed to the public key',
      proposals.status === 401 || proposals.status === 403,
      `HTTP ${proposals.status} ${proposalsBody.slice(0, 90)}`,
    )
  }

  // ...and the view that replaces it must not carry the columns either. Asked
  // for by name, so this reports the truth even on a project with no owners
  // registered yet — the old column check silently skipped itself in exactly
  // that case, which is every fresh project.
  for (const column of ['licence_image', 'licence_path', 'phone', 'email', 'owner_id']) {
    const res = await rest(`providers_public?select=${column}&limit=1`)
    check(
      `providers_public has no ${column} column`,
      res.status !== 200,
      `HTTP ${res.status}`,
    )
  }

  /*
   * The bucket the permits moved to.
   *
   * A *public* Storage bucket serves every object it holds to anyone who knows
   * or can guess the path, and no policy undoes that — so the property worth
   * asserting is the bucket's own flag, not a policy on top of it. The public
   * object route answers 400 for a private bucket and 404 for a missing object
   * in a public one, which is the distinction this looks for.
   */
  const bucketProbe = await fetch(
    `${url}/storage/v1/object/public/provider-licences/probe.jpg`,
    { headers: { apikey: key } },
  )
  check(
    'the provider-licences bucket is not public',
    bucketProbe.status !== 200 && bucketProbe.status !== 404,
    `HTTP ${bucketProbe.status}`,
  )

  console.log('\n--- can the public key grant itself anything? ----------------\n')

  const isAdmin = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const isAdminBody = await isAdmin.text()
  check(
    'is_admin() answers false for an unauthenticated caller',
    isAdmin.status === 200 && isAdminBody.trim() === 'false',
    `HTTP ${isAdmin.status} ${isAdminBody.slice(0, 40)}`,
  )

  /*
   * The booking transaction and its inverse.
   *
   * Both are SECURITY DEFINER — they lock and decrement `campaigns`, which no
   * ordinary caller may update — so an anonymous caller reaching either would
   * be a way to alter seat counts without an account. 404 here means the
   * migration has not been applied; anything but 200 means it is closed.
   */
  /*
   * Every required argument has to be sent, even to prove a function is closed.
   *
   * PostgREST resolves an RPC by the exact set of *named* arguments it is
   * given, and answers 404 when no overload matches. Probing `book_campaign`
   * with two of its five required parameters therefore reported "not found" for
   * a function that was present and correctly locked — a false alarm that sent
   * someone to re-apply a migration they had already applied. A 404 here means
   * the signature does not exist; it does not mean the function does not.
   */
  for (const [fn, body] of [
    [
      'book_campaign',
      {
        p_campaign_id: '00000000-0000-0000-0000-000000000000',
        p_travellers: [],
        p_contact_name: 'probe',
        p_contact_phone: 'probe',
        p_contact_email: 'probe@example.com',
      },
    ],
    ['cancel_booking', { p_booking_id: '00000000-0000-0000-0000-000000000000' }],
  ]) {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 404) {
      check(`${fn}() exists`, false, 'not found — apply 20260901000700_booking_transaction.sql')
    } else {
      check(`${fn}() is unreachable with the public key`, res.status !== 200, `HTTP ${res.status}`)
    }
  }

  /*
   * The functions that decide what an account *is*.
   *
   * Every one of these changes a role, a verification badge or a company's
   * standing, and every one is granted to `authenticated` or `service_role`
   * only. Reachable with the anon key, any of them would be a way to promote
   * yourself; `set_provider_status` in particular would hand out the "Verified
   * by NASEK" badge that the entire platform's trust rests on.
   */
  for (const [fn, body] of [
    ['promote_to_admin', { target_email: 'attacker@example.com' }],
    ['demote_admin', { target_email: 'someone@example.com' }],
    [
      'set_provider_status',
      {
        p_provider_id: '00000000-0000-0000-0000-000000000000',
        p_status: 'verified',
        p_reason: null,
      },
    ],
    ['register_provider', { p_name_ar: 'probe', p_name_en: 'probe' }],
    ['resubmit_provider', { p_name_ar: 'probe', p_name_en: 'probe' }],
    /*
     * Approving a campaign, which is the decision this whole release exists
     * around. Reachable with the public key, it would let anyone publish a trip
     * to the catalogue with no company verified and nobody having read it —
     * which is precisely the state 20260904000300 was written to end.
     */
    [
      'set_campaign_status',
      {
        p_campaign_id: '00000000-0000-0000-0000-000000000000',
        p_status: 'active',
        p_reason: null,
      },
    ],
    /*
     * Profile editing, both halves.
     *
     * `submit_provider_profile` decides for itself which of a company's fields
     * are marketing and which are the evidence NASEK verified them on — so an
     * anonymous caller reaching it would be a caller proposing changes to
     * somebody else's licence. `review_provider_changes` is the other end:
     * reachable, it would let anyone approve their own proposal, which is the
     * exact bypass the review queue exists to prevent.
     *
     * Both are granted to `authenticated` and check authorisation in their own
     * bodies — `auth.uid()` for the owner, `is_admin()` for the reviewer — so a
     * 401 here is the grant doing its job before either body runs.
     */
    ['submit_provider_profile', { p_phone: '+96890000000' }],
    [
      'review_provider_changes',
      {
        p_change_id: '00000000-0000-0000-0000-000000000000',
        p_approve: true,
        p_reason: null,
      },
    ],
  ]) {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 404) {
      /*
       * A 404 is "this signature is not deployed", not "this is open".
       *
       * Reported rather than passed over, because on a project that has not yet
       * had the 2026-09-04 migrations applied that is exactly what you want to
       * be told — and reported as a failure rather than a skip, because a
       * privileged function the client half of this release calls, missing from
       * the database, is a broken deployment and not a configuration choice.
       */
      check(`${fn}() exists`, false, 'not found — a migration has not been applied')
    } else {
      check(`${fn}() is unreachable with the public key`, res.status !== 200, `HTTP ${res.status}`)
    }
  }

  /*
   * ...and the one that has to answer, because a policy calls it.
   *
   * `campaigns_read` asks `provider_approved()` before showing a trip to a
   * signed-out visitor. Postgres evaluates a policy's whole expression without
   * promising to short-circuit, so an anonymous caller who cannot execute this
   * gets a 401 on the entire public catalogue — the exact failure that
   * 20260901000600 exists to document. It is safe to expose: it reports the
   * badge already printed on every campaign card.
   */
  const approved = await fetch(`${url}/rest/v1/rpc/provider_approved`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: '00000000-0000-0000-0000-000000000000' }),
  })
  const approvedBody = await approved.text()
  check(
    'provider_approved() is callable anonymously, so the catalogue can be read',
    approved.status === 200 && approvedBody.trim() === 'false',
    `HTTP ${approved.status} ${approvedBody.slice(0, 40)}`,
  )

  console.log('\n--- is sign-in configured? ----------------------------------\n')

  const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json()
  check('email sign-in is enabled', settings.external?.email === true)
  check(
    'sign-up is open, so a first-time code creates the account',
    settings.disable_signup === false,
    settings.disable_signup ? 'disable_signup is ON — new pilgrims cannot register' : '',
  )
  check(
    'the code must be entered, not auto-confirmed',
    settings.mailer_autoconfirm === false,
    settings.mailer_autoconfirm ? 'mailer_autoconfirm is ON — anyone can claim any address' : '',
  )
  if (settings.external?.phone !== true) {
    console.log('SKIP  phone sign-in is not configured (expected — see docs/SUPABASE.md §6)')
  } else {
    check('phone sign-in is enabled', true)
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
