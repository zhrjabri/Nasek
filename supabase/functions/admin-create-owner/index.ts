/**
 * NASEK — taking on a campaign owner.
 *
 * Public self-registration is gone. An administrator enters the company's
 * details, reads and uploads the operating permit, and presses a button; this
 * function does the two things that cannot be done from a browser or from SQL:
 *
 *   1. Creates the auth account and sends an invitation, using the service
 *      role. There is no other way to create a user for somebody else.
 *   2. Calls `admin_create_provider`, which writes the company row and promotes
 *      the account to `provider` inside one transaction with its own audit
 *      entry — because what a company row may contain is a database concern and
 *      should not be reimplemented here.
 *
 * WHO MAY CALL IT
 *
 * An administrator, and the check is asked of Postgres rather than believed.
 * The caller's own bearer token is used to call `is_admin()`, which runs inside
 * the database against a signature this function cannot forge and the caller
 * cannot influence. The service-role client is constructed only after that
 * answer comes back true.
 *
 * That ordering is the whole security property. A service-role client can do
 * anything; the only thing standing between this endpoint and "create me an
 * administrator" is that it is never reached without a real admin session, and
 * that the RPC below can only ever create a `provider`.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'
import { json, preflight } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/**
 * Where the invitation link lands.
 *
 * The Campaign Owner Portal, which is a different host from the administration
 * dashboard this request came from. Getting it wrong is invisible until an
 * owner clicks the link and arrives at an application that will not let them
 * in — so it is a secret of this function rather than something inferred from
 * the request's origin, which would be the administrator's host every time.
 */
const OWNER_PORTAL_URL = (Deno.env.get('NASEK_OWNER_PORTAL_URL') ?? '').trim()

interface Payload {
  email?: string
  contactName?: string
  companyName?: string
  tagline?: string
  description?: string
  wilayahId?: string
  governorate?: string
  address?: string
  experienceYears?: number
  phone?: string
  commercialRegistration?: string
  permitNumber?: string
  permitExpiry?: string
  licencePath?: string
  licenceFileName?: string
  licenceMime?: string
  verification?: 'verified' | 'pending'
}

const clean = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

Deno.serve(async (request) => {
  const pre = preflight(request)
  if (pre) return pre

  if (request.method !== 'POST') {
    return json(request, { ok: false, error: 'method_not_allowed' }, 405)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json(request, { ok: false, error: 'not_configured' }, 500)
  }

  // ------------------------------------------------- is the caller an admin?
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return json(request, { ok: false, error: 'forbidden' }, 403)
  }

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: isAdmin, error: roleError } = await asCaller.rpc('is_admin')
  if (roleError || isAdmin !== true) {
    return json(request, { ok: false, error: 'forbidden' }, 403)
  }

  // ----------------------------------------------------------- the payload
  let body: Payload
  try {
    body = (await request.json()) as Payload
  } catch {
    return json(request, { ok: false, error: 'bad_request' }, 400)
  }

  const email = clean(body.email).toLowerCase()
  const companyName = clean(body.companyName)
  const licencePath = clean(body.licencePath)

  if (!/^\S+@\S+\.\S+$/.test(email) || !companyName) {
    return json(request, { ok: false, error: 'bad_request' }, 400)
  }
  /*
   * The permit, checked here as well as in the RPC.
   *
   * The database refuses a company with nothing on file, so this is not the
   * control — it is the difference between a clear answer and a Postgres error
   * string surfacing in an administrator's toast. Both checks are cheap.
   */
  if (!licencePath) {
    return json(request, { ok: false, error: 'permit_required' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  /*
   * The account. Invited rather than created outright, so the owner sets their
   * own password from a link and NASEK never holds one it chose for them.
   *
   * An address that already has an account is the interesting case and it is
   * not an error: a company owner may well have booked an Umrah trip as a
   * pilgrim last year. Reusing that account is right — it is the same person —
   * so the invitation falls back to a recovery link, which lands on the same
   * portal screen and sets a password just the same.
   */
  let ownerId = ''
  let invited = false

  const invite = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: OWNER_PORTAL_URL || undefined,
  })

  if (invite.data?.user?.id) {
    ownerId = invite.data.user.id
    invited = true
  } else {
    // Already registered. Find them, and send a link that sets a password.
    const { data: existing, error: lookupError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('email', email)
      .maybeSingle()

    if (lookupError || !existing) {
      return json(request, { ok: false, error: 'invite_failed' }, 500)
    }
    if (existing.role === 'admin') {
      // An administrator promoted to `provider` would be locked out of the
      // dashboard they are standing in. `register_provider` refused this too.
      return json(request, { ok: false, error: 'is_admin_account' }, 400)
    }
    ownerId = existing.id as string

    const recovery = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: OWNER_PORTAL_URL || undefined },
    })
    invited = !recovery.error
  }

  // ------------------------------------------------------------ the company
  const { data: provider, error: createError } = await admin.rpc('admin_create_provider', {
    p_owner_id: ownerId,
    // One name, typed once, stored under both languages. NASEK does not ask an
    // administrator to transliterate a company name they were given.
    p_name_ar: companyName,
    p_name_en: companyName,
    p_tagline: clean(body.tagline),
    p_description: clean(body.description),
    p_wilayah_id: clean(body.wilayahId) || null,
    p_governorate: clean(body.governorate) || null,
    p_address: clean(body.address) || null,
    p_experience_years: Number(body.experienceYears) || 0,
    p_phone: clean(body.phone) || null,
    p_email: email,
    p_commercial_registration: clean(body.commercialRegistration) || null,
    p_permit_number: clean(body.permitNumber) || null,
    // Empty means "no expiry", which is a real thing. Postgres will not coerce
    // '' to `date`, so it has to become null before it gets there.
    p_permit_expiry: clean(body.permitExpiry) || null,
    p_licence_path: licencePath,
    p_licence_file_name: clean(body.licenceFileName) || null,
    p_licence_mime: clean(body.licenceMime) || null,
    p_verification: body.verification === 'pending' ? 'pending' : 'verified',
  })

  if (createError) {
    /*
     * The database's own message is passed through.
     *
     * "This account already has a registered campaign" and "A copy of the
     * operating permit is required" are two different mistakes with two
     * different fixes, and the administrator is the only person who can make
     * either of them.
     */
    return json(request, { ok: false, error: 'create_failed', detail: createError.message }, 400)
  }

  return json(request, { ok: true, providerId: provider?.id ?? null, invited }, 200)
})
