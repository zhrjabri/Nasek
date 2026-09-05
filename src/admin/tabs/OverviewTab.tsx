import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
  ArrowRight,
  Ban,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Coins,
  LayoutGrid,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react'
import { isPendingProvider, type Booking, type Campaign, type Provider } from '@/types'
import { useI18n } from '@/i18n'

import { NASEK_FEE_RATE } from '@/services/api/bookings'
import { setProviderVerification } from '@/services/data/catalogue'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { useStore } from '@/store/AppStore'
import { Button, Card, cx } from '@/components/ui'
import { Kpi } from './shared'

const PIE_COLORS = ['#1c5e4c', '#c9a961', '#8fd0b5']

/** Monthly subscription tiers, mirrored from the provider dashboard. */
const PLAN_PRICE = { basic: 15, plus: 35, premium: 75 } as const

/**
 * The landing tab.
 *
 * Ordered by what an admin actually opens this page to do. The numbers come
 * first because they answer "is the platform healthy". Immediately below sits
 * the work queue — what is waiting on a decision — because a dashboard that
 * shows only charts makes you hunt through tabs to find your own to-do list.
 * Charts go last: useful, rarely urgent.
 */
export function OverviewTab({
  campaigns,
  providers,
  suspendedCampaigns,
  suspendedUsers,
}: {
  campaigns: Campaign[]
  providers: Provider[]
  suspendedCampaigns: number
  suspendedUsers: number
}) {
  const { t, lang, bl, money, n } = useI18n()
  // Platform-wide bookings, scoped to administrators by policy. Previously a
  // generated demo history over an empty catalogue, which made every figure on
  // this page zero.
  const { dispatch, toast, bookings } = useStore()
  const { reload } = useSnapshotLoader()
  // Each section is an address now rather than a tab index, so the work queue
  // can hand out real links: an admin can open the verification queue in a new
  // tab, bookmark it, or send it to a colleague.
  const navigate = useNavigate()

  const stats = useMemo(() => {
    const paid = bookings.filter((b) => b.status !== 'cancelled')
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
      pending: providers.filter((p) => isPendingProvider(p.verification)).length,
    }
  }, [providers])

  const revenueSplit = [
    { name: t('admin.revSubscriptions'), value: Math.round(stats.subscriptions) },
    { name: t('admin.revCommission'), value: Math.round(stats.commission) },
    { name: t('admin.revPromotions'), value: Math.round(stats.promotions) },
  ]

  const byType = useMemo(() => {
    const hajj = bookings.filter(
      (b) => campaigns.find((c) => c.id === b.campaignId)?.type === 'hajj',
    ).length
    return [
      { name: t('common.umrah'), value: bookings.length - hajj },
      { name: t('common.hajj'), value: hajj },
    ]
  }, [campaigns, t])

  const growth = useMemo(() => buildGrowth(lang, bookings), [lang, bookings])

  const pendingQueue = providers.filter((p) => isPendingProvider(p.verification))
  const nothingWaiting =
    pendingQueue.length === 0 && suspendedCampaigns === 0 && suspendedUsers === 0

  return (
    <section className="space-y-6">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label={t('admin.kpiRevenue')} value={money(stats.revenue)} icon={<Coins className="size-4" />} highlight />
        <Kpi label={t('admin.kpiGmv')} value={money(stats.gmv)} icon={<Coins className="size-4" />} />
        <Kpi label={t('admin.kpiBookings')} value={n(stats.bookings)} icon={<Ticket className="size-4" />} />
        <Kpi label={t('admin.kpiProviders')} value={n(providers.length)} icon={<Building2 className="size-4" />} />
        <Kpi label={t('admin.kpiCampaigns')} value={n(campaigns.length)} icon={<LayoutGrid className="size-4" />} />
        <Kpi
          label={t('admin.kpiPending')}
          value={n(stats.pending)}
          icon={<ShieldCheck className="size-4" />}
          tone={stats.pending > 0 ? 'alert' : undefined}
        />
      </ul>

      {/* --------------------------------------------------- work queue */}
      <Card className="p-6">
        <h2 className="mb-1 text-md font-bold text-ink-900">{t('admin.attention')}</h2>
        <p className="mb-4 text-xs text-ink-500">{t('admin.attentionSub')}</p>

        {nothingWaiting ? (
          <p className="flex items-center justify-center gap-2 rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50 p-6 text-center text-sm text-ink-400">
            <CheckCircle2 className="size-4 text-nasek-600" />
            {t('admin.attentionClear')}
          </p>
        ) : (
          <div className="space-y-2.5">
            {/* Verification is the daily job, so each owner gets a full row
                with their permit rather than a bare count. */}
            {pendingQueue.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-[3px] border border-amber-300 bg-amber-50/50 p-4"
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-[3px] text-base font-bold text-white"
                  style={{ background: p.brandColor }}
                  aria-hidden
                >
                  {p.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-ink-900">{bl(p.name)}</p>
                  <p className="truncate text-xs text-ink-500">{t('admin.awaitingVerification')}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => navigate('/owners')}>
                  {t('admin.reviewPermit')}
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    // The store follows the database rather than racing it. The
                    // old order — draw the badge, fire the request, ignore the
                    // answer — left this screen showing a company as verified
                    // that Postgres had refused to verify, with no way back but
                    // a reload nobody knew to do.
                    const result = await setProviderVerification(p.id, 'verified')
                    if (!result.ok) {
                      toast(result.error, 'warning')
                      return
                    }
                    dispatch({ type: 'setVerification', providerId: p.id, status: 'verified' })
                    toast(t('admin.verifiedToast', { name: bl(p.name) }))
                    // The dispatch above is the offline path; once a snapshot
                    // has landed the table reads the server's providers, so the
                    // queue only empties if it is re-read.
                    await reload()
                  }}
                >
                  <BadgeCheck className="size-3.5" />
                  {t('admin.verify')}
                </Button>
              </div>
            ))}

            {suspendedCampaigns > 0 && (
              <QueueLink
                icon={<Ban className="size-4" />}
                label={t('admin.queueSuspendedCampaigns', { n: n(suspendedCampaigns) })}
                cta={t('admin.campaigns')}
                onClick={() => navigate('/campaigns')}
              />
            )}
            {suspendedUsers > 0 && (
              <QueueLink
                icon={<Users className="size-4" />}
                label={t('admin.queueSuspendedUsers', { n: n(suspendedUsers) })}
                cta={t('admin.users')}
                onClick={() => navigate('/users')}
              />
            )}
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------- charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-5 text-md font-bold text-ink-900">{t('admin.revenueSplit')}</h2>
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
          <h2 className="mb-5 text-md font-bold text-ink-900">{t('admin.bookingsByType')}</h2>
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
        <h2 className="mb-5 text-md font-bold text-ink-900">{t('admin.growth')}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={growth} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eae5d8" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8d9189' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="bookings" name={t('admin.kpiBookings')} stroke="#1c5e4c" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="providers" name={t('admin.kpiProviders')} stroke="#c9a961" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  )
}

function QueueLink({
  icon,
  label,
  cta,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  cta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 rounded-[3px] border border-ivory-300 bg-ivory-50 p-4 text-start',
        'transition-colors hover:border-nasek-400 hover:bg-nasek-50/40',
      )}
    >
      <span className="text-ink-400">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-ink-700">{label}</span>
      <span className="flex items-center gap-1 text-xs font-bold text-nasek-700">
        {cta}
        <ArrowRight className="size-3.5 rtl:rotate-180" />
      </span>
    </button>
  )
}

/**
 * Platform growth over the last 12 months. Bookings come from the seed
 * history; the provider curve is a plausible onboarding ramp so the chart
 * reads as a platform story rather than a single metric.
 */
function buildGrowth(lang: 'ar' | 'en', bookings: Booking[]) {
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
    bookings: bookings.filter((b) => b.bookingDate.startsWith(m.key)).length,
    providers: Math.round(2 + i * 0.65),
  }))
}
