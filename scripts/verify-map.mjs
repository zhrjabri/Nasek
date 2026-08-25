/**
 * Verify every wilayah marker projects INSIDE Oman's borders, and that the
 * real-distance function returns sane values. Catches a wrong sign, a swapped
 * lat/lng, or a mistyped coordinate — none of which are visible in a build.
 */
import { readFileSync } from 'node:fs'

const root = new URL('../src/data/', import.meta.url)
const outlineSrc = readFileSync(new URL('omanOutline.ts', root), 'utf8')
const geoSrc = readFileSync(new URL('geo.ts', root), 'utf8')

// --- pull the projection + paths out of the generated file ------------------
const num = (key) => Number(outlineSrc.match(new RegExp(`${key}:\\s*([\\d.-]+)`))[1])
const P = {
  lonMin: num('lonMin'),
  latMax: num('latMax'),
  cosLat: num('cosLat'),
  scale: num('scale'),
  width: num('width'),
  height: num('height'),
}

const paths = [...outlineSrc.matchAll(/'(M[\d.\-ML ]+Z)'/g)].map((m) => m[1])
console.log(`projection: lonMin=${P.lonMin.toFixed(3)} latMax=${P.latMax.toFixed(3)} scale=${P.scale.toFixed(3)}`)
console.log(`paths found: ${paths.length}`)

const toPoints = (d) =>
  d
    .replace(/Z$/, '')
    .split(/(?=[ML])/)
    .filter(Boolean)
    .map((seg) => seg.slice(1).split(' ').map(Number))

const rings = paths.map(toPoints)
rings.forEach((r, i) => console.log(`  ring ${i}: ${r.length} pts`))

const project = (lat, lng) => ({
  x: (lng - P.lonMin) * P.cosLat * P.scale,
  y: (P.latMax - lat) * P.scale,
})

// ray casting
function inRing(pt, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Distance from a point to the nearest edge of any ring, in map units. */
function distToRings(pt) {
  let best = Infinity
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j]
      const [x2, y2] = ring[i]
      const dx = x2 - x1
      const dy = y2 - y1
      const t = dx || dy ? ((pt.x - x1) * dx + (pt.y - y1) * dy) / (dx * dx + dy * dy) : 0
      const cl = Math.max(0, Math.min(1, t))
      best = Math.min(best, Math.hypot(pt.x - (x1 + cl * dx), pt.y - (y1 + cl * dy)))
    }
  }
  return best
}

// --- pull wilayat out of geo.ts ---------------------------------------------
const wilayat = [...geoSrc.matchAll(
  /\{\s*id:\s*'([a-z]+)'.*?en:\s*'([^']+)'\s*\}.*?lat:\s*([\d.]+),\s*lng:\s*([\d.]+)/gs,
)].map((m) => ({ id: m[1], name: m[2], lat: Number(m[3]), lng: Number(m[4]) }))

console.log(`\nwilayat parsed: ${wilayat.length}\n`)

let fails = 0
for (const w of wilayat) {
  const pt = project(w.lat, w.lng)
  const inside = rings.some((r) => inRing(pt, r))
  const edge = distToRings(pt)
  const inBox = pt.x >= 0 && pt.x <= P.width && pt.y >= 0 && pt.y <= P.height
  const ok = inside && inBox
  if (!ok) fails++
  console.log(
    `${ok ? ' ok ' : 'FAIL'}  ${w.id.padEnd(9)} ${w.name.padEnd(20)} ` +
      `x=${pt.x.toFixed(1).padStart(6)} y=${pt.y.toFixed(1).padStart(6)}  ` +
      `${inside ? 'on land' : 'OFF LAND'}  edge=${edge.toFixed(2)}`,
  )
}

// --- distance sanity ---------------------------------------------------------
const R = 6371
const rad = (d) => (d * Math.PI) / 180
const dist = (a, b) => {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))))
}
const byId = Object.fromEntries(wilayat.map((w) => [w.id, w]))
console.log('\ndistances (km, straight line):')
for (const [a, b, expect] of [
  ['muscat', 'seeb', '~42'],
  ['muscat', 'sohar', '~195'],
  ['muscat', 'nizwa', '~140'],
  ['muscat', 'salalah', '~830'],
  ['muscat', 'khasab', '~350'],
  ['salalah', 'sur', '~700'],
]) {
  console.log(`  ${a} -> ${b}: ${String(dist(byId[a], byId[b])).padStart(5)}   expected ${expect}`)
}

console.log(`\n${fails === 0 ? 'ALL MARKERS ON LAND' : `${fails} MARKER(S) OFF LAND`}`)
process.exit(fails === 0 ? 0 : 1)
