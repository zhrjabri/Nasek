import { useMemo, useState } from 'react'
import { Clock, Coins, FileText, Ticket, Users } from 'lucide-react'
import type { Booking, BookingStatus, Campaign, Provider } from '@/types'
import { useI18n } from '@/i18n'
import { formatPhone } from '@/services/auth/phone'
import { buildInvoice, tripReference } from '@/lib/invoice'
import { useStore } from '@/store/AppStore'
import { EmptyState, Badge, Button, Input, Modal, cx } from '@/components/ui'
import {
  BodyRow,
  DetailRow,
  HeadRow,
  Kpi,
  TableShell,
  Th,
  Toolbar,
  useCountLabel,
} from './shared'

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
  const { t, lang, bl, money, n, date } = useI18n()
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
  /*
   * A date window on the request date.
   *
   * Empty means unbounded at that end, which is why these are two independent
   * strings rather than a range object: "everything since March" and
   * "everything up to March" are both things an administrator asks for, and a
   * range type would make one of them awkward.
   */
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  /** The booking whose invoice is open, if any. */
  const [invoice, setInvoice] = useState<Booking | null>(null)

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
      /*
       * Inclusive at both ends, and compared as ISO strings.
       *
       * `bookingDate` is `YYYY-MM-DD` and so is the value of a `<input
       * type="date">`, and ISO dates sort lexicographically — so this needs no
       * `Date` parsing and cannot be thrown off by a timezone. Parsing them
       * into `Date` objects is how a booking made on the boundary day
       * disappears from a range that plainly includes it.
       */
      if (from && b.bookingDate < from) return false
      if (to && b.bookingDate > to) return false
      if (!needle) return true

      /*
       * Four more things to search by than the reference.
       *
       * An administrator gets a call about a booking and could be given any of
       * these: the invoice number, the customer's name or number, the company
       * they booked with, or "the Ramadan trip". Searching only the customer's
       * own details meant a question about a company could not be answered
       * from this screen at all.
       */
      const campaign = titleOf(b.campaignId)
      const owner = ownerOf(campaign?.providerId)
      const haystack = [
        b.reference,
        b.contactName,
        b.contactEmail,
        b.contactPhone,
        campaign ? campaign.title.ar : '',
        campaign ? campaign.title.en : '',
        campaign ? tripReference(campaign.id) : '',
        owner ? owner.name.ar : '',
        owner ? owner.name.en : '',
      ]
      return haystack.some((field) => field.toLowerCase().includes(needle))
    })
    // `bookings` belongs here. It arrives from the snapshot a moment after this
    // component mounts, and leaving it out meant the memo was computed once
    // against an empty store and never again — so the ledger stayed blank until
    // the administrator happened to type in the search box.
  }, [bookings, filter, query, from, to, titleOf, ownerOf])

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

      {/*
        The date window, below the toolbar rather than inside it.

        `Toolbar` is shared by six tabs and takes one search box and one
        segmented filter; widening its contract for the only screen that needs
        dates would push the change onto five tabs that do not.
      */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-2xs font-bold uppercase tracking-wider text-ink-400">
          <span className="block pb-1.5">{t('admin.bookingDateFrom')}</span>
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-2xs font-bold uppercase tracking-wider text-ink-400">
          <span className="block pb-1.5">{t('admin.bookingDateTo')}</span>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {(from || to) && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            {t('admin.bookingDatesClear')}
          </Button>
        )}
      </div>

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
                <Th>{t('admin.bookingConfirmedOn')}</Th>
                <Th>{t('common.status')}</Th>
                <Th end>{t('admin.viewInvoice')}</Th>
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
                    {/*
                      When the seats actually left the trip.

                      Under the inventory rules 20260913000100 introduced, a
                      pending request holds nothing: the deduction happens at
                      the moment the owner records payment, which is this
                      timestamp. An administrator reconciling a trip's remaining
                      seats against its bookings needs to see which of them are
                      actually holding any.
                    */}
                    <td className="p-3.5 text-ink-500">
                      {b.confirmedAt ? (
                        date(b.confirmedAt)
                      ) : (
                        <span className="text-2xs text-ink-400">
                          {t('admin.bookingNotConfirmed')}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <Badge tone={TONE[b.status]}>{t(`admin.status${b.status.charAt(0).toUpperCase()}${b.status.slice(1)}` as 'admin.statusPending')}</Badge>
                    </td>
                    <td className="p-3.5 text-end">
                      <Button size="xs" variant="secondary" onClick={() => setInvoice(b)}>
                        <FileText className="size-3.5" />
                        {t('admin.viewInvoice')}
                      </Button>
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

      {/*
        The invoice, as the customer received it.

        Built by the same `buildInvoice` the customer's own screen and the
        WhatsApp message use, from the same booking row — so what an
        administrator reads out over the phone is what the pilgrim is looking
        at, down to the trip reference. Rebuilding it here from the same fields
        would eventually mean two invoices for one booking.

        The company's phone is deliberately absent. `booking_provider_contact`
        answers only to the customer on that booking, and an administrator does
        not need the number to answer a question about an invoice.
      */}
      <Modal
        open={!!invoice}
        onClose={() => setInvoice(null)}
        title={invoice ? t('admin.invoiceTitle', { ref: invoice.reference }) : ''}
        wide
      >
        {invoice &&
          (() => {
            const campaign = titleOf(invoice.campaignId)
            const owner = ownerOf(campaign?.providerId)
            const built = buildInvoice(invoice, campaign, owner, lang)
            const held = invoice.status === 'confirmed' || invoice.status === 'completed'
            return (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-ink-500">{t('admin.invoiceBody')}</p>
                <dl className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
                  <DetailRow label={t('booking.invoiceNo')} value={built.invoiceNumber} ltr />
                  <DetailRow
                    label={t('common.status')}
                    value={
                      <Badge tone={TONE[invoice.status]}>
                        {t(
                          `admin.status${invoice.status.charAt(0).toUpperCase()}${invoice.status.slice(1)}` as 'admin.statusPending',
                        )}
                      </Badge>
                    }
                  />
                  <DetailRow label={t('prov.customerName')} value={built.customerName || '—'} />
                  <DetailRow
                    label={t('common.phone')}
                    value={built.customerPhone ? formatPhone(built.customerPhone) : '—'}
                    ltr
                  />
                  <DetailRow label={t('campaign.byProvider')} value={built.providerName || '—'} />
                  <DetailRow label={t('prov.customerTrip')} value={built.campaignName || '—'} />
                  <DetailRow label={t('booking.tripNo')} value={built.tripReference} ltr />
                  <DetailRow
                    label={t('booking.tripDate')}
                    value={built.tripDate ? date(built.tripDate) : '—'}
                  />
                  <DetailRow
                    label={t('common.travellers')}
                    value={
                      built.maleCount == null || built.femaleCount == null
                        ? n(built.totalPassengers)
                        : `${n(built.totalPassengers)} · ${t('booking.male')} ${n(built.maleCount)} · ${t('booking.female')} ${n(built.femaleCount)}`
                    }
                    ltr
                  />
                  <DetailRow
                    label={t('booking.pricePerPerson')}
                    value={built.pricePerPerson == null ? '—' : money(built.pricePerPerson)}
                    ltr
                  />
                  <DetailRow label={t('common.total')} value={money(built.totalAmount)} ltr />
                  <DetailRow label={t('booking.created')} value={date(built.bookingDate)} />
                  <DetailRow
                    label={t('admin.bookingConfirmedOn')}
                    value={
                      invoice.confirmedAt
                        ? date(invoice.confirmedAt)
                        : t('admin.bookingNotConfirmed')
                    }
                  />
                  {/* Says out loud what the seat count on the trip means.
                      A pending request is not holding anything. */}
                  <DetailRow
                    label={t('admin.invoiceSeatsHeld')}
                    value={held ? t('admin.invoiceSeatsHeldYes') : t('admin.invoiceSeatsHeldNo')}
                    wide
                  />
                </dl>
              </div>
            )
          })()}
      </Modal>
    </section>
  )
}
