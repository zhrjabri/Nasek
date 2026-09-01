import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import type { Campaign } from '@/types'
import { useI18n } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { serviceLabel } from '@/data/services'

import { campaignsApi } from '@/services/api/campaigns'
import { setSaved } from '@/services/data/catalogue'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { CampaignCard } from '@/components/campaign/CampaignCard'
import { tripDays } from '@/lib/trip'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  ProgressBar,
  Rating,
  Skeleton,
  cx,
} from '@/components/ui'

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang, bl, money, n, date, dateRange } = useI18n()
  const { campaigns, getProvider } = useCatalogue()
  const { isSaved, dispatch, toast, hiddenReviewIds, reviews: allReviews } = useStore()

  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined)
  const [similar, setSimilar] = useState<Campaign[]>([])
  const [reported, setReported] = useState(false)

  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight

  useEffect(() => {
    if (!id) return
    let live = true
    setCampaign(undefined)
    void campaignsApi.get(id, campaigns).then((c) => {
      if (!live) return
      setCampaign(c)
      if (c) void campaignsApi.similar(c, campaigns).then((s) => live && setSimilar(s))
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (campaign === undefined) return <DetailSkeleton />

  if (campaign === null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState
          title={t('state.notFoundTitle')}
          body={t('state.notFoundBody')}
          action={<LinkButton to="/campaigns">{t('compare.browse')}</LinkButton>}
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
    (r) => r.campaignId === campaign.id && !hiddenReviewIds.includes(r.id),
  )
  const saved = isSaved(campaign.id)
  const days = tripDays(campaign)
  const booked = campaign.seatsTotal - campaign.seatsAvailable
  const soldOut = campaign.seatsAvailable === 0

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
                label={t('compare.row.haram')}
                value={`${n(campaign.haramDistanceM)} m`}
              />
              <Glance
                icon={<Users className="size-4" />}
                label={t('compare.row.seats')}
                value={soldOut ? t('common.soldOut') : n(campaign.seatsAvailable)}
                tone={soldOut ? 'muted' : campaign.seatsAvailable <= 6 ? 'urgent' : 'normal'}
              />
            </div>
          </Card>

          {/* ------------------------------------------------------- about */}
          <Section title={t('campaign.aboutTrip')}>
            <p className="text-md leading-[1.85] text-ink-600">{bl(campaign.description)}</p>
          </Section>

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
            </ul>
          </Section>

          {/* ----------------------------------------------- accommodation */}
          <Section title={t('campaign.accommodation')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <HotelCard city={t('campaign.makkah')} value={bl(campaign.hotelMakkah)} />
              <HotelCard city={t('campaign.madinah')} value={bl(campaign.hotelMadinah)} />
            </div>
          </Section>

          {/* --------------------------------------------------- occupancy */}
          <Section title={t('compare.row.seats')}>
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
                label={t('compare.row.seats')}
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
                      <span className="text-base font-bold text-ink-900">{review.userName}</span>
                      <Rating value={review.rating} size="sm" />
                    </div>
                    <p className="mt-2.5 text-base leading-relaxed text-ink-600">
                      {bl(review.comment)}
                    </p>
                    <p className="mt-2.5 text-2xs text-ink-400">{date(review.date)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ------------------------------------------------------- terms */}
          <Section title={t('campaign.terms')}>
            <div className="rounded-[3px] border border-ivory-300 bg-ivory-50/60 p-5">
              <p className="text-sm leading-[1.9] text-ink-600">{t('campaign.termsBody')}</p>
            </div>
          </Section>

          {/* ----------------------------------------------------- contact */}
          {provider && (
            <Section title={t('campaign.contact')}>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`tel:${provider.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50 px-4 py-3 text-sm font-semibold text-ink-700 transition-colors hover:border-nasek-300 hover:text-nasek-800"
                >
                  <Phone className="size-4 text-nasek-600" />
                  <span className="nums">{provider.phone}</span>
                </a>
                <a
                  href={`mailto:${provider.email}`}
                  className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50 px-4 py-3 text-sm font-semibold text-ink-700 transition-colors hover:border-nasek-300 hover:text-nasek-800"
                >
                  <Mail className="size-4 text-nasek-600" />
                  {provider.email}
                </a>
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
                {soldOut ? (
                  <Button block size="lg" disabled>
                    {t('common.soldOut')}
                  </Button>
                ) : (
                  <LinkButton to={`/booking/${campaign.id}`} block size="lg">
                    {t('common.bookNow')}
                    <Arrow className="size-4" />
                  </LinkButton>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void setSaved(campaign.id, !isSaved(campaign.id))
                      dispatch({ type: 'toggleSaved', id: campaign.id })
                      toast(saved ? t('campaign.unsavedToast') : t('campaign.savedToast'), saved ? 'info' : 'success')
                    }}
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
            {!soldOut && campaign.seatsAvailable <= 10 && (
              <p className="text-2xs font-semibold text-amber-700">
                {t('common.lastSeats', { n: n(campaign.seatsAvailable) })}
              </p>
            )}
          </div>
          {soldOut ? (
            <Button className="ms-auto" size="lg" disabled>
              {t('common.soldOut')}
            </Button>
          ) : (
            <LinkButton to={`/booking/${campaign.id}`} size="lg" className="ms-auto">
              {t('common.bookNow')}
              <Arrow className="size-4" />
            </LinkButton>
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
