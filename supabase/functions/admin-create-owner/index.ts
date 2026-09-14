/**
 * NASEK — an administrator creates a campaign owner.
 *
 * An administrator enters the company's details, uploads the operating permit,
 * and sets the owner's sign-in email and a temporary password. This function
 * creates the auth account with that password and writes the company, and the
 * owner signs in at the Campaign Owner Portal with the email and password.
 *
 * Nothing is emailed. There is no invitation, no link, and no dependency on
 * SMTP or Resend: the administrator passes the temporary password on
 * themselves. What happens after the caller is known is in `flow.ts` —
 * including how a half-finished creation is undone.
 *
 * WHO MAY CALL IT
 *
 * An administrator, and the check is asked of Postgres rather than believed.
 * The caller's own bearer token is used to call `is_admin()`, which runs inside
 * the database against a signature this function cannot forge and the caller
 * cannot influence — and which, since 20260913000200, refuses a session that
 * signed in with a password. The service-role client is constructed only after
 * that answer comes back true.
 *
 * That ordering is the whole security property. A service-role client can do
 * anything; the only thing standing between this endpoint and "create me an
 * administrator" is that it is never reached without a real admin session, and
 * that `admin_create_provider` can only ever create a `provider`.
 *
 * The request body carries a password. It is not logged here or in `flow.ts`,
 * and no response or error detail contains it.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'
import { json, preflight } from '../_shared/cors.ts'
import { createOwner, type ServiceClient } from './flow.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
  const token = auth.slice('bearer '.length).trim()

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: isAdmin, error: roleError } = await asCaller.rpc('is_admin')
  if (roleError || isAdmin !== true) {
    return json(request, { ok: false, error: 'forbidden' }, 403)
  }

  /*
   * Who, as well as whether. The permit was uploaded into this administrator's
   * own folder, and `flow.ts` holds the request to that folder — both for the
   * company row and for deleting the file again if creation fails.
   */
  const { data: caller, error: callerError } = await asCaller.auth.getUser(token)
  if (callerError || !caller?.user?.id) {
    return json(request, { ok: false, error: 'forbidden' }, 403)
  }

  // ----------------------------------------------------------- the payload
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(request, { ok: false, error: 'bad_request' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const outcome = await createOwner(admin as unknown as ServiceClient, caller.user.id, body)
  return json(request, outcome.body, outcome.status)
})
