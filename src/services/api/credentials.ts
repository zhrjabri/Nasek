import type { Role } from '@/types'

/**
 * Password storage and checking.
 *
 * NASEK has no server, so credentials live in the browser alongside the rest
 * of the session. That places a firm ceiling on what this can promise, and it
 * is worth being precise about where the ceiling is:
 *
 *   - Passwords are never stored, anywhere, in a form that can be read back.
 *     What is kept is a PBKDF2 derivation with a per-account random salt, so
 *     someone who opens the stored state finds no passwords in it, and a
 *     password reused on another site is not exposed by NASEK.
 *   - What this cannot do is stop someone who already controls the browser.
 *     They could edit the stored state directly rather than attacking the
 *     hash. Defending against that needs the check to happen on a server the
 *     visitor does not control, which is the single change that would turn
 *     this from a real-behaving login into a genuinely secure one.
 *
 * The shape here is deliberately the shape a server would use, so moving the
 * check behind an API later is a change of location, not of design.
 */

/** Cost factor. High enough to be slow to attack, quick enough to feel instant. */
const ITERATIONS = 210_000
const HASH = 'SHA-256'
const KEY_BITS = 256

export interface Credential {
  userId: string
  role: Exclude<Role, 'admin'>
  /** Normalised email, used to look the account up at sign-in. */
  emailKey: string
  /** Normalised phone, the other way in. */
  phoneKey: string
  salt: string
  hash: string
  iterations: number
}

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)))

/** Email as a lookup key: case and stray spaces should never lock someone out. */
export const normaliseEmail = (value: string) => value.trim().toLowerCase()

/**
 * Phone as a lookup key.
 *
 * Omani numbers get written +968 9123 4567, 0096891234567 or 91234567
 * depending on the person and the day. Reducing to digits and dropping the
 * country code means all three reach the same account.
 */
export function normalisePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const withoutTrunk = digits.replace(/^00/, '')
  return withoutTrunk.startsWith('968') ? withoutTrunk.slice(3) : withoutTrunk
}

/** Which kind of identifier someone typed into the single "email or phone" box. */
export const looksLikeEmail = (value: string) => value.includes('@')

export function identifierKey(value: string) {
  return looksLikeEmail(value) ? normaliseEmail(value) : normalisePhone(value)
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: HASH },
    material,
    KEY_BITS,
  )
  return toHex(bits)
}

/** Turn a chosen password into something safe to keep. */
export async function createCredential(input: {
  userId: string
  role: Exclude<Role, 'admin'>
  email: string
  phone: string
  password: string
}): Promise<Credential> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return {
    userId: input.userId,
    role: input.role,
    emailKey: normaliseEmail(input.email),
    phoneKey: normalisePhone(input.phone),
    salt: toHex(salt.buffer),
    hash: await derive(input.password, salt, ITERATIONS),
    iterations: ITERATIONS,
  }
}

/**
 * Compare a typed password against a stored credential.
 *
 * The comparison runs over the full string rather than stopping at the first
 * wrong character, so how long a rejection takes says nothing about how much
 * of the password was right.
 */
export async function verifyPassword(credential: Credential, password: string) {
  const candidate = await derive(password, fromHex(credential.salt), credential.iterations)
  if (candidate.length !== credential.hash.length) return false
  let diff = 0
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ credential.hash.charCodeAt(i)
  }
  return diff === 0
}

/** Find the account an identifier belongs to, by either route in. */
export function findCredential(
  credentials: Credential[],
  identifier: string,
  role: Exclude<Role, 'admin'>,
) {
  const key = identifierKey(identifier)
  if (!key) return undefined
  return credentials.find(
    (c) => c.role === role && (c.emailKey === key || c.phoneKey === key),
  )
}

// ------------------------------------------------------------------ lockout

/** Failed attempts allowed before the account stops answering for a while. */
export const MAX_ATTEMPTS = 5
/** How long the pause lasts. Long enough to ruin a guessing script's day. */
export const LOCKOUT_MS = 60_000

export interface Lockout {
  fails: number
  lockedUntil: number
}

export const lockRemainingMs = (lock: Lockout | undefined, now: number) =>
  lock && lock.lockedUntil > now ? lock.lockedUntil - now : 0
