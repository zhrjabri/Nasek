import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Info,
  Lock,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  Printer,
  ReceiptText,
} from 'lucide-react'
import type { Booking, Campaign, Provider } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { bookingsApi, bookingTotal } from '@/services/api/bookings'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { isValidPhone, formatPhone } from '@/services/auth/phone'
import { createBooking } from '@/services/data/catalogue'
import { buildInvoice, invoiceWhatsappUrl, tripReference } from '@/lib/invoice'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { tripDays } from '@/lib/trip'
import {
  AnchorButton,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  Notice,
  ProgressBar,
  RuleLink,
  Spinner,
  cx,
} from '@/components/ui'

/**
 * Two steps, and neither of them is a payment screen.
 *
 * NASEK does not take money. The flow used to end on a fourth step showing a
 * greyed-out card number and a button reading "Simulate payment", which wrote a
 * booking straight to 'confirmed' — a database record asserting that a trip had
 * been paid for by a form that had never asked for a payment method.
 *
 * What replaces it is the workflow NASEK actually operates: choose how many
 * people are travelling, check the figures, create a booking *request*, and
 * send the invoice NASEK issues to the campaign owner over WhatsApp. The owner
 * quotes their own payment details, is paid directly, and marks the booking
 * confirmed in their portal.
 *
 * The traveller-details step went with the payment step. It collected a name, a
 * civil ID and a passport number for every companion before the customer had
 * been told how to pay — details no screen in any of the three applications
 * displayed, ahead of a conversation in which the campaign owner asks for them
 * anyway. The `travellers` table and every row in it are untouched; this form
 * simply stops adding to them.
 */
const STEP_KEYS: MessageKey[] = ['booking.stepPassengers', 'booking.stepReview']
const LAST_STEP = STEP_KEYS.length

/**
 * The passenger counts live in the address bar.
 *
 * Not for prettiness: a customer with no phone number on file is sent to their
 * profile to add one, and has to come back to a booking that still remembers
 * what they had chosen. Query parameters survive that round trip, a refresh,
 * and the browser's back button, where component state survives none of them.
 */
function readCount(raw: string | null): number {
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 && value <= 99 ? value : 0
}

export function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang, bl, money, n, date, dateRange } = useI18n()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user, dispatch, toast, remoteReady } = useStore()
  const { getCampaign, getProvider } = useCatalogue()
  // `book_campaign` decrements the trip's seats inside its own transaction, so
  // every seat count this browser is holding is stale the moment it returns.
  const { reload } = useSnapshotLoader()

  const campaign = id ? getCampaign(id) : undefined
  const [step, setStep] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [booking, setBooking] = useState<Booking | null>(null)

  const male = readCount(params.get('m'))
  const female = readCount(params.get('f'))
  const passengers = male + female

  const setCounts = (nextMale: number, nextFemale: number) => {
    const next = new URLSearchParams(params)
    next.set('m', String(Math.max(0, nextMale)))
    next.set('f', String(Math.max(0, nextFemale)))
    setParams(next, { replace: true })
  }

  /*
   * One passenger to begin with, written into the address rather than assumed.
   *
   * A booking of nobody is not a booking, and an empty stepper reading zero is
   * a form that starts in an invalid state. Only on the first arrival — once
   * either parameter is present the customer's own choice stands, including a
   * deliberate zero on one of the two.
   */
  useEffect(() => {
    if (params.get('m') === null && params.get('f') === null) {
      const next = new URLSearchParams(params)
      next.set('m', '1')
      next.set('f', '0')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  if (!campaign) {
    /*
     * "Not in the catalogue" and "the catalogue has not arrived" are different
     * answers, and only one of them belongs on the screen. See the campaign
     * page, which makes the same distinction for the same reason.
     */
    if (isSupabaseConfigured && !remoteReady) {
      return (
        <main className="flex min-h-[60dvh] items-center justify-center px-4">
          <Spinner className="size-7 text-nasek-600" />
        </main>
      )
    }
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState
          title={t('state.notFoundTitle')}
          body={t('state.notFoundBody')}
          action={<RuleLink to="/campaigns">{t('campaign.browse')}</RuleLink>}
        />
      </main>
    )
  }

  /*
   * Registration has closed. Checked before the sign-in gate rather than after
   * it: sending somebody through an email, a code and a verification only to
   * tell them the trip stopped taking bookings last week is a cruelty the order
   * of two `if`s can avoid.
   */
  if (
    campaign.registrationDeadline &&
    campaign.registrationDeadline < new Date().toISOString().slice(0, 10)
  ) {
    return (
      <main className="mx-auto max-w-lg px-4 py-20 sm:px-6">
        <EmptyState
          title={t('campaign.deadlinePassed')}
          body={t('campaign.deadline') + ' · ' + date(campaign.registrationDeadline)}
          action={<RuleLink to="/campaigns">{t('campaign.browse')}</RuleLink>}
        />
      </main>
    )
  }

  // Booking needs an account — but the selection is held, not thrown away.
  if (!user) {
    const back = `/booking/${campaign.id}?m=${male}&f=${female}`
    return (
      <main className="mx-auto max-w-lg px-4 py-20 sm:px-6">
        <Card className="p-8 text-center">
          <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
            <Lock className="size-6" />
          </span>
          <h1 className="display text-2xl text-ink-900">{t('booking.signInFirst')}</h1>
          <p className="mt-2.5 text-base text-ink-500">{t('booking.signInNote')}</p>
          <div className="mt-6">
            <LinkButton to={`/signin?next=${encodeURIComponent(back)}`} size="lg" block>
              {t('nav.signIn')}
            </LinkButton>
          </div>
        </Card>
      </main>
    )
  }

  const provider = getProvider(campaign.providerId)

  /*
   * A booking with no way to reach the customer is not a booking.
   *
   * The campaign owner's entire side of this workflow is "reply to the person
   * who sent the invoice", and the invoice carries this number. It is read from
   * the profile rather than asked for again, and when the profile has not got
   * one the booking is refused here rather than created with a blank — or, far
   * worse, with something invented to fill the column.
   *
   * `book_campaign` refuses the same thing server-side. This is the version
   * that can offer a way out of it.
   */
  if (!isValidPhone(user.phone)) {
    const back = `/booking/${campaign.id}?m=${male}&f=${female}`
    return (
      <main className="mx-auto max-w-lg px-4 py-20 sm:px-6">
        <Card className="p-8 text-center">
          <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-[3px] bg-amber-50 text-amber-700">
            <Phone className="size-6" />
          </span>
          <h1 className="display text-2xl text-ink-900">{t('booking.phoneRequired')}</h1>
          <p className="mt-2.5 text-base leading-relaxed text-ink-500">
            {t('booking.phoneRequiredWhy')}
          </p>
          <div className="mt-6">
            <LinkButton
              to={`/dashboard?tab=profile&next=${encodeURIComponent(back)}`}
              size="lg"
              block
            >
              {t('booking.phoneAdd')}
            </LinkButton>
          </div>
          {/* The trip is not lost while they go and do it. */}
          <p className="mt-4 text-xs text-ink-400">{t('booking.phoneReturn')}</p>
        </Card>
      </main>
    )
  }

  const total = bookingTotal(campaign.price, passengers)
  const overCapacity = passengers > campaign.seatsAvailable
  const canContinue = passengers >= 1 && !overCapacity

  /**
   * Create the booking, and only then offer WhatsApp.
   *
   * The order is the point. Nothing opens WhatsApp until Postgres has returned
   * a row: an invoice number handed out before the booking exists is a number
   * for a booking that may never exist, sent to a campaign owner who will look
   * for it and not find it.
   */
  const createRequest = async () => {
    setProcessing(true)
    try {
      let created: Booking
      if (isSupabaseConfigured) {
        const result = await createBooking({
          campaignId: campaign.id,
          maleCount: male,
          femaleCount: female,
          contactName: user.nameIsPlaceholder ? '' : user.name,
          contactPhone: user.phone,
          contactEmail: user.email,
        })
        if ('error' in result) {
          setProcessing(false)
          /*
           * Three different things, and the customer is told which.
           *
           * The server's own wording when it refused on purpose — "Only 2
           * seat(s) remain on this trip" is actionable. A specific notice when
           * this bundle has landed ahead of its migration, which is nothing the
           * customer did and resolves on its own. Ours when something broke.
           */
          toast(
            result.schemaBehind
              ? t('booking.temporarilyUnavailable')
              : result.fromServer
                ? result.error
                : t('state.errorBody'),
            'warning',
          )
          return
        }
        created = result.booking
      } else {
        created = await bookingsApi.create({
          user,
          campaign,
          maleCount: male,
          femaleCount: female,
          contactName: user.nameIsPlaceholder ? '' : user.name,
          contactPhone: user.phone,
          contactEmail: user.email,
        })
      }
      dispatch({ type: 'addBooking', booking: created })
      dispatch({
        type: 'pushNotification',
        notification: {
          id: `n${created.id}`,
          userId: user.id,
          kind: 'booking',
          // Not "confirmed". Nothing has been paid, and the notification that
          // used to say so was written by the same screen that simulated the
          // payment.
          title: { ar: 'تم إنشاء طلب الحجز', en: 'Booking request created' },
          body: {
            ar: `طلب الحجز ${created.reference} بانتظار إتمام الدفع مع صاحب الحملة.`,
            en: `Booking request ${created.reference} is awaiting payment with the campaign owner.`,
          },
          date: created.bookingDate,
          read: false,
          audience: 'customer',
        },
      })
      setBooking(created)

      /*
       * Re-read the catalogue, so the seats this request just held are gone
       * from every card that shows them. Deliberately not awaited: the booking
       * is committed, and a slow refresh must not hold up the invoice.
       */
      void reload()
    } catch {
      toast(t('state.errorBody'), 'warning')
    } finally {
      setProcessing(false)
    }
  }

  // ------------------------------------------------------------- the invoice
  if (booking) {
    return <InvoiceScreen booking={booking} campaign={campaign} provider={provider} />
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="display mb-6 text-4xl text-ink-900 sm:text-5xl">{t('booking.title')}</h1>

      {/* --------------------------------------------------------- stepper */}
      <nav aria-label={t('booking.title')} className="mb-8">
        <ol className="scrollbar-none flex items-center gap-1 overflow-x-auto pb-1">
          {STEP_KEYS.map((key, i) => {
            const num = i + 1
            const done = num < step
            const active = num === step
            return (
              <li key={key} className="flex shrink-0 items-center gap-1">
                <span
                  className={cx(
                    'flex items-center gap-2 rounded-[3px] px-3 py-2 text-xs font-semibold transition-colors',
                    active
                      ? 'bg-nasek-900 text-ivory-50'
                      : done
                        ? 'bg-nasek-50 text-nasek-800'
                        : 'text-ink-400',
                  )}
                >
                  <span
                    className={cx(
                      'nums flex size-5 items-center justify-center rounded-full text-2xs',
                      active
                        ? 'bg-gold-400 text-nasek-950'
                        : done
                          ? 'bg-nasek-600 text-white'
                          : 'bg-ivory-300 text-ink-500',
                    )}
                  >
                    {done ? <Check className="size-3" strokeWidth={3.5} /> : num}
                  </span>
                  <span className="hidden sm:inline">{t(key)}</span>
                </span>
                {i < STEP_KEYS.length - 1 && <span className="h-px w-3 bg-ivory-300" />}
              </li>
            )
          })}
        </ol>
        <ProgressBar className="mt-3 sm:hidden" value={step} max={LAST_STEP} />
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Card className="p-6 sm:p-7">
            {/* -------------------------------------- 1. trip and passengers */}
            {step === 1 && (
              <div className="animate-fade">
                <StepTitle>{t('booking.chooseTrip')}</StepTitle>

                <div className="flex items-start gap-4 rounded-[3px] border border-ivory-300 bg-ivory-50/60 p-4">
                  <span
                    className="flex size-12 shrink-0 items-center justify-center rounded-[3px] text-lg font-bold text-white"
                    style={{ background: provider?.brandColor }}
                    aria-hidden
                  >
                    {provider?.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Badge tone={campaign.type === 'hajj' ? 'gold' : 'green'}>
                      {t(campaign.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
                    </Badge>
                    <p className="mt-2 text-lg font-bold text-ink-900">{bl(campaign.title)}</p>
                    <p className="mt-1 text-sm text-ink-500">
                      {provider ? bl(provider.name) : ''} · {wilayahName(campaign.wilayahId, lang)}
                    </p>
                  </div>
                </div>

                {/* The dates are the campaign's own — there is nothing to pick,
                    so they are shown for confirmation rather than as a step. */}
                <div className="mt-3 flex items-center gap-4 rounded-[3px] border border-ivory-300 bg-ivory-50/60 p-4">
                  <CalendarDays className="size-5 shrink-0 text-nasek-700" />
                  <div className="min-w-0">
                    <p className="text-base font-bold text-ink-900">
                      {dateRange(campaign.departureDate, campaign.returnDate)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {t('campaign.duration', { n: n(tripDays(campaign)) })} ·{' '}
                      {t(campaign.travelMethod === 'air' ? 'common.air' : 'common.land')}
                    </p>
                  </div>
                  <Check className="ms-auto size-5 shrink-0 text-nasek-700" strokeWidth={3} />
                </div>

                <Link
                  to="/campaigns"
                  className="mt-3 inline-block text-sm font-semibold text-nasek-700 hover:underline"
                >
                  {t('booking.changeTrip')}
                </Link>

                {/* ------------------------------------------- passengers */}
                <div className="mt-7 border-t border-ivory-300 pt-6">
                  <h3 className="text-lg font-bold text-ink-900">
                    {t('booking.passengersTitle')}
                  </h3>
                  <p className="mt-1 mb-5 text-sm text-ink-500">
                    {t('booking.travellersNote', { n: n(campaign.seatsAvailable) })}
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Counter
                      label={t('booking.male')}
                      value={male}
                      onChange={(v) => setCounts(v, female)}
                      max={Math.max(0, campaign.seatsAvailable - female)}
                    />
                    <Counter
                      label={t('booking.female')}
                      value={female}
                      onChange={(v) => setCounts(male, v)}
                      max={Math.max(0, campaign.seatsAvailable - male)}
                    />
                  </div>

                  <div className="mt-5 flex items-baseline justify-between rounded-[3px] border border-ivory-300 bg-ivory-50/60 px-4 py-3">
                    <span className="text-sm font-semibold text-ink-600">
                      {t('booking.totalPassengers')}
                    </span>
                    <span className="nums text-2xl font-bold text-nasek-900" aria-live="polite">
                      {n(passengers)}
                    </span>
                  </div>

                  {passengers < 1 && (
                    <p className="mt-4 flex items-center gap-2 text-sm font-medium text-amber-700">
                      <Info className="size-4 shrink-0" />
                      {t('booking.atLeastOne')}
                    </p>
                  )}
                  {overCapacity && (
                    <p className="mt-4 flex items-center gap-2 text-sm font-medium text-amber-700">
                      <Info className="size-4 shrink-0" />
                      {t('booking.notEnoughSeats', { n: n(campaign.seatsAvailable) })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ------------------------------------------------- 2. review */}
            {step === 2 && (
              <div className="animate-fade">
                <StepTitle>{t('booking.reviewTitle')}</StepTitle>
                <p className="mb-5 text-sm text-ink-500">{t('booking.reviewNote')}</p>

                <dl className="divide-y divide-ivory-300 rounded-[3px] border border-ivory-300">
                  <ReviewRow label={t('booking.campaign')} value={bl(campaign.title)} />
                  <ReviewRow label={t('booking.tripNo')} value={tripReference(campaign.id)} ltr />
                  <ReviewRow label={t('booking.tripDate')} value={date(campaign.departureDate)} />
                  <ReviewRow
                    label={t('campaign.byProvider')}
                    value={provider ? bl(provider.name) : '—'}
                  />
                  <ReviewRow
                    label={t('common.name')}
                    value={user.nameIsPlaceholder ? '—' : user.name}
                  />
                  <ReviewRow label={t('common.phone')} value={formatPhone(user.phone)} ltr />
                  <ReviewRow label={t('booking.male')} value={n(male)} />
                  <ReviewRow label={t('booking.female')} value={n(female)} />
                  <ReviewRow label={t('booking.totalPassengers')} value={n(passengers)} />
                  <ReviewRow
                    label={t('booking.pricePerPerson')}
                    value={money(campaign.price)}
                    ltr
                  />
                  <ReviewRow
                    label={t('common.total')}
                    value={money(total, { decimals: true })}
                    ltr
                  />
                </dl>

                {/* Said before the button, not after it: NASEK is not going to
                    ask for a card, and the customer should know that now. */}
                <Notice tone="info" className="mt-5">
                  {t('booking.manualPaymentNote')}
                </Notice>

                <Button
                  size="md"
                  block
                  className="mt-5"
                  loading={processing}
                  disabled={!canContinue}
                  onClick={() => void createRequest()}
                >
                  {!processing && <ReceiptText className="size-4" />}
                  {processing ? t('booking.processing') : t('booking.createRequest')}
                </Button>
              </div>
            )}

            {/* ----------------------------------------------- controls */}
            {step < LAST_STEP && (
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-ivory-300 pt-6">
                <Button
                  variant="ghost"
                  onClick={() => (step === 1 ? navigate(-1) : setStep((s) => s - 1))}
                >
                  <ArrowLeft className="size-4 rtl:-scale-x-100" />
                  {t('common.back')}
                </Button>
                <Button size="md" disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
                  {t('common.continue')}
                  <ArrowRight className="size-4 rtl:-scale-x-100" />
                </Button>
              </div>
            )}
            {step === LAST_STEP && (
              <div className="mt-6 border-t border-ivory-300 pt-5">
                <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft className="size-4 rtl:-scale-x-100" />
                  {t('common.back')}
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------------- summary */}
        <aside>
          <div className="lg:sticky lg:top-24">
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                {t('common.total')}
              </p>
              <p className="mt-3 text-md font-bold leading-snug text-ink-900">
                {bl(campaign.title)}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {date(campaign.departureDate)} ·{' '}
                {t('campaign.duration', { n: n(tripDays(campaign)) })}
              </p>

              {/*
                No fee line.

                There used to be a "NASEK service fee (2%)" row here and a
                subtotal above it. The customer now pays the campaign owner
                directly, so a fee inside that figure is a fee they would hand
                to the owner on NASEK's behalf with no way to pass it back. The
                2% is unchanged as a commercial fact — it is what the owner owes
                NASEK on confirmed business — and it is not part of this bill.
              */}
              <dl className="mt-5 space-y-2.5 border-t border-ivory-300 pt-4 text-sm">
                <SummaryRow label={t('booking.pricePerPerson')} value={money(campaign.price)} />
                <SummaryRow label={t('booking.male')} value={n(male)} />
                <SummaryRow label={t('booking.female')} value={n(female)} />
                <SummaryRow label={t('booking.totalPassengers')} value={n(passengers)} />
              </dl>

              <div className="mt-4 flex items-baseline justify-between border-t border-ivory-300 pt-4">
                <span className="text-sm font-bold text-ink-700">{t('common.total')}</span>
                <span className="nums text-3xl font-bold text-nasek-900">
                  {money(total, { decimals: true })}
                </span>
              </div>
            </Card>
          </div>
        </aside>
      </div>
    </main>
  )
}

// ------------------------------------------------------------------- pieces

function Counter({
  label,
  value,
  onChange,
  max,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  max: number
}) {
  const { t, n } = useI18n()
  return (
    <div className="rounded-[3px] border border-ivory-300 bg-ivory-50/60 p-4">
      <p className="mb-3 text-center text-sm font-bold text-ink-700">{label}</p>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          aria-label={`${label} −`}
          className="flex size-11 items-center justify-center rounded-[3px] border border-ivory-300 bg-ivory-50 text-ink-600 transition-colors hover:border-nasek-400 disabled:opacity-40"
        >
          <Minus className="size-5" />
        </button>
        <span className="nums display w-14 text-center text-5xl text-nasek-900" aria-live="polite">
          {n(value)}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`${label} +`}
          className="flex size-11 items-center justify-center rounded-[3px] border border-ivory-300 bg-ivory-50 text-ink-600 transition-colors hover:border-nasek-400 disabled:opacity-40"
        >
          <Plus className="size-5" />
        </button>
      </div>
      <p className="sr-only">{t('booking.totalPassengers')}</p>
    </div>
  )
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="display mb-5 text-2xl text-ink-900 sm:text-3xl">{children}</h2>
}

/**
 * `ltr` on the rows that hold a number.
 *
 * An invoice number, a phone number and a price are Latin-digit strings, and in
 * an Arabic page the bidirectional algorithm will happily move a leading `+` or
 * a trailing currency word to the wrong end of one. Marking the value's own
 * direction fixes it without touching the row's alignment.
 */
function ReviewRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd
        className={cx('text-end text-sm font-semibold text-ink-900', ltr && 'nums')}
        dir={ltr ? 'ltr' : undefined}
      >
        {value}
      </dd>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="nums font-semibold text-ink-800">{value}</dd>
    </div>
  )
}

// ------------------------------------------------------------------ invoice

/**
 * The invoice, and the one button that matters on it.
 *
 * This screen is reached only after Postgres has returned a booking row, so
 * every figure on it is read back off that row rather than off the form that
 * produced it — including the invoice number, which NASEK issued and which will
 * not change again for the life of the booking.
 */
function InvoiceScreen({
  booking,
  campaign,
  provider,
}: {
  booking: Booking
  campaign: Campaign
  provider: Provider | undefined
}) {
  const { t, lang, money, n, date } = useI18n()
  const invoice = useMemo(
    () => buildInvoice(booking, campaign, provider, lang),
    [booking, campaign, provider, lang],
  )
  const href = invoiceWhatsappUrl(invoice, lang)

  return (
    <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <div className="text-center animate-rise">
        <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
          <ReceiptText className="size-8" strokeWidth={1.8} />
        </span>
        <h1 className="display text-4xl text-ink-900 sm:text-5xl">{t('booking.requestTitle')}</h1>
        <p className="mx-auto mt-3 max-w-md text-md leading-relaxed text-ink-500">
          {t('booking.requestBody')}
        </p>
      </div>

      <Card className="mt-9 overflow-hidden">
        <div className="girih-gold border-b border-gold-500/40 bg-nasek-900 px-6 py-5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-gold-300/80">
            {t('booking.invoiceNo')}
          </p>
          <p className="nums mt-1.5 text-3xl font-bold tracking-wide text-ivory-50" dir="ltr">
            {invoice.invoiceNumber}
          </p>
        </div>

        <dl className="divide-y divide-ivory-300">
          <ReviewRow label={t('booking.campaign')} value={invoice.campaignName || '—'} />
          <ReviewRow label={t('booking.tripNo')} value={invoice.tripReference} ltr />
          <ReviewRow
            label={t('booking.tripDate')}
            value={invoice.tripDate ? date(invoice.tripDate) : '—'}
          />
          <ReviewRow label={t('common.name')} value={invoice.customerName || '—'} />
          <ReviewRow label={t('common.phone')} value={invoice.customerPhone} ltr />
          <ReviewRow
            label={t('booking.male')}
            value={invoice.maleCount == null ? '—' : n(invoice.maleCount)}
          />
          <ReviewRow
            label={t('booking.female')}
            value={invoice.femaleCount == null ? '—' : n(invoice.femaleCount)}
          />
          <ReviewRow label={t('booking.totalPassengers')} value={n(invoice.totalPassengers)} />
          <ReviewRow
            label={t('booking.pricePerPerson')}
            value={invoice.pricePerPerson == null ? '—' : money(invoice.pricePerPerson)}
            ltr
          />
          <ReviewRow
            label={t('common.total')}
            value={money(invoice.totalAmount, { decimals: true })}
            ltr
          />
          <ReviewRow label={t('campaign.byProvider')} value={invoice.providerName || '—'} />
          <ReviewRow label={t('booking.created')} value={date(invoice.bookingDate)} />
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-ink-500">{t('common.status')}</dt>
            <dd>
              <Badge tone="gold">{t('booking.awaitingPayment')}</Badge>
            </dd>
          </div>
        </dl>
      </Card>

      {/* ------------------------------------------------------- WhatsApp */}
      <div className="mt-7">
        {href ? (
          <>
            <AnchorButton href={href} target="_blank" rel="noopener noreferrer" size="lg" block>
              <MessageCircle className="size-5" />
              {t('booking.sendWhatsapp')}
            </AnchorButton>
            <p className="mt-3 text-center text-sm leading-relaxed text-ink-500">
              {t('booking.sendWhatsappNote')}
            </p>
          </>
        ) : (
          /*
           * No number, no link.
           *
           * A `wa.me` URL built from a fallback would deliver a real customer's
           * name, phone number and trip to whoever happens to own the number
           * the fallback invented. The booking is real and saved; only this one
           * action is unavailable, and it says why.
           */
          <Notice tone="warn" title={t('booking.noProviderPhone')}>
            {t('booking.noProviderPhoneNote')}
          </Notice>
        )}
      </div>

      <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
        <LinkButton to="/dashboard?tab=bookings" variant="secondary" size="md" block>
          {t('booking.viewBookings')}
        </LinkButton>
        <Button variant="secondary" size="md" block onClick={() => window.print()}>
          <Printer className="size-4" />
          {t('booking.print')}
        </Button>
      </div>
      <div className="mt-3">
        <LinkButton to="/" variant="ghost" block>
          {t('booking.backHome')}
        </LinkButton>
      </div>
    </main>
  )
}
