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
  MAX_OTP_ATTEMPTS,
  cancelOtp,
  isDemoOtp,
  normaliseTarget,
  startOtp,
  verifyOtp,
} from '@/services/auth/otp'
import { formatPhone, isValidPhone, maskEmail, maskPhone, toE164 } from '@/services/auth/phone'

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

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
