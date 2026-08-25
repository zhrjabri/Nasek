import { Link } from 'react-router-dom'
import { BadgeCheck, Crown, Scale, X } from 'lucide-react'
import type { Campaign } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { serviceLabel } from '@/data/services'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { tripDays } from '@/lib/trip'
import { Badge, Button, EmptyState, LinkButton, Rating, cx } from '@/components/ui'

/**
 * Side-by-side comparison.
 *
 * Each row declares which direction is "better" so the winner can be
 * highlighted automatically — that highlight is the entire point of the page.
 * Rows where "better" is a matter of preference (trip type, travel method)
 * carry no winner, and say nothing rather than inventing a ranking.
 */
type RowDirection = 'lower' | 'higher' | 'none'

interface Row {
  key: MessageKey
  direction: RowDirection
  /** Numeric value used to pick the winner. */
  score?: (c: Campaign) => number
  render: (c: Campaign, ctx: RenderContext) => React.ReactNode
}

interface RenderContext {
  lang: 'ar' | 'en'
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  money: (n: number) => string
  n: (n: number) => string
  dateRange: (a: string, b: string) => string
  providerName: (c: Campaign) => string
  verification: (c: Campaign) => string
}

const ROWS: Row[] = [
  {
    key: 'compare.row.price',
    direction: 'lower',
    score: (c) => c.price,
    render: (c, x) => <span className="nums text-[17px] font-bold text-nasek-900">{x.money(c.price)}</span>,
  },
  {
    key: 'compare.row.type',
    direction: 'none',
    render: (c, x) => (
      <Badge tone={c.type === 'hajj' ? 'gold' : 'green'}>
        {x.t(c.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
      </Badge>
    ),
  },
  {
    key: 'compare.row.provider',
    direction: 'none',
    render: (c, x) => <span className="text-[13px] font-semibold">{x.providerName(c)}</span>,
  },
  {
    key: 'compare.row.rating',
    direction: 'higher',
    score: (c) => c.rating,
    render: (c) => <Rating value={c.rating} count={c.reviewCount} size="sm" />,
  },
  {
    key: 'compare.row.travelMethod',
    direction: 'none',
    render: (c, x) => x.t(c.travelMethod === 'air' ? 'common.air' : 'common.land'),
  },
  {
    key: 'compare.row.departure',
    direction: 'none',
    render: (c, x) => wilayahName(c.wilayahId, x.lang),
  },
  {
    key: 'compare.row.dates',
    direction: 'none',
    render: (c, x) => (
      <span className="text-[13px]">{x.dateRange(c.departureDate, c.returnDate)}</span>
    ),
  },
  {
    key: 'compare.row.duration',
    direction: 'none',
    render: (c, x) => x.t('campaign.duration', { n: x.n(tripDays(c)) }),
  },
  {
    key: 'compare.row.hotelMakkah',
    direction: 'none',
    render: (c, x) => <span className="text-[13px]">{c.hotelMakkah[x.lang]}</span>,
  },
  {
    key: 'compare.row.hotelMadinah',
    direction: 'none',
    render: (c, x) => <span className="text-[13px]">{c.hotelMadinah[x.lang]}</span>,
  },
  {
    key: 'compare.row.haram',
    direction: 'lower',
    score: (c) => c.haramDistanceM,
    render: (c, x) => <span className="nums">{x.n(c.haramDistanceM)} m</span>,
  },
  {
    key: 'compare.row.seats',
    direction: 'higher',
    score: (c) => c.seatsAvailable,
    render: (c, x) => <span className="nums">{x.n(c.seatsAvailable)}</span>,
  },
  {
    key: 'compare.row.services',
    direction: 'higher',
    score: (c) => c.services.length,
    render: (c, x) => (
      <ul className="space-y-1">
        {c.services.map((s) => (
          <li key={s} className="text-[12px] text-ink-600">
            {serviceLabel(s, x.lang)}
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: 'compare.row.verification',
    direction: 'none',
    render: (c, x) => x.verification(c),
  },
]

export function ComparePage() {
  const { t, lang, bl, money, n, dateRange } = useI18n()
  const { compareIds, dispatch } = useStore()
  const { getCampaign, getProvider } = useCatalogue()

  const campaigns = compareIds.map(getCampaign).filter((c): c is Campaign => !!c)

  if (campaigns.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="display mb-8 text-[30px] text-ink-900 sm:text-[36px]">
          {t('compare.title')}
        </h1>
        <EmptyState
          icon={<Scale className="size-5" />}
          title={t('compare.empty')}
          body={t('compare.emptyHint')}
          action={<LinkButton to="/campaigns">{t('compare.browse')}</LinkButton>}
        />
      </main>
    )
  }

  const ctx: RenderContext = {
    lang,
    t,
    money,
    n,
    dateRange,
    providerName: (c) => {
      const p = getProvider(c.providerId)
      return p ? bl(p.name) : ''
    },
    verification: (c) => {
      const p = getProvider(c.providerId)
      return p?.verification === 'verified'
        ? t('common.verified')
        : p?.verification === 'pending'
          ? t('common.pendingVerification')
          : t('common.unverified')
    },
  }

  /** Ids of the campaigns that win a given row (ties all win). */
  const winnersFor = (row: Row): Set<string> => {
    if (row.direction === 'none' || !row.score || campaigns.length < 2) return new Set()
    const scores = campaigns.map(row.score)
    const best = row.direction === 'lower' ? Math.min(...scores) : Math.max(...scores)
    return new Set(campaigns.filter((c) => row.score!(c) === best).map((c) => c.id))
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="display text-[30px] text-ink-900 sm:text-[36px]">{t('compare.title')}</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-ink-500">{t('compare.subtitle')}</p>
      </header>

      {/* The table scrolls inside its own container; the page never does. */}
      <div className="overflow-x-auto rounded-[3px] border border-ivory-300 bg-ivory-50">
        <table className="w-full min-w-3xl border-collapse">
          <caption className="sr-only">{t('compare.title')}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky start-0 z-10 w-40 border-b border-ivory-300 bg-ivory-100 p-4 text-start"
              >
                <span className="sr-only">{t('common.compare')}</span>
              </th>
              {campaigns.map((c) => {
                const provider = getProvider(c.providerId)
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className="min-w-56 border-b border-s border-ivory-300 bg-ivory-50/60 p-4 text-start align-top"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-[3px] text-sm font-bold text-white"
                        style={{ background: provider?.brandColor }}
                        aria-hidden
                      >
                        {provider?.initials}
                      </span>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'toggleCompare', id: c.id })}
                        aria-label={`${t('common.remove')} — ${bl(c.title)}`}
                        className="rounded-md p-1 text-ink-400 transition-colors hover:bg-ivory-200 hover:text-ink-700"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <Link
                      to={`/campaigns/${c.id}`}
                      className="mt-2.5 block text-[14px] font-bold leading-snug text-ink-900 hover:text-nasek-800"
                    >
                      {bl(c.title)}
                    </Link>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {ROWS.map((row) => {
              const winners = winnersFor(row)
              return (
                <tr key={row.key} className="even:bg-ivory-50/50">
                  <th
                    scope="row"
                    className="sticky start-0 z-10 border-b border-ivory-300 bg-ivory-100 p-4 text-start align-top text-[12px] font-bold uppercase tracking-wider text-ink-500"
                  >
                    {t(row.key)}
                  </th>
                  {campaigns.map((c) => {
                    const isWinner = winners.has(c.id)
                    return (
                      <td
                        key={c.id}
                        className={cx(
                          'border-b border-s border-ivory-300 p-4 align-top text-[13.5px] text-ink-700',
                          isWinner && 'bg-nasek-50/70',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">{row.render(c, ctx)}</div>
                          {isWinner && (
                            <Badge tone="green" className="shrink-0">
                              <Crown className="size-3" />
                              {t('compare.best')}
                            </Badge>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            <tr>
              <th scope="row" className="sticky start-0 z-10 bg-ivory-100 p-4">
                <span className="sr-only">{t('common.book')}</span>
              </th>
              {campaigns.map((c) => (
                <td key={c.id} className="border-s border-ivory-300 p-4">
                  {c.seatsAvailable === 0 ? (
                    <Button block disabled>
                      {t('common.soldOut')}
                    </Button>
                  ) : (
                    <LinkButton to={`/booking/${c.id}`} block>
                      {t('common.bookNow')}
                    </LinkButton>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => dispatch({ type: 'clearCompare' })}>
          {t('common.clearAll')}
        </Button>
        {campaigns.length < 3 && (
          <LinkButton to="/campaigns" variant="ghost">
            {t('compare.browse')}
          </LinkButton>
        )}
        <p className="ms-auto flex items-center gap-1.5 text-[12px] text-ink-400">
          <BadgeCheck className="size-3.5 text-nasek-600" />
          {t('common.demoData')}
        </p>
      </div>
    </main>
  )
}
