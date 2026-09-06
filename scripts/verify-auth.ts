/*
 * Verification harness for passwordless sign-in.
 *
 * The parts that can run without a browser: phone normalisation, target
 * validation, masking, and the whole local one-time-code lifecycle — issued,
 * accepted once, rejected when wrong, expired, and given up on after too many
 * attempts.
 *
 * What it cannot cover is the Supabase path, because that one deliberately
 * decides nothing in this process: the code is minted and checked by a server,
 * and the only honest test of it is against a real project. What is checked
 * here is the fallback and every pure function both paths share — which is
 * where the mistakes that silently let someone in would live.
 */
import {
  EMAIL_CODE_LENGTH,
  EMAIL_OTP_TYPES,
  MAX_OTP_ATTEMPTS,
  cancelOtp,
  ALLOW_LOCAL_OTP_FALLBACK,
  isDemoOtp,
  normaliseTarget,
  startOtp,
  verifyOtp,
} from '@/services/auth/otp'
import { formatPhone, isValidPhone, maskEmail, maskPhone, toE164 } from '@/services/auth/phone'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/services/auth/password'
import { fallbackName, profileToUser } from '@/services/auth/session'
import { contactDetailsToKeep } from '@/services/auth/profileGaps'
import { redeemAccessCode } from '@/admin/accessCode'
import { landingFor } from '@/hooks/useSignIn'
import type { ProfileRow } from '@/services/supabase/schema'
import type { User, VerificationStatus } from '@/types'

/*
 * `sessionStorage` is a browser API and the fallback keeps its pending code
 * there. A tiny in-memory stand-in is enough: the harness only needs the code
 * to survive between `startOtp` and `verifyOtp`, which is exactly what the real
 * one does within a tab.
 *
 * It is installed on `window`, not on `globalThis`, and that detail is the
 * whole point of saying so. The first version of this file put it on
 * `globalThis`; the code under test reads `window.sessionStorage`, wrapped in a
 * try/catch for private-browsing mode, so every read threw, was swallowed, and
 * came back null. Nine checks went green against a module that was storing
 * nothing — including "the right code is accepted", which passed by never
 * accepting anything. A stub in the wrong place does not weaken a test, it
 * silently inverts it.
 */
const store = new Map<string, string>()
const shim = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
} as Storage
;(globalThis as unknown as { window: { sessionStorage: Storage } }).window = {
  sessionStorage: shim,
}

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function main() {
  console.log('\n--- Omani phone numbers -------------------------------------\n')

  // The four ways the same number gets written down in Oman.
  const forms = ['91234567', '+968 9123 4567', '00968 9123 4567', '968-9123-4567']
  const e164 = forms.map((f) => toE164(f))
  check(
    'every way of writing one number reaches the same E.164',
    new Set(e164).size === 1 && e164[0] === '+96891234567',
    e164.join(' | '),
  )

  check('a number that is too short is refused', toE164('9123') === null)
  check('a landline-shaped local number is refused', toE164('21234567') === null)
  check('an empty string is refused', toE164('') === null)
  check('letters are refused', toE164('not a phone') === null)
  check('isValidPhone agrees with toE164', isValidPhone('91234567') && !isValidPhone('123'))
  check(
    'a foreign number typed in full is kept',
    toE164('+44 7700 900123') === '+447700900123',
    String(toE164('+44 7700 900123')),
  )
  check('display formatting groups the local part', formatPhone('96891234567') === '+968 9123 4567')

  console.log('\n--- what the confirmation screen shows ----------------------\n')

  const maskedPhone = maskPhone('91234567')
  check(
    'a masked number reveals only the last three digits',
    maskedPhone.endsWith('567') && !maskedPhone.includes('9123'),
    maskedPhone,
  )
  const maskedEmail = maskEmail('zahra@nasek.om')
  check(
    'a masked address keeps the first letter and the domain',
    maskedEmail.startsWith('z') && maskedEmail.endsWith('@nasek.om') && !maskedEmail.includes('ahra'),
    maskedEmail,
  )

  console.log('\n--- what counts as a valid target --------------------------\n')

  check(
    'an address is lowercased and trimmed',
    normaliseTarget({ channel: 'email', value: '  Zahra@Nasek.OM ' }) === 'zahra@nasek.om',
  )
  check(
    'something without an @ is not an address',
    normaliseTarget({ channel: 'email', value: 'zahra.nasek.om' }) === null,
  )
  check(
    'something without a domain is not an address',
    normaliseTarget({ channel: 'email', value: 'zahra@nasek' }) === null,
  )

  console.log('\n--- the one-time code --------------------------------------\n')

  /*
   * Which template sent the code decides what kind of token it is: a returning
   * address gets Magic Link (`email`), an unseen one gets Confirm signup
   * (`signup`), and they are separate records. Checking only `email` failed for
   * everyone signing in for the first time — and failed with "invalid or
   * expired", which reads exactly like a mistyped code.
   */
  check(
    'an emailed code is looked up under both token kinds',
    EMAIL_OTP_TYPES.includes('email') && EMAIL_OTP_TYPES.includes('signup'),
    EMAIL_OTP_TYPES.join(', '),
  )
  check(
    'the common case is tried first, so a returning visitor costs one round trip',
    EMAIL_OTP_TYPES[0] === 'email',
  )

  /*
   * The fallback is a development and test affordance, and the gate that keeps
   * it that way is checked here rather than trusted.
   *
   * It used to be gated on nothing but "is there a Supabase client", which is
   * also true of a production build whose `VITE_SUPABASE_*` variables never
   * reached the build environment — and that is exactly what shipped to
   * `nasek.vercel.app`. The deployed sign-in screen generated its own code and
   * printed it on the page.
   *
   * `MODE` rather than `DEV` because Vite sets `DEV` false for every build,
   * including this harness's — which would take the fallback away from the
   * checks below that exist to cover it. This harness runs as `harness`, the
   * dev server as `development`, and only a real `vite build` as `production`.
   */
  check(
    'the local fallback is confined to development and test builds',
    ALLOW_LOCAL_OTP_FALLBACK && import.meta.env.MODE !== 'production',
    `MODE = ${import.meta.env.MODE}`,
  )
  check('this harness is exercising the local fallback', isDemoOtp)

  const target = { channel: 'email' as const, value: 'zahra@nasek.om' }

  const issued = await startOtp(target)
  check('a code is issued', issued.ok && !!issued.demoCode, issued.demoCode ?? '')
  /*
   * The length the project actually issues, not a literal.
   *
   * `/^\d{6}$/` was written here while the constant said six and Supabase said
   * eight, so this harness agreed with the bug: it asserted the fallback
   * matched a form that no real code from the live project could satisfy.
   */
  check(
    `the code is ${EMAIL_CODE_LENGTH} digits, matching the project's Email OTP Length`,
    // Spelled out rather than built with `\d` inside a template literal, where
    // the backslash is swallowed and the pattern quietly becomes `^d{8}$`.
    /^[0-9]+$/.test(issued.demoCode ?? '') && issued.demoCode?.length === EMAIL_CODE_LENGTH,
    issued.demoCode ?? '',
  )
  check('a resend cooldown comes back with it', issued.cooldownSeconds > 0)

  const decoy = (fill: string) => fill.repeat(EMAIL_CODE_LENGTH)
  const wrong = await verifyOtp(target, issued.demoCode === decoy('0') ? decoy('1') : decoy('0'))
  check('a wrong code is rejected', !wrong.ok && wrong.error === 'wrong_code')

  const shortCode = await verifyOtp(target, '123')
  check('a half-typed code is rejected on its shape', !shortCode.ok && shortCode.error === 'code_format')

  /*
   * A code of a different — but issuable — length reaches the server.
   *
   * This is the regression that the eight-digit incident is really about. The
   * guard was an equality against a number this repository held, so the day the
   * dashboard's Email OTP Length moved, every correct code was refused in the
   * browser and the server was never asked. It is a range now: six through ten,
   * which is what Supabase will issue between, so a setting change costs the
   * form some empty boxes and never costs anyone their sign-in.
   */
  const otherLength = await verifyOtp(target, '123456')
  check(
    'a six-digit code is judged by the server, not refused on its shape',
    !otherLength.ok && otherLength.error === 'wrong_code',
    otherLength.error ?? '',
  )
  const tooLong = await verifyOtp(target, '12345678901')
  check(
    'but a length no project could issue is still refused outright',
    !tooLong.ok && tooLong.error === 'code_format',
    tooLong.error ?? '',
  )

  // The code belongs to the address it was sent to, not to the browser.
  const otherTarget = { channel: 'email' as const, value: 'someone@else.om' }
  const crossed = await verifyOtp(otherTarget, issued.demoCode!)
  check('a code issued for one address does not open another', !crossed.ok)

  const right = await verifyOtp(target, issued.demoCode!)
  check('the right code is accepted', right.ok)

  const replayed = await verifyOtp(target, issued.demoCode!)
  check('and cannot be used a second time', !replayed.ok, 'single use')

  console.log('\n--- giving up -----------------------------------------------\n')

  const second = await startOtp(target)
  const guess = second.demoCode === decoy('0') ? decoy('1') : decoy('0')
  let lastError: string | undefined
  for (let i = 0; i < MAX_OTP_ATTEMPTS + 1; i++) {
    lastError = (await verifyOtp(target, guess)).error
  }
  check(
    'repeated wrong guesses stop being accepted at all',
    lastError === 'too_many',
    `after ${MAX_OTP_ATTEMPTS} attempts -> ${lastError}`,
  )
  check(
    'and the real code is dead too, so guessing cannot be resumed',
    !(await verifyOtp(target, second.demoCode!)).ok,
  )

  console.log('\n--- abandoning the screen -----------------------------------\n')

  const third = await startOtp(target)
  cancelOtp()
  check(
    'a code abandoned by going back no longer works',
    !(await verifyOtp(target, third.demoCode!)).ok,
  )

  console.log('\n--- passwords, for the two roles that hold one ---------------\n')

  /*
   * Length only, and no composition rules. Asserted because it is exactly the
   * sort of policy somebody later "improves" into requiring a symbol — which
   * measurably pushes people towards `Password1!` and away from length, the one
   * property that actually costs an attacker anything.
   */
  check(
    'a password shorter than the minimum is refused',
    passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1)) === 'short',
  )
  check(
    'a password of exactly the minimum is accepted',
    passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH)) === null,
  )
  check(
    'a long passphrase with no symbols in it is accepted',
    passwordProblem('correct horse battery staple') === null,
  )
  check(
    'a mismatched confirmation is caught',
    passwordProblem('a-long-enough-one', 'a-different-one') === 'mismatch',
  )
  check(
    'and a matching one is not',
    passwordProblem('a-long-enough-one', 'a-long-enough-one') === null,
  )

  console.log('\n--- a pilgrim who registered on an address alone -------------\n')

  /*
   * The minimal profile.
   *
   * Customer registration collects one thing: an address. The database trigger
   * writes a row with an empty name, and everything downstream has to cope with
   * that without ever showing "User" or an empty monogram — while still knowing
   * that what it is showing is not a name anybody gave.
   */
  const row = (over: Partial<ProfileRow> = {}): ProfileRow =>
    ({
      id: '00000000-0000-4000-8000-000000000001',
      name: '',
      email: 'nadia@example.om',
      phone: null,
      role: 'customer',
      wilayah_id: null,
      avatar_color: '',
      provider_id: null,
      suspended: false,
      removed: false,
      created_at: '2026-09-03T00:00:00.000Z',
      ...over,
    }) as ProfileRow

  const fresh = profileToUser(row())
  check(
    'a brand-new account is greeted by the local part of its address',
    fresh.name === 'nadia',
    fresh.name,
  )
  check('and that greeting is marked as a placeholder', fresh.nameIsPlaceholder === true)
  check('the wilayah falls back rather than being required', fresh.wilayahId === 'muscat')
  check('a phone is simply absent, not invented', fresh.phone === '')

  const named = profileToUser(row({ name: 'Nadia Al-Balushi' }))
  check('a profile with a real name reports one', named.name === 'Nadia Al-Balushi')
  check('and is not marked as a placeholder', named.nameIsPlaceholder === false)

  check(
    'a name of nothing but spaces is still a placeholder',
    profileToUser(row({ name: '   ' })).nameIsPlaceholder === true,
  )
  check(
    'an account with neither name nor address falls back to empty, not to a crash',
    fallbackName({ name: '', email: null, phone: null }) === '',
  )

  console.log('\n--- what a booking is allowed to keep ------------------------\n')

  /*
   * Registration asks for an address; the booking form asks for everything a
   * campaign actually needs. This is the seam between them, and it is the only
   * place a booking may change an account.
   */
  const contact = { name: 'Nadia Al-Balushi', phone: '+968 9123 4567', email: 'nadia@example.om' }

  const filled = contactDetailsToKeep(fresh, contact)
  check(
    'a placeholder name is replaced by the one the booking collected',
    filled?.name === 'Nadia Al-Balushi',
  )
  check('and stops being a placeholder', filled?.nameIsPlaceholder === false)
  check('a missing phone number is kept too', filled?.phone === '+968 9123 4567')

  /*
   * The case that matters more than the one above: a son booking for his
   * mother must not rename his own account to hers.
   */
  const established: User = { ...named, phone: '+968 9000 0000' }
  check(
    'a name the person already gave is never overwritten by a booking contact',
    contactDetailsToKeep(established, { ...contact, name: 'Someone Else' }) === null,
  )
  check(
    'nor is a phone number they already gave',
    contactDetailsToKeep(established, { ...contact, phone: '+968 9111 1111' }) === null,
  )
  check(
    'an empty booking form teaches the profile nothing',
    contactDetailsToKeep(fresh, { name: '  ', phone: '', email: '' }) === null,
  )
  check(
    'the email address is never among what a booking writes back',
    !Object.prototype.hasOwnProperty.call(
      contactDetailsToKeep(fresh, { ...contact, email: 'someone.else@example.om' }) ?? {},
      'email',
    ),
  )

  console.log('\n--- the administration access code --------------------------\n')

  /*
   * The dashboard now opens on one access code, and the whole point of the
   * design is that this bundle knows nothing about it: no hash, no salt, no
   * comparison. There is correspondingly little to assert on the client, and
   * that scarcity is the property worth checking rather than a gap in the
   * harness.
   *
   * What *is* assertable is that the client refuses before it reaches the
   * network. Both of these ran against a real deployment would be a round trip
   * to an Edge Function; here they must be answered locally, which is what
   * makes them checkable at all with `--mode harness` blanking the connection.
   */
  const empty = await redeemAccessCode('   ')
  check(
    'an empty code is refused without a request',
    !empty.ok && empty.error === 'empty',
    empty.ok ? 'accepted' : empty.error,
  )

  /*
   * No Supabase configured is `offline`, and specifically not `invalid_code`.
   *
   * The distinction is the one this whole error union exists for. "Your code is
   * wrong" sends somebody hunting for a typo in a correct secret; "the access
   * service could not be reached" sends them to check whether the function is
   * deployed, which is the actual problem. Collapsing the two is how a
   * five-minute deployment mistake becomes an afternoon.
   */
  const offline = await redeemAccessCode('any-code-at-all')
  check(
    'with no backend the code path reports offline, not a wrong code',
    !offline.ok && offline.error === 'offline',
    offline.ok ? 'accepted' : offline.error,
  )

  console.log('\n--- where each account lands after signing in ----------------\n')

  const as = (role: User['role']): User => ({
    id: 'u1',
    name: 'Test',
    email: 't@nasek.om',
    phone: '',
    role,
    wilayahId: 'muscat',
    avatarColor: '#000000',
    createdAt: '2026-01-01',
  })

  /*
   * One destination now, for everybody, and that is the three-application split
   * rather than a guard being dropped.
   *
   * The customer website has no owner dashboard and no administration screens
   * to send anyone to — they are separate builds on separate hosts, and this
   * bundle deliberately does not know their addresses. So a campaign owner who
   * signs in here, which they may perfectly well do to book an Umrah trip for
   * their own family, is a customer while they are here.
   *
   * `providerLanding` used to be asserted below and is gone with the routes it
   * named: the portal has no router, and `src/owner/OwnerApp.tsx` picks a
   * screen from the company's verification status directly.
   */
  for (const role of ['customer', 'provider', 'admin'] as const) {
    check(
      `a signed-in ${role} lands on the customer dashboard`,
      landingFor(as(role)) === '/dashboard',
      landingFor(as(role)),
    )
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
