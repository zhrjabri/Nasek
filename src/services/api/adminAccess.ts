/**
 * The administration gate.
 *
 * NASEK ships as a static site: every line of this file reaches the visitor's
 * browser, which places a hard ceiling on what a gate here can promise. What
 * it can do is make guessing expensive.
 *
 * The passphrase is stored as a PBKDF2 derivation — 210,000 rounds of
 * SHA-256 over a random salt — the same treatment account passwords get in
 * `credentials.ts`. That matters more than it might look: an earlier version
 * used a 32-bit hash, which sounds like a lock but is not one, because only
 * about four billion values exist and a laptop can walk the whole space in
 * seconds to find *some* string that fits. Widening the output to 256 bits
 * removes that shortcut, and the iteration count makes each guess cost real
 * time rather than none.
 *
 * What none of this can do is stop someone who controls the browser from
 * editing the stored session directly instead of attacking the gate. Only a
 * server that holds the check can close that, and this module is deliberately
 * shaped like one so that becomes a change of location, not a rewrite.
 *
 * ---------------------------------------------------------------------------
 * TO CHANGE THE PASSPHRASE
 *     node scripts/admin-passphrase.mjs
 * then paste the two values it prints below. Never commit the phrase itself —
 * this repository is public, and a phrase stored beside its own hash is not a
 * secret.
 * ---------------------------------------------------------------------------
 */

const ITERATIONS = 210_000
const HASH = 'SHA-256'
const KEY_BITS = 256

/** Random salt for the passphrase. Safe to store; useless on its own. */
const PASSPHRASE_SALT = '6d4b74f0032068f71fbe6fbd08f89ffe'
/** PBKDF2 derivation of the current passphrase. */
const PASSPHRASE_HASH = '2773fff0f59a06eb754adfaed1a7e9d3521932a95ef247450b49b727a333dfb2'

/** The unlisted address the gate lives at. Nothing in the UI ever links to it. */
export const ADMIN_ACCESS_PATH = '/admin-access'

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)))

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Check a typed passphrase.
 *
 * The derivation is the delay: 210,000 rounds take long enough that guessing
 * in bulk is painful, and the comparison runs over the whole string so the
 * time taken says nothing about how much of the phrase was right.
 */
export async function verifyAdminPassphrase(input: string): Promise<boolean> {
  const phrase = input.trim()
  if (!phrase) return false

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromHex(PASSPHRASE_SALT) as BufferSource,
      iterations: ITERATIONS,
      hash: HASH,
    },
    material,
    KEY_BITS,
  )

  const candidate = toHex(bits)
  if (candidate.length !== PASSPHRASE_HASH.length) return false
  let diff = 0
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ PASSPHRASE_HASH.charCodeAt(i)
  }
  return diff === 0
}
