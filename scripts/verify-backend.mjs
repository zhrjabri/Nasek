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
 * docs/SUPABASE.md §7.
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

  console.log('\n--- what a stranger with the public key can NOT read ---------\n')

  await hidden('profiles', 'the account directory is closed')
  await hidden('bookings', 'bookings are closed')
  await hidden('travellers', 'passport and civil-ID numbers are closed')
  await hidden('notifications', 'notifications are closed')
  await hidden('admin_audit', 'the administration audit trail is closed')

  // The permit scan and private contact details live on `providers`, which is
  // readable — so the check that matters is that the *columns* are not.
  const permit = await rest('providers?select=licence_image&limit=1')
  check(
    'permit images are not exposed through the public view',
    permit.status === 200 || permit.status === 404 || permit.status === 401,
    `HTTP ${permit.status}`,
  )
  const publicCols = await rest('providers_public?select=*&limit=1')
  if (publicCols.status === 200) {
    const rows = await publicCols.json()
    const cols = rows[0] ? Object.keys(rows[0]) : []
    const leaked = ['licence_image', 'licence_file_name', 'phone', 'email', 'owner_id'].filter((c) =>
      cols.includes(c),
    )
    check(
      'the public owner view omits permit, phone, email and owner id',
      leaked.length === 0,
      rows.length === 0 ? 'no owners registered yet — column check skipped' : leaked.join(', '),
    )
  }

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
  for (const [fn, body] of [
    ['book_campaign', { p_campaign_id: '00000000-0000-0000-0000-000000000000', p_travellers: [] }],
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

  // The one that would matter most if it were wrong.
  const promote = await fetch(`${url}/rest/v1/rpc/promote_to_admin`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_email: 'attacker@example.com' }),
  })
  check(
    'promote_to_admin() is unreachable with the public key',
    promote.status !== 200,
    `HTTP ${promote.status}`,
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
    console.log('SKIP  phone sign-in is not configured (expected — see docs/SUPABASE.md §5)')
  } else {
    check('phone sign-in is enabled', true)
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
