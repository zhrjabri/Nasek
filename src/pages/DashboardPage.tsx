import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  Ticket,
  UserRound,
  XCircle,
} from 'lucide-react'
import type { Booking, BookingStatus } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { WILAYAT, wilayahName } from '@/data/geo'
import { bookingsApi } from '@/services/api/bookings'
import { markNotificationRead } from '@/services/data/catalogue'
import { saveProfile } from '@/services/auth/session'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { CampaignCard } from '@/components/campaign/CampaignCard'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Segmented,
  Select,
  cx,
} from '@/components/ui'

type Tab = 'bookings' | 'saved' | 'notifications' | 'profile'

const TABS: { id: Tab; key: MessageKey; icon: typeof Ticket }[] = [
  { id: 'bookings', key: 'dash.bookings', icon: Ticket },
  { id: 'saved', key: 'dash.saved', icon: Bookmark },
  { id: 'notifications', key: 'dash.notifications', icon: Bell },
  { id: 'profile', key: 'dash.profile', icon: UserRound },
]

export function DashboardPage() {
  const { t, lang, setLang, bl, money, n, date } = useI18n()
  const [params, setParams] = useSearchParams()
  const { user, bookings, savedIds, notifications, unreadCount, dispatch, toast } =
    useStore()
  const { getCampaign, getProvider } = useCatalogue()

  const tab = (params.get('tab') as Tab) ?? 'bookings'
  const setTab = (next: Tab) => setParams({ tab: next }, { replace: true })

  const [profile, setProfile] = useState({
    // Empty, not the greeting. A pilgrim who registered with an address alone
    // is shown the local part of it around the site; putting that into the
    // editable name field would invite them to save it as their actual name.
    name: user?.nameIsPlaceholder ? '' : (user?.name ?? ''),
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    wilayahId: user?.wilayahId ?? 'muscat',
  })

  if (!user) return null

  const today = new Date().toISOString().slice(0, 10)
  const grouped = {
    upcoming: bookings.filter((b) => {
      const c = getCampaign(b.campaignId)
      return b.status !== 'cancelled' && (!c || c.departureDate >= today)
    }),
    completed: bookings.filter((b) => {
      const c = getCampaign(b.campaignId)
      return b.status !== 'cancelled' && c && c.departureDate < today
    }),
    cancelled: bookings.filter((b) => b.status === 'cancelled'),
  }

  const cancel = async (booking: Booking) => {
    if (!window.confirm(t('dash.cancelConfirm'))) return
    await bookingsApi.cancel(booking.id)
    dispatch({ type: 'cancelBooking', id: booking.id })
    toast(t('dash.bookingCancelled'), 'info')
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-center gap-4">
        <span
          className="flex size-14 items-center justify-center rounded-[3px] text-xl font-bold text-white"
          style={{ background: user.avatarColor }}
          aria-hidden
        >
          {user.name.trim().charAt(0)}
        </span>
        <div>
          <h1 className="display text-4xl text-ink-900 sm:text-5xl">
            {t('dash.welcome', { name: user.name.split(' ')[0] })}
          </h1>
          <p className="mt-1 text-base text-ink-500">{t('dash.welcomeSub')}</p>
        </div>
      </header>

      {/* ------------------------------------------------------------ tabs */}
      <nav className="scrollbar-none mb-7 flex gap-1 overflow-x-auto border-b border-ivory-300">
        {TABS.map((item) => {
          const active = tab === item.id
          const count =
            item.id === 'bookings'
              ? bookings.length
              : item.id === 'saved'
                ? savedIds.length
                : item.id === 'notifications'
                  ? unreadCount
                  : 0
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'relative flex shrink-0 items-center gap-2 px-4 py-3 text-base font-semibold transition-colors',
                active ? 'text-nasek-900' : 'text-ink-400 hover:text-ink-700',
              )}
            >
              <item.icon className="size-4" />
              {t(item.key)}
              {count > 0 && (
                <span className="nums rounded-full bg-ivory-200 px-1.5 py-0.5 text-2xs text-ink-600">
                  {n(count)}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gold-500" />
              )}
            </button>
          )
        })}
      </nav>

      {/* -------------------------------------------------------- bookings */}
      {tab === 'bookings' && (
        <section className="space-y-8">
          {bookings.length === 0 ? (
            <EmptyState
              icon={<Ticket className="size-5" />}
              title={t('dash.noBookings')}
              body={t('dash.noBookingsHint')}
              action={<LinkButton to="/campaigns">{t('compare.browse')}</LinkButton>}
            />
          ) : (
            (
              [
                ['dash.upcoming', grouped.upcoming, CalendarClock],
                ['dash.completed', grouped.completed, CheckCircle2],
                ['dash.cancelled', grouped.cancelled, XCircle],
              ] as [MessageKey, Booking[], typeof Ticket][]
            ).map(([key, list, Icon]) =>
              list.length === 0 ? null : (
                <div key={key}>
                  <h2 className="mb-3.5 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-400">
                    <Icon className="size-4" />
                    {t(key)}
                    <span className="nums">({n(list.length)})</span>
                  </h2>
                  <ul className="space-y-3">
                    {list.map((booking) => {
                      const campaign = getCampaign(booking.campaignId)
                      const provider = campaign ? getProvider(campaign.providerId) : undefined
                      const daysToGo = campaign
                        ? Math.round(
                            (new Date(campaign.departureDate).getTime() - Date.now()) / 86_400_000,
                          )
                        : 0
                      return (
                        <li key={booking.id}>
                          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                            <span
                              className="flex size-11 shrink-0 items-center justify-center rounded-[3px] text-base font-bold text-white"
                              style={{ background: provider?.brandColor ?? '#1c5e4c' }}
                              aria-hidden
                            >
                              {provider?.initials ?? '—'}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={booking.status} />
                                <span className="nums text-2xs font-semibold text-ink-400">
                                  {booking.reference}
                                </span>
                              </div>
                              <Link
                                to={campaign ? `/campaigns/${campaign.id}` : '/campaigns'}
                                className="mt-1.5 block text-md font-bold text-ink-900 hover:text-nasek-800"
                              >
                                {campaign ? bl(campaign.title) : '—'}
                              </Link>
                              <p className="mt-1 text-xs text-ink-500">
                                {campaign ? date(campaign.departureDate) : ''} ·{' '}
                                {n(booking.travellersCount)} {t('common.travellers')}
                                {key === 'dash.upcoming' && daysToGo > 0 && (
                                  <> · {t('dash.daysToGo', { n: n(daysToGo) })}</>
                                )}
                              </p>
                            </div>

                            <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                              <span className="nums text-lg font-bold text-nasek-900">
                                {money(booking.totalPrice, { decimals: true })}
                              </span>
                              {booking.status !== 'cancelled' && key === 'dash.upcoming' && (
                                <button
                                  type="button"
                                  onClick={() => void cancel(booking)}
                                  className="text-xs font-semibold text-ink-400 transition-colors hover:text-red-700"
                                >
                                  {t('dash.cancelBooking')}
                                </button>
                              )}
                            </div>
                          </Card>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ),
            )
          )}
        </section>
      )}

      {/* ----------------------------------------------------------- saved */}
      {tab === 'saved' && (
        <section>
          {savedIds.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="size-5" />}
              title={t('dash.noSaved')}
              body={t('dash.noSavedHint')}
              action={<LinkButton to="/campaigns">{t('compare.browse')}</LinkButton>}
            />
          ) : (
            <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {savedIds.map((id) => {
                const campaign = getCampaign(id)
                return campaign ? <CampaignCard key={id} campaign={campaign} compact /> : null
              })}
            </div>
          )}
        </section>
      )}

      {/* --------------------------------------------------- notifications */}
      {tab === 'notifications' && (
        <section>
          {notifications.length === 0 ? (
            <EmptyState icon={<Bell className="size-5" />} title={t('dash.noNotifications')} />
          ) : (
            <>
              {unreadCount > 0 && (
                <div className="mb-4 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dispatch({ type: 'readAllNotifications' })}
                  >
                    {t('dash.markAllRead')}
                  </Button>
                </div>
              )}
              <ul className="space-y-2.5">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void markNotificationRead(notification.id)
                        dispatch({ type: 'readNotification', id: notification.id })
                      }}
                      className={cx(
                        'w-full rounded-[3px] border p-4 text-start transition-colors',
                        notification.read
                          ? 'border-ivory-300 bg-ivory-50'
                          : 'border-nasek-200 bg-nasek-50/60',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {!notification.read && (
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gold-500" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-bold text-ink-900">
                            {bl(notification.title)}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-ink-500">
                            {bl(notification.body)}
                          </p>
                          <p className="mt-1.5 text-2xs text-ink-400">
                            {date(notification.date)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* --------------------------------------------------------- profile */}
      {tab === 'profile' && (
        <section className="max-w-xl">
          <Card className="p-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                /*
                 * Write through to the database, then apply locally.
                 *
                 * `saveProfile` sends only the fields a person owns and returns
                 * the row as it actually landed — which may differ from what was
                 * typed, because the guard trigger reverts anything privileged.
                 * Applying the returned row rather than the form's own state is
                 * what stops the interface from displaying a change the database
                 * declined to make. With no backend configured it returns null
                 * and the local patch stands, exactly as before.
                 */
                const saved = await saveProfile(profile)
                dispatch({
                  type: 'updateProfile',
                  // With no backend `saved` is null and the typed values stand;
                  // the placeholder flag has to be cleared by hand there, since
                  // nothing round-tripped through `profileToUser` to compute it.
                  patch: saved ?? { ...profile, nameIsPlaceholder: !profile.name.trim() },
                })
                toast(t('dash.profileSaved'))
              }}
              className="space-y-4"
            >
              <Field label={t('common.name')}>
                {(p) => (
                  <Input
                    {...p}
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t('common.email')}>
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    dir="ltr"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t('common.phone')}>
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    dir="ltr"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label={t('common.wilayah')}
                hint={wilayahName(profile.wilayahId, lang)}
              >
                {(p) => (
                  <Select
                    {...p}
                    value={profile.wilayahId}
                    onChange={(e) => setProfile({ ...profile, wilayahId: e.target.value })}
                  >
                    {WILAYAT.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name[lang]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button type="submit" size="lg">
                {t('common.save')}
              </Button>
            </form>
          </Card>

          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-ink-700">{t('common.language')}</p>
            <Segmented
              className="w-full"
              label={t('common.language')}
              value={lang}
              onChange={setLang}
              options={[
                { value: 'ar', label: 'العربية' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>
        </section>
      )}
    </main>
  )
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useI18n()
  const map: Record<BookingStatus, { tone: 'green' | 'gold' | 'neutral' | 'red'; key: MessageKey }> = {
    confirmed: { tone: 'green', key: 'dash.upcoming' },
    pending: { tone: 'gold', key: 'dash.pending' },
    completed: { tone: 'neutral', key: 'dash.completed' },
    cancelled: { tone: 'red', key: 'dash.cancelled' },
  }
  const { tone, key } = map[status]
  return <Badge tone={tone}>{t(key)}</Badge>
}
