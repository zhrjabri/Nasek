/**
 * Turn real Oman boundary GeoJSON into a projected SVG outline plus the
 * projection constants, so map markers and the coastline share one transform.
 *
 * Source: georgique/world-geojson (public domain boundary data).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const src = process.argv[2]
const out = process.argv[3]

const gj = JSON.parse(readFileSync(src, 'utf8'))
const features = gj.type === 'FeatureCollection' ? gj.features : [gj]

// Pull every ring out, tagged with its rough area so we can pick the ones
// that matter and drop sub-pixel islets.
const rings = []
for (const f of features) {
  const g = f.geometry ?? f
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  for (const poly of polys) {
    for (const ring of poly) {
      const area = Math.abs(
        ring.reduce((s, p, i) => {
          const q = ring[(i + 1) % ring.length]
          return s + (p[0] * q[1] - q[0] * p[1])
        }, 0) / 2,
      )
      rings.push({ ring, area })
    }
  }
}
rings.sort((a, b) => b.area - a.area)

// Mainland, Musandam and Masirah carry the country's recognisable shape.
// The remaining rings are uninhabited specks that would render as noise.
const KEEP = 3
const kept = rings.slice(0, KEEP)
console.log(
  'kept rings:',
  kept.map((r) => `${r.ring.length}pts area=${r.area.toFixed(3)}`).join(', '),
)

// --- projection -------------------------------------------------------------
// Equirectangular with the standard parallel at the country's mid-latitude:
// north-south distances stay true and the shape is undistorted at this size,
// which is what a national reference map needs.
const all = kept.flatMap((r) => r.ring)
const lons = all.map((p) => p[0])
const lats = all.map((p) => p[1])
const lonMin = Math.min(...lons)
const lonMax = Math.max(...lons)
const latMin = Math.min(...lats)
const latMax = Math.max(...lats)
const latMid = (latMin + latMax) / 2
const cosLat = Math.cos((latMid * Math.PI) / 180)

const rawW = (lonMax - lonMin) * cosLat
const rawH = latMax - latMin

const WIDTH = 100
const scale = WIDTH / rawW
const HEIGHT = +(rawH * scale).toFixed(3)

const project = ([lon, lat]) => [
  (lon - lonMin) * cosLat * scale,
  (latMax - lat) * scale, // SVG y grows downward
]

// --- Douglas–Peucker --------------------------------------------------------
function perpDist(p, a, b) {
  const [x, y] = p
  const [x1, y1] = a
  const [x2, y2] = b
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1)
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
  const cl = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (x1 + cl * dx), y - (y1 + cl * dy))
}

function simplify(points, tol) {
  if (points.length < 3) return points
  let maxD = 0
  let idx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1])
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD <= tol) return [points[0], points[points.length - 1]]
  return [
    ...simplify(points.slice(0, idx + 1), tol).slice(0, -1),
    ...simplify(points.slice(idx), tol),
  ]
}

// Tight tolerance — this only collapses redundant clusters, it does not
// smooth away real coastline (Musandam's fjords must survive).
const TOL = 0.06

const paths = kept.map(({ ring }) => {
  const projected = ring.map(project)
  const simplified = simplify(projected, TOL)
  const d =
    simplified
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join('') + 'Z'
  return { d, before: ring.length, after: simplified.length }
})

for (const p of paths) console.log(`ring: ${p.before} -> ${p.after} pts`)

const [mainland, musandam, masirah] = paths

const file = `/**
 * Oman's coastline and land borders, projected for the NASEK map.
 *
 * GENERATED — do not edit by hand. Produced from public-domain boundary
 * GeoJSON (georgique/world-geojson) by projecting to an equirectangular
 * grid with the standard parallel at Oman's mid-latitude (${latMid.toFixed(2)}°N) and
 * simplifying with Douglas–Peucker at a ${TOL} unit tolerance.
 *
 * Three landmasses are kept — the mainland, the Musandam exclave and Masirah
 * Island. Smaller uninhabited islets are omitted: at this scale they render
 * as specks and no campaign departs from them.
 */

/** The projection the outline was built with. Markers must use the same one
 *  or they will not line up with the coast. */
export const OMAN_PROJECTION = {
  lonMin: ${lonMin},
  lonMax: ${lonMax},
  latMin: ${latMin},
  latMax: ${latMax},
  cosLat: ${cosLat},
  scale: ${scale},
  width: ${WIDTH},
  height: ${HEIGHT},
} as const

/** Project real coordinates into the map's viewBox space. */
export function projectPoint(lat: number, lng: number): { x: number; y: number } {
  const p = OMAN_PROJECTION
  return {
    x: (lng - p.lonMin) * p.cosLat * p.scale,
    y: (p.latMax - lat) * p.scale,
  }
}

export const OMAN_MAINLAND =
  '${mainland.d}'

export const OMAN_MUSANDAM =
  '${musandam.d}'

export const OMAN_MASIRAH =
  '${masirah.d}'

export const OMAN_LANDMASSES = [OMAN_MAINLAND, OMAN_MUSANDAM, OMAN_MASIRAH]
`

writeFileSync(out, file, 'utf8')
console.log(`\nviewBox: 0 0 ${WIDTH} ${HEIGHT}`)
console.log('written:', out, `(${file.length} bytes)`)
