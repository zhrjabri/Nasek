import { useMemo } from 'react'
import type { Campaign } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT, wilayahPoint } from '@/data/geo'
import { OMAN_LANDMASSES, OMAN_PROJECTION } from '@/data/omanOutline'
import { cx } from '@/components/ui'

/**
 * Campaign coverage across Oman, drawn as inline SVG.
 *
 * The outline is the country's real coastline and land borders, projected
 * from public-domain boundary data (see `data/omanOutline.ts`). Markers are
 * placed by projecting each wilayah's actual latitude and longitude through
 * the same transform, so a town sits where it really is relative to the coast.
 *
 * Still deliberately not a tile map: no API key, no network, no cookie
 * banner, and it renders identically offline in a pitch room.
 */
export function OmanMap({
  campaigns,
  selectedId,
  onSelect,
  className,
}: {
  campaigns: Campaign[]
  selectedId: string | null
  onSelect: (wilayahId: string | null) => void
  className?: string
}) {
  const { t, lang, n } = useI18n()

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of campaigns) map.set(c.wilayahId, (map.get(c.wilayahId) ?? 0) + 1)
    return map
  }, [campaigns])

  const maxCount = Math.max(1, ...counts.values())

  const markers = useMemo(
    () =>
      WILAYAT.map((w) => ({
        wilayah: w,
        point: wilayahPoint(w),
        count: counts.get(w.id) ?? 0,
      })),
    [counts],
  )

  const { width, height } = OMAN_PROJECTION

  return (
    <div className={cx('relative', className)}>
      <svg
        viewBox={`-2 -2 ${width + 4} ${height + 4}`}
        className="mx-auto block h-auto w-full max-w-[400px]"
        role="group"
        aria-label={t('map.title')}
      >
        <defs>
          <linearGradient id="nasek-land" x1="0.2" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="var(--color-ivory-50)" />
            <stop offset="100%" stopColor="var(--color-ivory-200)" />
          </linearGradient>
          <pattern id="nasek-girih-map" width="7" height="7" patternUnits="userSpaceOnUse">
            <path
              d="M3.5 0 L7 3.5 L3.5 7 L0 3.5 Z"
              fill="none"
              stroke="var(--color-nasek-700)"
              strokeWidth="0.22"
              strokeOpacity="0.2"
            />
          </pattern>
        </defs>

        {/* Landmasses: parchment fill, girih wash, gold coastline. */}
        {OMAN_LANDMASSES.map((d, i) => (
          <g key={i}>
            <path
              d={d}
              fill="url(#nasek-land)"
              stroke="var(--color-gold-500)"
              strokeWidth="0.45"
              strokeLinejoin="round"
            />
            <path d={d} fill="url(#nasek-girih-map)" />
          </g>
        ))}

        {/* Wilayah markers, sized by how many campaigns depart from there. */}
        {markers.map(({ wilayah, point, count }) => {
          const selected = selectedId === wilayah.id
          const r = count === 0 ? 0.75 : 1.5 + (count / maxCount) * 2.6

          return (
            <g key={wilayah.id} className="cursor-pointer">
              {selected && count > 0 && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={r}
                  fill="none"
                  stroke="var(--color-gold-500)"
                  strokeWidth="0.5"
                  style={{ animation: 'nasek-pulse-ring 1.8s ease-out infinite' }}
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={r}
                className="transition-all duration-300"
                fill={
                  count === 0
                    ? 'var(--color-ivory-400)'
                    : selected
                      ? 'var(--color-gold-400)'
                      : 'var(--color-nasek-700)'
                }
                stroke="var(--color-ivory-50)"
                strokeWidth={count === 0 ? 0.25 : 0.5}
              />
              {count > 0 && (
                <text
                  x={point.x}
                  y={point.y + 0.72}
                  textAnchor="middle"
                  fontSize="2"
                  fontWeight="700"
                  fill={selected ? 'var(--color-nasek-950)' : 'var(--color-ivory-50)'}
                  className="pointer-events-none select-none"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {count}
                </text>
              )}
              {/* The visible dot is too small to tap; this is the real target. */}
              <circle
                cx={point.x}
                cy={point.y}
                r="3.6"
                fill="transparent"
                onClick={() => onSelect(selected ? null : wilayah.id)}
              >
                {/*
                  One interpolation, not four nodes. React treats `<title>` as
                  special and requires a single string child; written as
                  `{name} — {count}` it receives an array and warns, and the
                  accessible name a screen reader announces for this marker is
                  then at the mercy of how the array is joined.
                */}
                <title>
                  {`${wilayah.name[lang]} — ${
                    count > 0 ? t('map.count', { n: count }) : t('map.none')
                  }`}
                </title>
              </circle>
            </g>
          )
        })}
      </svg>

      <p className="mt-3 text-center text-2xs text-ink-400">
        {t('map.legend')} · {t('map.source')}
      </p>

      {/* Keyboard and screen-reader equivalent of the visual map. */}
      <ul className="mt-4 flex flex-wrap justify-center gap-1.5">
        {markers
          .filter((m) => m.count > 0)
          .sort((a, b) => b.count - a.count)
          .map(({ wilayah, count }) => {
            const selected = selectedId === wilayah.id
            return (
              <li key={wilayah.id}>
                <button
                  type="button"
                  onClick={() => onSelect(selected ? null : wilayah.id)}
                  aria-pressed={selected}
                  className={cx(
                    'flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    selected
                      ? 'border-gold-400 bg-gold-50 text-gold-800'
                      : 'border-ivory-400 bg-ivory-50 text-ink-600 hover:border-nasek-500 hover:text-nasek-700',
                  )}
                >
                  {wilayah.name[lang]}
                  <span className="nums rounded-[2px] bg-ivory-200 px-1.5 text-2xs text-ink-500">
                    {n(count)}
                  </span>
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}
