/**
 * The local passphrase gate.
 *
 * Reached only when no Supabase project is configured. When one is, the
 * dashboard authenticates against `is_admin()` in Postgres and this file is
 * never consulted — see `src/admin/session.ts`.
 *
 * What it was, and why it is smaller now. This module used to hold two secrets:
 * a passphrase and the *address* the dashboard answered on, both stored as
 * PBKDF2 derivations, with the router hashing every unrecognised path to see
 * whether it matched. That existed because the dashboard lived inside the
 * public site, where the only way to keep a route from being found was to keep
 * its name out of the bundle. The dashboard is now a separate application on a
 * separate host, so there is no path inside the public site to conceal; the
 * address mechanism has gone with the problem it solved.
 *
 * What remains is honest about its ceiling, as the original was. Everything
 * here reaches the visitor's browser, so this makes guessing expensive and
 * nothing more — over data that never left that browser in the first place.
 * The moment a database is configured, the check that matters happens somewhere
 * the visitor does not control.
 *
 * ---------------------------------------------------------------------------
 * TO CHANGE THE PASSPHRASE
 *     node scripts/admin-passphrase.mjs                  # generate one
 *     node scripts/admin-passphrase.mjs "your phrase"    # keep one you chose
 * then paste the salt and hash below. Never commit the phrase itself — a secret
 * stored beside its own hash is not a secret.
 * ---------------------------------------------------------------------------
 */

const ITERATIONS = 210_000
const HASH = 'SHA-256'
const KEY_BITS = 256

/** Salt and derivation of the passphrase. Safe to store; useless on their own. */
const PASSPHRASE_SALT = '1a3877d59ec5af841a4387459ec0f0ab'
const PASSPHRASE_HASH = 'f24657439cf58ef2cf6cba76f0854e1b4f972acc10e2b030a4a3df98a97b9ae8'

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)))

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function derive(input: string, saltHex: string) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex) as BufferSource, iterations: ITERATIONS, hash: HASH },
    material,
    KEY_BITS,
  )
  return toHex(bits)
}

/** Compare in full, so the time taken says nothing about how close a guess was. */
function sameHash(candidate: string, expected: string) {
  if (candidate.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Check a typed passphrase.
 *
 * The derivation is the delay: 210,000 rounds take long enough that guessing
 * in bulk is painful, and costs the one person who knows it about 50ms.
 */
export async function verifyAdminPassphrase(input: string): Promise<boolean> {
  const phrase = input.trim()
  if (!phrase) return false
  return sameHash(await derive(phrase, PASSPHRASE_SALT), PASSPHRASE_HASH)
}
