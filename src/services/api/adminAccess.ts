/**
 * The administration gate.
 *
 * NASEK ships as a static site: every line of this file reaches the visitor's
 * browser, which places a hard ceiling on what a gate here can promise. What
 * it can do is make finding and guessing expensive.
 *
 * Two secrets, neither of them written down here:
 *
 *   - The passphrase, stored as a PBKDF2 derivation — 210,000 rounds of
 *     SHA-256 over a random salt — the same treatment account passwords get
 *     in `credentials.ts`.
 *   - The address itself, hashed the same way. Earlier the route sat in the
 *     built JavaScript as the plain string "/admin-access", which meant
 *     anyone reading the bundle could find the door even if they could not
 *     open it. Now the bundle carries only a hash, and the router recognises
 *     the address by hashing whatever was typed and comparing.
 *
 * Hashing an address only helps if the address is unguessable, so the one in
 * use was invented by `scripts/admin-passphrase.mjs` rather than chosen.
 * Hashing something like "admin-access" would be undone by the first wordlist
 * an attacker tried.
 *
 * What none of this can do is stop someone who controls the browser from
 * editing the stored session directly instead of going through the gate, or
 * from fetching the dashboard's JavaScript chunk straight off the server.
 * Only a server that holds both the check and the data can close that, and
 * this module is deliberately shaped like one so that becomes a change of
 * location rather than a rewrite.
 *
 * ---------------------------------------------------------------------------
 * TO CHANGE EITHER SECRET
 *     node scripts/admin-passphrase.mjs                  # new address + phrase
 *     node scripts/admin-passphrase.mjs "your phrase"    # keep a phrase you chose
 * then paste the four values it prints below. Never commit the address or the
 * phrase themselves — this repository is public, and a secret stored beside
 * its own hash is not a secret.
 * ---------------------------------------------------------------------------
 */

const ITERATIONS = 210_000
const HASH = 'SHA-256'
const KEY_BITS = 256

/** Salt and derivation of the passphrase. Safe to store; useless on their own. */
const PASSPHRASE_SALT = '1a3877d59ec5af841a4387459ec0f0ab'
const PASSPHRASE_HASH = 'f24657439cf58ef2cf6cba76f0854e1b4f972acc10e2b030a4a3df98a97b9ae8'

/** Salt and derivation of the unlisted address the gate answers on. */
const PATH_SALT = '8f2e564b37a2a167b997efaec0076ddc'
const PATH_HASH = '34de0c42cd75b7c5f3505e567d8a7865f8a37c4f6be2f4553771606e6bab9bf5'

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
 * Does this address belong to the administration gate?
 *
 * Called from the catch-all route, so every unknown address gets asked. That
 * is deliberate: a wrong address and the real one take the same path through
 * the router and produce the same "not found" until the hash matches, leaving
 * nothing for someone to probe for.
 */
export async function isAdminGatePath(pathname: string): Promise<boolean> {
  const candidate = pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!candidate) return false
  return sameHash(await derive(candidate, PATH_SALT), PATH_HASH)
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
