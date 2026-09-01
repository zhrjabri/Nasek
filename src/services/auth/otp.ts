import { supabase } from '@/services/supabase/client'
import { toE164 } from './phone'
import { authRedirectTarget } from './redirect'

/**
 * Passwordless sign-in.
 *
 * NASEK used to ask everyone to invent a password, confirm it, and remember it
 * — for a site most pilgrims will use a handful of times in their life, around
 * one trip. That is the worst possible ratio of effort to benefit, and it is
 * how weak, reused passwords get created. It also meant NASEK held a credential
 * worth stealing.
 *
 * Now it holds nothing. You prove you can receive mail at an address, or a
 * message on a handset, and that is the whole of it. There is no password to
 * forget, to reuse, to phish, or to leak, and the "forgot password" flow — the
 * one every password system has, and the one that is really the security
 * boundary — is simply the normal way in.
 *
 * Two implementations sit behind one interface:
 *
 *   * Supabase Auth, which mints and verifies the code server-side and returns
 *     a signed session. This is the real one.
 *   * A local fallback for when no backend is configured, which keeps the
 *     prototype runnable with no setup. It says so loudly and shows the code on
 *     screen; it is a demo of the flow, not a security control, and
 *     `isDemoOtp` is exported so the UI can never quietly pretend otherwise.
 */

export type OtpChannel = 'email' | 'phone'

export interface OtpTarget {
  channel: OtpChannel
  /** Exactly what the person typed. Normalised inside, never by the caller. */
  value: string
}

export interface OtpStartResult {
  ok: boolean
  /** Present only in the local fallback — the code to display on screen. */
  demoCode?: string
  /** How long before "resend" should become available again, in seconds. */
  cooldownSeconds: number
  error?: string
}

export interface OtpVerifyResult {
  ok: boolean
  error?: string
  /** True when the code was right but the account is barred by an admin. */
  suspended?: boolean
}

/** How long a code is good for. Supabase's own default is an hour; this is ours. */
const CODE_TTL_MS = 10 * 60_000
/** Resend cooldown. Long enough to blunt a flood, short enough not to strand anyone. */
export const RESEND_COOLDOWN_SECONDS = 45
/** Wrong codes allowed before the attempt has to be restarted. */
export const MAX_OTP_ATTEMPTS = 5

/** True when codes are being generated in this browser rather than sent by a server. */
export const isDemoOtp = supabase === null

// --------------------------------------------------------------- normalising

/**
 * The address or number as the auth provider needs to see it.
 *
 * Returns null when the input cannot be one, so the caller shows a field error
 * rather than asking a provider to deliver to nowhere.
 */
export function normaliseTarget(target: OtpTarget): string | null {
  if (target.channel === 'email') {
    const email = target.value.trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null
  }
  return toE164(target.value)
}

// ------------------------------------------------------------ local fallback

const DEMO_KEY = 'nasek.otp.pending'

interface DemoRecord {
  target: string
  hash: string
  salt: string
  expiresAt: number
  attempts: number
}

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)))

/**
 * Even the demo code is stored as a derivation rather than in the clear.
 *
 * It protects nothing — the code was displayed on screen a moment ago — but a
 * fallback that writes a live credential into storage in plain text is a
 * pattern worth never establishing, because fallbacks get copied.
 */
async function deriveCode(code: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 120_000, hash: 'SHA-256' },
    material,
    256,
  )
  return toHex(bits)
}

function readDemo(): DemoRecord | null {
  try {
    const raw = window.sessionStorage.getItem(DEMO_KEY)
    return raw ? (JSON.parse(raw) as DemoRecord) : null
  } catch {
    return null
  }
}

function writeDemo(record: DemoRecord | null) {
  try {
    if (record) window.sessionStorage.setItem(DEMO_KEY, JSON.stringify(record))
    else window.sessionStorage.removeItem(DEMO_KEY)
  } catch {
    /* private mode — the flow degrades to in-memory and the code still shows */
  }
}

/** Six digits, from the CSPRNG rather than Math.random. */
function generateCode(): string {
  const buf = crypto.getRandomValues(new Uint32Array(1))
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

// ------------------------------------------------------------------- public

/**
 * Send a one-time code.
 *
 * `shouldCreateUser` is true because NASEK does not distinguish signing up from
 * signing in — typing your address is both. That is the whole point of the
 * change: a first-time pilgrim and a returning one take exactly the same three
 * steps, and there is no "no account found" dead end to recover from.
 */
export async function startOtp(target: OtpTarget): Promise<OtpStartResult> {
  const normalised = normaliseTarget(target)
  if (!normalised) {
    return { ok: false, cooldownSeconds: 0, error: 'invalid' }
  }

  if (supabase) {
    /*
     * `emailRedirectTo` is what makes the emailed link usable.
     *
     * Supabase's default templates render a link and no code, and on newer
     * projects they cannot be edited without custom SMTP — so for many projects
     * the link *is* the sign-in. Without a redirect target Supabase sends
     * people to the project's Site URL, which is not necessarily either of
     * NASEK's two applications; with it, they come back to whichever one they
     * started from. The address must also be on the project's redirect
     * allow-list, or Supabase silently falls back to the Site URL.
     */
    const { error } =
      target.channel === 'email'
        ? await supabase.auth.signInWithOtp({
            email: normalised,
            options: { shouldCreateUser: true, emailRedirectTo: authRedirectTarget() },
          })
        : await supabase.auth.signInWithOtp({
            phone: normalised,
            options: { shouldCreateUser: true },
          })

    if (error) {
      return {
        ok: false,
        cooldownSeconds: 0,
        // Supabase rate-limits sending, and that is worth naming precisely:
        // "try again" is useless advice when the answer is "in 40 seconds".
        error: /rate|limit|seconds/i.test(error.message) ? 'rate_limited' : 'send_failed',
      }
    }
    return { ok: true, cooldownSeconds: RESEND_COOLDOWN_SECONDS }
  }

  // ------------------------------------------------------- no backend
  const code = generateCode()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  writeDemo({
    target: normalised,
    salt: toHex(salt.buffer),
    hash: await deriveCode(code, salt),
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
  })
  return { ok: true, demoCode: code, cooldownSeconds: RESEND_COOLDOWN_SECONDS }
}

/**
 * Check a code and, if it is right, establish the session.
 *
 * With Supabase this is one call: the code is verified server-side and a signed
 * JWT comes back. Nothing about the result is decided in this browser, which is
 * the difference between this and everything the prototype did.
 */
export async function verifyOtp(target: OtpTarget, code: string): Promise<OtpVerifyResult> {
  const normalised = normaliseTarget(target)
  if (!normalised) return { ok: false, error: 'invalid' }

  const token = code.replace(/\D/g, '')
  if (token.length !== 6) return { ok: false, error: 'code_format' }

  if (supabase) {
    const { error } =
      target.channel === 'email'
        ? await supabase.auth.verifyOtp({ email: normalised, token, type: 'email' })
        : await supabase.auth.verifyOtp({ phone: normalised, token, type: 'sms' })

    if (error) {
      return {
        ok: false,
        error: /expired/i.test(error.message) ? 'expired' : 'wrong_code',
      }
    }
    return { ok: true }
  }

  // ------------------------------------------------------- no backend
  const record = readDemo()
  if (!record || record.target !== normalised) return { ok: false, error: 'wrong_code' }
  if (Date.now() > record.expiresAt) {
    writeDemo(null)
    return { ok: false, error: 'expired' }
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    writeDemo(null)
    return { ok: false, error: 'too_many' }
  }

  const candidate = await deriveCode(token, fromHex(record.salt))
  // Compared in full, so how long a rejection takes says nothing about how
  // close the guess was.
  let diff = candidate.length ^ record.hash.length
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ record.hash.charCodeAt(i)
  }
  if (diff !== 0) {
    writeDemo({ ...record, attempts: record.attempts + 1 })
    return { ok: false, error: 'wrong_code' }
  }

  writeDemo(null)
  return { ok: true }
}

/** Abandon a code in progress — used when someone goes back to change the address. */
export function cancelOtp() {
  writeDemo(null)
}
