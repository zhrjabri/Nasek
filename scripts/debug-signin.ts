/*
 * Walk a sign-in link through the real code, printing every step.
 *
 *   npm run debug:signin -- "<paste the link from your email>"
 *
 * This exists because the sign-in failure could not be observed. There is no
 * inbox to read and no browser console to watch from here, so three rounds of
 * fixes were reasoned from the symptom rather than from evidence — which is a
 * bad way to fix anything and, on the evidence, did not work.
 *
 * It imports the same parser and the same Supabase client the application uses,
 * so what it reports is what the app would do, not an approximation of it. Each
 * stage prints what it received and what it produced, and the first one that
 * fails says exactly why.
 *
 * The token in the link is single-use: running this consumes it, exactly as the
 * app would. If it succeeds, you are signed in — in this terminal rather than
 * in the browser — which is itself the answer to "is the token good".
 */
import { parseSignInLink } from '@/services/auth/redirect'
import { supabase } from '@/services/supabase/client'

const step = (n: number, label: string) => console.log(`\n[${n}] ${label}\n${'-'.repeat(60)}`)
const ok = (msg: string) => console.log(`  OK    ${msg}`)
const bad = (msg: string) => console.log(`  FAIL  ${msg}`)
const info = (msg: string) => console.log(`        ${msg}`)

async function main() {
  const raw = process.argv.slice(2).join(' ').trim()

  step(0, 'Configuration')
  if (!supabase) {
    bad('No Supabase client — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env')
    process.exitCode = 1
    return
  }
  ok(`client created against ${import.meta.env.VITE_SUPABASE_URL}`)

  /*
   * `--send` first, because a stale link is the likeliest explanation of all
   * and the hardest to rule out by looking. Requesting a code invalidates the
   * previous one, so after a few attempts every link in the inbox is dead
   * except the newest — and they are indistinguishable on screen.
   */
  if (raw.startsWith('--send')) {
    const email = raw.replace('--send', '').trim()
    if (!email) {
      bad('Usage: npm run debug:signin -- --send you@example.com')
      process.exitCode = 1
      return
    }
    step(1, `Requesting a fresh sign-in email for ${email}`)
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    if (sendError) {
      bad(`${sendError.message}`)
      if (/rate|limit|seconds/i.test(sendError.message)) {
        info('')
        info('Rate limited. The built-in mail service allows only a few messages')
        info('per hour, and every earlier attempt spent one. Wait, or configure')
        info('your own SMTP — see docs/SUPABASE.md.')
      }
      process.exitCode = 1
      return
    }
    ok('sent — this is now the ONLY link that will work')
    info('')
    info('Open the email, do NOT click the link, copy it, then run:')
    info('  npm run debug:signin -- "<paste the link here, in quotes>"')
    return
  }

  if (!raw) {
    bad('No link given.')
    info('Usage:')
    info('  npm run debug:signin -- --send you@example.com     request a fresh one')
    info('  npm run debug:signin -- "<link>"                   redeem it')
    process.exitCode = 1
    return
  }

  step(1, 'What was pasted')
  info(`${raw.length} characters`)
  info(`starts: ${raw.slice(0, 80)}`)
  if (raw.includes('&amp;')) info('contains &amp; — HTML-escaped, decoded by the parser')
  if (/^https:\/\/www\.google\.com\/url\?/.test(raw)) info('Gmail redirector — unwrapped by the parser')

  step(2, 'Parsing the link')
  const parsed = parseSignInLink(raw)
  if (!parsed) {
    bad('No token found in that text.')
    info('The parser looks for ?token= or ?token_hash= plus &type=.')
    info('Copy the whole link — "Copy link address", not the visible text.')
    process.exitCode = 1
    return
  }
  ok(`type       = ${parsed.type}`)
  ok(`token_hash = ${parsed.tokenHash.slice(0, 14)}… (${parsed.tokenHash.length} chars)`)

  if (parsed.tokenHash.startsWith('pkce_')) {
    bad('This is a PKCE token — it cannot be redeemed from a paste.')
    info('It was issued while the app used the PKCE flow. Request a NEW email;')
    info('the app now asks for the implicit flow, whose tokens redeem anywhere.')
    process.exitCode = 1
    return
  }

  step(3, 'Redeeming it (supabase.auth.verifyOtp)')
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: parsed.tokenHash,
    type: parsed.type,
  })

  if (error) {
    bad(`${error.name}: ${error.message}`)
    info(`status ${error.status ?? '—'}`)
    if (/expired|invalid/i.test(error.message)) {
      info('')
      info('This one message covers three different situations:')
      info('  a) the link was already used — clicking it, or a mail scanner')
      info('     prefetching it, consumes the token;')
      info('  b) the link is older than the expiry window;')
      info('  c) a NEWER email was requested — issuing a code invalidates the')
      info('     previous one, so only the most recent link ever works.')
      info('')
      info('Request one fresh email, do not open the link, copy it, run this.')
    }
    process.exitCode = 1
    return
  }

  ok('token accepted')
  info(`user id  = ${data.user?.id}`)
  info(`email    = ${data.user?.email}`)
  info(`confirmed= ${data.user?.email_confirmed_at ?? 'no'}`)
  info(`session  = ${data.session ? 'issued' : 'NONE — this would leave the app signed out'}`)
  if (!data.session) {
    bad('Verified, but no session was returned.')
    process.exitCode = 1
    return
  }

  step(4, 'Reading the profile (what the app gates on)')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user!.id)
    .maybeSingle()

  if (profileError) {
    bad(`profiles query failed: ${profileError.message}`)
    info('The app treats this as "not signed in yet" and waits, then gives up.')
    info('Check that 20260901000200_rls_policies.sql granted SELECT to authenticated.')
    process.exitCode = 1
    return
  }
  if (!profile) {
    bad('No profile row for this account.')
    info('handle_new_user() should create one when the auth user is inserted.')
    info('Without it the app can never resolve who you are, so it shows the')
    info('public site however valid the session is.')
    process.exitCode = 1
    return
  }

  const row = profile as Record<string, unknown>
  ok(`role      = ${row.role}`)
  ok(`suspended = ${row.suspended} | removed = ${row.removed}`)
  info(`name      = ${row.name || '(blank — the app falls back to the address)'}`)

  step(5, 'Where the app would send you')
  const role = String(row.role)
  if (row.suspended || row.removed) {
    bad('Barred by an administrator — the app would refuse the sign-in.')
  } else {
    ok(role === 'provider' ? '/provider' : '/dashboard')
    if (role === 'admin') {
      info('An administrator signing in on the public site lands on /dashboard;')
      info('the dashboard is the other application, on port 5174.')
    }
  }

  console.log('\nEVERY STEP PASSED — the token, the session and the profile are all good.')
  console.log('If the browser still fails with a fresh link, the fault is in the UI layer.\n')
}

void main()
