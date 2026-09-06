import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  Star,
  Ticket,
  UserRound,
  XCircle,
} from 'lucide-react'
import type { Booking, BookingStatus } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { bookingsApi } from '@/services/api/bookings'
import { isSupabaseConfigured } from '@/services/supabase/client'
import {
  cancelBooking,
  completePastBookings,
  createReview,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/data/catalogue'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { CampaignCard } from '@/components/campaign/CampaignCard'
import { AccountPanel } from '@/pages/account/AccountPanel'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  LinkButton,
  Segmented,
  Textarea,
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
  const { user, bookings, reviews, savedIds, notifications, dispatch, toast } =
    useStore()
  const { getCampaign, getProvider } = useCatalogue()

  /*
   * A pilgrim's notifications, and only those.
   *
   * `loadSnapshot` already asks Postgres for `audience = 'customer'` on this
   * build, so against a configured backend this filter matches everything it is
   * given. It is here because the property belongs to the screen rather than to
   * one route into it: `pushNotification` writes straight to the store after a
   * booking, and a campaign owner using the customer site is an ordinary person
   * whose store may hold both kinds. This dashboard shows one of them.
   *
   * What it must not be mistaken for is the security boundary. That is
   * `notifications_own` in `20260909000100`, which refuses an owner-audience
   * row to any account that owns no company, so a customer cannot reach one by
   * asking PostgREST directly. For somebody who genuinely owns a company the
   * rows are legitimately theirs and Postgres must return them; which of their
   * two dashboards is asking is a question only the client can answer.
   */
  const mine = notifications.filter((entry) => entry.audience === 'customer')
  // Re-read after a cancellation, so the seats the trip just got back are the
  // ones shown. Subscribes to nothing until it is called.
  const { reload } = useSnapshotLoader()

  const tab = (params.get('tab') as Tab) ?? 'bookings'
  const setTab = (next: Tab) => setParams({ tab: next }, { replace: true })

  /** The booking whose review form is open, and what has been typed into it. */
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ rating: 5, comment: '' })
  const [posting, setPosting] = useState(false)

  /*
   * Bring past trips up to date the moment this page opens.
   *
   * `book_campaign` writes 'confirmed' and nothing ever wrote 'completed', so
   * the status sat unreachable and the review gate behind it was shut against
   * everybody. `complete_past_bookings` advances the caller's own past-dated
   * bookings; it is idempotent, scoped by the database to bookings this account
   * is party to, and cheap when there is nothing to move.
   */
  useEffect(() => {
    void completePastBookings().then((moved) => {
      if (moved > 0) void reload()
    })
  }, [reload])

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

  /**
   * Cancel a booking, and give the seats back.
   *
   * This called `bookingsApi.cancel` — a mock that resolves after 600ms and
   * touches nothing — against a live database, so the whole operation was a
   * toast. The row stayed `confirmed`, the seats were never returned to the
   * trip, and the next snapshot put the booking back exactly as it was, with
   * no error anywhere to explain why the cancellation had undone itself.
   *
   * `cancel_booking` is the transaction that actually does it: it checks the
   * booking is the caller's to cancel, flips the status and returns the seats
   * to the campaign in the same statement. It existed and was never called.
   *
   * The store is updated only once the database has agreed. Showing the
   * cancellation first and discovering the refusal later is the failure this
   * whole page had.
   */
  const cancel = async (booking: Booking) => {
    if (!window.confirm(t('dash.cancelConfirm'))) return

    if (isSupabaseConfigured) {
      if (!(await cancelBooking(booking.id))) {
        toast(t('dash.cancelFailed'), 'warning')
        return
      }
      dispatch({ type: 'cancelBooking', id: booking.id })
      toast(t('dash.bookingCancelled'), 'info')
      // The seat count on every card of this trip is now wrong by one.
      await reload()
      return
    }

    await bookingsApi.cancel(booking.id)
    dispatch({ type: 'cancelBooking', id: booking.id })
    toast(t('dash.bookingCancelled'), 'info')
  }

  /**
   * Write the review, then re-read so it appears where it belongs.
   *
   * The reload is not cosmetic. The insert fires a trigger that recomputes this
   * trip's rating, and its company's, from every visible review — so the stars
   * on the campaign card have changed as a result of this action and are stale
   * in the store until the snapshot is fetched again.
   *
   * The database's own refusal is surfaced rather than replaced. "You can
   * review a trip once you have travelled on it" tells somebody what to do; a
   * generic failure does not.
   */
  const postReview = async (campaignId: string, providerId: string) => {
    setPosting(true)
    const result = await createReview({
      campaignId,
      providerId,
      rating: draft.rating,
      comment: draft.comment,
    })
    setPosting(false)
    if ('error' in result) {
      toast(result.error, 'warning')
      return
    }
    setReviewing(null)
    toast(t('review.posted'))
    await reload()
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
                  // The badge counts what the tab will actually draw. `unreadCount`
                  // is the whole store, which for an owner browsing the customer
                  // site would promise notifications this screen does not show.
                  ? mine.filter((n) => !n.read).length
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
              action={<LinkButton to="/campaigns">{t('campaign.browse')}</LinkButton>}
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
                      // One review per traveller per trip: the unique
                      // constraint says so, and offering the form again would
                      // only produce a duplicate-key error.
                      const reviewed = reviews.some(
                        (r) => r.campaignId === booking.campaignId && r.userId === user.id,
                      )
                      const canReview =
                        key === 'dash.completed' && booking.status !== 'cancelled' && !reviewed
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
                              {canReview && reviewing !== booking.id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReviewing(booking.id)
                                    setDraft({ rating: 5, comment: '' })
                                  }}
                                  className="text-xs font-semibold text-nasek-700 transition-colors hover:underline"
                                >
                                  {t('review.write')}
                                </button>
                              )}
                              {reviewed && (
                                <span className="text-xs text-ink-400">{t('review.thanks')}</span>
                              )}
                            </div>
                          </Card>

                          {/* The form opens under the trip it is about rather
                              than in a dialog: the traveller is looking at the
                              booking, and the review is about that booking. */}
                          {reviewing === booking.id && campaign && (
                            <Card className="mt-2 p-5">
                              <h3 className="text-base font-bold text-ink-900">
                                {t('review.formTitle')}
                              </h3>
                              <p className="mt-1 text-xs text-ink-500">{t('review.formNote')}</p>

                              <fieldset className="mt-4">
                                <legend className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink-500">
                                  {t('review.rating')}
                                </legend>
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      aria-label={t('review.stars', { n: n(star) })}
                                      aria-pressed={draft.rating === star}
                                      onClick={() => setDraft((d) => ({ ...d, rating: star }))}
                                      className="rounded-[3px] p-0.5 transition-transform hover:scale-110"
                                    >
                                      <Star
                                        className={cx(
                                          'size-6',
                                          star <= draft.rating
                                            ? 'fill-gold-400 text-gold-400'
                                            : 'text-ivory-400',
                                        )}
                                        strokeWidth={1.5}
                                      />
                                    </button>
                                  ))}
                                </div>
                              </fieldset>

                              <div className="mt-4">
                                <Field label={t('review.comment')}>
                                  {(fp) => (
                                    <Textarea
                                      {...fp}
                                      rows={3}
                                      value={draft.comment}
                                      onChange={(e) =>
                                        setDraft((d) => ({ ...d, comment: e.target.value }))
                                      }
                                    />
                                  )}
                                </Field>
                              </div>

                              <div className="mt-4 flex gap-2">
                                <Button
                                  size="sm"
                                  loading={posting}
                                  disabled={!draft.comment.trim()}
                                  onClick={() =>
                                    void postReview(booking.campaignId, campaign.providerId)
                                  }
                                >
                                  {t('review.submit')}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setReviewing(null)}>
                                  {t('common.cancel')}
                                </Button>
                              </div>
                            </Card>
                          )}
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
              action={<LinkButton to="/campaigns">{t('campaign.browse')}</LinkButton>}
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
          {mine.length === 0 ? (
            <EmptyState icon={<Bell className="size-5" />} title={t('dash.noNotifications')} />
          ) : (
            <>
              {mine.some((entry) => !entry.read) && (
                <div className="mb-4 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Written to the database as well as to the store. It
                      // dispatched locally only, so every notification came
                      // back unread on the next load — while the button beside
                      // each one, which does call through, made its change
                      // stick. Two controls for the same thing, disagreeing.
                      void markAllNotificationsRead()
                      dispatch({ type: 'readAllNotifications' })
                    }}
                  >
                    {t('dash.markAllRead')}
                  </Button>
                </div>
              )}
              <ul className="space-y-2.5">
                {mine.map((notification) => (
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
      {/*
        Lifted into its own component, and it grew a great deal while doing
        so. What was here was four inputs and a save button — one of which,
        the email field, was writable and silently discarded, because
        `saveProfile` has never sent that column and the database now reverts
        it outright.

        `AccountPanel` is view-first with an explicit edit state, adds the
        governorate and nationality the brief asked for, and treats the
        sign-in address as what it is: a credential, changed through
        Supabase with a confirmation email rather than saved like a phone
        number.
      */}
      {tab === 'profile' && (
        <div className="space-y-5">
          <AccountPanel user={user} />

          {/* The language switch stays with the account settings rather than
              moving into the panel: it is a preference of this browser, not
              a fact about the person, and nothing writes it to the profile. */}
          <div className="max-w-2xl">
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
        </div>
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
