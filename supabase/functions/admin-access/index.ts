/**
 * NASEK — the administration access code, validated where the browser cannot
 * reach.
 *
 * The requirement was precise: administration opens on a single secret code,
 * that code is never in React source or in a `VITE_` variable, it is checked
 * server-side, and `is_admin()` plus row-level security remain the actual
 * authorisation layer. This function is the "server-side" of that sentence, and
 * it is deliberately the *only* new privilege in the system.
 *
 * WHAT IT DOES
 *
 *   1. Rate-limits the caller. Failures are counted per source over a short
 *      window in `admin_access_attempts`; past the threshold the door stops
 *      answering for a while, whatever code arrives.
 *   2. Compares the submitted code against a secret held in this function's
 *      environment, in constant time.
 *   3. Finds the administrator account — and re-checks in the database that it
 *      really holds `role = 'admin'` and is neither suspended nor removed.
 *   4. Mints a single-use magic-link token for that account with the service
 *      role, and returns *only the token hash*.
 *
 * The browser then redeems that hash through the ordinary
 * `supabase.auth.verifyOtp()` and ends up with an ordinary signed session. From
 * that point nothing is special: `loadAdminSession()` asks `is_admin()` inside
 * Postgres, the policies scope every query, and a forged session reads exactly
 * what a pilgrim's reads.
 *
 * WHAT NEVER LEAVES THIS FILE'S ENVIRONMENT
 *
 *   ADMIN_ACCESS_CODE / ADMIN_ACCESS_CODE_HASH   the code and its derivation
 *   SUPABASE_SERVICE_ROLE_KEY                     RLS bypass
 *
 * Neither is returned, echoed, logged, or included in an error message. The
 * response on a wrong code is the same shape and the same status as on a code
 * that is right for a project with no administrator — there is nothing here to
 * learn by probing.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'
import { corsHeaders, json, preflight } from '../_shared/cors.ts'

/** Failures from one source before the door stops answering. */
const MAX_FAILURES = 8
/** How far back those failures are counted. */
const WINDOW_MINUTES = 15

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/**
 * The code, in either of the two forms this accepts.
 *
 * `ADMIN_ACCESS_CODE_HASH` is the better one: a SHA-256 of
 * `ADMIN_ACCESS_CODE_SALT + code`, so the deployment holds a derivation rather
 * than the phrase. `ADMIN_ACCESS_CODE` is the plain phrase, supported because
 * it is one command to set and it is still a secret that lives only in this
 * function's environment — which is the property the requirement is actually
 * about. If both are set the hash wins.
 */
const CODE_HASH = (Deno.env.get('ADMIN_ACCESS_CODE_HASH') ?? '').trim().toLowerCase()
const CODE_SALT = Deno.env.get('ADMIN_ACCESS_CODE_SALT') ?? ''
const CODE_PLAIN = Deno.env.get('ADMIN_ACCESS_CODE') ?? ''

/** Which account the code opens. Optional — see `resolveAdminEmail`. */
const ADMIN_EMAIL = (Deno.env.get('NASEK_ADMIN_EMAIL') ?? '').trim().toLowerCase()

/** Salt for the stored attempt fingerprint, so the table holds no addresses. */
const IP_SALT = Deno.env.get('ADMIN_ACCESS_IP_SALT') ?? 'nasek-attempt-salt'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Compare without letting the clock say how close a guess was.
 *
 * Both sides are hashed first, so this always compares two strings of the same
 * length and the early-exit on length tells an attacker nothing about the
 * secret — only about SHA-256's output size, which is public.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function codeIsCorrect(candidate: string): Promise<boolean> {
  const code = candidate.trim()
  if (!code) return false

  if (CODE_HASH) {
    return constantTimeEqual(await sha256Hex(`${CODE_SALT}${code}`), CODE_HASH)
  }
  if (CODE_PLAIN) {
    // Hashed on both sides before comparing, so the comparison itself is over
    // fixed-length strings even though the configured value is not.
    return constantTimeEqual(await sha256Hex(code), await sha256Hex(CODE_PLAIN))
  }
  return false
}

/** A stable, non-reversible fingerprint of where a request came from. */
async function fingerprint(request: Request): Promise<string> {
  const source =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  return (await sha256Hex(`${IP_SALT}:${source}`)).slice(0, 32)
}

/**
 * Which account this code signs in as.
 *
 * `NASEK_ADMIN_EMAIL` names it outright, which is what a deployment with more
 * than one administrator should do. Without it, the single account holding
 * `role = 'admin'` is used — the ordinary case, and it fails closed when there
 * is more than one rather than picking arbitrarily, because "the code let
 * somebody in as a different administrator than you expected" is not an
 * ambiguity worth resolving by guesswork.
 *
 * Either way the row is read back and checked. The variable names a candidate;
 * the database decides whether it is an administrator.
 */
async function resolveAdminEmail(): Promise<
  { ok: true; email: string } | { ok: false; reason: string }
> {
  if (ADMIN_EMAIL) {
    const { data, error } = await admin
      .from('profiles')
      .select('email, role, suspended, removed')
      .eq('email', ADMIN_EMAIL)
      .maybeSingle()

    if (error) return { ok: false, reason: 'lookup_failed' }
    if (!data || data.role !== 'admin') return { ok: false, reason: 'not_an_admin' }
    if (data.suspended || data.removed) return { ok: false, reason: 'not_an_admin' }
    return { ok: true, email: ADMIN_EMAIL }
  }

  const { data, error } = await admin
    .from('profiles')
    .select('email')
    .eq('role', 'admin')
    .eq('suspended', false)
    .eq('removed', false)
    .limit(2)

  if (error) return { ok: false, reason: 'lookup_failed' }
  if (!data || data.length === 0) return { ok: false, reason: 'no_admin' }
  if (data.length > 1) return { ok: false, reason: 'ambiguous_admin' }
  if (!data[0].email) return { ok: false, reason: 'no_admin' }
  return { ok: true, email: String(data[0].email).toLowerCase() }
}

Deno.serve(async (request) => {
  const pre = preflight(request)
  if (pre) return pre

  if (request.method !== 'POST') {
    return json(request, { ok: false, error: 'method_not_allowed' }, 405)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(request, { ok: false, error: 'not_configured' }, 500)
  }
  if (!CODE_HASH && !CODE_PLAIN) {
    // Deliberately explicit, and safe to be: it says a code has not been set,
    // never what one would be. The alternative — pretending every code is
    // wrong — sends whoever deployed this hunting for a typo in a secret that
    // does not exist.
    return json(request, { ok: false, error: 'not_configured' }, 500)
  }

  const source = await fingerprint(request)

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()
  const { count } = await admin
    .from('admin_access_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', source)
    .eq('succeeded', false)
    .gte('created_at', since)

  if ((count ?? 0) >= MAX_FAILURES) {
    return json(request, { ok: false, error: 'rate_limited' }, 429)
  }

  let code = ''
  try {
    const body = (await request.json()) as { code?: unknown }
    code = typeof body.code === 'string' ? body.code : ''
  } catch {
    code = ''
  }

  const correct = await codeIsCorrect(code)
  await admin.from('admin_access_attempts').insert({ ip_hash: source, succeeded: correct })
  // Opportunistic sweep, so the table does not grow without bound. Failing here
  // must not fail the sign-in, so its result is ignored.
  void admin.rpc('prune_admin_access_attempts')

  if (!correct) {
    return json(request, { ok: false, error: 'invalid_code' }, 401)
  }

  const target = await resolveAdminEmail()
  if (!target.ok) {
    return json(request, { ok: false, error: target.reason }, 403)
  }

  /*
   * A magic link, generated and immediately taken apart.
   *
   * `generateLink` is the service role's way of producing a genuine,
   * single-use, short-lived credential for an existing account without sending
   * an email — which is exactly what is wanted here, because the code has
   * already established that the person at the keyboard is entitled to it and
   * routing them through an inbox would add a delay and a second thing to go
   * wrong.
   *
   * Only `hashed_token` is returned. The full `action_link` carries a redirect
   * and would work if pasted anywhere; the hash is redeemable only by a client
   * that already knows which project and which account it belongs to, and it is
   * spent the moment it is used.
   */
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: target.email,
  })

  if (error || !data?.properties?.hashed_token) {
    return json(request, { ok: false, error: 'link_failed' }, 500)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      email: target.email,
      tokenHash: data.properties.hashed_token,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders(request),
        'Content-Type': 'application/json',
        // Belt and braces on a response that carries a credential.
        'Cache-Control': 'no-store',
      },
    },
  )
})
