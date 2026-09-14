/**
 * NASEK — creating a campaign owner's account and company, and undoing the
 * account when the company cannot be written.
 *
 * Kept apart from `index.ts` so it has no Deno globals and no remote imports:
 * the service-role client arrives as an argument, which is what lets
 * `scripts/verify-owner-create.ts` drive every failure path below from Node
 * with a stand-in client, instead of against production.
 *
 * `index.ts` has already established that the caller is an administrator
 * before this is reached. Nothing here re-decides that.
 *
 * THE ORDER, AND WHY
 *
 *   1. Check everything that can be checked without creating anything.
 *   2. Create the auth user, with the password the administrator chose.
 *   3. Write the company through `admin_create_provider`.
 *   4. If 3 failed, delete the user from 2 — only that one, and only when no
 *      company row points at it — and discard the uploaded permit.
 *
 * Auth and Postgres cannot share a transaction, so 4 is compensation rather
 * than a rollback, and it is written to fail towards keeping data: when it
 * cannot prove a deletion is safe, it does not delete, and says so.
 *
 * THE PASSWORD
 *
 * Read from the request body, checked, handed to `auth.admin.createUser`, and
 * dropped. GoTrue stores a bcrypt hash of it. It is never written to a table,
 * never logged, and never part of a response or an error detail —
 * `verify-owner-create` sends a marker password through every path and fails
 * if the marker comes back out anywhere.
 */
import { temporaryPasswordProblem } from './password.ts'

export const LICENCE_BUCKET = 'provider-licences'

interface ErrorLike {
  message: string
  code?: string
  status?: number
}

/**
 * The part of the service-role client this uses — structural, so a stand-in
 * satisfies it without supabase-js. `index.ts` passes the real client.
 */
export interface ServiceClient {
  auth: {
    admin: {
      createUser(attributes: {
        email: string
        password: string
        email_confirm: boolean
        user_metadata?: Record<string, unknown>
      }): Promise<{ data: { user: { id: string } | null } | null; error: ErrorLike | null }>
      deleteUser(id: string, shouldSoftDelete?: boolean): Promise<{ error: ErrorLike | null }>
    }
  }
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: ErrorLike | null }>
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        limit(count: number): PromiseLike<{ data: unknown[] | null; error: ErrorLike | null }>
      }
    }
  }
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<{ error: ErrorLike | null }>
    }
  }
}

export type CreateOwnerErrorCode =
  | 'bad_request'
  | 'permit_required'
  | 'permit_not_yours'
  | 'weak_password'
  | 'email_exists'
  | 'account_failed'
  | 'create_failed'
  | 'cleanup_failed'

export type CreateOwnerResponse =
  | { status: 200; body: { ok: true; providerId: string | null } }
  | {
      status: number
      body: { ok: false; error: CreateOwnerErrorCode; problem?: string; detail?: string }
    }

type Log = (message: string) => void

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const fail = (
  status: number,
  error: CreateOwnerErrorCode,
  extra: { problem?: string; detail?: string } = {},
): CreateOwnerResponse => ({ status, body: { ok: false, error, ...extra } })

/**
 * Is this object path one the caller uploaded?
 *
 * `uploadLicence` always writes `<uid>/<timestamp>-<name>`. Holding the request
 * to that shape does two jobs: a company cannot be created pointing at somebody
 * else's document, and the cleanup below can never be aimed at a file this
 * administrator did not put there.
 */
export function isCallersUpload(path: string, callerId: string): boolean {
  if (!callerId || !path.startsWith(`${callerId}/`)) return false
  const rest = path.slice(callerId.length + 1)
  return rest.length > 0 && !rest.includes('/') && !rest.includes('..')
}

/**
 * Remove an uploaded permit that nothing ended up using.
 *
 * Three conditions, all required: the caller uploaded it; no company points at
 * it; no pending change points at it. The second and third are what stop a
 * resubmitted path — one already attached to a real company — from being
 * deleted because a later request that named it failed. A lookup that errors
 * counts as "in use". An orphaned file costs a few hundred kilobytes; a deleted
 * permit costs a company its verification.
 */
async function discardPermit(
  admin: ServiceClient,
  callerId: string,
  path: string,
  log: Log,
): Promise<void> {
  if (!isCallersUpload(path, callerId)) return
  try {
    for (const table of ['providers', 'provider_profile_changes']) {
      const { data, error } = await admin.from(table).select('id').eq('licence_path', path).limit(1)
      if (error || (data && data.length > 0)) return
    }
    const { error } = await admin.storage.from(LICENCE_BUCKET).remove([path])
    if (error) log(`admin-create-owner: permit cleanup failed: ${error.message}`)
  } catch (thrown) {
    log(`admin-create-owner: permit cleanup threw: ${thrown instanceof Error ? thrown.message : 'unknown'}`)
  }
}

export async function createOwner(
  admin: ServiceClient,
  callerId: string,
  raw: unknown,
  log: Log = (message) => console.error(message),
): Promise<CreateOwnerResponse> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  /*
   * Belt and braces on the one secret in the request. Neither GoTrue nor
   * Postgres is known to quote a password back in an error, and neither is
   * given the chance to reach a log line or a response through this function.
   */
  const secret = typeof body.temporaryPassword === 'string' ? body.temporaryPassword : ''
  const redact = (text: string) => (secret ? text.split(secret).join('[redacted]') : text)

  const response = await run(admin, callerId, body, (message) => log(redact(message)))
  if (!response.body.ok && response.body.detail) {
    response.body.detail = redact(response.body.detail)
  }
  return response
}

async function run(
  admin: ServiceClient,
  callerId: string,
  body: Record<string, unknown>,
  log: Log,
): Promise<CreateOwnerResponse> {
  const email = clean(body.email).toLowerCase()
  const companyName = clean(body.companyName)
  const licencePath = clean(body.licencePath)
  // Not trimmed. A password is exactly what was typed; the rule refuses
  // surrounding whitespace rather than silently removing it.
  const password = body.temporaryPassword

  // ------------------------------------------------ 1. nothing created yet
  if (!licencePath) return fail(400, 'permit_required')
  if (!isCallersUpload(licencePath, callerId)) return fail(400, 'permit_not_yours')

  const refuse = async (
    status: number,
    error: CreateOwnerErrorCode,
    extra: { problem?: string; detail?: string } = {},
  ) => {
    await discardPermit(admin, callerId, licencePath, log)
    return fail(status, error, extra)
  }

  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    !companyName ||
    !clean(body.governorate) ||
    !clean(body.wilayahId) ||
    !clean(body.permitNumber)
  ) {
    return refuse(400, 'bad_request')
  }

  // The dialog has already compared the two fields; the server has one copy,
  // so it is compared with itself and the rest of the rule still applies.
  const problem = temporaryPasswordProblem(password, password, email)
  if (problem) return refuse(400, 'weak_password', { problem })

  // ------------------------------------------------------- 2. the account
  /*
   * Created confirmed, because the address was entered by an administrator
   * holding the company's paperwork — there is no link for anybody to click,
   * and an unconfirmed account cannot sign in with a password.
   *
   * No phone. The company's number goes on the company row as contact
   * information; putting it on the auth user would make it an identity.
   *
   * An address that already has an account is refused, never adopted. The old
   * invitation flow reused it and let the owner set a password from a recovery
   * link; doing that here would mean an administrator setting a password on an
   * account somebody else already uses.
   */
  let created: Awaited<ReturnType<ServiceClient['auth']['admin']['createUser']>>
  try {
    created = await admin.auth.admin.createUser({
      email,
      password: password as string,
      email_confirm: true,
      user_metadata: { name: clean(body.contactName) },
    })
  } catch {
    return refuse(502, 'account_failed')
  }

  if (created.error || !created.data?.user?.id) {
    const error = created.error
    const message = error?.message ?? ''
    if (
      error?.code === 'email_exists' ||
      error?.code === 'user_already_exists' ||
      /already (been )?registered|already exists/i.test(message)
    ) {
      return refuse(409, 'email_exists')
    }
    if (error?.code === 'weak_password' || /password/i.test(message)) {
      return refuse(400, 'weak_password', { detail: message })
    }
    return refuse(500, 'account_failed', { detail: message || undefined })
  }

  const ownerId = created.data.user.id

  // ------------------------------------------------------- 3. the company
  let createError: ErrorLike | null = null
  let provider: { id?: string } | null = null
  try {
    const result = await admin.rpc('admin_create_provider', {
      p_owner_id: ownerId,
      // One name, typed once, stored under both languages. NASEK does not ask
      // an administrator to transliterate a company name they were given.
      p_name_ar: companyName,
      p_name_en: companyName,
      p_tagline: clean(body.tagline),
      p_description: clean(body.description),
      p_wilayah_id: clean(body.wilayahId) || null,
      p_governorate: clean(body.governorate) || null,
      p_experience_years: Number(body.experienceYears) || 0,
      p_phone: clean(body.phone) || null,
      p_email: email,
      p_commercial_registration: clean(body.commercialRegistration) || null,
      p_permit_number: clean(body.permitNumber) || null,
      // Empty means "no expiry". Postgres will not coerce '' to `date`.
      p_permit_expiry: clean(body.permitExpiry) || null,
      p_licence_path: licencePath,
      p_licence_file_name: clean(body.licenceFileName) || null,
      p_licence_mime: clean(body.licenceMime) || null,
      p_verification: body.verification === 'pending' ? 'pending' : 'verified',
    })
    createError = result.error
    provider = (result.data as { id?: string } | null) ?? null
  } catch (thrown) {
    createError = { message: thrown instanceof Error ? thrown.message : 'the database did not answer' }
  }

  if (!createError) {
    return { status: 200, body: { ok: true, providerId: provider?.id ?? null } }
  }

  // --------------------------------------------------- 4. compensation
  /*
   * Did the company get written anyway?
   *
   * `admin_create_provider` is one transaction, so an error normally means no
   * row. But an error can also be a reply that never arrived for a commit that
   * did — and deleting the user then would not remove the company:
   * `providers.owner_id` is `on delete set null`, so it would leave a company
   * owned by nobody. So look, and believe what is there.
   */
  let companyExists: boolean | null = null
  try {
    const { data, error } = await admin.from('providers').select('id').eq('owner_id', ownerId).limit(1)
    companyExists = error ? null : (data?.length ?? 0) > 0
    if (companyExists) {
      const row = data?.[0] as { id?: string } | undefined
      return { status: 200, body: { ok: true, providerId: row?.id ?? null } }
    }
  } catch {
    companyExists = null
  }

  if (companyExists === null) {
    // Cannot tell, so do not delete. The account stays and the administrator
    // is told exactly that; the permit may belong to the company, so it stays.
    log(`admin-create-owner: company write failed and could not be confirmed for user ${ownerId}`)
    return fail(500, 'cleanup_failed', { detail: createError.message })
  }

  /*
   * No company. The user was created by this request a moment ago — the id
   * came back from our own `createUser`, and an address that already had an
   * account never reaches this line — so deleting it removes nothing that
   * existed before. Hard delete, so the address is free for a retry.
   */
  let deleted = false
  try {
    const { error } = await admin.auth.admin.deleteUser(ownerId, false)
    deleted = !error
    if (error) log(`admin-create-owner: could not remove user ${ownerId}: ${error.message}`)
  } catch (thrown) {
    log(`admin-create-owner: removing user ${ownerId} threw: ${thrown instanceof Error ? thrown.message : 'unknown'}`)
  }

  await discardPermit(admin, callerId, licencePath, log)

  if (!deleted) return fail(500, 'cleanup_failed', { detail: createError.message })

  /*
   * The database's own message, because "A copy of the operating permit is
   * required" and a location constraint are different mistakes with different
   * fixes, and the administrator is the one who makes them.
   */
  return fail(400, 'create_failed', { detail: createError.message })
}
