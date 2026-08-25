/**
 * The administration gate.
 *
 * NASEK ships as a static site: there is no server, so every line of this file
 * reaches the visitor's browser. That places a hard ceiling on what this can
 * be. The passphrase is *not* stored here in the clear — only a hash of it is,
 * so the phrase cannot be read straight out of the bundle — but a determined
 * reader with the hash can still brute-force a short phrase offline. Treat
 * this as a lock on a door, not a wall: it keeps out everyone who is merely
 * browsing, which is what a hidden route needs to do. Real single-owner access
 * needs a backend that checks the passphrase server-side and hands back a
 * session cookie; that is the one change that would make this genuinely safe.
 *
 * ---------------------------------------------------------------------------
 * TO CHANGE THE PASSPHRASE
 *   1. Run:  node -e "let h=0x811c9dc5;for(const c of 'YOUR NEW PHRASE'){h^=c.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0}console.log(h.toString(16))"
 *   2. Paste the printed value into PASSPHRASE_HASH below.
 * Do not write the phrase itself down anywhere in this repository — the repo
 * is public, and a phrase committed next to its hash defeats the point.
 * ---------------------------------------------------------------------------
 */

/** FNV-1a, 32-bit. Small, dependency-free, and enough to keep the phrase out of the bundle text. */
function hash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h >>> 0).toString(16)
}

/** Hash of the current administration passphrase. See the header to change it. */
const PASSPHRASE_HASH = 'e12b9a74'

/** The unlisted address the gate lives at. Nothing in the UI ever links to it. */
export const ADMIN_ACCESS_PATH = '/admin-access'

/**
 * Check a typed passphrase.
 *
 * Deliberately slow to answer. A gate that replies instantly invites a script
 * to try thousands of phrases a second; a fixed delay makes that tedious and
 * costs the one person who knows the phrase a third of a second.
 */
export function verifyAdminPassphrase(input: string): Promise<boolean> {
  const ok = hash(input.trim()) === PASSPHRASE_HASH
  return new Promise((resolve) => setTimeout(() => resolve(ok), 600))
}
