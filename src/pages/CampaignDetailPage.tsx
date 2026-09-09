import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BedDouble,
  Bookmark,
  BookmarkCheck,
  Bus,
  CalendarDays,
  ChevronRight,
  Clock,
  Flag,
  Info,
  Mail,
  MapPin,
  Phone,
  Plane,
  Users,
  X,
} from 'lucide-react'
import type { Campaign } from '@/types'
import { useI18n } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { serviceLabel } from '@/data/services'
import { campaignImageUrl } from '@/services/storage/campaignImages'
import { isSupabaseConfigured } from '@/services/supabase/client'

import { campaignsApi } from '@/services/api/campaigns'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useToggleSaved } from '@/hooks/useToggleSaved'
import { CampaignCard } from '@/components/campaign/CampaignCard'
import { tripDays } from '@/lib/trip'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  RuleLink,
  ProgressBar,
  Rating,
  Skeleton,
  cx,
} from '@/components/ui'

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang, bl, money, n, date, dateRange } = useI18n()
  const { campaigns, getProvider } = useCatalogue()
  const { isSaved, hiddenReviewIds, reviews: allReviews, remoteReady } = useStore()
  const toggleSave = useToggleSaved()

  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined)
  const [similar, setSimilar] = useState<Campaign[]>([])
  const [reported, setReported] = useState(false)

  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight

  /**
   * The id this page is currently about, so a re-read does not reset the page.
   *
   * The lookup below re-runs when the catalogue changes as well as when the
   * address does, and only the second of those should send the screen back to
   * its skeleton. Without the distinction, a snapshot landing while somebody
   * was reading would blank the trip under them for a third of a second.
   */
  const shownId = useRef<string | undefined>(undefined)

  /*
   * Read the trip out of the catalogue — again, when the catalogue arrives.
   *
   * This ran once, keyed on `id` alone, with the `exhaustive-deps` warning
   * switched off. On a cold load that is fatal rather than untidy: `campaigns`
   * is empty until `useRemoteData` has fetched the snapshot, and this page
   * mounts alongside it — a child's effects run before its parent's — so the
   * lookup was made against an empty catalogue, the closure kept that empty
   * array however long the request took, and the page settled on
   *
   *     الصفحة غير موجودة  /  We can't find that page
   *
   * for a trip that exists and is live. Every refresh of a trip page, and every
   * link anyone shared, landed there; navigating in from the listing worked,
   * because by then the snapshot had arrived, which is why it survived review.
   *
   * `campaigns` in the dependency array is the whole fix, and it is exactly
   * what the disabled rule was asking for.
   */
  useEffect(() => {
    if (!id) return

    // A different trip is a different page and starts at the skeleton. The same
    // trip re-read against a fuller catalogue keeps what is on screen.
    if (shownId.current !== id) {
      shownId.current = id
      setCampaign(undefined)
      setSimilar([])
    }

    let live = true
    void campaignsApi.get(id, campaigns).then((c) => {
      if (!live) return
      /*
       * "Not in the catalogue" and "the catalogue is not here yet" are not the
       * same answer, and only one of them is worth telling somebody.
       *
       * Where there is a database, the catalogue has not arrived until
       * `remoteReady`; concluding from it before then is how this page told
       * people a live trip did not exist. With no backend configured there is
       * nothing to wait for and the local catalogue is the whole truth, so the
       * answer stands immediately — the offline prototype is unchanged.
       */
      if (!c && isSupabaseConfigured && !remoteReady) return
      setCampaign(c)
      if (c) void campaignsApi.similar(c, campaigns).then((s) => live && setSimilar(s))
    })
    return () => {
      live = false
    }
  }, [id, campaigns, remoteReady])

  if (campaign === undefined) return <DetailSkeleton />

  if (campaign === null) {
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

  const provider = getProvider(campaign.providerId)
  // A review the admin has taken down must disappear from the trip it was
  // written about, not only from the moderation screen.
  /*
   * Reviews of this trip.
   *
   * `reviews_read` already withholds hidden ones from everybody but their
   * author and an administrator, so the local filter below only still matters
   * with no backend configured — where the moderation flag lives in this
   * browser and nothing else would apply it.
   */
  const reviews = allReviews.filter(
    // `r.hidden` is the row's own column and covers the two callers the policy
    // deliberately still sends a hidden review to — its author, and an
    // administrator — neither of whom should meet it on the public trip page.
    (r) => r.campaignId === campaign.id && !r.hidden && !hiddenReviewIds.includes(r.id),
  )
  const saved = isSaved(campaign.id)
  const days = tripDays(campaign)
  const booked = campaign.seatsTotal - campaign.seatsAvailable
  const soldOut = campaign.seatsAvailable === 0
  /*
   * Registration closes before the trip departs, where the owner set a date.
   *
   * Compared as ISO strings against today's date rather than as `Date` objects,
   * which is not laziness: `new Date('2027-03-01') < new Date()` compares a
   * midnight-UTC instant against the local clock, so a deadline of "today" reads
   * as passed for anyone east of Greenwich — which is everyone in Oman. Both
   * sides sliced to `YYYY-MM-DD` compare the calendar days people mean.
   *
   * Closed registration and a sold-out trip are separate reasons that produce
   * the same outcome, and both have to be checked wherever booking is offered.
   */
  const closed =
    !!campaign.registrationDeadline &&
    campaign.registrationDeadline < new Date().toISOString().slice(0, 10)
  const bookable = !soldOut && !closed

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-6">
      {/* --------------------------------------------------- breadcrumb */}
      <nav aria-label="breadcrumb" className="mb-5 flex items-center gap-1.5 text-sm text-ink-400">
        <Link to="/" className="hover:text-ink-700">
          {t('nav.home')}
        </Link>
        <ChevronRight className="size-3.5 rtl:-scale-x-100" />
        <Link to="/campaigns" className="hover:text-ink-700">
          {t('nav.campaigns')}
        </Link>
        <ChevronRight className="size-3.5 rtl:-scale-x-100" />
        <span className="truncate font-medium text-ink-600">{bl(campaign.title)}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* =========================================================== main */}
        <div className="min-w-0">
          {/* --------------------------------------------------- hero card */}
          <Card className="girih overflow-hidden">
            <div className="border-b border-ivory-300 bg-ivory-50/60 p-6 backdrop-blur-sm sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={campaign.type === 'hajj' ? 'gold' : 'green'}>
                  {t(campaign.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
                </Badge>
                {provider?.verification === 'verified' && (
                  <Badge tone="green">
                    <BadgeCheck className="size-3.5" />
                    {t('common.verified')}
                  </Badge>
                )}
                {provider?.verification === 'pending' && (
                  <Badge tone="amber">{t('common.pendingVerification')}</Badge>
                )}
                <Badge tone="neutral">{t('common.demoData')}</Badge>
              </div>

              <h1 className="display mt-4 text-4xl text-ink-900 sm:text-5xl">
                {bl(campaign.title)}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Rating value={campaign.rating} count={campaign.reviewCount} />
                <span className="flex items-center gap-1.5 text-sm text-ink-500">
                  <MapPin className="size-4 text-nasek-600/70" />
                  {wilayahName(campaign.wilayahId, lang)}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-ink-500">
                  {campaign.travelMethod === 'air' ? (
                    <Plane className="size-4 text-nasek-600/70" />
                  ) : (
                    <Bus className="size-4 text-nasek-600/70" />
                  )}
                  {t(campaign.travelMethod === 'air' ? 'common.air' : 'common.land')}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-ink-500">
                  <Clock className="size-4 text-nasek-600/70" />
                  {t('campaign.duration', { n: n(days) })}
                </span>
              </div>
            </div>

            {/* provider strip */}
            {provider && (
              <div className="flex items-center gap-3.5 border-b border-ivory-300 bg-ivory-50/70 p-5">
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-[3px] text-xl font-bold text-white shadow-soft"
                  style={{ background: provider.brandColor }}
                  aria-hidden
                >
                  {provider.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                    {t('campaign.byProvider')}
                  </p>
                  <p className="truncate text-md font-bold text-ink-900">{bl(provider.name)}</p>
                  <p className="truncate text-xs text-ink-500">
                    {bl(provider.tagline)} · {t('common.experience', { n: n(provider.experienceYears) })}
                  </p>
                </div>
                <Rating value={provider.rating} count={provider.reviewCount} size="sm" />
              </div>
            )}

            {/* trip at a glance */}
            <div className="grid grid-cols-2 divide-x divide-ivory-300 rtl:divide-x-reverse sm:grid-cols-4">
              <Glance
                icon={<CalendarDays className="size-4" />}
                label={t('common.departure')}
                value={date(campaign.departureDate)}
              />
              <Glance
                icon={<CalendarDays className="size-4" />}
                label={t('common.return')}
                value={date(campaign.returnDate)}
              />
              <Glance
                icon={<BedDouble className="size-4" />}
                label={t('campaign.haramLabel')}
                value={`${n(campaign.haramDistanceM)} m`}
              />
              <Glance
                icon={<Users className="size-4" />}
                label={t('campaign.seatsLabel')}
                value={soldOut ? t('common.soldOut') : n(campaign.seatsAvailable)}
                tone={soldOut ? 'muted' : campaign.seatsAvailable <= 6 ? 'urgent' : 'normal'}
              />
            </div>
          </Card>

          {/* ------------------------------------------------------- about */}
          <Section title={t('campaign.aboutTrip')}>
            <p className="text-md leading-[1.85] text-ink-600">{bl(campaign.description)}</p>
          </Section>

          {/* ------------------------------------------------ photographs */}
          {/*
            Shown only when there are some, rather than reserving a gallery
            that is empty on most listings. Campaigns predate this field and
            plenty will never have one; a heading over nothing reads as a
            broken page rather than as an owner who did not upload photos.
          */}
          {campaign.images.length > 0 && (
            <Section title={t('campaign.gallery')}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {campaign.images.map((path) => (
                  <li key={path}>
                    <img
                      src={campaignImageUrl(path)}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-[3px] border border-ivory-300 object-cover"
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* ---------------------------------------------------- services */}
          <Section title={t('campaign.includes')}>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {campaign.services.map((s) => (
                <li
                  key={s}
                  className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50/60 px-3.5 py-2.5"
                >
                  <BadgeCheck className="size-4 shrink-0 text-nasek-600" />
                  <span className="text-sm font-medium text-ink-700">
                    {serviceLabel(s, lang)}
                  </span>
                </li>
              ))}
              {/*
                And whatever the six did not cover, in the owner's own words.

                Rendered in the same list rather than a section of its own: a
                pilgrim reading "what is included" does not care which of these
                NASEK can filter on. The six are a closed set because the
                Campaigns facets and Smart Match match on them; these are the
                rest of the offer, typed by the person running the trip.
              */}
              {campaign.includedServices.map((text, i) => (
                <li
                  key={`extra-${i}`}
                  className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50/60 px-3.5 py-2.5"
                >
                  <BadgeCheck className="size-4 shrink-0 text-nasek-600" />
                  <span className="text-sm font-medium text-ink-700">{text}</span>
                </li>
              ))}
            </ul>

            {/*
              What the price does not cover, immediately under what it does.

              Together rather than in separate sections, because they are one
              question — "what am I paying for" — and a pilgrim who reads the
              included list and stops has read half an answer. Only what the
              owner ticked appears: a service in neither list is simply not
              mentioned, which is honest, and listing every unticked service as
              excluded would publish a wall of things nobody claimed.
            */}
            {campaign.excludedServices.length > 0 && (
              <>
                <h3 className="mt-6 mb-2.5 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
                  {t('campaign.excluded')}
                </h3>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {campaign.excludedServices.map((s) => (
                    <li
                      key={s}
                      className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50/40 px-3.5 py-2.5"
                    >
                      <X className="size-4 shrink-0 text-ink-400" />
                      <span className="text-sm font-medium text-ink-500">
                        {serviceLabel(s, lang)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          {/* ----------------------------------------------- accommodation */}
          <Section title={t('campaign.accommodation')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <HotelCard city={t('campaign.makkah')} value={bl(campaign.hotelMakkah)} />
              <HotelCard city={t('campaign.madinah')} value={bl(campaign.hotelMadinah)} />
            </div>
          </Section>

          {/* --------------------------------------------------- occupancy */}
          <Section title={t('campaign.seatsLabel')}>
            <div className="rounded-[3px] border border-ivory-300 bg-ivory-50/60 p-5">
              <div className="flex items-baseline justify-between">
                <p className="nums text-md font-bold text-ink-800">
                  {t('campaign.seatsBar', { booked: n(booked), total: n(campaign.seatsTotal) })}
                </p>
                <p
                  className={cx(
                    'nums text-sm font-semibold',
                    campaign.seatsAvailable <= 6 ? 'text-amber-700' : 'text-nasek-700',
                  )}
                >
                  {soldOut ? t('common.soldOut') : t('common.seatsLeft', { n: n(campaign.seatsAvailable) })}
                </p>
              </div>
              <ProgressBar
                className="mt-3"
                value={booked}
                max={campaign.seatsTotal}
                tone={campaign.seatsAvailable <= 6 ? 'amber' : 'green'}
                label={t('campaign.seatsLabel')}
              />
            </div>
          </Section>

          {/* ----------------------------------------------------- reviews */}
          <Section title={t('campaign.reviewsTitle')}>
            {reviews.length === 0 ? (
              <p className="rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50 p-6 text-center text-sm text-ink-400">
                {t('campaign.noReviews')}
              </p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((review) => (
                  <li key={review.id} className="rounded-[3px] border border-ivory-300 bg-ivory-50 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-base font-bold text-ink-900">
                        {review.userName || t('review.anonymous')}
                      </span>
                      <Rating value={review.rating} size="sm" />
                    </div>
                    <p className="mt-2.5 text-base leading-relaxed text-ink-600">
                      {bl(review.comment)}
                    </p>
                    <p className="mt-2.5 text-2xs text-ink-400">{date(review.date)}</p>

                    {/* The campaign's answer, where it gave one. This is the
                        half of the reply feature that was missing entirely:
                        owners could type a reply and no traveller ever saw it,
                        because it lived in component state on the owner's own
                        dashboard. */}
                    {bl(review.reply) && (
                      <div className="mt-3 rounded-[3px] border-s-2 border-nasek-600 bg-white/70 px-4 py-3">
                        <p className="text-2xs font-bold uppercase tracking-wider text-nasek-700">
                          {t('review.replyTitle')}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-ink-700">
                          {bl(review.reply)}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ------------------------------------------------------- terms */}
          {/*
            The owner's own terms where they wrote some, NASEK's standing text
            where they did not.

            Not a fallback out of laziness: a campaign page with no terms at all
            is worse for the pilgrim than the platform's general wording, and
            listings that predate this field have nothing of their own to show.
            An owner who writes terms replaces the generic paragraph entirely,
            which is the incentive that matters.
          */}
          <Section title={t('campaign.terms')}>
            <div className="rounded-[3px] border border-ivory-300 bg-ivory-50/60 p-5">
              <p className="whitespace-pre-line text-sm leading-[1.9] text-ink-600">
                {bl(campaign.terms) || t('campaign.termsBody')}
              </p>
            </div>
          </Section>

          {/* ----------------------------------------------------- contact */}
          {/*
            The campaign's own contact where it has one, the company's
            otherwise. An owner running several trips out of different offices
            has a real reason to route a specific campaign elsewhere, and a
            pilgrim ringing about a trip should reach whoever runs that trip.
          */}
          {(campaign.contactPersons.length || campaign.contactPhone || campaign.contactEmail || provider) && (
            <Section title={t('campaign.contact')}>
              {/*
                Everyone the owner listed, each with their own number.

                A trip routinely has more than one person on it — the organiser
                and the group leader, or one number for Muscat and another for
                Salalah — and this used to have room for exactly one. Campaigns
                written before the change carry their single contact in
                `contactName`/`contactPhone`, and `toCampaign` promotes it into
                this list, so nothing older loses its contact.
              */}
              {campaign.contactPersons.length > 0 && (
                <ul className="mb-3 space-y-2.5">
                  {campaign.contactPersons.map((person, i) => (
                    <li key={`${person.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-semibold text-ink-700">{person.name}</span>
                      {person.phone && (
                        <a
                          href={`tel:${person.phone.replace(/\s/g, '')}`}
                          className="flex items-center gap-2 text-sm font-medium text-nasek-700 hover:underline"
                        >
                          <Phone className="size-3.5" />
                          <span className="nums" dir="ltr">{person.phone}</span>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {campaign.contactPersons.length === 0 && campaign.contactName && (
                <p className="mb-2.5 text-sm font-semibold text-ink-700">
                  {campaign.contactName}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {campaign.contactPersons.length === 0 && (campaign.contactPhone || provider?.phone) && (
                  <a
                    href={`tel:${(campaign.contactPhone || provider?.phone || '').replace(/\s/g, '')}`}
                    className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50 px-4 py-3 text-sm font-semibold text-ink-700 transition-colors hover:border-nasek-300 hover:text-nasek-800"
                  >
                    <Phone className="size-4 text-nasek-600" />
                    <span className="nums">{campaign.contactPhone || provider?.phone}</span>
                  </a>
                )}
                {(campaign.contactEmail || provider?.email) && (
                  <a
                    href={`mailto:${campaign.contactEmail || provider?.email}`}
                    className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50 px-4 py-3 text-sm font-semibold text-ink-700 transition-colors hover:border-nasek-300 hover:text-nasek-800"
                  >
                    <Mail className="size-4 text-nasek-600" />
                    {campaign.contactEmail || provider?.email}
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* -------------------------------------------------------- report */}
          <div className="mt-8">
            {reported ? (
              <p className="flex items-center gap-2 rounded-[3px] border border-nasek-200 bg-nasek-50 px-4 py-3 text-sm font-medium text-nasek-800">
                <BadgeCheck className="size-4" />
                {t('campaign.reported')}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setReported(true)}
                className="inline-flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-sm font-medium text-ink-400 transition-colors hover:bg-ivory-200 hover:text-red-700"
              >
                <Flag className="size-3.5" />
                {t('campaign.report')}
              </button>
            )}
          </div>
        </div>

        {/* ======================================================== aside */}
        <aside>
          <div className="lg:sticky lg:top-24">
            <Card className="overflow-hidden">
              <div className="border-b border-ivory-300 p-5">
                <div className="flex items-baseline gap-2">
                  <span className="nums display text-5xl text-nasek-900">
                    {money(campaign.price)}
                  </span>
                  <span className="text-sm text-ink-400">{t('common.perPerson')}</span>
                </div>
                <p className="mt-1.5 text-sm text-ink-500">
                  {dateRange(campaign.departureDate, campaign.returnDate)} ·{' '}
                  {t('campaign.duration', { n: n(days) })}
                </p>
              </div>

              <div className="space-y-2.5 p-5">
                {bookable ? (
                  <LinkButton to={`/booking/${campaign.id}`} block size="md">
                    {t('common.bookNow')}
                    <Arrow className="size-4" />
                  </LinkButton>
                ) : (
                  <Button block size="md" disabled>
                    {soldOut ? t('common.soldOut') : t('campaign.deadlinePassed')}
                  </Button>
                )}

                {/* The deadline is worth stating while it is still in the
                    future — it is a date somebody has to plan around — and not
                    only once it has passed and the button has gone. */}
                {campaign.registrationDeadline && !closed && (
                  <p className="text-center text-2xs text-ink-500">
                    {t('campaign.deadline')} · {date(campaign.registrationDeadline)}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    variant="secondary"
                    onClick={() => toggleSave(campaign.id)}
                    aria-pressed={saved}
                  >
                    {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                    {saved ? t('common.saved') : t('common.save')}
                  </Button>
                </div>

                <div className="flex items-start gap-2 rounded-[3px] bg-gold-50 p-3">
                  <Info className="mt-px size-3.5 shrink-0 text-gold-700" />
                  <p className="text-2xs leading-relaxed text-gold-800">
                    {t('booking.paymentNote')}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </aside>
      </div>

      {/* --------------------------------------------- phone action bar */}
      {/* On a phone the price and the book button sit below every tab, review
          and map on the page — a long scroll away from the moment someone
          decides. This keeps both within thumb reach. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ivory-300 bg-ivory-100/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <div className="min-w-0">
            <p className="flex items-baseline gap-1.5">
              <span className="nums text-xl font-bold text-nasek-900">
                {money(campaign.price)}
              </span>
              <span className="text-xs text-ink-400">{t('common.perPerson')}</span>
            </p>
            {bookable && campaign.seatsAvailable <= 10 && (
              <p className="text-2xs font-semibold text-amber-700">
                {t('common.lastSeats', { n: n(campaign.seatsAvailable) })}
              </p>
            )}
          </div>
          {bookable ? (
            <LinkButton to={`/booking/${campaign.id}`} size="md" className="ms-auto">
              {t('common.bookNow')}
              <Arrow className="size-4" />
            </LinkButton>
          ) : (
            <Button className="ms-auto" size="md" disabled>
              {soldOut ? t('common.soldOut') : t('campaign.deadlinePassed')}
            </Button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------- similar */}
      {similar.length > 0 && (
        <section className="mt-16">
          <h2 className="display text-2xl text-ink-900">{t('campaign.similar')}</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((c) => (
              <CampaignCard key={c.id} campaign={c} compact />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

// ------------------------------------------------------------------ pieces

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3.5 text-sm font-bold uppercase tracking-[0.14em] text-ink-400">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Glance({
  icon,
  label,
  value,
  tone = 'normal',
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: 'normal' | 'urgent' | 'muted'
}) {
  return (
    <div className="p-4">
      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
        <span className="text-nasek-600/60">{icon}</span>
        {label}
      </p>
      <p
        className={cx(
          'mt-1.5 text-base font-bold',
          tone === 'urgent' ? 'text-amber-700' : tone === 'muted' ? 'text-ink-400' : 'text-ink-900',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function HotelCard({ city, value }: { city: string; value: string }) {
  return (
    <div className="rounded-[3px] border border-ivory-300 bg-ivory-50 p-4">
      <p className="text-2xs font-bold uppercase tracking-wider text-gold-600">{city}</p>
      <p className="mt-1.5 text-base font-semibold text-ink-800">{value}</p>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-64" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Skeleton className="h-52 w-full rounded-[3px]" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-32 w-full rounded-[3px]" />
        </div>
        <Skeleton className="h-72 w-full rounded-[3px]" />
      </div>
    </main>
  )
}
