/*
 * Generate a new administration passphrase and the values that go in
 * `src/services/api/adminAccess.ts`.
 *
 *   node scripts/admin-passphrase.mjs                  # invent a strong one
 *   node scripts/admin-passphrase.mjs "my own phrase"  # use your own
 *
 * Prints the phrase once, plus the salt and hash to paste into the source.
 * The phrase itself must never be committed — only the salt and hash are safe
 * to store, and a phrase sitting next to its own hash defeats the point.
 */
import { pbkdf2Sync, randomBytes, randomInt } from 'node:crypto'

const ITERATIONS = 210_000
const KEY_BYTES = 32

/*
 * Ordinary words, chosen randomly. A phrase of six is far easier to remember
 * and to type than a scramble of symbols, and — because the words are picked
 * by the machine rather than by a person — much harder to guess than
 * something like "nasek-admin-2026".
 */
const WORDS = `
anchor amber arbour autumn basalt beacon bishop bramble bronze burrow canvas
cedar cinder cistern clover cobalt compass coral cornice crater crescent
cypress dagger damask dervish dhow dial dolphin dunes ember falcon fathom
ferry fig flint frigate gallery garnet gazelle ginger granite gulf harbour
harvest hazel heron incense indigo ivory jasmine juniper kestrel lantern
lattice lemon lighthouse linen lotus marble mariner meadow mercury minaret
mirror monsoon mortar mosaic myrrh nectar oasis obsidian ochre olive onyx
orchard osprey palm papyrus pearl pepper pewter pigeon pilot pomegranate
poplar portal pottery quartz quiver raven reef rigging ripple rosemary
saffron sailcloth sandal sapphire scarab sesame shale shutter silver sisal
slate spice spindle starling sumac sundial tamarind teak terrace thistle
thyme tide timber topaz trellis tulip turmeric turquoise vellum vessel
vineyard walnut wharf willow window yarn zenith
`
  .trim()
  .split(/\s+/)

function invent(count = 6) {
  return Array.from({ length: count }, () => WORDS[randomInt(WORDS.length)]).join('-')
}

const phrase = process.argv[2] ?? invent()
const salt = randomBytes(16)
const hash = pbkdf2Sync(phrase, salt, ITERATIONS, KEY_BYTES, 'sha256')

const bits = Math.round(Math.log2(WORDS.length) * phrase.split('-').length)

console.log('\n  Passphrase (write it down somewhere safe — it is shown once):\n')
console.log(`      ${phrase}\n`)
if (!process.argv[2]) {
  console.log(`  Chosen from ${WORDS.length} words; roughly ${bits} bits of entropy.\n`)
}
console.log('  Paste these two into src/services/api/adminAccess.ts:\n')
console.log(`      const PASSPHRASE_SALT = '${salt.toString('hex')}'`)
console.log(`      const PASSPHRASE_HASH = '${hash.toString('hex')}'\n`)
