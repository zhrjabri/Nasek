/**
 * Phone numbers, in the two shapes NASEK needs them.
 *
 * People in Oman write their number as +968 9123 4567, 0096891234567, 9123 4567
 * or 91234567 depending on the person and the day, and all four mean the same
 * eight digits. `src/services/api/credentials.ts` already reduced them to a
 * lookup key on that basis. What is new here is the other direction: an SMS
 * provider will not accept a lookup key, it needs E.164 — a leading `+`, the
 * country code, no spaces — and getting that wrong means the code is never
 * delivered and the person is left staring at a form that says it worked.
 */

/** Oman. The default when someone types a bare local number. */
export const DEFAULT_COUNTRY_CODE = '968'

/** Omani mobile numbers are eight digits and begin with 7 or 9. */
const OMAN_MOBILE = /^[79]\d{7}$/

/** Digits only, with the international prefixes people type stripped off. */
export function digitsOf(value: string): string {
  return value.replace(/\D/g, '').replace(/^00/, '')
}

/**
 * A number in E.164, or null if it cannot be one.
 *
 * Returning null rather than a best guess is deliberate: sending a one-time
 * code to a number derived from a typo is worse than refusing to send it, both
 * because the person waits for something that will never arrive and because the
 * code lands on a stranger's handset.
 */
export function toE164(value: string, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  const raw = value.trim()
  const digits = digitsOf(raw)
  if (!digits) return null

  // Already carries a country code — either typed with + or with 00.
  if (raw.startsWith('+') || value.replace(/\D/g, '').startsWith('00')) {
    return digits.length >= 8 ? `+${digits}` : null
  }

  // Written with the country code but no prefix at all: 96891234567.
  if (digits.startsWith(countryCode) && digits.length > countryCode.length) {
    return `+${digits}`
  }

  // A bare local number. Only accept it when it looks like one, so a half-typed
  // number is rejected here rather than at the SMS provider.
  if (countryCode === DEFAULT_COUNTRY_CODE) {
    return OMAN_MOBILE.test(digits) ? `+${countryCode}${digits}` : null
  }
  return digits.length >= 6 ? `+${countryCode}${digits}` : null
}

/** Is this something we could plausibly send a code to? */
export const isValidPhone = (value: string) => toE164(value) !== null

/** Grouped for display: +968 9123 4567. Never used as a key. */
export function formatPhone(value: string): string {
  const e164 = toE164(value)
  if (!e164) return value
  const digits = e164.slice(1)
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    const local = digits.slice(DEFAULT_COUNTRY_CODE.length)
    return `+${DEFAULT_COUNTRY_CODE} ${local.slice(0, 4)} ${local.slice(4)}`.trim()
  }
  return `+${digits}`
}

/**
 * Hide most of a number, for the "we sent a code to …" line.
 *
 * The screen has to prove it understood which number you gave it without
 * printing the whole thing on a phone someone else might be looking at.
 */
export function maskPhone(value: string): string {
  const e164 = toE164(value) ?? value
  const tail = e164.slice(-3)
  return `${e164.slice(0, Math.max(0, e164.length - 3)).replace(/\d/g, '•')}${tail}`
}

/** The same idea for an address: a@b.com → a•••@b.com. */
export function maskEmail(value: string): string {
  const at = value.indexOf('@')
  if (at <= 0) return value
  const name = value.slice(0, at)
  const domain = value.slice(at)
  const shown = name.slice(0, 1)
  return `${shown}${'•'.repeat(Math.max(2, name.length - 1))}${domain}`
}
