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
  Clock,
  Coins,
  LayoutGrid,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react'
import { isPendingProvider, type Booking, type Campaign, type Provider } from '@/types'
import { useI18n } from '@/i18n'

import { mediationFee } from '@/services/api/bookings'
import { setProviderVerification } from '@/services/data/catalogue'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { useStore } from '@/store/AppStore'
import { Button, Card, cx } from '@/components/ui'
import { Kpi } from './shared'

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

  /*
   * Only what the ledger can answer for.
   *
   * This memo used to compute a "NASEK revenue" figure out of three parts, and
   * two of them were invented in this file: `subscriptions` multiplied every
   * company by a price list — 15 / 35 / 75 rial a month — that exists in no
   * table, no migration and no signed agreement, and `promotions` was that
   * invention multiplied by 0.22 for a product NASEK does not sell. The
   * headline number on the administration dashboard was therefore mostly
   * fiction, and it shipped.
   *
   * The mediation fee is the one that is real: NASEK charges campaign owners
   * 2% of the business the platform brings them. So that is what is reported,
   * under its own name.
   *
   * AND ONLY ON BUSINESS THAT HAPPENED
   *
   * `status !== 'cancelled'` used to stand in for "paid", which was almost
   * defensible while `book_campaign` wrote every booking as 'confirmed' the
   * moment it was created. Payment now happens off the platform, between the
   * customer and the campaign owner, and a 'pending' booking is a request
   * nobody has paid for. Charging a mediation fee on one — or showing it to an
   * administrator as platform value — would be billing for money that may never
   * arrive. Confirmed and completed only.
   */
  const stats = useMemo(() => {
    const settled = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed')
    const gmv = settled.reduce((s, b) => s + b.totalPrice, 0)
    return {
      gmv,
      fees: mediationFee(gmv),
      settled: settled.length,
      /** Requests in flight. A workload figure, deliberately not a money one. */
      awaiting: bookings.filter((b) => b.status === 'pending').length,
      bookings: bookings.filter((b) => b.status !== 'cancelled').length,
      pending: providers.filter((p) => isPendingProvider(p.verification)).length,
    }
    /*
     * `bookings` belongs here — every figure above but the pending count is
     * computed from it.
     *
     * It was missing, so this memo was pinned to `providers` alone: correct
     * only because the snapshot happens to replace both slices in the same
     * dispatch, and wrong the moment anything reloads bookings without also
     * reloading companies. Fees, GMV and the booking count would then sit at
     * whatever they were when the page opened, with nothing to show they had
     * stopped moving. The same omission left this tab's ledger figures frozen
     * at zero once already; see `BookingsTab`.
     */
  }, [providers, bookings])

  const byType = useMemo(() => {
    const hajj = bookings.filter(
      (b) => campaigns.find((c) => c.id === b.campaignId)?.type === 'hajj',
    ).length
    return [
      { name: t('common.umrah'), value: bookings.length - hajj },
      { name: t('common.hajj'), value: hajj },
    ]
    // `bookings` again, for the same reason.
  }, [campaigns, bookings, t])

  const growth = useMemo(() => buildGrowth(lang, bookings, providers), [lang, bookings, providers])
  /* Nothing booked and nobody signed up yet: the two charts below would be
     bare axes, which reads as breakage rather than as a new platform. */
  const noHistory = bookings.length === 0 && providers.length === 0

  const pendingQueue = providers.filter((p) => isPendingProvider(p.verification))
  const nothingWaiting =
    pendingQueue.length === 0 && suspendedCampaigns === 0 && suspendedUsers === 0

  return (
    <section className="space-y-6">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Both money figures say "no confirmed financial data yet" rather than
            a confident OMR 0 while nothing has been paid for. Zero and
            "nothing has settled" look the same and are not. */}
        <Kpi
          label={t('admin.revCommission')}
          value={stats.settled ? money(stats.fees) : t('admin.noConfirmedFinancial')}
          icon={<Coins className="size-4" />}
          highlight
        />
        <Kpi
          label={t('admin.kpiConfirmedValue')}
          value={stats.settled ? money(stats.gmv) : t('admin.noConfirmedFinancial')}
          icon={<Coins className="size-4" />}
        />
        <Kpi
          label={t('admin.kpiAwaitingPayment')}
          value={n(stats.awaiting)}
          icon={<Clock className="size-4" />}
          hint={stats.awaiting > 0 ? t('admin.awaitingPaymentHint') : undefined}
        />
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

      <p className="text-2xs leading-relaxed text-ink-400">{t('admin.paymentNotProcessed')}</p>

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
                <Button size="xs" variant="secondary" onClick={() => navigate('/owners')}>
                  {t('admin.reviewPermit')}
                </Button>
                <Button
                  size="xs"
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

      {/*
        --------------------------------------------------------- charts

        The revenue-by-source doughnut used to sit first. Two of its three
        slices were the invented subscription and promotion figures, so what it
        actually drew was a picture of how much of NASEK's revenue had been
        made up. There is one real source, and a pie chart of one slice is a
        circle — so it is gone rather than reduced, and the fee it did have a
        number for is a KPI above.
      */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-5 text-md font-bold text-ink-900">{t('admin.bookingsByType')}</h2>
          {noHistory ? (
            <NoData label={t('admin.noData')} />
          ) : (
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
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-5 text-md font-bold text-ink-900">{t('admin.growth')}</h2>
          {noHistory ? (
            <NoData label={t('admin.noData')} />
          ) : (
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
          )}
        </Card>
      </div>
    </section>
  )
}

/** What a chart shows before the platform has anything to plot. */
function NoData({ label }: { label: string }) {
  return (
    <p className="flex h-64 items-center justify-center rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50 text-center text-sm text-ink-400">
      {label}
    </p>
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
 * Platform growth over the last 12 months, both lines off the record.
 *
 * The provider curve used to be `Math.round(2 + i * 0.65)` — a straight line
 * drawn so the chart would "read as a platform story", bearing no relation to
 * how many companies had actually joined. It is now the cumulative count of
 * companies whose `joined_at` falls on or before the end of each month, which
 * is the same question asked of the table that knows the answer.
 */
function buildGrowth(lang: 'ar' | 'en', bookings: Booking[], providers: Provider[]) {
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

  return months.map((m) => ({
    month: m.month,
    bookings: bookings.filter((b) => b.bookingDate.startsWith(m.key)).length,
    // `joined_at` is a date, so comparing the first seven characters answers
    // "had this company joined by the end of this month?".
    providers: providers.filter((p) => p.joinedAt.slice(0, 7) <= m.key).length,
  }))
}
