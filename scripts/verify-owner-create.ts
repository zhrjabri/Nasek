/*
 * An administrator creates a campaign owner with an email and a temporary
 * password — checked without touching production.
 *
 * `admin-create-owner` runs in Deno and cannot be started here, so its logic
 * lives in `flow.ts` with the service-role client passed in. This drives that
 * file with a stand-in client that records every call, through every path that
 * matters: success, each refusal before an account exists, and each way the
 * company write can fail after one does. The properties asserted are the ones
 * that would otherwise only show up as damage in the live project —
 *
 *   * no account is created for a request that was going to be refused
 *   * an address that already has an account is refused, never adopted
 *   * the compensation deletes only the account this request created, and not
 *     even that one when a company might point at it
 *   * an uploaded permit is removed when nothing uses it, and never otherwise
 *   * the password never comes back out — not in a response, a detail, a log
 *     line, or the arguments to the database
 *
 * Then the source: the admin check still happens before the service role is
 * touched, nothing sends an invitation, the phone is not an identity, and the
 * dialog keeps the password out of storage.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  createOwner,
  isCallersUpload,
  type ServiceClient,
} from '../supabase/functions/admin-create-owner/flow.ts'
import {
  temporaryPasswordProblem,
  TEMPORARY_PASSWORD_MIN_LENGTH,
} from '../supabase/functions/admin-create-owner/password.ts'
import { adminEn } from '@/i18n/adminEn'
import { adminAr } from '@/i18n/adminAr'
import { ownerEn } from '@/i18n/ownerEn'
import { ownerAr } from '@/i18n/ownerAr'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const head = (s: string) => console.log(`\n--- ${s} ---\n`)

const root = path.resolve(import.meta.dirname ?? '.', '..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ============================================================ the stand-in

const CALLER = '11111111-1111-4111-8111-111111111111'
const NEW_USER = '22222222-2222-4222-8222-222222222222'
const EXISTING_PROVIDER = '33333333-3333-4333-8333-333333333333'
/** A password that is valid and unmistakable, so any leak is findable. */
const MARKER = 'Zq7!marker-Pw-9x'

interface Script {
  createUser?: 'ok' | 'email_exists' | 'weak' | 'echo' | 'other' | 'throw'
  rpc?: 'ok' | 'error' | 'throw'
  /** What `providers where owner_id = new user` finds after a failed RPC. */
  companyLookup?: 'none' | 'found' | 'error'
  deleteUser?: 'ok' | 'error'
  /** Whether a company or pending change already points at the permit path. */
  permitInUse?: boolean
}

function standIn(script: Script) {
  const calls = {
    createUser: [] as Record<string, unknown>[],
    rpc: [] as { fn: string; args: Record<string, unknown> }[],
    deleteUser: [] as { id: string; soft?: boolean }[],
    remove: [] as string[][],
    lookups: [] as { table: string; column: string; value: string }[],
  }

  const client: ServiceClient = {
    auth: {
      admin: {
        async createUser(attributes) {
          calls.createUser.push(attributes)
          switch (script.createUser ?? 'ok') {
            case 'ok':
              return { data: { user: { id: NEW_USER } }, error: null }
            case 'email_exists':
              return {
                data: { user: null },
                error: { message: 'A user with this email address has already been registered', code: 'email_exists', status: 422 },
              }
            case 'weak':
              return {
                data: { user: null },
                error: { message: 'Password should contain at least one character of each: abc', code: 'weak_password', status: 422 },
              }
            case 'echo':
              // Hypothetical: a service that quotes the password back.
              return {
                data: { user: null },
                error: { message: `Password "${attributes.password}" is known to be leaked`, code: 'weak_password', status: 422 },
              }
            case 'other':
              return { data: { user: null }, error: { message: 'Database error creating new user', status: 500 } }
            case 'throw':
              throw new Error('network down')
          }
        },
        async deleteUser(id, soft) {
          calls.deleteUser.push({ id, soft })
          return script.deleteUser === 'error'
            ? { error: { message: 'delete refused' } }
            : { error: null }
        },
      },
    },
    rpc(fn, args) {
      calls.rpc.push({ fn, args })
      if (script.rpc === 'throw') return Promise.reject(new Error('connection reset'))
      if (script.rpc === 'error') {
        return Promise.resolve({ data: null, error: { message: 'null value in column "governorate" violates not-null constraint' } })
      }
      return Promise.resolve({ data: { id: 'provider-new' }, error: null })
    },
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              return {
                limit() {
                  calls.lookups.push({ table, column, value })
                  if (column === 'owner_id') {
                    const found = script.companyLookup ?? 'none'
                    if (found === 'error') return Promise.resolve({ data: null, error: { message: 'timeout' } })
                    return Promise.resolve({ data: found === 'found' ? [{ id: EXISTING_PROVIDER }] : [], error: null })
                  }
                  return Promise.resolve({ data: script.permitInUse ? [{ id: 'x' }] : [], error: null })
                },
              }
            },
          }
        },
      }
    },
    storage: {
      from() {
        return {
          async remove(paths) {
            calls.remove.push(paths)
            return { error: null }
          },
        }
      },
    },
  }
  return { client, calls }
}

const PERMIT = `${CALLER}/1789400000000-permit.pdf`

const request = (overrides: Record<string, unknown> = {}) => ({
  email: '  Owner@Example.COM ',
  temporaryPassword: MARKER,
  contactName: 'Salim Al-Harthy',
  companyName: 'Al Noor Hajj & Umrah',
  tagline: 'Since 1998',
  description: '',
  wilayahId: 'muscat-bawshar',
  governorate: 'Muscat',
  experienceYears: 12,
  phone: '+968 9123 4567',
  commercialRegistration: '',
  permitNumber: 'P-2026-001',
  permitExpiry: '',
  licencePath: PERMIT,
  licenceFileName: 'permit.pdf',
  licenceMime: 'application/pdf',
  verification: 'verified',
  ...overrides,
})

async function run(script: Script, overrides: Record<string, unknown> = {}) {
  const { client, calls } = standIn(script)
  const logs: string[] = []
  const response = await createOwner(client, CALLER, request(overrides), (line) => logs.push(line))
  const leaked = [
    JSON.stringify(response),
    ...logs,
    JSON.stringify(calls.rpc),
    JSON.stringify(calls.lookups),
    JSON.stringify(calls.remove),
  ].some((text) => text.includes(MARKER))
  return { response, calls, logs, leaked }
}

/** Every scenario, for the properties that must hold in all of them. */
const everyRun: { label: string; outcome: Awaited<ReturnType<typeof run>> }[] = []
const scenario = async (label: string, script: Script, overrides: Record<string, unknown> = {}) => {
  const outcome = await run(script, overrides)
  everyRun.push({ label, outcome })
  return outcome
}

// ================================================================= 1. rule

head('the temporary password rule, shared by the dialog and the function')

check('twelve characters is the minimum', TEMPORARY_PASSWORD_MIN_LENGTH === 12)
check('eleven is short', temporaryPasswordProblem('Abcdefgh12!', 'Abcdefgh12!', 'a@b.co') === 'short')
check('twelve varied characters pass', temporaryPasswordProblem('Abcdefgh123!', 'Abcdefgh123!', 'a@b.co') === null)
check('the two fields must match', temporaryPasswordProblem('Abcdefgh123!', 'Abcdefgh123?', 'a@b.co') === 'mismatch')
check('a held-down key is refused', temporaryPasswordProblem('aaaaaaaaaaaaaa', 'aaaaaaaaaaaaaa', 'a@b.co') === 'simple')
check('surrounding spaces are refused, not trimmed', temporaryPasswordProblem(' Abcdefgh123!', ' Abcdefgh123!', 'a@b.co') === 'spaces')
check(
  'the email address is refused as a password',
  temporaryPasswordProblem('Owner.Name@nasek.om', 'Owner.Name@nasek.om', 'owner.name@nasek.om') === 'is_email',
)
check(
  'and so is its local part',
  temporaryPasswordProblem('owner.name.long', 'owner.name.long', 'owner.name.long@nasek.om') === 'is_email',
)
const arabic = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.repeat(2).slice(0, 37)
check('over 72 bytes is refused (bcrypt reads no further)', temporaryPasswordProblem(arabic, arabic, 'a@b.co') === 'long')
check('a non-string is refused', temporaryPasswordProblem(undefined, undefined, 'a@b.co') === 'short')

head('the permit path must be one the caller uploaded')

check('the caller\'s own upload', isCallersUpload(PERMIT, CALLER))
check('someone else\'s folder', !isCallersUpload(`${NEW_USER}/1-permit.pdf`, CALLER))
check('a traversal out of the folder', !isCallersUpload(`${CALLER}/../${NEW_USER}/x.pdf`, CALLER))
check('a nested path', !isCallersUpload(`${CALLER}/a/b.pdf`, CALLER))
check('the folder itself', !isCallersUpload(`${CALLER}/`, CALLER))
check('a prefix that only looks like the folder', !isCallersUpload(`${CALLER}0/x.pdf`, CALLER))

async function main() {
// ============================================================= 2. success

head('success: one account, confirmed, with the password, and one company')

{
  const { response, calls } = await scenario('success', {})
  check('answers 200 ok with the company id', response.status === 200 && response.body.ok && response.body.providerId === 'provider-new')
  check('creates exactly one account', calls.createUser.length === 1)
  const attrs = calls.createUser[0] ?? {}
  check('for the address, lower-cased and trimmed', attrs.email === 'owner@example.com')
  check('with the password exactly as typed', attrs.password === MARKER)
  check('already confirmed — there is no link to click', attrs.email_confirm === true)
  check('with no phone: the number is contact information, not an identity', !('phone' in attrs) && !('phone_confirm' in attrs))
  check('writes the company through admin_create_provider for that account', calls.rpc.length === 1 && calls.rpc[0].fn === 'admin_create_provider' && calls.rpc[0].args.p_owner_id === NEW_USER)
  check('the phone goes on the company row', calls.rpc[0]?.args.p_phone === '+968 9123 4567')
  check('the password is not an argument to the database', !JSON.stringify(calls.rpc).includes(MARKER))
  check('deletes nothing', calls.deleteUser.length === 0 && calls.remove.length === 0)
}

// ================================================ 3. refused before an account

head('refused before anything is created')

{
  const { response, calls } = await scenario('short password', {}, { temporaryPassword: 'short' })
  check('a password that breaks the rule is refused', response.status === 400 && !response.body.ok && response.body.error === 'weak_password' && response.body.problem === 'short')
  check('…without creating an account', calls.createUser.length === 0 && calls.rpc.length === 0)
  check('…and the uploaded permit is removed', calls.remove.length === 1 && calls.remove[0][0] === PERMIT)
}
{
  const { response, calls } = await scenario('bad email', {}, { email: 'not-an-address' })
  check('a malformed email is refused', !response.body.ok && response.body.error === 'bad_request')
  check('…without creating an account', calls.createUser.length === 0)
}
{
  const { response, calls } = await scenario('no governorate', {}, { governorate: '  ' })
  check('a blank governorate is refused before the database has to', !response.body.ok && response.body.error === 'bad_request' && calls.createUser.length === 0)
}
{
  const { response, calls } = await scenario('no permit', {}, { licencePath: '' })
  check('no permit is refused', !response.body.ok && response.body.error === 'permit_required' && calls.createUser.length === 0)
  check('…and there is nothing to remove', calls.remove.length === 0)
}
{
  const { response, calls } = await scenario('foreign permit', {}, { licencePath: `${NEW_USER}/1-permit.pdf` })
  check('a permit outside the caller\'s folder is refused', !response.body.ok && response.body.error === 'permit_not_yours' && calls.createUser.length === 0)
  check('…and is never deleted', calls.remove.length === 0)
}

// ======================================================= 4. account refused

head('the account itself is refused — nothing to compensate')

{
  const { response, calls } = await scenario('email exists', { createUser: 'email_exists' })
  check('an address with an account is refused as email_exists', response.status === 409 && !response.body.ok && response.body.error === 'email_exists')
  check('…never adopted: no company is written for it', calls.rpc.length === 0)
  check('…and no user is deleted — it belongs to somebody', calls.deleteUser.length === 0)
  check('…and the unused permit is removed', calls.remove.length === 1)
}
{
  const { response, calls } = await scenario('email exists, permit in use', { createUser: 'email_exists', permitInUse: true })
  check('a permit a company already points at is not removed', !response.body.ok && calls.remove.length === 0)
}
{
  const { response, calls } = await scenario('project policy refuses', { createUser: 'weak' })
  check('the project\'s own password policy comes back as weak_password', !response.body.ok && response.body.error === 'weak_password')
  check('…with the policy\'s words, so the administrator knows what to change', !response.body.ok && /at least one character/.test(response.body.detail ?? ''))
  check('…and nothing to delete', calls.rpc.length === 0 && calls.deleteUser.length === 0)
}
{
  const { response } = await scenario('service echoes the password', { createUser: 'echo' })
  check('a detail that quotes the password is redacted', !response.body.ok && !(response.body.detail ?? '').includes(MARKER) && (response.body.detail ?? '').includes('[redacted]'))
}
{
  const { response, calls } = await scenario('auth other error', { createUser: 'other' })
  check('any other refusal is account_failed', !response.body.ok && response.body.error === 'account_failed' && calls.rpc.length === 0 && calls.deleteUser.length === 0)
}
{
  const { response, calls } = await scenario('auth throws', { createUser: 'throw' })
  check('a thrown call is account_failed, not a crash', !response.body.ok && response.body.error === 'account_failed' && calls.deleteUser.length === 0)
}

// ================================================== 5. company refused after

head('the account was created and the company was not — compensation')

{
  const { response, calls } = await scenario('rpc error', { rpc: 'error' })
  check('answers create_failed with the database\'s words', response.status === 400 && !response.body.ok && response.body.error === 'create_failed' && /governorate/.test(response.body.detail ?? ''))
  check('looks for a company owned by the new account first', calls.lookups.some((l) => l.table === 'providers' && l.column === 'owner_id' && l.value === NEW_USER))
  check('deletes exactly the account it created, hard', calls.deleteUser.length === 1 && calls.deleteUser[0].id === NEW_USER && calls.deleteUser[0].soft === false)
  check('removes the unused permit', calls.remove.length === 1 && calls.remove[0][0] === PERMIT)
}
{
  const { response, calls } = await scenario('rpc throws', { rpc: 'throw' })
  check('a thrown RPC is compensated the same way', !response.body.ok && response.body.error === 'create_failed' && calls.deleteUser.length === 1 && calls.deleteUser[0].id === NEW_USER)
}
{
  const { response, calls } = await scenario('reply lost after commit', { rpc: 'error', companyLookup: 'found' })
  check('a company that was written anyway is success', response.status === 200 && response.body.ok && response.body.providerId === EXISTING_PROVIDER)
  check('…and its owner is NOT deleted (owner_id is on delete set null)', calls.deleteUser.length === 0)
  check('…and its permit is NOT removed', calls.remove.length === 0)
}
{
  const { response, calls } = await scenario('cannot tell', { rpc: 'error', companyLookup: 'error' })
  check('when it cannot tell, it reports cleanup_failed', response.status === 500 && !response.body.ok && response.body.error === 'cleanup_failed')
  check('…and deletes nothing — neither the account nor the permit', calls.deleteUser.length === 0 && calls.remove.length === 0)
}
{
  const { response, calls, logs } = await scenario('delete refused', { rpc: 'error', deleteUser: 'error' })
  check('an account that cannot be removed is reported, not hidden', !response.body.ok && response.body.error === 'cleanup_failed')
  check('…the permit is still removed, since nothing uses it', calls.remove.length === 1)
  check('…and the log names the account id so it can be found', logs.some((l) => l.includes(NEW_USER)))
}

// ============================================== 6. true of every scenario

head('true in every scenario above')

const leaks = everyRun.filter((r) => r.outcome.leaked).map((r) => r.label)
check('the password never appears in a response, detail, log or database call', leaks.length === 0, leaks.join(', '))
const strays = everyRun
  .filter((r) => r.outcome.calls.deleteUser.some((d) => d.id !== NEW_USER))
  .map((r) => r.label)
check('no scenario deletes any account but the one it created', strays.length === 0, strays.join(', '))
const preCreate = everyRun
  .filter((r) => r.outcome.calls.deleteUser.length > 0 && r.outcome.calls.createUser.length === 0)
  .map((r) => r.label)
check('no scenario deletes an account without having created one', preCreate.length === 0, preCreate.join(', '))
const foreign = everyRun
  .filter((r) => r.outcome.calls.remove.flat().some((p) => !p.startsWith(`${CALLER}/`)))
  .map((r) => r.label)
check('no scenario removes a file outside the caller\'s folder', foreign.length === 0, foreign.join(', '))

// ================================================================ 7. source

head('the function, from source')

const index = read('supabase/functions/admin-create-owner/index.ts')
const flow = read('supabase/functions/admin-create-owner/flow.ts')
const indexCode = code(index)
const flowCode = code(flow)

check(
  'is_admin() is asked with the caller\'s token before the service role is used',
  indexCode.indexOf("rpc('is_admin')") > 0 &&
    indexCode.indexOf("rpc('is_admin')") < indexCode.indexOf('SERVICE_ROLE, {'),
)
check('the caller id comes from their verified token', /auth\.getUser\(token\)/.test(indexCode))
check('no invitation is sent', !/inviteUserByEmail|generateLink|resetPasswordForEmail/.test(indexCode + flowCode))
check('the owner portal URL is no longer read here', !/NASEK_OWNER_PORTAL_URL/.test(indexCode + flowCode))
check('nothing logs the request body', !/console\.(log|info|debug|warn|error)\([^)]*(body|request|password)/i.test(indexCode + flowCode))
check('the account is created, confirmed, by the service role', /createUser\(\{[\s\S]{0,160}email_confirm:\s*true/.test(flowCode))
check('the auth user is given no phone', !/createUser\(\{[\s\S]{0,200}phone/.test(flowCode))

head('the dialog, from source')

const dialog = read('src/admin/tabs/NewOwnerDialog.tsx')
const client = read('src/admin/createOwner.ts')
const dialogCode = code(dialog)
check('asks for a temporary password and its confirmation', /temporaryPassword/.test(dialogCode) && /confirmPassword/.test(dialogCode))
check('both fields are new-password, so a browser does not fill in the admin\'s own', (dialogCode.match(/autoComplete="new-password"/g) ?? []).length === 2)
check('checks the shared rule before uploading the permit', dialogCode.indexOf('temporaryPasswordProblem(') < dialogCode.indexOf('uploadLicence('))
check('keeps the password out of storage', !/localStorage|sessionStorage|indexedDB/.test(dialogCode + code(client)))
check('does not put the password in a toast or the confirmation', !/toast\([^)]*[Pp]assword/.test(dialogCode) && !/setCreated\(\{[^}]*[Pp]assword/.test(dialogCode))
check('clears it on close', /const close = \(\) => \{\s*forgetPassword\(\)/.test(dialogCode))
check('posts only to admin-create-owner', /functions\/v1\/admin-create-owner/.test(client) && (client.match(/fetch\(/g) ?? []).length === 1)
check('the retired invitation outcome is gone from the client', !/invited|deliveryError|invite_failed/.test(code(client) + dialogCode))

head('the words')

const newOwnerKeys = (dict: Record<string, string>) => Object.keys(dict).filter((k) => k.startsWith('admin.newOwner'))
const enKeys = newOwnerKeys(adminEn)
const arKeys = newOwnerKeys(adminAr)
check('English and Arabic carry the same owner-creation keys', enKeys.length === arKeys.length && enKeys.every((k) => arKeys.includes(k)))
const inviting = enKeys.filter((k) => /invit/i.test(adminEn[k as keyof typeof adminEn]) || /دعو|دعوة/.test(adminAr[k as keyof typeof adminAr]))
check('no administration owner-creation string mentions an invitation', inviting.length === 0, inviting.join(', '))
for (const key of ['admin.newOwnerInviteFailed', 'admin.newOwnerCreatedNoEmail', 'admin.newOwnerIsAdmin']) {
  check(`${key} is gone`, !(key in adminEn) && !(key in adminAr))
}
check('no admin dictionary key begins admin.password (A1)', !Object.keys(adminEn).some((k) => k.startsWith('admin.password')))
check(
  'the owner sign-in screen no longer points at an invitation link',
  !/invit/i.test(ownerEn['owner.passwordOnly']) && !/دعت|دعوة/.test(ownerAr['owner.passwordOnly']),
)

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
