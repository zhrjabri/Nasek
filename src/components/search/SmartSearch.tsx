import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Sparkles, Wand2, X } from 'lucide-react'
import type { SearchFilters } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { PRICE_CEILING } from '@/data/campaigns'
import { EXAMPLE_QUERIES, getAI } from '@/services/ai'
import type { NLSearchResult } from '@/services/ai'
import { applyFilters, defaultFilters } from '@/services/api/campaigns'
import { useCatalogue } from '@/hooks/useCatalogue'
import { Button, Segmented, Select, cx } from '@/components/ui'
import { encodeFilters } from '@/lib/filterParams'

/**
 * The hero search. Two ways in, both landing on the same filter state:
 * a natural-language box for people who know what they want, and structured
 * fields for people who want to browse.
 *
 * The natural-language path never hides its work — it shows the filters it
 * extracted, with the words that produced them, before running the search.
 */
export function SmartSearch({ variant = 'hero' }: { variant?: 'hero' | 'panel' }) {
  const { t, isRtl } = useI18n()
  const navigate = useNavigate()
  const { campaigns } = useCatalogue()
  const [mode, setMode] = useState<'smart' | 'classic'>('smart')

  const Arrow = isRtl ? ArrowLeft : ArrowRight

  return (
    <div
      className={cx(
        'w-full rounded-[3px] border bg-ivory-50/95 p-4 shadow-lift backdrop-blur-sm sm:p-5',
        variant === 'hero' ? 'border-ivory-300/80' : 'border-ivory-300',
      )}
    >
      <Segmented
        value={mode}
        onChange={setMode}
        size="sm"
        className="mb-4 w-full"
        label={t('search.title')}
        options={[
          {
            value: 'smart',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                {t('search.smartTab')}
              </span>
            ),
          },
          { value: 'classic', label: t('search.classicTab') },
        ]}
      />

      {mode === 'smart' ? (
        <SmartMode campaigns={campaigns} Arrow={Arrow} />
      ) : (
        <ClassicMode onSubmit={(f) => navigate(`/campaigns?${encodeFilters(f)}`)} />
      )}
    </div>
  )
}

// ------------------------------------------------------------- smart mode

function SmartMode({
  campaigns,
  Arrow,
}: {
  campaigns: import('@/types').Campaign[]
  Arrow: typeof ArrowRight
}) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [thinking, setThinking] = useState(false)
  const [result, setResult] = useState<NLSearchResult | null>(null)

  const analyse = async () => {
    if (!query.trim()) return
    setThinking(true)
    setResult(null)
    const parsed = await getAI().parseSearch(query, lang)
    setResult(parsed)
    setThinking(false)
  }

  const merged: SearchFilters = { ...defaultFilters(), ...(result?.filters ?? {}), query: '' }
  const matchCount = result && !result.empty ? applyFilters(campaigns, merged).length : 0

  return (
    <div>
      <div className="relative">
        <textarea
          id="nasek-smart-input"
          rows={2}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (result) setResult(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void analyse()
            }
          }}
          placeholder={t('search.smartPlaceholder')}
          aria-label={t('search.smartTab')}
          className="w-full resize-none rounded-[3px] border border-ivory-300 bg-ivory-50 px-4 py-3.5 pe-12 text-[15px] leading-relaxed text-ink-800 placeholder:text-ink-400 transition-colors focus:border-nasek-600 focus:bg-ivory-50 focus:outline-none focus:ring-2 focus:ring-nasek-600/15"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setResult(null)
            }}
            aria-label={t('common.clear')}
            className="absolute end-3 top-3 rounded-md p-1 text-ink-400 transition-colors hover:bg-ivory-200 hover:text-ink-700"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <p className="mt-2 text-[11px] text-ink-400">{t('search.smartHint')}</p>

      {/* Examples set React state directly — writing to the DOM node would be
          invisible to the controlled textarea. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-ink-400">{t('search.tryExample')}:</span>
        {EXAMPLE_QUERIES[lang].slice(0, 2).map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setQuery(example)
              setResult(null)
            }}
            className="rounded-full border border-ivory-300 bg-ivory-100 px-3 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:border-nasek-300 hover:bg-nasek-50 hover:text-nasek-800"
          >
            {example}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <Button
          onClick={() => void analyse()}
          loading={thinking}
          disabled={!query.trim()}
          size="lg"
          block
        >
          {!thinking && <Wand2 className="size-4" />}
          {thinking ? t('search.smartThinking') : t('search.smartAnalyse')}
        </Button>
      </div>

      {/* ------------------------------------------- what the parser found */}
      {result && (
        <div className="mt-4 rounded-[3px] border border-nasek-200 bg-nasek-50/60 p-4 animate-rise">
          {result.empty ? (
            <p className="text-[13px] leading-relaxed text-ink-600">{t('search.smartNothing')}</p>
          ) : (
            <>
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-nasek-700">
                <Sparkles className="size-3.5" />
                {t('search.smartUnderstood')}
              </p>
              <ul className="flex flex-wrap gap-2">
                {result.facets.map((facet) => (
                  <li
                    key={facet.field + facet.label}
                    className={cx(
                      'flex items-center gap-2 rounded-[3px] border bg-ivory-50 px-3 py-2',
                      facet.confidence >= 0.6
                        ? 'border-nasek-200'
                        : 'border-dashed border-gold-300',
                    )}
                  >
                    <span className="text-[13px] font-semibold text-ink-800">{facet.label}</span>
                    {facet.evidence && (
                      <span className="rounded-md bg-ivory-200 px-1.5 py-0.5 text-[10px] text-ink-400">
                        “{facet.evidence}”
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-4"
                variant="gold"
                block
                onClick={() => navigate(`/campaigns?${encodeFilters(merged)}`)}
              >
                {t('search.smartApply', { n: matchCount })}
                <Arrow className="size-4" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------- classic mode

function ClassicMode({ onSubmit }: { onSubmit: (filters: SearchFilters) => void }) {
  const { t, lang, n } = useI18n()
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters)

  const patch = (p: Partial<SearchFilters>) => setFilters((f) => ({ ...f, ...p }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(filters)
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
          {t('search.type')}
        </span>
        <Select
          value={filters.type}
          onChange={(e) => patch({ type: e.target.value as SearchFilters['type'] })}
        >
          <option value="all">{t('common.all')}</option>
          <option value="umrah">{t('common.umrah')}</option>
          <option value="hajj">{t('common.hajj')}</option>
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
          {t('search.where')}
        </span>
        <Select
          value={filters.wilayahIds[0] ?? ''}
          onChange={(e) => patch({ wilayahIds: e.target.value ? [e.target.value] : [] })}
        >
          <option value="">{t('search.anyWilayah')}</option>
          {WILAYAT.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name[lang]}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
          {t('search.budget')}
        </span>
        <Select
          value={String(filters.priceMax)}
          onChange={(e) => patch({ priceMax: Number(e.target.value) })}
        >
          <option value={PRICE_CEILING}>{t('common.all')}</option>
          {[150, 300, 500, 800, 1500, 2000].map((cap) => (
            <option key={cap} value={cap}>
              {t('smart.upTo', { n: n(cap) })}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
          {t('search.travellers')}
        </span>
        <Select
          value={String(filters.travellers)}
          onChange={(e) =>
            patch({ travellers: Number(e.target.value), minSeats: Number(e.target.value) })
          }
        >
          {[1, 2, 3, 4, 5, 6, 8, 10].map((v) => (
            <option key={v} value={v}>
              {n(v)}
            </option>
          ))}
        </Select>
      </label>

      <div className="sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="lg" block>
          {t('search.submit')}
        </Button>
      </div>
    </form>
  )
}
