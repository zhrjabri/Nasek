import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Campaign, SearchFilters, ServiceKey } from '@/types'
import { useI18n } from '@/i18n'
import { PRICE_CEILING, PRICE_FLOOR } from '@/data/campaigns'
import { wilayatByGovernorate } from '@/data/geo'
import { SERVICE_KEYS, serviceLabel } from '@/data/services'
import { countActiveFilters, defaultFilters } from '@/services/api/campaigns'
import { Badge, Checkbox, Input, Segmented, cx } from '@/components/ui'

interface Props {
  filters: SearchFilters
  onChange: (next: SearchFilters) => void
  /** Full campaign pool, used to show a live count beside each option. */
  campaigns: Campaign[]
}

export function CampaignFilters({ filters, onChange, campaigns }: Props) {
  const { t, lang, n, money } = useI18n()
  const patch = (p: Partial<SearchFilters>) => onChange({ ...filters, ...p })
  const activeCount = countActiveFilters(filters)

  // Counts are computed against everything except the facet being counted, so
  // a wilayah doesn't show "0" merely because it is currently deselected.
  const wilayahCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of campaigns) {
      if (filters.type !== 'all' && c.type !== filters.type) continue
      map.set(c.wilayahId, (map.get(c.wilayahId) ?? 0) + 1)
    }
    return map
  }, [campaigns, filters.type])

  /*
   * The slider's top end follows the catalogue. PRICE_CEILING was fixed when
   * the seed data was written and the seed is now empty, so on a site whose
   * trips are all published by owners it could easily fall short of the
   * dearest one -- leaving a trip no slider position could reach.
   */
  const ceiling = useMemo(() => {
    const dearest = campaigns.reduce((max, c) => Math.max(max, c.price), 0)
    return Math.max(PRICE_CEILING, Math.ceil(dearest / 100) * 100)
  }, [campaigns])

  const serviceCounts = useMemo(() => {
    const map = new Map<ServiceKey, number>()
    for (const c of campaigns) {
      if (filters.type !== 'all' && c.type !== filters.type) continue
      for (const s of c.services) map.set(s, (map.get(s) ?? 0) + 1)
    }
    return map
  }, [campaigns, filters.type])

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
          {t('common.filters')}
          {activeCount > 0 && <Badge tone="green">{t('filters.active', { n: activeCount })}</Badge>}
        </h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...defaultFilters(), query: filters.query })}
            className="inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 text-xs font-semibold text-ink-500 transition-colors hover:bg-ivory-200 hover:text-ink-800"
          >
            <RotateCcw className="size-3.5" />
            {t('common.clearAll')}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------- trip type */}
      <Group title={t('filters.type')}>
        <Segmented
          size="sm"
          className="w-full"
          label={t('filters.type')}
          value={filters.type}
          onChange={(type) => patch({ type })}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'umrah', label: t('common.umrah') },
            { value: 'hajj', label: t('common.hajj') },
          ]}
        />
      </Group>

      {/* ----------------------------------------------------------- price */}
      <Group title={t('filters.price')}>
        <div className="flex items-baseline justify-between text-sm">
          <span className="nums font-semibold text-ink-800">{money(filters.priceMin)}</span>
          <span className="nums font-semibold text-ink-800">{money(filters.priceMax)}</span>
        </div>
        <input
          type="range"
          className="nasek-range mt-3"
          min={PRICE_FLOOR}
          max={ceiling}
          step={10}
          value={filters.priceMax}
          aria-label={t('filters.price')}
          onChange={(e) =>
            patch({ priceMax: Math.max(Number(e.target.value), filters.priceMin + 10) })
          }
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[150, 300, 500, 1000, 2000].map((cap) => (
            <button
              key={cap}
              type="button"
              onClick={() => patch({ priceMin: PRICE_FLOOR, priceMax: cap })}
              className={cx(
                'rounded-[3px] border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                filters.priceMax === cap
                  ? 'border-nasek-700 bg-nasek-800 text-ivory-50'
                  : 'border-ivory-300 bg-ivory-50 text-ink-500 hover:border-nasek-300',
              )}
            >
              {t('smart.upTo', { n: n(cap) })}
            </button>
          ))}
        </div>
      </Group>

      {/* -------------------------------------------------- travel method */}
      <Group title={t('filters.travelMethod')}>
        <Segmented
          size="sm"
          className="w-full"
          label={t('filters.travelMethod')}
          value={filters.travelMethod}
          onChange={(travelMethod) => patch({ travelMethod })}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'air', label: t('common.air') },
            { value: 'land', label: t('common.land') },
          ]}
        />
      </Group>

      {/* -------------------------------------------------------- wilayah */}
      <Group title={t('filters.location')}>
        <div className="max-h-64 space-y-3 overflow-y-auto pe-1">
          {wilayatByGovernorate(lang).map(([governorate, list]) => {
            const relevant = list.filter((w) => (wilayahCounts.get(w.id) ?? 0) > 0)
            if (!relevant.length) return null
            return (
              <div key={governorate}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  {governorate}
                </p>
                {relevant.map((w) => (
                  <Checkbox
                    key={w.id}
                    checked={filters.wilayahIds.includes(w.id)}
                    onChange={() => patch({ wilayahIds: toggleIn(filters.wilayahIds, w.id) })}
                    label={w.name[lang]}
                    count={wilayahCounts.get(w.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </Group>

      {/* ----------------------------------------------------------- dates */}
      <Group title={t('filters.date')}>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={filters.dateFrom ?? ''}
            aria-label={t('common.from')}
            onChange={(e) => patch({ dateFrom: e.target.value || null })}
          />
          <Input
            type="date"
            value={filters.dateTo ?? ''}
            aria-label={t('common.to')}
            onChange={(e) => patch({ dateTo: e.target.value || null })}
          />
        </div>
      </Group>

      {/* ---------------------------------------------------------- rating */}
      <Group title={t('filters.rating')}>
        <div className="flex flex-wrap gap-1.5">
          {[0, 4, 4.5, 4.8].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => patch({ minRating: r })}
              className={cx(
                'rounded-[3px] border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                filters.minRating === r
                  ? 'border-nasek-700 bg-nasek-800 text-ivory-50'
                  : 'border-ivory-300 bg-ivory-50 text-ink-500 hover:border-nasek-300',
              )}
            >
              {r === 0 ? t('filters.anyRating') : t('filters.starsUp', { n: n(r) })}
            </button>
          ))}
        </div>
      </Group>

      {/* ----------------------------------------------------------- seats */}
      <Group title={t('filters.seats')}>
        <div className="flex flex-wrap gap-1.5">
          {[0, 2, 4, 10].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => patch({ minSeats: s })}
              className={cx(
                'rounded-[3px] border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                filters.minSeats === s
                  ? 'border-nasek-700 bg-nasek-800 text-ivory-50'
                  : 'border-ivory-300 bg-ivory-50 text-ink-500 hover:border-nasek-300',
              )}
            >
              {s === 0 ? t('common.all') : `${n(s)}+`}
            </button>
          ))}
        </div>
      </Group>

      {/* -------------------------------------------------------- services */}
      <Group title={t('filters.services')}>
        <div className="max-h-56 overflow-y-auto pe-1">
          {SERVICE_KEYS.filter((s) => (serviceCounts.get(s) ?? 0) > 0).map((s) => (
            <Checkbox
              key={s}
              checked={filters.services.includes(s)}
              onChange={() => patch({ services: toggleIn(filters.services, s) })}
              label={serviceLabel(s, lang)}
              count={serviceCounts.get(s)}
            />
          ))}
        </div>
      </Group>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-ivory-300 pt-5 first-of-type:border-0 first-of-type:pt-0">
      <legend className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">
        {title}
      </legend>
      {children}
    </fieldset>
  )
}
