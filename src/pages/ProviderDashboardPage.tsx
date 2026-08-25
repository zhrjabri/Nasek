import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BadgeCheck,
  BarChart3,
  Coins,
  LayoutGrid,
  MessageSquare,
  Pencil,
  Plus,
  Star,
  Ticket,
  ExternalLink,
  Search as SearchIcon,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react'
import type { BookingStatus, Campaign, CampaignType, ServiceKey, TravelMethod } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { WILAYAT, wilayahName } from '@/data/geo'
import { SERVICE_KEYS, serviceLabel } from '@/data/services'
import { reviewsForProvider } from '@/data/reviews'
import { SEED_BOOKINGS } from '@/data/seed'
import { NASEK_FEE_RATE } from '@/services/api/bookings'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Modal,
  ProgressBar,
  Rating,
  Segmented,
  Select,
  Textarea,
  cx,
} from '@/components/ui'

type Tab = 'overview' | 'campaigns' | 'customers' | 'reviews' | 'analytics'

const TABS: { id: Tab; key: MessageKey; icon: typeof LayoutGrid }[] = [
  { id: 'overview', key: 'prov.overview', icon: LayoutGrid },
  { id: 'campaigns', key: 'prov.myCampaigns', icon: Ticket },
  { id: 'customers', key: 'prov.customers', icon: Users },
  { id: 'reviews', key: 'prov.reviews', icon: MessageSquare },
  { id: 'analytics', key: 'prov.analytics', icon: BarChart3 },
]

/** Monthly subscription tiers — the business model made concrete. */
const PLAN_PRICE = { basic: 15, plus: 35, premium: 75 } as const

export function ProviderDashboardPage() {
  const { t, lang, bl, money, n, date } = useI18n()
  const { user, dispatch, toast } = useStore()
  const { campaignsOf, getProvider } = useCatalogue()
  // The tab lives in the URL, as it does on the customer dashboard: a
  // refresh, a bookmark or a link from the low-seat warning all land where
  // they should instead of bouncing back to the overview.
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = TABS.some((x) => x.id === tabParam) ? (tabParam as Tab) : 'overview'
  const setTab = (next: Tab) => setParams({ tab: next }, { replace: true })
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')
  const [visibleRows, setVisibleRows] = useState(40)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [replyTo, setReplyTo] = useState<{ id: string; text: string } | null>(null)

  const providerId = user?.providerId ?? 'p1'
  const provider = getProvider(providerId)
  const campaigns = campaignsOf(providerId)

  // Bookings for this owner's trips, from the shared demo history.
  const bookings = useMemo(() => {
    const ids = new Set(campaigns.map((c) => c.id))
    return SEED_BOOKINGS.filter((b) => ids.has(b.campaignId))
  }, [campaigns])

  const stats = useMemo(() => {
    const paid = bookings.filter((b) => b.status !== 'cancelled')
    const revenue = paid.reduce((sum, b) => sum + b.totalPrice, 0)
    const seatsTotal = campaigns.reduce((s, c) => s + c.seatsTotal, 0)
    const seatsAvailable = campaigns.reduce((s, c) => s + c.seatsAvailable, 0)
    return {
      bookings: paid.length,
      revenue,
      commission: revenue * NASEK_FEE_RATE,
      active: campaigns.filter((c) => c.seatsAvailable > 0).length,
      seatsAvailable,
      fillRate: seatsTotal ? ((seatsTotal - seatsAvailable) / seatsTotal) * 100 : 0,
      rating: provider?.rating ?? 0,
    }
  }, [bookings, campaigns, provider])

  /** The trips behind the "almost full" warning, so it can name them. */
  const almostFull = useMemo(
    () => campaigns.filter((c) => c.seatsAvailable > 0 && c.seatsAvailable <= 6),
    [campaigns],
  )

  const monthly = useMemo(() => buildMonthly(bookings, lang), [bookings, lang])

  const byTrip = useMemo(
    () =>
      campaigns
        .map((c) => ({
          name: bl(c.title).slice(0, 22),
          bookings: bookings.filter((b) => b.campaignId === c.id && b.status !== 'cancelled').length,
          fill: Math.round(((c.seatsTotal - c.seatsAvailable) / c.seatsTotal) * 100),
        }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 6),
    [campaigns, bookings, bl],
  )

  const byLocation = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of bookings) {
      const id = b.notes ?? 'muscat'
      map.set(id, (map.get(id) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([id, value]) => ({ name: wilayahName(id, lang), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [bookings, lang])

  /**
   * The customers tab is where an owner goes to find one person — the caller
   * on the other end of the phone. Forty rows in booking-date order is the
   * wrong shape for that, so the table is searchable by traveller, trip or
   * reference, and filterable by status.
   */
  const filteredBookings = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false
      if (!q) return true
      const trip = campaigns.find((c) => c.id === b.campaignId)
      return [b.contactName, b.reference, trip ? bl(trip.title) : '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [bookings, campaigns, customerQuery, statusFilter, bl])

  const reviews = reviewsForProvider(providerId)

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ---------------------------------------------------------- header */}
      <header className="mb-7 flex flex-wrap items-center gap-4">
        <span
          className="flex size-14 items-center justify-center rounded-[3px] text-xl font-bold text-white"
          style={{ background: provider?.brandColor ?? '#1c5e4c' }}
          aria-hidden
        >
          {provider?.initials ?? user?.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gold-600">
            {t('prov.title')}
          </p>
          <h1 className="display text-[26px] text-ink-900 sm:text-[32px]">
            {provider ? bl(provider.name) : user?.name}
          </h1>
        </div>
        {provider && (
          <Badge tone={provider.verification === 'verified' ? 'green' : 'amber'}>
            <BadgeCheck className="size-3.5" />
            {provider.verification === 'verified'
              ? t('common.verified')
              : t('common.pendingVerification')}
          </Badge>
        )}
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {t('prov.addCampaign')}
        </Button>
      </header>

      {/* ------------------------------------------------------------ tabs */}
      <nav className="scrollbar-none mb-7 flex gap-1 overflow-x-auto border-b border-ivory-300">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            className={cx(
              'relative flex shrink-0 items-center gap-2 px-4 py-3 text-[14px] font-semibold transition-colors',
              tab === item.id ? 'text-nasek-900' : 'text-ink-400 hover:text-ink-700',
            )}
          >
            <item.icon className="size-4" />
            {t(item.key)}
            {tab === item.id && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gold-500" />
            )}
          </button>
        ))}
      </nav>

      {/* -------------------------------------------------------- overview */}
      {tab === 'overview' && (
        <section className="space-y-6">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label={t('prov.kpiBookings')} value={n(stats.bookings)} icon={<Ticket className="size-4" />} />
            <Kpi label={t('prov.kpiRevenue')} value={money(stats.revenue)} icon={<Coins className="size-4" />} />
            <Kpi label={t('prov.kpiActive')} value={n(stats.active)} icon={<LayoutGrid className="size-4" />} />
            <Kpi label={t('prov.kpiSeats')} value={n(stats.seatsAvailable)} icon={<Users className="size-4" />} />
            <Kpi
              label={t('prov.kpiRating')}
              value={n(stats.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              icon={<Star className="size-4" />}
            />
            <Kpi
              label={t('prov.kpiFill')}
              value={`${n(Math.round(stats.fillRate))}%`}
              icon={<BarChart3 className="size-4" />}
              progress={stats.fillRate}
            />
          </ul>

          {/* A count alone left the owner to go hunting for which trips it
              meant. Naming them, with the seats left and the way to fix it,
              makes the warning something you can act on from here. */}
          {almostFull.length > 0 && (
            <Card className="border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-amber-900">
                    {t('prov.lowSeats', { n: n(almostFull.length) })}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-amber-800/80">{t('prov.lowSeatsFix')}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {almostFull.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[3px] bg-ivory-50/70 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-800">
                      {bl(c.title)}
                    </span>
                    <span className="nums text-[12px] font-semibold text-amber-800">
                      {t('common.seatsLeft', { n: n(c.seatsAvailable) })}
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>
                      <Pencil className="size-3.5" />
                      {t('common.edit')}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* the business model, shown where the owner actually feels it */}
          <Card className="p-6">
            <h2 className="text-[15px] font-bold text-ink-900">{t('prov.plan')}</h2>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
              {t('prov.planNote')}
            </p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <PlanFigure
                label={t('prov.planMonthly')}
                value={money(PLAN_PRICE[provider?.plan ?? 'basic'])}
                note={provider?.plan ?? 'basic'}
              />
              <PlanFigure label={t('prov.planCommission')} value={money(stats.commission)} />
              <PlanFigure
                label={t('prov.planThisMonth')}
                value={money(PLAN_PRICE[provider?.plan ?? 'basic'] + stats.commission / 12)}
                highlight
              />
            </dl>
          </Card>

          <Card className="p-6">
            <h2 className="mb-5 text-[15px] font-bold text-ink-900">{t('prov.chartBookings')}</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="prov-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#23765e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#23765e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eae5d8" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="bookings"
                    name={t('prov.kpiBookings')}
                    stroke="#23765e"
                    strokeWidth={2}
                    fill="url(#prov-area)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>
      )}

      {/* ------------------------------------------------------- campaigns */}
      {tab === 'campaigns' && (
        <section>
          {campaigns.length === 0 ? (
            <EmptyState
              icon={<Ticket className="size-5" />}
              title={t('prov.noCampaigns')}
              body={t('prov.noCampaignsHint')}
              action={
                <Button onClick={() => setEditing('new')}>
                  <Plus className="size-4" />
                  {t('prov.addCampaign')}
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={c.type === 'hajj' ? 'gold' : 'green'}>
                          {t(c.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
                        </Badge>
                        <Badge tone="neutral">
                          {t(c.travelMethod === 'air' ? 'common.air' : 'common.land')}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[15.5px] font-bold text-ink-900">{bl(c.title)}</p>
                      <p className="mt-1 text-[12.5px] text-ink-500">
                        {wilayahName(c.wilayahId, lang)} · {date(c.departureDate)} ·{' '}
                        <span className="nums">{money(c.price)}</span>
                      </p>
                      <div className="mt-2.5 max-w-xs">
                        <ProgressBar
                          value={c.seatsTotal - c.seatsAvailable}
                          max={c.seatsTotal}
                          tone={c.seatsAvailable <= 6 ? 'amber' : 'green'}
                          label={t('compare.row.seats')}
                        />
                        <p className="mt-1.5 nums text-[11px] text-ink-400">
                          {t('campaign.seatsBar', {
                            booked: n(c.seatsTotal - c.seatsAvailable),
                            total: n(c.seatsTotal),
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Deleting used to go through window.confirm — a browser
                        box in the wrong language, with no idea which trip it
                        was about. The confirmation now sits on the row it
                        belongs to and says what will happen. */}
                    {confirmDelete === c.id ? (
                      <div className="rounded-[3px] border border-red-200 bg-red-50 p-3 sm:w-72">
                        <p className="text-[13px] font-bold text-red-800">{t('prov.deleteAsk')}</p>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-red-700/80">
                          {t('prov.deleteConfirm')}
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              dispatch({ type: 'deleteCampaign', id: c.id })
                              toast(t('prov.campaignDeleted'), 'info')
                              setConfirmDelete(null)
                            }}
                          >
                            <Trash2 className="size-3.5" />
                            {t('common.delete')}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <LinkButton to={`/campaigns/${c.id}`} variant="ghost" size="sm">
                          <ExternalLink className="size-3.5" />
                          {t('prov.viewPublic')}
                        </LinkButton>
                        <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>
                          <Pencil className="size-3.5" />
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          aria-label={t('common.delete')}
                          onClick={() => setConfirmDelete(c.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ------------------------------------------------------- customers */}
      {tab === 'customers' && (
        <section>
          {bookings.length === 0 ? (
            <EmptyState icon={<Users className="size-5" />} title={t('prov.noCustomers')} />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value)
                      setVisibleRows(40)
                    }}
                    placeholder={t('prov.searchCustomers')}
                    aria-label={t('prov.searchCustomers')}
                    className="ps-10"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as BookingStatus | 'all')
                    setVisibleRows(40)
                  }}
                  className="sm:w-56"
                  aria-label={t('common.status')}
                >
                  <option value="all">{t('prov.statusAll')}</option>
                  <option value="confirmed">{t('dash.upcoming')}</option>
                  <option value="pending">{t('dash.pending')}</option>
                  <option value="completed">{t('dash.completed')}</option>
                  <option value="cancelled">{t('dash.cancelled')}</option>
                </Select>
              </div>

              {filteredBookings.length === 0 ? (
                <EmptyState
                  icon={<SearchIcon className="size-5" />}
                  title={t('prov.noMatch')}
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setCustomerQuery('')
                        setStatusFilter('all')
                      }}
                    >
                      {t('common.clearAll')}
                    </Button>
                  }
                />
              ) : (
                <>
                  <p className="mb-2.5 text-[12.5px] font-semibold text-ink-500" aria-live="polite">
                    {t('prov.showingCount', {
                      shown: n(Math.min(visibleRows, filteredBookings.length)),
                      total: n(filteredBookings.length),
                    })}
                  </p>

                  <div className="overflow-x-auto rounded-[3px] border border-ivory-300 bg-ivory-50">
                    <table className="w-full min-w-2xl text-start text-[13.5px]">
                      <thead>
                        <tr className="border-b border-ivory-300 bg-ivory-100 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                          <th scope="col" className="p-3.5 text-start">{t('prov.customerName')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('prov.customerTrip')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('prov.customerPeople')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('prov.customerDate')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('common.total')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBookings.slice(0, visibleRows).map((b) => {
                          const c = campaigns.find((x) => x.id === b.campaignId)
                          return (
                            <tr key={b.id} className="border-b border-ivory-300 last:border-0 even:bg-ivory-50/50">
                              <td className="p-3.5">
                                <span className="font-semibold text-ink-800">{b.contactName}</span>
                                {/* the reference is what a caller reads out, so
                                    it belongs beside the name, not hidden */}
                                <span className="nums block text-[11px] text-ink-400">
                                  {b.reference}
                                </span>
                              </td>
                              <td className="max-w-48 truncate p-3.5 text-ink-600">
                                {c ? bl(c.title) : '—'}
                              </td>
                              <td className="nums p-3.5 text-ink-600">{n(b.travellersCount)}</td>
                              <td className="p-3.5 text-ink-500">{date(b.bookingDate)}</td>
                              <td className="nums p-3.5 font-semibold text-ink-800">{money(b.totalPrice)}</td>
                              <td className="p-3.5">
                                <Badge tone={STATUS_TONE[b.status]}>{t(STATUS_KEY[b.status])}</Badge>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {filteredBookings.length > visibleRows && (
                    <div className="mt-4 text-center">
                      <Button variant="secondary" onClick={() => setVisibleRows((v) => v + 40)}>
                        {t('prov.showMore')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* --------------------------------------------------------- reviews */}
      {tab === 'reviews' && (
        <section>
          {reviews.length === 0 ? (
            <EmptyState icon={<MessageSquare className="size-5" />} title={t('campaign.noReviews')} />
          ) : (
            <ul className="space-y-3">
              {reviews.map((review) => (
                <li key={review.id}>
                  <Card className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[14px] font-bold text-ink-900">{review.userName}</span>
                      <Rating value={review.rating} size="sm" />
                    </div>
                    <p className="mt-2.5 text-[14px] leading-relaxed text-ink-600">
                      {bl(review.comment)}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] text-ink-400">{date(review.date)}</span>
                      {/* The Reply button did nothing at all — the one thing an
                          owner comes to this tab to do. It now writes a reply
                          that shows under the review. */}
                      {!replies[review.id] && replyTo?.id !== review.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReplyTo({ id: review.id, text: '' })}
                        >
                          {t('prov.respondReview')}
                        </Button>
                      )}
                    </div>

                    {replyTo?.id === review.id && (
                      <div className="mt-3 border-t border-ivory-300 pt-3">
                        <Textarea
                          autoFocus
                          value={replyTo.text}
                          onChange={(e) => setReplyTo({ id: review.id, text: e.target.value })}
                          placeholder={t('prov.replyPlaceholder')}
                          aria-label={t('prov.respondReview')}
                        />
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            disabled={!replyTo.text.trim()}
                            onClick={() => {
                              setReplies((r) => ({ ...r, [review.id]: replyTo.text.trim() }))
                              setReplyTo(null)
                              toast(t('prov.replyPosted'))
                            }}
                          >
                            {t('prov.replySend')}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setReplyTo(null)}>
                            {t('common.cancel')}
                          </Button>
                          <span className="text-[11px] text-ink-400">{t('prov.replyNote')}</span>
                        </div>
                      </div>
                    )}

                    {replies[review.id] && (
                      <div className="mt-3 rounded-[3px] border-s-2 border-nasek-600 bg-nasek-50/60 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-nasek-700">
                          {t('prov.replyYours')}
                        </p>
                        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-700">
                          {replies[review.id]}
                        </p>
                        <button
                          type="button"
                          onClick={() => setReplyTo({ id: review.id, text: replies[review.id] })}
                          className="mt-2 text-[12px] font-semibold text-nasek-700 hover:underline"
                        >
                          {t('common.edit')}
                        </button>
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ------------------------------------------------------- analytics */}
      {tab === 'analytics' && (
        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6 lg:col-span-2">
            <h2 className="mb-5 text-[15px] font-bold text-ink-900">{t('prov.chartRevenue')}</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eae5d8" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="revenue" name={t('prov.kpiRevenue')} fill="#1c5e4c" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-5 text-[15px] font-bold text-ink-900">{t('prov.chartTrips')}</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byTrip} layout="vertical" margin={{ left: 0, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eae5d8" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={{ fontSize: 10, fill: '#6b7269' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Bar dataKey="bookings" name={t('prov.kpiBookings')} fill="#359375" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-5 text-[15px] font-bold text-ink-900">{t('prov.chartLocations')}</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byLocation}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="52%"
                    outerRadius="80%"
                    paddingAngle={2}
                  >
                    {byLocation.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>
      )}

      {/* ------------------------------------------------------ edit modal */}
      {editing && (
        <CampaignForm
          campaign={editing === 'new' ? null : editing}
          providerId={providerId}
          onClose={() => setEditing(null)}
          onSave={(campaign) => {
            dispatch({ type: 'upsertCampaign', campaign })
            toast(t('prov.campaignSaved'))
            setEditing(null)
          }}
        />
      )}
    </main>
  )
}

const PIE_COLORS = ['#1c5e4c', '#359375', '#c9a961', '#8fd0b5', '#a8842c', '#23765e']

/** Booking status → badge. `pending` means the booking is unconfirmed; it used
 *  to borrow the provider-verification wording, which said something else. */
const STATUS_TONE: Record<BookingStatus, 'green' | 'gold' | 'red' | 'neutral'> = {
  confirmed: 'green',
  pending: 'gold',
  completed: 'neutral',
  cancelled: 'red',
}

const STATUS_KEY: Record<BookingStatus, MessageKey> = {
  confirmed: 'dash.upcoming',
  pending: 'dash.pending',
  completed: 'dash.completed',
  cancelled: 'dash.cancelled',
}

// ------------------------------------------------------------------ pieces

function Kpi({
  label,
  value,
  icon,
  progress,
}: {
  label: string
  value: string
  icon: React.ReactNode
  progress?: number
}) {
  return (
    <li>
      <Card className="p-5">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">
          <span className="text-nasek-600">{icon}</span>
          {label}
        </div>
        <p className="nums mt-2.5 text-[28px] font-bold leading-none text-ink-900">{value}</p>
        {progress != null && <ProgressBar className="mt-3" value={progress} label={label} />}
      </Card>
    </li>
  )
}

function PlanFigure({
  label,
  value,
  note,
  highlight,
}: {
  label: string
  value: string
  note?: string
  highlight?: boolean
}) {
  return (
    <div
      className={cx(
        'rounded-[3px] border p-4',
        highlight ? 'border-nasek-200 bg-nasek-50' : 'border-ivory-300 bg-ivory-50/60',
      )}
    >
      <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="nums mt-2 text-[22px] font-bold text-ink-900">{value}</dd>
      {note && (
        <dd className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gold-600">
          {note}
        </dd>
      )}
    </div>
  )
}

/** Aggregate bookings into the last 12 months, labelled in the active locale. */
function buildMonthly(bookings: { bookingDate: string; totalPrice: number; status: string }[], lang: 'ar' | 'en') {
  const buckets = new Map<string, { bookings: number; revenue: number }>()
  const now = new Date()
  const keys: string[] = []

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    keys.push(key)
    buckets.set(key, { bookings: 0, revenue: 0 })
  }

  for (const b of bookings) {
    if (b.status === 'cancelled') continue
    const key = b.bookingDate.slice(0, 7)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.bookings += 1
      bucket.revenue += b.totalPrice
    }
  }

  const fmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short' })
  return keys.map((key) => {
    const [year, month] = key.split('-').map(Number)
    return {
      month: fmt.format(new Date(year, month - 1, 1)),
      ...buckets.get(key)!,
    }
  })
}

// ------------------------------------------------------------ campaign form

function CampaignForm({
  campaign,
  providerId,
  onClose,
  onSave,
}: {
  campaign: Campaign | null
  providerId: string
  onClose: () => void
  onSave: (campaign: Campaign) => void
}) {
  const { t, lang, n } = useI18n()
  const isNew = campaign === null
  const [form, setForm] = useState(() => ({
    titleAr: campaign?.title.ar ?? '',
    titleEn: campaign?.title.en ?? '',
    descAr: campaign?.description.ar ?? '',
    descEn: campaign?.description.en ?? '',
    type: (campaign?.type ?? 'umrah') as CampaignType,
    price: String(campaign?.price ?? 150),
    wilayahId: campaign?.wilayahId ?? 'muscat',
    travelMethod: (campaign?.travelMethod ?? 'land') as TravelMethod,
    departureDate: campaign?.departureDate ?? '',
    returnDate: campaign?.returnDate ?? '',
    seatsTotal: String(campaign?.seatsTotal ?? 40),
    seatsAvailable: String(campaign?.seatsAvailable ?? 40),
    hotelMakkah: campaign?.hotelMakkah.ar ?? '',
    hotelMadinah: campaign?.hotelMadinah.ar ?? '',
    haramDistanceM: String(campaign?.haramDistanceM ?? 800),
    services: campaign?.services ?? (['hotel_makkah', 'transport', 'visa'] as ServiceKey[]),
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmClose, setConfirmClose] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const initialForm = useRef(form)
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm.current)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  /** Today, as the date input wants it — no trip can depart in the past. */
  const today = new Date().toISOString().slice(0, 10)

  const FIELD_LABEL: Record<string, string> = {
    titleAr: t('prov.formTitleAr'),
    titleEn: t('prov.formTitleEn'),
    departureDate: t('prov.formDeparture'),
    returnDate: t('prov.formReturn'),
    seatsAvailable: t('prov.formSeatsAvailable'),
  }

  /** Closing a half-filled form is one stray click away — on the backdrop, on
   *  Escape. Ask before throwing the work away. */
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose())

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.titleAr.trim()) next.titleAr = t('common.required')
    if (!form.titleEn.trim()) next.titleEn = t('common.required')
    if (!form.departureDate) next.departureDate = t('common.required')
    if (!form.returnDate) next.returnDate = t('common.required')
    // These two used to report "Required" on a field that was filled in,
    // which said nothing about what was actually wrong with it.
    if (form.returnDate && form.departureDate && form.returnDate < form.departureDate) {
      next.returnDate = t('prov.errReturnBefore')
    }
    if (Number(form.seatsAvailable) > Number(form.seatsTotal)) {
      next.seatsAvailable = t('prov.errSeatsExceed')
    }
    setErrors(next)
    if (Object.keys(next).length) {
      // The offending field can sit well below the fold in a form this long.
      setTimeout(() => summaryRef.current?.focus(), 0)
      return
    }

    onSave({
      id: campaign?.id ?? `own-${Date.now()}`,
      providerId,
      type: form.type,
      title: { ar: form.titleAr, en: form.titleEn },
      description: { ar: form.descAr, en: form.descEn },
      price: Number(form.price),
      wilayahId: form.wilayahId,
      travelMethod: form.travelMethod,
      departureDate: form.departureDate,
      returnDate: form.returnDate,
      seatsTotal: Number(form.seatsTotal),
      seatsAvailable: Number(form.seatsAvailable),
      services: form.services,
      hotelMakkah: { ar: form.hotelMakkah, en: form.hotelMakkah },
      hotelMadinah: { ar: form.hotelMadinah, en: form.hotelMadinah },
      haramDistanceM: Number(form.haramDistanceM),
      rating: campaign?.rating ?? 0,
      reviewCount: campaign?.reviewCount ?? 0,
      featured: campaign?.featured ?? false,
      bookingsCount: campaign?.bookingsCount ?? 0,
    })
  }

  return (
    <Modal
      open
      wide
      onClose={requestClose}
      title={campaign ? t('prov.editCampaign') : t('prov.newCampaign')}
    >
      <form onSubmit={submit} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <div
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            className="rounded-[3px] border border-red-200 bg-red-50 p-4 focus:outline-none focus:ring-1 focus:ring-red-400"
          >
            <p className="text-[13px] font-bold text-red-800">{t('prov.fixErrors')}</p>
            <ul className="mt-1.5 list-disc space-y-0.5 ps-5 text-[12.5px] leading-relaxed text-red-700">
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>
                  <span className="font-semibold">{FIELD_LABEL[key] ?? key}</span> — {message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formTitleAr')} required error={errors.titleAr}>
            {(p) => <Input {...p} dir="rtl" value={form.titleAr} onChange={(e) => set('titleAr', e.target.value)} />}
          </Field>
          <Field label={t('prov.formTitleEn')} required error={errors.titleEn}>
            {(p) => <Input {...p} dir="ltr" value={form.titleEn} onChange={(e) => set('titleEn', e.target.value)} />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formDescAr')}>
            {(p) => (
              <Textarea {...p} dir="rtl" value={form.descAr} onChange={(e) => set('descAr', e.target.value)} />
            )}
          </Field>
          <Field label={t('prov.formDescEn')}>
            {(p) => (
              <Textarea {...p} dir="ltr" value={form.descEn} onChange={(e) => set('descEn', e.target.value)} />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formType')}>
            {() => (
              <Segmented
                className="w-full"
                size="sm"
                label={t('prov.formType')}
                value={form.type}
                onChange={(v) => set('type', v)}
                options={[
                  { value: 'umrah', label: t('common.umrah') },
                  { value: 'hajj', label: t('common.hajj') },
                ]}
              />
            )}
          </Field>
          <Field label={t('prov.formMethod')}>
            {() => (
              <Segmented
                className="w-full"
                size="sm"
                label={t('prov.formMethod')}
                value={form.travelMethod}
                onChange={(v) => set('travelMethod', v)}
                options={[
                  { value: 'land', label: t('common.land') },
                  { value: 'air', label: t('common.air') },
                ]}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formPrice')}>
            {(p) => (
              <Input {...p} type="number" min={20} value={form.price} onChange={(e) => set('price', e.target.value)} />
            )}
          </Field>
          <Field label={t('prov.formWilayah')}>
            {(p) => (
              <Select {...p} value={form.wilayahId} onChange={(e) => set('wilayahId', e.target.value)}>
                {WILAYAT.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name[lang]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formDeparture')} required error={errors.departureDate}>
            {(p) => (
              <Input
                {...p}
                type="date"
                min={today}
                value={form.departureDate}
                onChange={(e) => set('departureDate', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('prov.formReturn')} required error={errors.returnDate}>
            {(p) => (
              <Input
                {...p}
                type="date"
                min={form.departureDate || today}
                value={form.returnDate}
                onChange={(e) => set('returnDate', e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className={cx('grid gap-4', isNew ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
          {/* On a new trip the two seat fields were a trap: nothing is booked
              yet, so "seats still available" can only be the total. It follows
              the total while creating, and appears once the trip exists and
              the two numbers can legitimately differ. */}
          <Field label={t('prov.formSeats')} hint={isNew ? t('prov.seatsNewNote') : undefined}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                value={form.seatsTotal}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    seatsTotal: e.target.value,
                    seatsAvailable: isNew ? e.target.value : f.seatsAvailable,
                  }))
                }
              />
            )}
          </Field>
          {!isNew && (
            <Field label={t('prov.formSeatsAvailable')} error={errors.seatsAvailable}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  max={Number(form.seatsTotal)}
                  value={form.seatsAvailable}
                  onChange={(e) => set('seatsAvailable', e.target.value)}
                />
              )}
            </Field>
          )}
          <Field label={t('prov.formHaram')}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                step={50}
                value={form.haramDistanceM}
                onChange={(e) => set('haramDistanceM', e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formHotelMakkah')}>
            {(p) => (
              <Input {...p} value={form.hotelMakkah} onChange={(e) => set('hotelMakkah', e.target.value)} />
            )}
          </Field>
          <Field label={t('prov.formHotelMadinah')}>
            {(p) => (
              <Input {...p} value={form.hotelMadinah} onChange={(e) => set('hotelMadinah', e.target.value)} />
            )}
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-700">
            {t('prov.formServices')}
          </legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {SERVICE_KEYS.map((s) => (
              <Checkbox
                key={s}
                checked={form.services.includes(s)}
                onChange={() =>
                  set(
                    'services',
                    form.services.includes(s)
                      ? form.services.filter((x) => x !== s)
                      : [...form.services, s],
                  )
                }
                label={serviceLabel(s, lang)}
              />
            ))}
          </div>
          <p className="mt-2 nums text-[11px] text-ink-400">
            {t('prov.servicesCount', {
              n: n(form.services.length),
              total: n(SERVICE_KEYS.length),
            })}
          </p>
        </fieldset>

        {confirmClose ? (
          <div className="rounded-[3px] border border-amber-200 bg-amber-50 p-4">
            <p className="text-[13px] font-bold text-amber-900">{t('prov.discardAsk')}</p>
            <div className="mt-2.5 flex gap-2">
              <Button type="button" variant="danger" size="sm" onClick={onClose}>
                {t('prov.discard')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmClose(false)}
              >
                {t('prov.keepEditing')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2.5 border-t border-ivory-300 pt-5">
            <Button type="submit" size="lg" block>
              {t('prov.saveCampaign')}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={requestClose}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
      </form>
    </Modal>
  )
}
