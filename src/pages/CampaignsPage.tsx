import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, Search as SearchIcon, X } from 'lucide-react'
import type { Campaign, SearchFilters, SortKey } from '@/types'
import { useI18n } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { serviceLabel } from '@/data/services'
import { applyFilters, applySort, countActiveFilters, defaultFilters } from '@/services/api/campaigns'
import { decodeFilters, encodeFilters } from '@/lib/filterParams'
import { useCatalogue } from '@/hooks/useCatalogue'
import { CampaignCard, CampaignCardSkeleton } from '@/components/campaign/CampaignCard'
import { CampaignFilters } from '@/components/campaign/CampaignFilters'
import { Badge, Button, EmptyState, Input, Modal, Select, cx } from '@/components/ui'

const SORTS: SortKey[] = ['recommended', 'price_asc', 'price_desc', 'rating', 'popular', 'seats']

export function CampaignsPage() {
  const { t, n } = useI18n()
  const { campaigns, providers } = useCatalogue()
  const [params, setParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const { filters: urlFilters, sort: urlSort } = useMemo(() => decodeFilters(params), [params])
  const [filters, setFilters] = useState<SearchFilters>(urlFilters)
  const [sort, setSort] = useState<SortKey>(urlSort)
  const [queryDraft, setQueryDraft] = useState(urlFilters.query)

  // The URL is the source of truth: a back/forward navigation or a shared link
  // must reset the panel, not fight with it.
  useEffect(() => {
    setFilters(urlFilters)
    setSort(urlSort)
    setQueryDraft(urlFilters.query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // Push filter changes back into the URL, replacing history so the back
  // button leaves the page rather than stepping through every slider nudge.
  const commit = (next: SearchFilters, nextSort: SortKey = sort) => {
    setFilters(next)
    setSort(nextSort)
    setParams(new URLSearchParams(encodeFilters(next, nextSort)), { replace: true })
  }

  // Search as you type. Waiting on the Enter key hid results behind a
  // keystroke people had no reason to guess; a third of a second of quiet is
  // enough to tell typing from finishing.
  useEffect(() => {
    if (queryDraft === filters.query) return
    const id = setTimeout(() => commit({ ...filters, query: queryDraft }), 340)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDraft])

  // A short delay so the skeletons register — the search really is instant.
  useEffect(() => {
    setLoading(true)
    const id = setTimeout(() => setLoading(false), 260)
    return () => clearTimeout(id)
  }, [params])

  const results: Campaign[] = useMemo(
    () => applySort(applyFilters(campaigns, filters, providers), sort, providers),
    [campaigns, filters, sort, providers],
  )

  const activeCount = countActiveFilters(filters)

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ------------------------------------------------------- page head */}
      <header className="mb-6">
        <h1 className="display text-[30px] text-ink-900 sm:text-[36px]">{t('nav.campaigns')}</h1>
        <p className="mt-2 text-[15px] text-ink-500">{t('common.tagline')}</p>
      </header>

      {/* ---------------------------------------------------- search + sort */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            commit({ ...filters, query: queryDraft })
          }}
        >
          <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            placeholder={t('common.search')}
            aria-label={t('common.search')}
            className="ps-10 pe-10"
          />
          {queryDraft && (
            <button
              type="button"
              onClick={() => {
                setQueryDraft('')
                commit({ ...filters, query: '' })
              }}
              aria-label={t('common.clear')}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-400 hover:bg-ivory-200"
            >
              <X className="size-4" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="lg:hidden"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="size-4" />
            {t('common.filters')}
            {activeCount > 0 && <Badge tone="green">{n(activeCount)}</Badge>}
          </Button>

          <label className="flex items-center gap-2">
            <span className="hidden text-[13px] font-semibold text-ink-500 sm:block">
              {t('sort.label')}
            </span>
            <Select
              value={sort}
              onChange={(e) => commit(filters, e.target.value as SortKey)}
              className="w-48"
              aria-label={t('sort.label')}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}` as const)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      <ActiveFilterChips filters={filters} onChange={commit} />

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* ------------------------------------------------- filters (lg) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-[3px] border border-ivory-300 bg-ivory-50 p-5 pe-4">
            <CampaignFilters filters={filters} onChange={commit} campaigns={campaigns} />
          </div>
        </aside>

        {/* ------------------------------------------------------ results */}
        <section aria-live="polite">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-600">
              {loading
                ? t('common.searching')
                : results.length === 1
                  ? t('campaign.resultsOne')
                  : t('campaign.results', { n: n(results.length) })}
            </p>
          </div>

          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <CampaignCardSkeleton key={i} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="size-5" />}
              title={t('campaign.noResults')}
              body={t('campaign.noResultsHint')}
              action={
                <Button variant="secondary" onClick={() => commit(defaultFilters())}>
                  {t('common.clearAll')}
                </Button>
              }
            />
          ) : (
            <div className={cx('stagger grid gap-5 sm:grid-cols-2 xl:grid-cols-3')}>
              {results.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* -------------------------------------------------- filters (sm) */}
      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('common.filters')}
      >
        <CampaignFilters filters={filters} onChange={commit} campaigns={campaigns} />
        <Button block size="lg" className="mt-6" onClick={() => setFiltersOpen(false)}>
          {t('filters.showResults', { n: n(results.length) })}
        </Button>
      </Modal>
    </main>
  )
}

/**
 * What is currently narrowing the list, and how to undo any one of it.
 *
 * On a phone the filter panel lives behind a button in a sheet, so without
 * this row the only sign that eighteen campaigns became three is the count.
 * Each chip removes exactly one choice — the whole panel no longer has to be
 * reopened to loosen a single filter.
 */
function ActiveFilterChips({
  filters,
  onChange,
}: {
  filters: SearchFilters
  onChange: (next: SearchFilters) => void
}) {
  const { t, lang, n, money, date } = useI18n()
  const d = defaultFilters()
  const chips: { id: string; label: string; clear: () => void }[] = []

  if (filters.type !== d.type) {
    chips.push({
      id: 'type',
      label: t(filters.type === 'hajj' ? 'common.hajj' : 'common.umrah'),
      clear: () => onChange({ ...filters, type: d.type }),
    })
  }

  if (filters.priceMin !== d.priceMin || filters.priceMax !== d.priceMax) {
    chips.push({
      id: 'price',
      label: `${money(filters.priceMin)} – ${money(filters.priceMax)}`,
      clear: () => onChange({ ...filters, priceMin: d.priceMin, priceMax: d.priceMax }),
    })
  }

  if (filters.travelMethod !== d.travelMethod) {
    chips.push({
      id: 'via',
      label: t(filters.travelMethod === 'air' ? 'common.air' : 'common.land'),
      clear: () => onChange({ ...filters, travelMethod: d.travelMethod }),
    })
  }

  for (const id of filters.wilayahIds) {
    chips.push({
      id: `w-${id}`,
      label: wilayahName(id, lang),
      clear: () => onChange({ ...filters, wilayahIds: filters.wilayahIds.filter((w) => w !== id) }),
    })
  }

  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      id: 'dates',
      label: [
        filters.dateFrom && `${t('common.from')} ${date(filters.dateFrom)}`,
        filters.dateTo && `${t('common.to')} ${date(filters.dateTo)}`,
      ]
        .filter(Boolean)
        .join(' · '),
      clear: () => onChange({ ...filters, dateFrom: null, dateTo: null }),
    })
  }

  if (filters.minRating > 0) {
    chips.push({
      id: 'rating',
      label: t('filters.starsUp', { n: n(filters.minRating) }),
      clear: () => onChange({ ...filters, minRating: 0 }),
    })
  }

  if (filters.minSeats > 0) {
    chips.push({
      id: 'seats',
      label: t('filters.chipSeats', { n: n(filters.minSeats) }),
      clear: () => onChange({ ...filters, minSeats: 0 }),
    })
  }

  for (const s of filters.services) {
    chips.push({
      id: `s-${s}`,
      label: serviceLabel(s, lang),
      clear: () => onChange({ ...filters, services: filters.services.filter((x) => x !== s) }),
    })
  }

  if (chips.length === 0) return null

  return (
    <ul aria-label={t('filters.applied')} className="mb-6 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.id}>
          <button
            type="button"
            onClick={chip.clear}
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-nasek-200 bg-nasek-50 py-1.5 ps-3 pe-2 text-[12.5px] font-semibold text-nasek-800 transition-colors hover:border-nasek-400 hover:bg-nasek-100"
          >
            <span>{chip.label}</span>
            <X className="size-3.5 text-nasek-600" aria-hidden />
            <span className="sr-only">{t('filters.remove')}</span>
          </button>
        </li>
      ))}
      {chips.length > 1 && (
        <li>
          <button
            type="button"
            onClick={() => onChange({ ...defaultFilters(), query: filters.query })}
            className="rounded-[3px] px-2 py-1.5 text-[12.5px] font-semibold text-ink-500 transition-colors hover:bg-ivory-200 hover:text-ink-900"
          >
            {t('common.clearAll')}
          </button>
        </li>
      )}
    </ul>
  )
}
