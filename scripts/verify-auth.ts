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
  EMAIL_OTP_TYPES,
  MAX_OTP_ATTEMPTS,
  cancelOtp,
  isDemoOtp,
  normaliseTarget,
  startOtp,
  verifyOtp,
} from '@/services/auth/otp'
import { formatPhone, isValidPhone, maskEmail, maskPhone, toE164 } from '@/services/auth/phone'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/services/auth/password'
import { landingFor, providerLanding } from '@/hooks/useSignIn'
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

  check('this harness is exercising the local fallback', isDemoOtp)

  const target = { channel: 'email' as const, value: 'zahra@nasek.om' }

  const issued = await startOtp(target)
  check('a code is issued', issued.ok && !!issued.demoCode, issued.demoCode ?? '')
  check('the code is six digits', /^\d{6}$/.test(issued.demoCode ?? ''))
  check('a resend cooldown comes back with it', issued.cooldownSeconds > 0)

  const wrong = await verifyOtp(target, issued.demoCode === '000000' ? '111111' : '000000')
  check('a wrong code is rejected', !wrong.ok && wrong.error === 'wrong_code')

  const shortCode = await verifyOtp(target, '123')
  check('a half-typed code is rejected on its shape', !shortCode.ok && shortCode.error === 'code_format')

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
  const decoy = second.demoCode === '000000' ? '111111' : '000000'
  let lastError: string | undefined
  for (let i = 0; i < MAX_OTP_ATTEMPTS + 1; i++) {
    lastError = (await verifyOtp(target, decoy)).error
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

  check('a pilgrim lands on their dashboard', landingFor(as('customer')) === '/dashboard')
  check('a campaign owner lands on theirs', landingFor(as('provider')) === '/provider')
  /*
   * An administrator signing in on the *public* site is signing in as a person.
   * Administration is a separate application on a separate host; this one has no
   * dashboard for them and no code to build one from. Sending them to
   * `/dashboard` and then refusing them there — which the route guard used to do
   * — is the one genuinely absurd outcome available here, and it happened.
   */
  check('an administrator lands where any pilgrim would', landingFor(as('admin')) === '/dashboard')

  const landings: [VerificationStatus, string | null][] = [
    ['verified', '/provider'],
    ['pending', '/provider/pending'],
    // Legacy, and still on rows. Nothing writes it any more; everything has to
    // keep reading it as "not looked at yet".
    ['unverified', '/provider/pending'],
    ['rejected', '/provider/review'],
    // No route at all: there is nowhere for a suspended owner to go, and
    // inventing one would send them round a redirect loop.
    ['suspended', null],
  ]
  for (const [status, expected] of landings) {
    check(
      `a ${status} company goes to ${expected ?? 'no route, just a message'}`,
      providerLanding(status) === expected,
      String(providerLanding(status)),
    )
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
