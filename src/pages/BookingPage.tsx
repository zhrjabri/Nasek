import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CreditCard,
  Info,
  Lock,
  Minus,
  Plus,
  Printer,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { Booking, Campaign, Traveller, User } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { bookingsApi, priceBreakdown } from '@/services/api/bookings'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { saveProfile } from '@/services/auth/session'
import { contactDetailsToKeep } from '@/services/auth/profileGaps'
import { createBooking } from '@/services/data/catalogue'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { tripDays } from '@/lib/trip'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LinkButton,
  RuleLink,
  ProgressBar,
  Segmented,
  Select,
  Spinner,
  cx,
} from '@/components/ui'

/**
 * Four steps, not six.
 *
 * The flow used to open with two screens that only restated a choice already
 * made on the campaign page — the trip, then its fixed dates — so every
 * booking began with two clicks that changed nothing. Trip, dates and party
 * size now share one screen, and the rest follows: details, review, payment.
 */
const STEP_KEYS: MessageKey[] = [
  'booking.stepTrip',
  'booking.step4',
  'booking.step5',
  'booking.step6',
]

/** Payment — the last step that is still part of the form. */
const LAST_STEP = STEP_KEYS.length

const emptyTraveller = (): Traveller => ({
  name: '',
  nationality: 'omani',
  gender: 'male',
  civilId: '',
  passportNo: '',
})

export function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang, bl, money, n, date, dateRange } = useI18n()
  const navigate = useNavigate()
  const { user, dispatch, toast, remoteReady } = useStore()
  const { getCampaign, getProvider } = useCatalogue()
  // `book_campaign` decrements the trip's seats inside its own transaction, so
  // every seat count this browser is holding is stale the moment it returns.
  const { reload } = useSnapshotLoader()

  const campaign = id ? getCampaign(id) : undefined
  const [step, setStep] = useState(1)
  const [travellersCount, setTravellersCount] = useState(1)
  const [travellers, setTravellers] = useState<Traveller[]>([emptyTraveller()])
  const [contact, setContact] = useState({ name: '', phone: '', email: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState(false)
  const [booking, setBooking] = useState<Booking | null>(null)

  const Back = ArrowLeft
  const Next = ArrowRight

  /*
   * Prefill from the signed-in account — nobody should retype what we know.
   *
   * The name is the exception, and the reason is the whole point of registering
   * with an address alone: a pilgrim who has not given a name is greeted by the
   * local part of theirs, and `user.name` is that greeting. Prefilling it would
   * put `ahmed.k` into the field the campaign reads to find someone at an
   * airport, and — because this form saves what it collects back to the profile
   * — would then make it permanent. `nameIsPlaceholder` is exactly the question
   * "is this a name they gave us?", so the field is left empty when it is not.
   */
  useEffect(() => {
    if (!user) return
    setContact({
      name: user.nameIsPlaceholder ? '' : user.name,
      phone: user.phone,
      email: user.email,
    })
  }, [user])

  // Keep the traveller array in step with the count.
  useEffect(() => {
    setTravellers((cur) => {
      if (cur.length === travellersCount) return cur
      if (cur.length < travellersCount) {
        return [...cur, ...Array.from({ length: travellersCount - cur.length }, emptyTraveller)]
      }
      return cur.slice(0, travellersCount)
    })
  }, [travellersCount])

  if (!campaign) {
    /*
     * "Not in the catalogue" and "the catalogue has not arrived" are different
     * answers, and only one of them belongs on the screen.
     *
     * The trip is read straight out of the catalogue, which is empty until the
     * snapshot lands — and this page mounts alongside the loader that fetches
     * it. So every refresh of a booking page, and every link into one, opened
     * on "We can't find that page" and corrected itself a few hundred
     * milliseconds later. It resolved on its own, which is why it read as a
     * flicker rather than as a bug; on a slow connection it is a paragraph
     * telling somebody their trip does not exist while it loads.
     *
     * With no backend there is nothing to wait for, so the answer stands
     * immediately and the offline prototype is unchanged. `CampaignDetailPage`
     * makes the same distinction for the same reason.
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
   * Registration has closed.
   *
   * Checked before the sign-in gate rather than after it, which is the whole
   * reason it is a separate branch: sending somebody through an email, a code
   * and a verification only to tell them the trip stopped taking bookings last
   * week is a cruelty the order of two `if`s can avoid.
   *
   * ISO strings on both sides, sliced to the day — the same comparison the
   * campaign page makes, and for the same reason: `Date` comparison would put
   * a deadline of "today" in the past for every clock east of Greenwich.
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
    return (
      <main className="mx-auto max-w-lg px-4 py-20 sm:px-6">
        <Card className="p-8 text-center">
          <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
            <Lock className="size-6" />
          </span>
          <h1 className="display text-2xl text-ink-900">{t('booking.signInFirst')}</h1>
          <p className="mt-2.5 text-base text-ink-500">{t('booking.signInNote')}</p>
          {/*
            One button, because there is one door.

            The second used to say "create account" and led to a registration
            screen that did exactly what signing in does — verifying a code on
            an unknown address creates the account. Two buttons for one
            operation made a first-time pilgrim stop and choose, at the moment
            they had already decided to book.
          */}
          <div className="mt-6">
            <LinkButton
              to={`/signin?next=${encodeURIComponent(`/booking/${campaign.id}`)}`}
              size="lg"
              block
            >
              {t('nav.signIn')}
            </LinkButton>
          </div>
        </Card>
      </main>
    )
  }

  const provider = getProvider(campaign.providerId)
  const { subtotal, fee, total } = priceBreakdown(campaign, travellersCount)

  const validateDetails = () => {
    const next: Record<string, string> = {}
    travellers.forEach((traveller, i) => {
      if (!traveller.name.trim()) next[`t${i}.name`] = t('common.required')
      if (!traveller.civilId.trim()) next[`t${i}.civilId`] = t('common.required')
      if (!traveller.passportNo.trim()) next[`t${i}.passportNo`] = t('common.required')
      if (traveller.nationality !== 'omani' && !traveller.residenceNo?.trim()) {
        next[`t${i}.residenceNo`] = t('common.required')
      }
    })
    if (!contact.name.trim()) next['contact.name'] = t('auth.nameRequired')
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) next['contact.email'] = t('auth.emailInvalid')
    if (contact.phone.replace(/\D/g, '').length < 8) next['contact.phone'] = t('auth.phoneInvalid')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const pay = async () => {
    setProcessing(true)
    try {
      /*
       * With a database, booking is one transaction on the server.
       *
       * `book_campaign` locks the campaign row, re-checks availability after
       * the lock, decrements the seats and inserts the booking and its
       * travellers together. Doing that here in separate statements is the race
       * docs/DATA-MODEL.md has always described: two people read one remaining
       * seat, both decide it is theirs, and the trip is oversold with nothing
       * in the system aware of it.
       *
       * The server's own message is surfaced when it refuses. "Only 2 seat(s)
       * remain on this trip" is actionable; a generic failure is not.
       */
      let created: Booking
      if (isSupabaseConfigured) {
        const result = await createBooking({
          campaignId: campaign.id,
          travellers,
          contactName: contact.name,
          contactPhone: contact.phone,
          contactEmail: contact.email,
        })
        if ('error' in result) {
          setProcessing(false)
          // The server's own wording when it refused on purpose; ours when
          // something broke. See `DELIBERATE_BOOKING_REFUSALS` in the data layer
          // for why the two cannot be told apart by the message alone.
          toast(result.fromServer ? result.error : t('state.errorBody'), 'warning')
          return
        }
        created = { ...result.booking, travellers }
      } else {
        created = await bookingsApi.create({
          user,
          campaign,
          travellersCount,
          travellers,
          contactName: contact.name,
          contactPhone: contact.phone,
          contactEmail: contact.email,
        })
      }
      dispatch({ type: 'addBooking', booking: created })

      /*
       * The booking is the moment NASEK earns the right to these details, so it
       * is also the moment they are kept.
       *
       * Registration asks for an address and nothing else. Everything a person
       * is actually known by arrives here, on the form where it matters — and
       * writing it back means it is asked once rather than at every booking. It
       * runs after the booking is created and its failure is swallowed on
       * purpose: a profile that did not update is a prefill that will be empty
       * next time, not a trip that did not get booked, and there is nothing
       * useful to say to somebody who has just paid.
       */
      void rememberContactDetails(user, contact).then((patch) => {
        if (patch) dispatch({ type: 'updateProfile', patch })
      })
      dispatch({
        type: 'pushNotification',
        notification: {
          id: `n${created.id}`,
          userId: user.id,
          kind: 'booking',
          title: { ar: 'تم تأكيد حجزك', en: 'Your booking is confirmed' },
          body: {
            ar: `أُكد حجزك رقم ${created.reference}. ستتواصل معك الحملة لاستكمال الإجراءات.`,
            en: `Booking ${created.reference} is confirmed. The campaign will contact you to finish the paperwork.`,
          },
          date: created.bookingDate,
          read: false,
          /*
           * The only customer-audience notification NASEK produces, and it says
           * so rather than taking a default.
           *
           * Everything else written anywhere — company approved, campaign
           * approved, new booking received, profile change reviewed — is
           * addressed to a provider owner or to an administrator. Which is how
           * an owner opening the customer site came to find their company's
           * approvals in a pilgrim's dashboard: it was the only inbox there
           * was. This one is genuinely the pilgrim's.
           *
           * Local to the session, as it always has been: dispatched into the
           * store and never written to `notifications`, so it does not survive
           * a reload. That is unchanged here and worth knowing when the
           * Notifications tab looks empty on a second visit.
           */
          audience: 'customer',
        },
      })
      setBooking(created)
      setStep(LAST_STEP + 1)

      /*
       * Re-read the catalogue, so the seats this booking just consumed are gone
       * from every card that shows them.
       *
       * Deliberately after the confirmation is on screen and deliberately not
       * awaited: the booking is already committed, and a slow refresh must not
       * hold up the receipt. Without it the campaign page kept advertising the
       * old count until something else happened to reload the snapshot — which
       * on a nearly full trip is how two people are told the same last seat is
       * still available.
       */
      void reload()
    } catch {
      toast(t('booking.notEnoughSeats', { n: n(campaign.seatsAvailable) }), 'warning')
    } finally {
      setProcessing(false)
    }
  }

  // ------------------------------------------------------------ confirmation
  if (booking) {
    return <Confirmation booking={booking} campaign={campaign} />
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
            {/* ------------------------------ 1. trip, dates and travellers */}
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
                      {provider ? bl(provider.name) : ''} ·{' '}
                      {wilayahName(campaign.wilayahId, lang)}
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

                {/* ------------------------------------------- travellers */}
                <div className="mt-7 border-t border-ivory-300 pt-6">
                  <h3 className="text-lg font-bold text-ink-900">
                    {t('booking.travellersTitle')}
                  </h3>
                  <p className="mt-1 mb-5 text-sm text-ink-500">
                    {t('booking.travellersNote', { n: n(campaign.seatsAvailable) })}
                  </p>
                  <div className="flex items-center justify-center gap-6">
                    <button
                      type="button"
                      onClick={() => setTravellersCount((c) => Math.max(1, c - 1))}
                      disabled={travellersCount <= 1}
                      aria-label={t('common.previous')}
                      className="flex size-12 items-center justify-center rounded-[3px] border border-ivory-300 bg-ivory-50 text-ink-600 transition-colors hover:border-nasek-400 disabled:opacity-40"
                    >
                      <Minus className="size-5" />
                    </button>
                    <span
                      className="nums display w-20 text-center text-7xl text-nasek-900"
                      aria-live="polite"
                    >
                      {n(travellersCount)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setTravellersCount((c) => Math.min(campaign.seatsAvailable, c + 1))
                      }
                      disabled={travellersCount >= campaign.seatsAvailable}
                      aria-label={t('common.next')}
                      className="flex size-12 items-center justify-center rounded-[3px] border border-ivory-300 bg-ivory-50 text-ink-600 transition-colors hover:border-nasek-400 disabled:opacity-40"
                    >
                      <Plus className="size-5" />
                    </button>
                  </div>
                  {travellersCount >= campaign.seatsAvailable && (
                    <p className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-amber-700">
                      <Info className="size-4" />
                      {t('booking.notEnoughSeats', { n: n(campaign.seatsAvailable) })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* --------------------------------------------- 2. details */}
            {step === 2 && (
              <div className="animate-fade">
                <StepTitle>{t('booking.step4')}</StepTitle>

                <div className="space-y-5">
                  {travellers.map((traveller, i) => (
                    <fieldset
                      key={i}
                      className="rounded-[3px] border border-ivory-300 bg-ivory-50/50 p-4"
                    >
                      <legend className="px-2 text-xs font-bold uppercase tracking-wider text-nasek-700">
                        {i === 0 ? t('booking.leadTraveller') : t('booking.travellerN', { n: n(i + 1) })}
                      </legend>

                      <div className="mt-2 grid gap-4 sm:grid-cols-2">
                        <Field
                          label={t('common.name')}
                          required
                          error={errors[`t${i}.name`]}
                          className="sm:col-span-2"
                        >
                          {(p) => (
                            <Input
                              {...p}
                              value={traveller.name}
                              onChange={(e) =>
                                setTravellers((cur) =>
                                  cur.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                                )
                              }
                            />
                          )}
                        </Field>

                        <Field label={t('booking.nationality')}>
                          {(p) => (
                            <Select
                              {...p}
                              value={traveller.nationality}
                              onChange={(e) =>
                                setTravellers((cur) =>
                                  cur.map((x, j) =>
                                    j === i ? { ...x, nationality: e.target.value } : x,
                                  ),
                                )
                              }
                            >
                              <option value="omani">{t('booking.omani')}</option>
                              <option value="resident">{t('booking.nonOmani')}</option>
                            </Select>
                          )}
                        </Field>

                        <Field label={t('booking.gender')}>
                          {() => (
                            <Segmented
                              size="sm"
                              className="w-full"
                              label={t('booking.gender')}
                              value={traveller.gender}
                              onChange={(gender) =>
                                setTravellers((cur) =>
                                  cur.map((x, j) => (j === i ? { ...x, gender } : x)),
                                )
                              }
                              options={[
                                { value: 'male', label: t('booking.male') },
                                { value: 'female', label: t('booking.female') },
                              ]}
                            />
                          )}
                        </Field>

                        <Field label={t('booking.civilId')} required error={errors[`t${i}.civilId`]}>
                          {(p) => (
                            <Input
                              {...p}
                              inputMode="numeric"
                              value={traveller.civilId}
                              onChange={(e) =>
                                setTravellers((cur) =>
                                  cur.map((x, j) =>
                                    j === i ? { ...x, civilId: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                          )}
                        </Field>

                        <Field
                          label={t('booking.passport')}
                          required
                          error={errors[`t${i}.passportNo`]}
                        >
                          {(p) => (
                            <Input
                              {...p}
                              value={traveller.passportNo}
                              onChange={(e) =>
                                setTravellers((cur) =>
                                  cur.map((x, j) =>
                                    j === i ? { ...x, passportNo: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                          )}
                        </Field>

                        {/* Extra documents for non-Omani residents, per the
                            original NASEK registration flow. */}
                        {traveller.nationality !== 'omani' && (
                          <>
                            <Field
                              label={t('booking.residence')}
                              required
                              error={errors[`t${i}.residenceNo`]}
                            >
                              {(p) => (
                                <Input
                                  {...p}
                                  value={traveller.residenceNo ?? ''}
                                  onChange={(e) =>
                                    setTravellers((cur) =>
                                      cur.map((x, j) =>
                                        j === i ? { ...x, residenceNo: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                              )}
                            </Field>
                            <Field label={t('booking.sponsor')}>
                              {(p) => (
                                <Input
                                  {...p}
                                  value={traveller.sponsorName ?? ''}
                                  onChange={(e) =>
                                    setTravellers((cur) =>
                                      cur.map((x, j) =>
                                        j === i ? { ...x, sponsorName: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                              )}
                            </Field>
                            <p className="sm:col-span-2 flex items-start gap-2 rounded-[3px] bg-gold-50 p-3 text-xs leading-relaxed text-gold-800">
                              <Info className="mt-px size-3.5 shrink-0" />
                              {t('booking.docsNote')}
                            </p>
                          </>
                        )}
                      </div>
                    </fieldset>
                  ))}

                  {/* ------------------------------------------ contact */}
                  <fieldset className="rounded-[3px] border border-ivory-300 p-4">
                    <legend className="px-2 text-xs font-bold uppercase tracking-wider text-nasek-700">
                      {t('booking.contactTitle')}
                    </legend>
                    <p className="mt-1 px-2 text-xs text-ink-400">{t('booking.contactNote')}</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <Field
                        label={t('common.name')}
                        required
                        error={errors['contact.name']}
                        className="sm:col-span-2"
                      >
                        {(p) => (
                          <Input
                            {...p}
                            value={contact.name}
                            onChange={(e) => setContact({ ...contact, name: e.target.value })}
                          />
                        )}
                      </Field>
                      <Field label={t('common.phone')} required error={errors['contact.phone']}>
                        {(p) => (
                          <Input
                            {...p}
                            type="tel"
                            dir="ltr"
                            value={contact.phone}
                            onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                          />
                        )}
                      </Field>
                      <Field label={t('common.email')} required error={errors['contact.email']}>
                        {(p) => (
                          <Input
                            {...p}
                            type="email"
                            dir="ltr"
                            value={contact.email}
                            onChange={(e) => setContact({ ...contact, email: e.target.value })}
                          />
                        )}
                      </Field>
                    </div>
                  </fieldset>
                </div>
              </div>
            )}

            {/* ---------------------------------------------- 3. review */}
            {step === 3 && (
              <div className="animate-fade">
                <StepTitle>{t('booking.reviewTitle')}</StepTitle>
                <p className="mb-5 text-sm text-ink-500">{t('booking.reviewNote')}</p>

                <dl className="divide-y divide-ivory-300 rounded-[3px] border border-ivory-300">
                  <ReviewRow label={t('booking.chooseTrip')} value={bl(campaign.title)} />
                  <ReviewRow
                    label={t('common.date')}
                    value={dateRange(campaign.departureDate, campaign.returnDate)}
                  />
                  <ReviewRow
                    label={t('booking.travellersCount')}
                    value={n(travellersCount)}
                  />
                  <ReviewRow label={t('common.name')} value={contact.name} />
                  <ReviewRow label={t('common.phone')} value={contact.phone} />
                  <ReviewRow label={t('common.email')} value={contact.email} />
                </dl>

                <ul className="mt-4 space-y-2">
                  {travellers.map((traveller, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-[3px] border border-ivory-300 bg-ivory-50/60 px-4 py-2.5"
                    >
                      <Users className="size-4 shrink-0 text-nasek-600" />
                      <span className="text-sm font-semibold text-ink-800">
                        {traveller.name || t('booking.travellerN', { n: n(i + 1) })}
                      </span>
                      <span className="nums ms-auto text-xs text-ink-400">
                        {traveller.civilId}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* --------------------------------------------- 4. payment */}
            {step === 4 && (
              <div className="animate-fade">
                <StepTitle>{t('booking.paymentTitle')}</StepTitle>

                <div className="mb-5 flex items-start gap-3 rounded-[3px] border border-gold-200 bg-gold-50 p-4">
                  <Info className="mt-0.5 size-4 shrink-0 text-gold-700" />
                  <p className="text-sm leading-relaxed text-gold-900">
                    {t('booking.paymentNote')}
                  </p>
                </div>

                {/* A visual placeholder only — no card data is collected. */}
                <div className="rounded-[3px] border border-ivory-300 bg-ivory-50/60 p-5 opacity-60">
                  <div className="flex items-center gap-2.5 text-ink-500">
                    <CreditCard className="size-5" />
                    <span className="text-sm font-semibold">•••• •••• •••• ••••</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="h-10 rounded-[3px] border border-ivory-300 bg-ivory-50" />
                    <div className="h-10 rounded-[3px] border border-ivory-300 bg-ivory-50" />
                  </div>
                </div>

                <Button
                  size="md"
                  block
                  className="mt-6"
                  loading={processing}
                  onClick={() => void pay()}
                >
                  {!processing && <ShieldCheck className="size-4" />}
                  {processing ? t('booking.processing') : t('booking.paymentDemo')}
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
                  <Back className="size-4 rtl:-scale-x-100" />
                  {t('common.back')}
                </Button>
                <Button
                  size="md"
                  onClick={() => {
                    if (step === 2 && !validateDetails()) return
                    setStep((s) => s + 1)
                  }}
                >
                  {t('common.continue')}
                  <Next className="size-4 rtl:-scale-x-100" />
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
                {date(campaign.departureDate)} · {t('campaign.duration', { n: n(tripDays(campaign)) })}
              </p>

              <dl className="mt-5 space-y-2.5 border-t border-ivory-300 pt-4 text-sm">
                <SummaryRow label={t('booking.pricePerPerson')} value={money(campaign.price)} />
                <SummaryRow label={t('booking.travellersCount')} value={n(travellersCount)} />
                <SummaryRow label={t('booking.subtotal')} value={money(subtotal)} />
                <SummaryRow label={t('booking.fee')} value={money(fee, { decimals: true })} muted />
              </dl>

              <div className="mt-4 flex items-baseline justify-between border-t border-ivory-300 pt-4">
                <span className="text-sm font-bold text-ink-700">{t('booking.grandTotal')}</span>
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

/**
 * Keep what the booking form collected, so it is asked once and not every time.
 *
 * The decision of *what* may be kept lives in `contactDetailsToKeep`, where it
 * is pure and asserted by `npm run verify:auth`. This is only the I/O around
 * it: write the patch to the profile row where there is one, and hand it back
 * either way so the caller can update the store without re-reading anything.
 */
async function rememberContactDetails(
  user: User,
  contact: { name: string; phone: string; email: string },
): Promise<Partial<User> | null> {
  const patch = contactDetailsToKeep(user, contact)
  if (!patch) return null

  // With no backend there is no row to write to; the store is the profile, and
  // the patch is applied to it by the caller either way.
  if (!isSupabaseConfigured) return patch

  const saved = await saveProfile(patch)
  return saved ? patch : null
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="display mb-5 text-2xl text-ink-900 sm:text-3xl">{children}</h2>
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-end text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={cx(muted ? 'text-ink-400' : 'text-ink-500')}>{label}</dt>
      <dd className={cx('nums font-semibold', muted ? 'text-ink-500' : 'text-ink-800')}>{value}</dd>
    </div>
  )
}

// ------------------------------------------------------------ confirmation

function Confirmation({ booking, campaign }: { booking: Booking; campaign: Campaign }) {
  const { t, bl, money, n, dateRange } = useI18n()
  const { getProvider } = useCatalogue()
  const provider = getProvider(campaign.providerId)

  return (
    <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <div className="text-center animate-rise">
        <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
          <BadgeCheck className="size-8" strokeWidth={1.8} />
        </span>
        <h1 className="display text-4xl text-ink-900 sm:text-5xl">
          {t('booking.confirmTitle')}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-md leading-relaxed text-ink-500">
          {t('booking.confirmBody')}
        </p>
      </div>

      <Card className="mt-9 overflow-hidden">
        <div className="girih-gold border-b border-gold-500/40 bg-nasek-900 px-6 py-5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-gold-300/80">
            {t('booking.reference')}
          </p>
          <p className="nums mt-1.5 text-3xl font-bold tracking-wide text-ivory-50">
            {booking.reference}
          </p>
        </div>

        <dl className="divide-y divide-ivory-300">
          <ReviewRow label={t('booking.chooseTrip')} value={bl(campaign.title)} />
          <ReviewRow label={t('campaign.byProvider')} value={provider ? bl(provider.name) : ''} />
          <ReviewRow
            label={t('common.date')}
            value={dateRange(campaign.departureDate, campaign.returnDate)}
          />
          <ReviewRow label={t('booking.travellersCount')} value={n(booking.travellersCount)} />
          <ReviewRow label={t('common.name')} value={booking.contactName} />
          <ReviewRow
            label={t('booking.grandTotal')}
            value={money(booking.totalPrice, { decimals: true })}
          />
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-ink-500">{t('common.status')}</dt>
            <dd>
              <Badge tone="green">
                <Check className="size-3" strokeWidth={3.5} />
                {t('dash.upcoming')}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
        <LinkButton to="/dashboard?tab=bookings" size="md" block>
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
