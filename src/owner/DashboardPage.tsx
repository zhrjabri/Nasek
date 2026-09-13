import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Bell,
  Building2,
  Coins,
  LayoutGrid,
  MessageSquare,
  Pencil,
  Plus,
  Star,
  Ticket,
  Search as SearchIcon,
  Trash2,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react'
import type { BookingStatus, Campaign } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { CampaignForm } from '@/components/campaign/CampaignForm'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { publicCampaignUrl } from '@/lib/publicSite'
import { tripReference } from '@/lib/invoice'

import {
  completePastBookings,
  confirmBookingPayment,
  removeCampaign,
  replyToReview,
  saveCampaign,
} from '@/services/data/catalogue'
import { formatPhone } from '@/services/auth/phone'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  ProgressBar,
  RuleAnchor,
  RuleButton,
  Rating,
  Select,
  Textarea,
  cx,
} from '@/components/ui'
import { CampaignStatusBadge } from '@/components/campaign/CampaignStatusBadge'
import { CompanyProfilePanel } from './panels/CompanyProfilePanel'
import { NotificationsPanel } from './panels/NotificationsPanel'

type Tab =
  | 'overview'
  | 'campaigns'
  | 'customers'
  | 'reviews'
  | 'analytics'
  | 'profile'
  | 'notifications'

/**
 * The portal's sections.
 *
 * Company profile and notifications are new, and they are the two the brief
 * named that this dashboard had no answer for at all. Both are placed at the
 * end rather than the front on purpose: an owner opens this to look at seats
 * and bookings, and the company's own record is something you go to
 * deliberately, once, not something that should sit between them and the work.
 */
const TABS: { id: Tab; key: MessageKey; icon: typeof LayoutGrid }[] = [
  { id: 'overview', key: 'prov.overview', icon: LayoutGrid },
  { id: 'campaigns', key: 'prov.myCampaigns', icon: Ticket },
  { id: 'customers', key: 'prov.customers', icon: Users },
  { id: 'reviews', key: 'prov.reviews', icon: MessageSquare },
  { id: 'analytics', key: 'prov.analytics', icon: BarChart3 },
  { id: 'profile', key: 'owner.tabProfile', icon: Building2 },
  { id: 'notifications', key: 'owner.tabNotifications', icon: Bell },
]

/*
 * `PLAN_PRICE` used to live here — `{ basic: 15, plus: 35, premium: 75 }`,
 * described as "the business model made concrete". It was concrete only in
 * this file. `providers.plan` is a real column, but no table, migration or
 * agreement attaches a price to any of its three values, and every company is
 * pinned to `basic` by trigger anyway. So the portal showed each owner a
 * monthly bill NASEK had never agreed to charge them, and an "estimated this
 * month" total built on top of it. Both are gone, and so is the mediation fee
 * that outlived them for a while: NASEK charges the campaign owner nothing at
 * all. The card below says so and shows no figure, because there is none.
 */

/**
 * The current tab, kept in the query string, without a router.
 *
 * This was `useSearchParams`, and that could not work here: the Campaign Owner
 * Portal mounts no `Router` at all — deliberately, so that nothing competes
 * with Supabase for the URL fragment an invitation link arrives in — and every
 * router hook throws outside one. React draws this page, `useSearchParams`
 * calls `useLocation`, and the render dies with
 *
 *     useLocation() may be used only in the context of a <Router> component.
 *
 * Inside the `Suspense` boundary that loads this module, with no error boundary
 * above it, that unmounts the entire tree: a blank white page and nothing in
 * the DOM. It survived review, typecheck, three builds and every harness
 * because this is the one screen only a *verified owner* ever reaches, and
 * until the first owner was invited into production nobody ever had.
 * `verify:render` now draws it, so it cannot happen again.
 *
 * Adding a `HashRouter` to the portal would have been the smaller diff and the
 * worse answer — it would put the router back in the fragment, which is the
 * exact collision the portal is built to avoid.
 *
 * `replaceState` rather than a push, matching the `{ replace: true }` this
 * replaces: changing tab is not a navigation, and thirty back-presses to leave
 * a dashboard is not a feature.
 */
function useTabParam(): [Tab, (next: Tab) => void] {
  const read = (): Tab => {
    if (typeof window === 'undefined') return 'overview'
    const raw = new URLSearchParams(window.location.search).get('tab')
    return TABS.some((x) => x.id === raw) ? (raw as Tab) : 'overview'
  }

  const [tab, setTabState] = useState<Tab>(read)

  const setTab = useCallback((next: Tab) => {
    setTabState(next)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState({}, '', url.toString())
  }, [])

  /*
   * The address bar can still change under us — a browser back that pops past
   * an entry something else pushed, or a link into another tab of this same
   * screen. Reading it again is cheaper than being wrong about which tab is up.
   */
  useEffect(() => {
    const onPop = () => setTabState(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return [tab, setTab]
}

export function DashboardPage() {
  const { t, lang, bl, money, n, date } = useI18n()
  const { user, dispatch, toast, bookings: allBookings, reviews: allReviews } = useStore()
  const { campaignsOf, getProvider } = useCatalogue()
  /*
   * Re-read after publishing, editing or withdrawing a trip.
   *
   * `upsertCampaign` and `deleteCampaign` write to `providerCampaigns` and
   * `hiddenCampaignIds`, which are the offline prototype's store and which
   * `useCatalogue` stops consulting the moment a snapshot has landed. So every
   * one of those actions saved correctly to Postgres, said so, and left this
   * list showing exactly what it showed before — a trip published and
   * apparently not published.
   */
  const { reload } = useSnapshotLoader()

  /*
   * Bring finished trips up to date when the dashboard opens.
   *
   * The owner's booking table filters by status, and 'completed' was a status
   * nothing ever wrote — so the filter matched nothing and a trip that came
   * back last month still read as upcoming. `complete_past_bookings` advances
   * the bookings on this owner's own campaigns; it is idempotent and does
   * nothing when there is nothing due.
   */
  useEffect(() => {
    void completePastBookings().then((moved) => {
      if (moved > 0) void reload()
    })
  }, [reload])
  // The tab lives in the URL, as it does on the customer dashboard: a
  // refresh, a bookmark or a link from the low-seat warning all land where
  // they should instead of bouncing back to the overview.
  const [tab, setTab] = useTabParam()
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')
  const [visibleRows, setVisibleRows] = useState(40)
  /*
   * The reply in progress, and nothing else.
   *
   * There used to be a `replies` map here holding every answer this owner had
   * written, in component state — so a reply survived until the next tab change
   * and was never seen by the traveller it answered. The text now lives on the
   * review row (`reply_ar` / `reply_en`), written by `replyToReview` and
   * readable by everyone through `reviews_public`; this state is only the
   * editor that is currently open.
   */
  const [replyTo, setReplyTo] = useState<{ id: string; text: string } | null>(null)
  const [savingReply, setSavingReply] = useState(false)
  /** Which booking is mid-confirmation, so one row spins rather than the table. */
  const [confirming, setConfirming] = useState<string | null>(null)

  const providerId = user?.providerId ?? 'p1'
  const provider = getProvider(providerId)
  const campaigns = campaignsOf(providerId)

  /*
    * Bookings on this owner's trips.
    *
    * Read from the store, which `useRemoteData` fills from Postgres — and
    * `bookings_read` there already returns exactly the rows this account may
    * see: their own, plus every booking on a campaign they own. The filter
    * below is presentational, narrowing to the trips currently listed; it is
    * not what keeps one owner from reading another's ledger.
    *
    * It used to read SEED_BOOKINGS, a generated demo history derived from a
    * campaign list that is empty — so this panel showed nothing at all.
    */
  const bookings = useMemo(() => {
    const ids = new Set(campaigns.map((c) => c.id))
    return allBookings.filter((b) => ids.has(b.campaignId))
  }, [campaigns, allBookings])

  /*
   * Money that has actually been received, and nothing else.
   *
   * `status !== 'cancelled'` used to define "paid", which under the old flow
   * was almost defensible because `book_campaign` wrote every booking as
   * 'confirmed' the moment it was created. It is indefensible now: a pending
   * booking is a request nobody has paid for, and counting one as revenue would
   * put an owner's unpaid enquiries into the figure they run their business on.
   *
   * 'confirmed' means the owner has been paid and said so. 'completed' means
   * that trip has since returned. Those two, and only those two, are revenue.
   */
  const stats = useMemo(() => {
    const earned = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed')
    const revenue = earned.reduce((sum, b) => sum + b.totalPrice, 0)
    const seatsTotal = campaigns.reduce((s, c) => s + c.seatsTotal, 0)
    const seatsAvailable = campaigns.reduce((s, c) => s + c.seatsAvailable, 0)
    return {
      /** Every live request, paid or not — this is a workload, not a revenue figure. */
      bookings: bookings.filter((b) => b.status !== 'cancelled').length,
      awaiting: bookings.filter((b) => b.status === 'pending').length,
      confirmedCount: earned.length,
      revenue,
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

  /**
   * "I have been paid."
   *
   * The only statement in NASEK that turns a request into a confirmed booking,
   * and the owner is the only party who can make it — the money arrived in
   * their account, over a channel the platform never sees.
   *
   * The store follows the database rather than racing it. Drawing the green
   * badge first and firing the request afterwards is how a screen comes to show
   * a booking as paid that Postgres refused to confirm, with no way back but a
   * reload nobody knows to do; the owner dashboard has been corrected for
   * exactly that once already, on provider verification.
   */
  const markPaid = async (booking: { id: string; reference: string }) => {
    setConfirming(booking.id)
    const result = await confirmBookingPayment(booking.id)
    setConfirming(null)
    if ('error' in result) {
      toast(
        result.schemaBehind
          ? t('prov.temporarilyUnavailable')
          : result.fromServer
            ? result.error
            : t('state.errorBody'),
        'warning',
      )
      return
    }
    dispatch({ type: 'setBookingStatus', bookingId: booking.id, status: 'confirmed' })
    toast(t('prov.markedPaid', { ref: booking.reference }), 'success')
    // The seat ledger is unchanged by a confirmation, but the revenue figures
    // above this table are not — re-read so they move with it.
    await reload()
  }

  const monthly = useMemo(() => buildMonthly(bookings, lang), [bookings, lang])
  /* Twelve empty months and an axis at zero reads as a broken page rather than
     as an owner who has not been booked yet. Say the second thing. */
  const noBookings = bookings.length === 0

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

  const reviews = allReviews.filter((r) => r.providerId === providerId)

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
          <p className="text-2xs font-bold uppercase tracking-wider text-gold-600">
            {t('prov.title')}
          </p>
          <h1 className="display text-3xl text-ink-900 sm:text-5xl">
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
        <Button size="sm" onClick={() => setEditing('new')}>
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
              'relative flex shrink-0 items-center gap-2 px-4 py-3 text-base font-semibold transition-colors',
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

      {/*
        No phone number on the company record.

        Every booking request ends with a customer trying to open WhatsApp to
        this company, and that button is disabled when there is no number to
        open it to. The owner is the only person who can fix it, so they are
        told here rather than left wondering why nobody is messaging them.
      */}
      {!provider?.phone?.trim() && (
        <Card className="mb-6 border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-900">{t('prov.noPhoneTitle')}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800/80">
                {t('prov.noPhoneBody')}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => setTab('profile')}
              >
                <Building2 className="size-3.5" />
                {t('owner.tabProfile')}
              </Button>
            </div>
          </div>
        </Card>
      )}

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
                  <p className="text-sm font-bold text-amber-900">
                    {t('prov.lowSeats', { n: n(almostFull.length) })}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800/80">{t('prov.lowSeatsFix')}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {almostFull.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[3px] bg-ivory-50/70 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800">
                      {bl(c.title)}
                    </span>
                    <span className="nums text-xs font-semibold text-amber-800">
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

          {/*
            What NASEK charges, which is nothing.

            This card carried a "Mediation fee (2%)" figure — a running total of
            what the owner owed NASEK on confirmed business. There is no such
            fee: NASEK takes no percentage from the customer, the owner, the
            booking or the invoice. The figure is gone and so is the arithmetic
            behind it; what is left is the one sentence an owner opens this to
            read, and the count of business they have actually confirmed.
          */}
          <Card className="p-6">
            <h2 className="text-md font-bold text-ink-900">{t('prov.plan')}</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">
              {t('prov.planNote')}
            </p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <PlanFigure
                label={t('prov.confirmedBookings')}
                value={n(stats.confirmedCount)}
                highlight
              />
              <PlanFigure
                label={t('prov.kpiRevenue')}
                value={
                  stats.confirmedCount
                    ? money(stats.revenue)
                    : t('prov.noConfirmedFinancial')
                }
              />
            </dl>
          </Card>

          <Card className="p-6">
            <h2 className="mb-5 text-md font-bold text-ink-900">{t('prov.chartBookings')}</h2>
            {noBookings ? (
              <NoData label={t('prov.noData')} />
            ) : (
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
            )}
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
                <Button size="sm" onClick={() => setEditing('new')}>
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
                        <CampaignStatusBadge campaign={c} />
                        <Badge tone={c.type === 'hajj' ? 'gold' : 'green'}>
                          {t(c.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
                        </Badge>
                        <Badge tone="neutral">
                          {t(c.travelMethod === 'air' ? 'common.air' : 'common.land')}
                        </Badge>
                      </div>
                      <p className="mt-2 text-md font-bold text-ink-900">{bl(c.title)}</p>
                      <p className="mt-1 text-xs text-ink-500">
                        {wilayahName(c.wilayahId, lang)} · {date(c.departureDate)} ·{' '}
                        <span className="nums">{money(c.price)}</span>
                      </p>
                      {/*
                        The reason, on the row it belongs to.

                        A refusal an owner cannot read is a dead end with
                        wording, and the correction they need to make is
                        usually one field of the form immediately to the right
                        of this. Putting the two together is what turns a
                        rejection into something actionable.
                      */}
                      {c.status === 'rejected' && (
                        <p className="mt-2 rounded-[3px] border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">
                          <span className="font-bold">{t('campaignStatus.reason')}: </span>
                          {c.rejectionReason || t('prov.reasonMissing')}
                        </p>
                      )}

                      <div className="mt-2.5 max-w-xs">
                        <ProgressBar
                          value={c.seatsTotal - c.seatsAvailable}
                          max={c.seatsTotal}
                          tone={c.seatsAvailable <= 6 ? 'amber' : 'green'}
                          label={t('campaign.seatsLabel')}
                        />
                        <p className="mt-1.5 nums text-2xs text-ink-400">
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
                        <p className="text-sm font-bold text-red-800">{t('prov.deleteAsk')}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-red-700/80">
                          {t('prov.deleteConfirm')}
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={async () => {
                              // Checked rather than fired and forgotten. A
                              // withdrawal Postgres refused announced itself as
                              // done and left the trip on the public site.
                              if (isSupabaseConfigured && !(await removeCampaign(c.id))) {
                                toast(t('prov.campaignSaveFailed'), 'warning')
                                return
                              }
                              dispatch({ type: 'deleteCampaign', id: c.id })
                              toast(t('prov.campaignDeleted'), 'info')
                              setConfirmDelete(null)
                              await reload()
                            }}
                          >
                            <Trash2 className="size-3.5" />
                            {t('common.delete')}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {/*
                          A link to a page that answers "not found" is worse
                          than no link, and there are three cases rather than
                          the two this once had.

                          *Suspended* — taken down by an administrator, still
                          `active` as far as approval goes. The public
                          catalogue no longer carries it, so its page answers
                          "not found"; the badge at the top of the row already
                          says why, and nothing more belongs here.

                          *Approved and live* — an ordinary `<a>` to the
                          customer site. Not a router link: that page belongs
                          to a different application on a different origin, and
                          this portal mounts no `Router` at all, so a `<Link>`
                          threw the moment an owner had one approved trip and
                          took the whole tab down with it. See
                          `lib/publicSite.ts`. Absent when the public site's
                          address is not configured into this build, because a
                          link that cannot be built is better not drawn.

                          *Anything else* — waiting or refused, and it says so
                          rather than offering to open a page that does not
                          exist yet.
                        */}
                        {c.suspended ? null : c.status === 'active' ? (
                          publicCampaignUrl(c.id) && (
                            <RuleAnchor href={publicCampaignUrl(c.id)!} newTab>
                              {t('prov.viewPublic')}
                            </RuleAnchor>
                          )
                        ) : (
                          <span className="px-2.5 text-xs font-semibold text-ink-400">
                            {t('prov.viewPublicPending')}
                          </span>
                        )}
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
                      size="sm"
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
                  <p className="mb-2.5 text-xs font-semibold text-ink-500" aria-live="polite">
                    {t('prov.showingCount', {
                      shown: n(Math.min(visibleRows, filteredBookings.length)),
                      total: n(filteredBookings.length),
                    })}
                  </p>

                  {/*
                    How a booking gets paid, said once, above the table it
                    happens in.

                    The owner is the only person in this workflow who knows
                    whether money arrived, and this table is where they record
                    it. Nothing else in NASEK can tell.
                  */}
                  <div className="mb-3 flex items-start gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50/60 p-3.5">
                    <Wallet className="mt-px size-4 shrink-0 text-nasek-700" />
                    <p className="text-xs leading-relaxed text-ink-600">
                      {t('prov.paymentWorkflow')}
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-[3px] border border-ivory-300 bg-ivory-50">
                    <table className="w-full min-w-4xl text-start text-sm">
                      <thead>
                        <tr className="border-b border-ivory-300 bg-ivory-100 text-2xs font-bold uppercase tracking-wider text-ink-500">
                          <th scope="col" className="p-3.5 text-start">{t('booking.invoiceNo')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('prov.customerName')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('prov.customerTrip')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('booking.tripDate')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('prov.customerPeople')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('booking.pricePerPerson')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('common.total')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('booking.created')}</th>
                          <th scope="col" className="p-3.5 text-start">{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBookings.slice(0, visibleRows).map((b) => {
                          const c = campaigns.find((x) => x.id === b.campaignId)
                          return (
                            <tr key={b.id} className="border-b border-ivory-300 last:border-0 even:bg-ivory-50/50">
                              <td className="nums p-3.5 font-semibold text-ink-700" dir="ltr">
                                {b.reference}
                              </td>
                              <td className="p-3.5">
                                <span className="block font-semibold text-ink-800">
                                  {b.contactName || '—'}
                                </span>
                                {/* The number the owner replies to. It is the
                                    whole of their side of this workflow, so it
                                    is on the row rather than behind a click. */}
                                <span className="nums block text-2xs text-ink-400" dir="ltr">
                                  {b.contactPhone ? formatPhone(b.contactPhone) : '—'}
                                </span>
                              </td>
                              <td className="max-w-48 p-3.5 text-ink-600">
                                <span className="block truncate">{c ? bl(c.title) : '—'}</span>
                                <span className="nums block text-2xs text-ink-400" dir="ltr">
                                  {c ? tripReference(c.id) : '—'}
                                </span>
                              </td>
                              <td className="p-3.5 text-ink-500">
                                {c ? date(c.departureDate) : '—'}
                              </td>
                              <td className="nums p-3.5 text-ink-600">
                                <span className="block font-semibold">{n(b.travellersCount)}</span>
                                {/* Null for a booking taken before the split was
                                    recorded. A dash, never a pair of zeroes. */}
                                <span className="block text-2xs text-ink-400">
                                  {b.maleCount == null || b.femaleCount == null
                                    ? '—'
                                    : `${t('booking.male')} ${n(b.maleCount)} · ${t('booking.female')} ${n(b.femaleCount)}`}
                                </span>
                              </td>
                              <td className="nums p-3.5 text-ink-600">
                                {b.pricePerPerson == null ? '—' : money(b.pricePerPerson)}
                              </td>
                              <td className="nums p-3.5 font-semibold text-ink-800">{money(b.totalPrice)}</td>
                              <td className="p-3.5 text-ink-500">{date(b.bookingDate)}</td>
                              <td className="p-3.5">
                                <Badge tone={STATUS_TONE[b.status]}>{t(STATUS_KEY[b.status])}</Badge>
                                {b.status === 'pending' && (
                                  <Button
                                    size="xs"
                                    variant="approve"
                                    className="mt-2"
                                    loading={confirming === b.id}
                                    onClick={() => void markPaid(b)}
                                  >
                                    <BadgeCheck className="size-3.5" />
                                    {t('prov.markPaid')}
                                  </Button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {filteredBookings.length > visibleRows && (
                    <div className="mt-4 text-center">
                      <Button size="sm" variant="secondary" onClick={() => setVisibleRows((v) => v + 40)}>
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
                      <span className="text-base font-bold text-ink-900">
                        {review.userName || t('review.anonymous')}
                      </span>
                      <Rating value={review.rating} size="sm" />
                    </div>
                    <p className="mt-2.5 text-base leading-relaxed text-ink-600">
                      {bl(review.comment)}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-2xs text-ink-400">{date(review.date)}</span>
                      {/* The Reply button did nothing at all — the one thing an
                          owner comes to this tab to do. It now writes a reply
                          that shows under the review. */}
                      {!bl(review.reply) && replyTo?.id !== review.id && (
                        <RuleButton onClick={() => setReplyTo({ id: review.id, text: '' })}>
                          {t('prov.respondReview')}
                        </RuleButton>
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
                            loading={savingReply}
                            disabled={!replyTo.text.trim()}
                            onClick={async () => {
                              // Written to the review row, then re-read. The
                              // traveller who wrote the review is the person
                              // this answers, and they were never shown it.
                              setSavingReply(true)
                              const ok = await replyToReview(review.id, replyTo.text)
                              setSavingReply(false)
                              if (!ok) {
                                toast(t('prov.replyFailed'), 'warning')
                                return
                              }
                              setReplyTo(null)
                              toast(t('prov.replyPosted'))
                              await reload()
                            }}
                          >
                            {t('prov.replySend')}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setReplyTo(null)}>
                            {t('common.cancel')}
                          </Button>
                          <span className="text-2xs text-ink-400">{t('prov.replyNote')}</span>
                        </div>
                      </div>
                    )}

                    {bl(review.reply) && replyTo?.id !== review.id && (
                      <div className="mt-3 rounded-[3px] border-s-2 border-nasek-600 bg-nasek-50/60 px-4 py-3">
                        <p className="text-2xs font-bold uppercase tracking-wider text-nasek-700">
                          {t('prov.replyYours')}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-ink-700">
                          {bl(review.reply)}
                        </p>
                        <button
                          type="button"
                          onClick={() => setReplyTo({ id: review.id, text: bl(review.reply) })}
                          className="mt-2 text-xs font-semibold text-nasek-700 hover:underline"
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
            <h2 className="mb-5 text-md font-bold text-ink-900">{t('prov.chartRevenue')}</h2>
            {noBookings ? (
              <NoData label={t('prov.noData')} />
            ) : (
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
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-5 text-md font-bold text-ink-900">{t('prov.chartTrips')}</h2>
            {byTrip.length === 0 ? (
              <NoData label={t('prov.noData')} />
            ) : (
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
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-5 text-md font-bold text-ink-900">{t('prov.chartLocations')}</h2>
            {byLocation.length === 0 ? (
              <NoData label={t('prov.noData')} />
            ) : (
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
            )}
          </Card>
        </section>
      )}

      {/* --------------------------------------------------- company profile */}
      {tab === 'profile' && <CompanyProfilePanel provider={provider} />}

      {/* ---------------------------------------------------- notifications */}
      {tab === 'notifications' && <NotificationsPanel />}

      {/* ------------------------------------------------------ edit modal */}
      {/*
        The form gets its own boundary, inside the one around the screen.

        Not belt and braces: they catch different sizes of failure. If the form
        throws, the boundary nearest it keeps the list, the filters and the
        rest of this screen alive, and the panel it draws appears where the
        modal was rather than replacing everything. The outer one only ever
        sees what this cannot.
      */}
      {editing && (
        <ErrorBoundary where="the owner campaign form">
          <CampaignForm
            campaign={editing === 'new' ? null : editing}
            providerId={providerId}
            onClose={() => setEditing(null)}
            onSave={async (campaign) => {
              // Written to the database first, then to the store with whatever
              // the database actually stored — an insert comes back with a real
              // id, and keeping the local one would orphan every later edit.
              const stored = await saveCampaign(campaign)
              /*
               * A null answer means Postgres refused, and it must not be reported
               * as a save.
               *
               * `stored ?? campaign` quietly substituted the unsaved object and
               * toasted success, so a trip rejected by a policy or a constraint
               * sat in this browser's store looking published — until the next
               * load, when it silently vanished.
               */
              if (isSupabaseConfigured && !stored) {
                toast(t('prov.campaignSaveFailed'), 'warning')
                return
              }
              const saved = stored ?? campaign
              dispatch({ type: 'upsertCampaign', campaign: saved })
              /*
               * Say what happened.
               *
               * There is no wait to name any more: an approved company's trip is
               * live the moment it is saved, and this is the sentence the brief
               * asked for. An edit keeps its own wording — the trip was already
               * published and stays that way, which is the other half of
               * retiring the queue.
               */
              toast(editing === 'new' ? t('prov.publishedActive') : t('prov.campaignSaved'))
              setEditing(null)
              await reload()
            }}
          />
        </ErrorBoundary>
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
        <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-ink-400">
          <span className="text-nasek-600">{icon}</span>
          {label}
        </div>
        <p className="nums mt-2.5 text-4xl font-bold leading-none text-ink-900">{value}</p>
        {progress != null && <ProgressBar className="mt-3" value={progress} label={label} />}
      </Card>
    </li>
  )
}

function PlanFigure({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={cx(
        'rounded-[3px] border p-4',
        highlight ? 'border-nasek-200 bg-nasek-50' : 'border-ivory-300 bg-ivory-50/60',
      )}
    >
      <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">{label}</dt>
      {/* The `note` line went with the subscription tier it named. */}
      <dd className="nums mt-2 text-2xl font-bold text-ink-900">{value}</dd>
    </div>
  )
}

/** What a chart shows before this owner has been booked. */
function NoData({ label }: { label: string }) {
  return (
    <p className="flex h-64 items-center justify-center rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50 text-center text-sm text-ink-400">
      {label}
    </p>
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
    if (!bucket) continue
    bucket.bookings += 1
    /*
     * The two series answer different questions and are counted differently.
     *
     * `bookings` is how much work came in that month, so a request that has not
     * been paid for still counts. `revenue` is money received, so it does not:
     * only a booking the owner has confirmed — or one whose trip has since run
     * — has been paid for, and adding pending requests to a revenue bar chart
     * is how an owner comes to plan against income that never arrived.
     */
    if (b.status === 'confirmed' || b.status === 'completed') bucket.revenue += b.totalPrice
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
