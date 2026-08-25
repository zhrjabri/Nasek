import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BadgeCheck,
  Building2,
  Coins,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { REVIEWS } from '@/data/reviews'
import { SEED_BOOKINGS } from '@/data/seed'
import { NASEK_FEE_RATE } from '@/services/api/bookings'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { Badge, Button, Card, EmptyState, Rating, cx } from '@/components/ui'

type Tab = 'overview' | 'providers' | 'campaigns' | 'bookings' | 'reviews'

const TABS: { id: Tab; key: MessageKey; icon: typeof LayoutGrid }[] = [
  { id: 'overview', key: 'admin.overview', icon: LayoutGrid },
  { id: 'providers', key: 'admin.providers', icon: Building2 },
  { id: 'campaigns', key: 'admin.campaigns', icon: Ticket },
  { id: 'bookings', key: 'admin.bookings', icon: Users },
  { id: 'reviews', key: 'admin.reviews', icon: MessageSquare },
]

/** Monthly subscription tiers, mirrored from the provider dashboard. */
const PLAN_PRICE = { basic: 15, plus: 35, premium: 75 } as const

export function AdminDashboardPage() {
  const { t, lang, bl, money, n, date } = useI18n()
  const { dispatch, toast } = useStore()
  const { campaigns, providers } = useCatalogue()
  const [tab, setTab] = useState<Tab>('overview')

  const stats = useMemo(() => {
    const paid = SEED_BOOKINGS.filter((b) => b.status !== 'cancelled')
    const gmv = paid.reduce((s, b) => s + b.totalPrice, 0)
    const commission = gmv * NASEK_FEE_RATE
    const subscriptions = providers.reduce((s, p) => s + PLAN_PRICE[p.plan] * 12, 0)
    const promotions = Math.round(subscriptions * 0.22)
    return {
      gmv,
      commission,
      subscriptions,
      promotions,
      revenue: commission + subscriptions + promotions,
      bookings: paid.length,
      pending: providers.filter((p) => p.verification !== 'verified').length,
    }
  }, [providers])

  const revenueSplit = [
    { name: t('admin.revSubscriptions'), value: Math.round(stats.subscriptions) },
    { name: t('admin.revCommission'), value: Math.round(stats.commission) },
    { name: t('admin.revPromotions'), value: Math.round(stats.promotions) },
  ]

  const byType = useMemo(() => {
    const hajj = SEED_BOOKINGS.filter(
      (b) => campaigns.find((c) => c.id === b.campaignId)?.type === 'hajj',
    ).length
    return [
      { name: t('common.umrah'), value: SEED_BOOKINGS.length - hajj },
      { name: t('common.hajj'), value: hajj },
    ]
  }, [campaigns, t])

  const growth = useMemo(() => buildGrowth(lang), [lang])

  const topProviders = useMemo(
    () =>
      providers
        .map((p) => {
          const ids = new Set(campaigns.filter((c) => c.providerId === p.id).map((c) => c.id))
          const bookings = SEED_BOOKINGS.filter(
            (b) => ids.has(b.campaignId) && b.status !== 'cancelled',
          )
          return {
            provider: p,
            bookings: bookings.length,
            revenue: bookings.reduce((s, b) => s + b.totalPrice, 0),
          }
        })
        .sort((a, b) => b.revenue - a.revenue),
    [providers, campaigns],
  )

  const pendingQueue = providers.filter((p) => p.verification !== 'verified')

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-wrap items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-[3px] bg-nasek-900 text-gold-400">
          <ShieldCheck className="size-6" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gold-600">
            {t('common.appName')}
          </p>
          <h1 className="display text-[26px] text-ink-900 sm:text-[32px]">{t('admin.title')}</h1>
        </div>
      </header>

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
            <Kpi label={t('admin.kpiGmv')} value={money(stats.gmv)} icon={<Coins className="size-4" />} />
            <Kpi label={t('admin.kpiRevenue')} value={money(stats.revenue)} icon={<Coins className="size-4" />} highlight />
            <Kpi label={t('admin.kpiBookings')} value={n(stats.bookings)} icon={<Ticket className="size-4" />} />
            <Kpi label={t('admin.kpiProviders')} value={n(providers.length)} icon={<Building2 className="size-4" />} />
            <Kpi label={t('admin.kpiCampaigns')} value={n(campaigns.length)} icon={<LayoutGrid className="size-4" />} />
            <Kpi label={t('admin.kpiPending')} value={n(stats.pending)} icon={<ShieldCheck className="size-4" />} />
          </ul>

          {/* the verification queue is the admin's actual daily job */}
          <Card className="p-6">
            <h2 className="mb-4 text-[15px] font-bold text-ink-900">{t('admin.pendingQueue')}</h2>
            {pendingQueue.length === 0 ? (
              <p className="rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50 p-5 text-center text-sm text-ink-400">
                {t('admin.queueEmpty')}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {pendingQueue.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-[3px] border border-ivory-300 bg-ivory-50/60 p-4"
                  >
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-[3px] text-base font-bold text-white"
                      style={{ background: p.brandColor }}
                      aria-hidden
                    >
                      {p.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-ink-900">{bl(p.name)}</p>
                      <p className="truncate text-[12px] text-ink-500">
                        {wilayahName(p.wilayahId, lang)} ·{' '}
                        {t('common.experience', { n: n(p.experienceYears) })}
                      </p>
                    </div>
                    {/* Verifying without seeing the permit would be theatre, so
                        the uploaded image sits next to the button. */}
                    {p.licenceImage ? (
                      <a
                        href={p.licenceImage}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-[3px] border border-ivory-300 bg-ivory-50 p-1.5 pe-2.5 text-[12px] font-semibold text-ink-600 transition-colors hover:border-nasek-700 hover:text-nasek-800"
                      >
                        <img
                          src={p.licenceImage}
                          alt={p.licenceFileName ?? t('admin.licence')}
                          className="size-9 rounded-[2px] border border-ivory-300 object-cover"
                        />
                        {t('admin.viewLicence')}
                      </a>
                    ) : (
                      <span className="text-[12px] text-ink-400">{t('admin.noLicence')}</span>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        dispatch({ type: 'setVerification', providerId: p.id, status: 'verified' })
                        toast(t('admin.verifiedToast', { name: bl(p.name) }))
                      }}
                    >
                      <BadgeCheck className="size-3.5" />
                      {t('admin.verify')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="mb-5 text-[15px] font-bold text-ink-900">{t('admin.revenueSplit')}</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueSplit}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="52%"
                      outerRadius="80%"
                      paddingAngle={2}
                    >
                      {revenueSplit.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="mb-5 text-[15px] font-bold text-ink-900">{t('admin.bookingsByType')}</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byType} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eae5d8" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="value" name={t('admin.kpiBookings')} radius={[6, 6, 0, 0]}>
                      <Cell fill="#1c5e4c" />
                      <Cell fill="#c9a961" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h2 className="mb-5 text-[15px] font-bold text-ink-900">{t('admin.growth')}</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growth} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eae5d8" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="bookings"
                    name={t('admin.kpiBookings')}
                    stroke="#1c5e4c"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="providers"
                    name={t('admin.kpiProviders')}
                    stroke="#c9a961"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>
      )}

      {/* -------------------------------------------------------- providers */}
      {tab === 'providers' && (
        providers.length === 0 ? (
          <EmptyState icon={<Building2 className="size-5" />} title={t('admin.noProviders')} />
        ) : (
        <section className="overflow-x-auto rounded-[3px] border border-ivory-300 bg-ivory-50">
          <table className="w-full min-w-3xl text-[13.5px]">
            <thead>
              <tr className="border-b border-ivory-300 bg-ivory-100 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                <th scope="col" className="p-3.5 text-start">{t('admin.providers')}</th>
                <th scope="col" className="p-3.5 text-start">{t('common.wilayah')}</th>
                <th scope="col" className="p-3.5 text-start">{t('common.rating')}</th>
                <th scope="col" className="p-3.5 text-start">{t('prov.plan')}</th>
                <th scope="col" className="p-3.5 text-start">{t('compare.row.verification')}</th>
                <th scope="col" className="p-3.5 text-end">{t('common.filter')}</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id} className="border-b border-ivory-300 last:border-0 even:bg-ivory-50/50">
                  <td className="p-3.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-[3px] text-xs font-bold text-white"
                        style={{ background: p.brandColor }}
                        aria-hidden
                      >
                        {p.initials}
                      </span>
                      <span className="font-semibold text-ink-800">{bl(p.name)}</span>
                    </div>
                  </td>
                  <td className="p-3.5 text-ink-600">{wilayahName(p.wilayahId, lang)}</td>
                  <td className="p-3.5">
                    <Rating value={p.rating} count={p.reviewCount} size="sm" />
                  </td>
                  <td className="p-3.5">
                    <Badge tone={p.plan === 'premium' ? 'gold' : 'neutral'}>{p.plan}</Badge>
                  </td>
                  <td className="p-3.5">
                    <Badge tone={p.verification === 'verified' ? 'green' : 'amber'}>
                      {p.verification === 'verified'
                        ? t('admin.verified')
                        : t('common.pendingVerification')}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-end">
                    <Button
                      size="sm"
                      variant={p.verification === 'verified' ? 'secondary' : 'primary'}
                      onClick={() => {
                        const next = p.verification === 'verified' ? 'pending' : 'verified'
                        dispatch({ type: 'setVerification', providerId: p.id, status: next })
                        toast(
                          next === 'verified'
                            ? t('admin.verifiedToast', { name: bl(p.name) })
                            : t('admin.unverifiedToast', { name: bl(p.name) }),
                          next === 'verified' ? 'success' : 'info',
                        )
                      }}
                    >
                      {p.verification === 'verified' ? t('admin.unverify') : t('admin.verify')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        )
      )}

      {/* ------------------------------------------------------- campaigns */}
      {tab === 'campaigns' && (
        <section className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 text-[15px] font-bold text-ink-900">{t('admin.topProviders')}</h2>
            <ul className="space-y-2.5">
              {topProviders.slice(0, 5).map((entry, i) => (
                <li
                  key={entry.provider.id}
                  className="flex items-center gap-3 rounded-[3px] border border-ivory-300 p-3.5"
                >
                  <span className="nums w-5 text-[13px] font-bold text-ink-400">{n(i + 1)}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-800">
                    {bl(entry.provider.name)}
                  </span>
                  <span className="nums text-[12px] text-ink-400">
                    {n(entry.bookings)} {t('admin.kpiBookings')}
                  </span>
                  <span className="nums text-[14px] font-bold text-nasek-900">
                    {money(entry.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="overflow-x-auto rounded-[3px] border border-ivory-300 bg-ivory-50">
            <table className="w-full min-w-3xl text-[13.5px]">
              <thead>
                <tr className="border-b border-ivory-300 bg-ivory-100 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                  <th scope="col" className="p-3.5 text-start">{t('admin.campaigns')}</th>
                  <th scope="col" className="p-3.5 text-start">{t('filters.type')}</th>
                  <th scope="col" className="p-3.5 text-start">{t('common.price')}</th>
                  <th scope="col" className="p-3.5 text-start">{t('compare.row.seats')}</th>
                  <th scope="col" className="p-3.5 text-start">{t('common.rating')}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-ivory-300 last:border-0 even:bg-ivory-50/50">
                    <td className="max-w-64 p-3.5">
                      <Link
                        to={`/campaigns/${c.id}`}
                        className="truncate font-semibold text-ink-800 hover:text-nasek-800"
                      >
                        {bl(c.title)}
                      </Link>
                    </td>
                    <td className="p-3.5">
                      <Badge tone={c.type === 'hajj' ? 'gold' : 'green'}>
                        {t(c.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
                      </Badge>
                    </td>
                    <td className="nums p-3.5 font-semibold text-ink-800">{money(c.price)}</td>
                    <td className="nums p-3.5 text-ink-600">
                      {n(c.seatsAvailable)} / {n(c.seatsTotal)}
                    </td>
                    <td className="p-3.5">
                      <Rating value={c.rating} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------- bookings */}
      {tab === 'bookings' && (
        <section className="overflow-x-auto rounded-[3px] border border-ivory-300 bg-ivory-50">
          <table className="w-full min-w-3xl text-[13.5px]">
            <thead>
              <tr className="border-b border-ivory-300 bg-ivory-100 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                <th scope="col" className="p-3.5 text-start">{t('booking.reference')}</th>
                <th scope="col" className="p-3.5 text-start">{t('prov.customerName')}</th>
                <th scope="col" className="p-3.5 text-start">{t('prov.customerTrip')}</th>
                <th scope="col" className="p-3.5 text-start">{t('common.date')}</th>
                <th scope="col" className="p-3.5 text-start">{t('common.total')}</th>
                <th scope="col" className="p-3.5 text-start">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {SEED_BOOKINGS.slice(0, 50).map((b) => {
                const c = campaigns.find((x) => x.id === b.campaignId)
                return (
                  <tr key={b.id} className="border-b border-ivory-300 last:border-0 even:bg-ivory-50/50">
                    <td className="nums p-3.5 font-semibold text-ink-700">{b.reference}</td>
                    <td className="p-3.5 text-ink-700">{b.contactName}</td>
                    <td className="max-w-48 truncate p-3.5 text-ink-600">{c ? bl(c.title) : '—'}</td>
                    <td className="p-3.5 text-ink-500">{date(b.bookingDate)}</td>
                    <td className="nums p-3.5 font-semibold text-ink-800">{money(b.totalPrice)}</td>
                    <td className="p-3.5">
                      <Badge
                        tone={
                          b.status === 'cancelled'
                            ? 'red'
                            : b.status === 'pending'
                              ? 'gold'
                              : b.status === 'completed'
                                ? 'neutral'
                                : 'green'
                        }
                      >
                        {b.status}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* --------------------------------------------------------- reviews */}
      {tab === 'reviews' && (
        <section>
          {REVIEWS.length === 0 ? (
            <EmptyState title={t('campaign.noReviews')} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {REVIEWS.map((review) => (
                <li key={review.id}>
                  <Card className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[14px] font-bold text-ink-900">{review.userName}</span>
                      <Rating value={review.rating} size="sm" />
                    </div>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-600">
                      {bl(review.comment)}
                    </p>
                    <p className="mt-2.5 text-[11px] text-ink-400">{date(review.date)}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}

const PIE_COLORS = ['#1c5e4c', '#c9a961', '#8fd0b5']

function Kpi({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: string
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <li>
      <Card className={cx('p-5', highlight && 'border-nasek-200 bg-nasek-50/60')}>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">
          <span className="text-nasek-600">{icon}</span>
          {label}
        </div>
        <p className="nums mt-2.5 text-[28px] font-bold leading-none text-ink-900">{value}</p>
      </Card>
    </li>
  )
}

/**
 * Platform growth over the last 12 months. Bookings come from the seed
 * history; the provider curve is a plausible onboarding ramp so the chart
 * reads as a platform story rather than a single metric.
 */
function buildGrowth(lang: 'ar' | 'en') {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short' })
  const months: { key: string; month: string }[] = []

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      month: fmt.format(d),
    })
  }

  return months.map((m, i) => ({
    month: m.month,
    bookings: SEED_BOOKINGS.filter((b) => b.bookingDate.startsWith(m.key)).length,
    providers: Math.round(2 + i * 0.65),
  }))
}
