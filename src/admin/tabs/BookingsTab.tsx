import { useMemo, useState } from 'react'
import { Clock, Coins, Ticket, Users } from 'lucide-react'
import type { Booking, BookingStatus, Campaign, Provider } from '@/types'
import { useI18n } from '@/i18n'
import { formatPhone } from '@/services/auth/phone'
import { tripReference } from '@/lib/invoice'
import { useStore } from '@/store/AppStore'
import { EmptyState, Badge, cx } from '@/components/ui'
import { BodyRow, HeadRow, Kpi, TableShell, Th, Toolbar, useCountLabel } from './shared'

type Filter = 'all' | BookingStatus

const TONE: Record<BookingStatus, 'green' | 'gold' | 'red' | 'neutral'> = {
  confirmed: 'green',
  pending: 'gold',
  cancelled: 'red',
  completed: 'neutral',
}

/**
 * The booking ledger.
 *
 * Read-only by design. A booking is an agreement between a pilgrim and a
 * campaign owner, and an admin quietly editing one would leave both parties
 * looking at different facts. What the admin needs here is to *find* a
 * booking — when someone calls about a reference number — which is what the
 * search is for.
 */
export function BookingsTab({
  campaigns,
  providers,
}: {
  campaigns: Campaign[]
  providers: Provider[]
}) {
  const { t, bl, money, n, date } = useI18n()
  const countLabel = useCountLabel()
  /*
   * Every booking on the platform — because `bookings_read` returns exactly
   * that to an administrator, and nothing at all to anyone else. This tab used
   * to read a generated demo history built from a campaign list that is empty,
   * so the ledger was blank no matter how many bookings existed.
   */
  const { bookings } = useStore()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const titleOf = useMemo(() => {
    const map = new Map(campaigns.map((c) => [c.id, c]))
    return (id: string) => map.get(id)
  }, [campaigns])

  /** The company behind a trip — NASEK's ledger names both parties. */
  const ownerOf = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p]))
    return (id: string | undefined) => (id ? map.get(id) : undefined)
  }, [providers])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return bookings.filter((b: Booking) => {
      if (filter !== 'all' && b.status !== filter) return false
      if (!needle) return true
      return (
        b.reference.toLowerCase().includes(needle) ||
        b.contactName.toLowerCase().includes(needle) ||
        b.contactEmail.toLowerCase().includes(needle) ||
        b.contactPhone.includes(needle)
      )
    })
    // `bookings` belongs here. It arrives from the snapshot a moment after this
    // component mounts, and leaving it out meant the memo was computed once
    // against an empty store and never again — so the ledger stayed blank until
    // the administrator happened to type in the search box.
  }, [bookings, filter, query])

  /*
   * Confirmed value, and pending value, kept apart.
   *
   * "Booking value" used to mean every booking that had not been cancelled,
   * which under the old flow was every booking full stop — `book_campaign`
   * wrote them all as 'confirmed' on creation. Payment now happens off the
   * platform and a pending booking is a request nobody has paid for, so adding
   * one to the platform's confirmed value would be reporting money that may
   * never arrive. The two are separate figures because they are separate facts.
   */
  const stats = useMemo(() => {
    const live = bookings.filter((b) => b.status !== 'cancelled')
    const confirmed = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed')
    const pending = bookings.filter((b) => b.status === 'pending')
    return {
      total: bookings.length,
      travellers: live.reduce((s, b) => s + b.travellersCount, 0),
      confirmedValue: confirmed.reduce((s, b) => s + b.totalPrice, 0),
      confirmedCount: confirmed.length,
      pendingValue: pending.reduce((s, b) => s + b.totalPrice, 0),
      pendingCount: pending.length,
    }
    // `bookings` belongs here. It arrives from the snapshot a moment after this
    // component mounts, and an empty dependency list froze the figures at the
    // top of the ledger at zero for the life of the page.
  }, [bookings])

  return (
    <section className="space-y-5">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('admin.kpiBookings')} value={n(stats.total)} icon={<Ticket className="size-4" />} />
        <Kpi label={t('common.travellers')} value={n(stats.travellers)} icon={<Users className="size-4" />} />
        <Kpi
          label={t('admin.kpiConfirmedValue')}
          value={stats.confirmedCount ? money(stats.confirmedValue) : t('admin.noConfirmedFinancial')}
          icon={<Coins className="size-4" />}
          highlight
        />
        {/* Named for what it is. Not revenue, not booking value — money that
            has been asked for and not yet paid, off the platform. */}
        <Kpi
          label={t('admin.kpiAwaitingPayment')}
          value={money(stats.pendingValue)}
          icon={<Clock className="size-4" />}
          hint={stats.pendingCount > 0 ? t('admin.awaitingPaymentHint') : undefined}
        />
      </ul>

      <p className="text-2xs leading-relaxed text-ink-400">{t('admin.paymentNotProcessed')}</p>

      <Toolbar<Filter>
        query={query}
        onQuery={setQuery}
        placeholder={t('admin.bookingSearch')}
        filter={filter}
        onFilter={setFilter}
        filterLabel={t('admin.bookingFilter')}
        count={countLabel(Math.min(visible.length, 100), bookings.length)}
        options={[
          { value: 'all', label: t('admin.userAll') },
          { value: 'confirmed', label: t('admin.statusConfirmed') },
          { value: 'pending', label: t('admin.statusPending') },
          { value: 'completed', label: t('admin.statusCompleted') },
          { value: 'cancelled', label: t('admin.statusCancelled') },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-5" />}
          title={bookings.length === 0 ? t('admin.noBookings') : t('admin.noBookingMatch')}
          body={bookings.length === 0 ? t('admin.noBookingsBody') : t('admin.noUsersBody')}
        />
      ) : (
        <TableShell>
          <table className="w-full min-w-4xl text-sm">
            <thead>
              <HeadRow>
                <Th>{t('booking.invoiceNo')}</Th>
                <Th>{t('prov.customerName')}</Th>
                <Th>{t('campaign.byProvider')}</Th>
                <Th>{t('prov.customerTrip')}</Th>
                <Th>{t('booking.tripDate')}</Th>
                <Th>{t('common.travellers')}</Th>
                <Th>{t('booking.pricePerPerson')}</Th>
                <Th>{t('common.total')}</Th>
                <Th>{t('booking.created')}</Th>
                <Th>{t('common.status')}</Th>
              </HeadRow>
            </thead>
            <tbody>
              {/* Capped: an admin scans or searches this list, never scrolls
                  thousands of rows, and rendering them all would stall the tab. */}
              {visible.slice(0, 100).map((b) => {
                const campaign = titleOf(b.campaignId)
                const owner = ownerOf(campaign?.providerId)
                return (
                  <BodyRow key={b.id}>
                    <td className="nums p-3.5 font-semibold text-ink-700" dir="ltr">
                      {b.reference}
                    </td>
                    <td className="max-w-40 p-3.5">
                      <span className="block truncate text-ink-700">{b.contactName || '—'}</span>
                      <span className="block truncate text-2xs text-ink-400" dir="ltr">
                        {b.contactPhone ? formatPhone(b.contactPhone) : '—'}
                      </span>
                    </td>
                    <td className="max-w-40 p-3.5">
                      <span className="block truncate text-ink-600">
                        {owner ? bl(owner.name) : '—'}
                      </span>
                      {/* An owner with no number is why a customer's WhatsApp
                          button is dead. NASEK can see it from here. */}
                      <span
                        className={cx(
                          'block truncate text-2xs',
                          owner?.phone?.trim() ? 'text-ink-400' : 'font-semibold text-amber-700',
                        )}
                        dir={owner?.phone?.trim() ? 'ltr' : undefined}
                      >
                        {owner?.phone?.trim() ? formatPhone(owner.phone) : t('admin.ownerNoPhone')}
                      </span>
                    </td>
                    <td className="max-w-48 p-3.5">
                      <span className="block truncate text-ink-600">
                        {campaign ? bl(campaign.title) : '—'}
                      </span>
                      <span className="nums block text-2xs text-ink-400" dir="ltr">
                        {campaign ? tripReference(campaign.id) : '—'}
                      </span>
                    </td>
                    <td className="p-3.5 text-ink-500">
                      {campaign ? date(campaign.departureDate) : '—'}
                    </td>
                    <td className="nums p-3.5 text-ink-600">
                      <span className="block">{n(b.travellersCount)}</span>
                      {/* Null on a booking taken before the split existed. */}
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
                      <Badge tone={TONE[b.status]}>{t(`admin.status${b.status.charAt(0).toUpperCase()}${b.status.slice(1)}` as 'admin.statusPending')}</Badge>
                    </td>
                  </BodyRow>
                )
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      {visible.length > 100 && (
        <p className="text-2xs text-ink-400">{t('admin.bookingCapped', { n: n(100) })}</p>
      )}
    </section>
  )
}
