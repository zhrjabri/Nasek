import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Coins,
  Compass,
  Eye,
  HeartHandshake,
  MapPinned,
  MessageCircle,
  Quote,
  Search,
  Sparkles,
  Ticket,
} from 'lucide-react'
import type { Campaign } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { REVIEWS } from '@/data/reviews'
import { campaignsApi } from '@/services/api/campaigns'
import { useCatalogue } from '@/hooks/useCatalogue'
import { CampaignCard, CampaignCardSkeleton } from '@/components/campaign/CampaignCard'
import { SmartSearch } from '@/components/search/SmartSearch'
import { OmanMap } from '@/components/map/OmanMap'
import { LogoMark } from '@/components/brand/Logo'
import { Badge, LinkButton, Ornament, Rating, SectionHeading } from '@/components/ui'

export function HomePage() {
  const { t, lang, isRtl, n, bl } = useI18n()
  const { campaigns, providers, getProvider } = useCatalogue()
  const [featured, setFeatured] = useState<Campaign[] | null>(null)
  const [popular, setPopular] = useState<Campaign[] | null>(null)
  const [mapWilayah, setMapWilayah] = useState<string | null>(null)

  const Arrow = isRtl ? ArrowLeft : ArrowRight

  useEffect(() => {
    let live = true
    void campaignsApi.featured().then((r) => live && setFeatured(r))
    void campaignsApi.popular().then((r) => live && setPopular(r))
    return () => {
      live = false
    }
  }, [])

  const stats = useMemo(
    () => [
      { value: campaigns.length, label: t('hero.statCampaigns') },
      { value: providers.length, label: t('hero.statProviders') },
      { value: new Set(campaigns.map((c) => c.wilayahId)).size, label: t('hero.statWilayat') },
      {
        value: campaigns.reduce((sum, c) => sum + c.reviewCount, 0),
        label: t('hero.statReviews'),
      },
    ],
    [campaigns, providers, t],
  )

  /** The three five-star quotes the home page pulls out, if there are any. */
  const testimonials = REVIEWS.filter((r) => r.rating === 5).slice(0, 3)

  const mapCampaigns = mapWilayah
    ? campaigns.filter((c) => c.wilayahId === mapWilayah)
    : []

  return (
    <main>
      {/* ===================================================== hero ===== */}
      {/*
        A framed title page on parchment rather than a dark gradient banner:
        double gold rule, the mark centred above the title, ornaments instead
        of glow. The composition is symmetrical, which is what reads as
        classical more than any single decorative element.
      */}
      <section className="relative overflow-hidden border-b border-ivory-300">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-ivory-100" />
          <div className="girih absolute inset-0 opacity-[0.05]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(253,251,246,0.95),transparent)]" />
        </div>

        <div className="mx-auto max-w-7xl px-4 pt-10 pb-12 sm:px-6 sm:pt-14 lg:px-8">
          <div className="framed mx-auto max-w-4xl bg-ivory-50/70 px-6 py-12 text-center sm:px-12 sm:py-16">
            <p className="eyebrow">{t('hero.eyebrow')}</p>

            <LogoMark className="mx-auto mt-7 h-24 w-auto sm:h-32" tone="green" />

            <Ornament className="mt-7" />

            <h1 className="display mt-6 text-[30px] leading-[1.15] text-nasek-900 sm:text-[46px]">
              {t('hero.title')}
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-500 sm:text-[16.5px]">
              {t('hero.subtitle')}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <LinkButton to="/smart-match" size="lg">
                <Compass className="size-4" />
                {t('hero.ctaPrimary')}
              </LinkButton>
              <LinkButton to="/campaigns" variant="outline" size="lg">
                {t('hero.ctaSecondary')}
                <Arrow className="size-4" />
              </LinkButton>
            </div>
          </div>

          {/* the search box sits directly under the title block */}
          <div className="relative z-10 mx-auto mt-8 max-w-4xl">
            <SmartSearch />
          </div>

          {/* stats, ruled into four columns like a printed table */}
          <ul className="mx-auto mt-10 grid max-w-3xl grid-cols-2 divide-x divide-ivory-300 rtl:divide-x-reverse sm:grid-cols-4">
            {stats.map((stat) => (
              <li key={stat.label} className="px-3 py-2 text-center">
                <p className="nums display text-[30px] text-nasek-700">{n(stat.value)}</p>
                <p className="mt-1 text-[11.5px] font-medium tracking-wide text-ink-500">
                  {stat.label}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================================================= how it works == */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading
          align="center"
          eyebrow={t('common.appName')}
          title={t('how.title')}
          subtitle={t('how.subtitle')}
        />
        <ol className="stagger mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              { icon: Search, title: 'how.s1.title', body: 'how.s1.body' },
              { icon: Eye, title: 'how.s2.title', body: 'how.s2.body' },
              { icon: Check, title: 'how.s3.title', body: 'how.s3.body' },
              { icon: Ticket, title: 'how.s4.title', body: 'how.s4.body' },
            ] as { icon: typeof Search; title: MessageKey; body: MessageKey }[]
          ).map((step, i) => (
            <li
              key={step.title}
              className="surface relative flex flex-col items-center gap-3 px-5 pb-6 pt-8 text-center transition-colors hover:border-gold-300"
            >
              {/* the step number sits in a rotated square, plate-style */}
              <span className="absolute -top-3.5 start-1/2 flex size-7 -translate-x-1/2 rotate-45 items-center justify-center border border-gold-400 bg-ivory-50 rtl:translate-x-1/2">
                <span className="nums -rotate-45 text-[11px] font-bold text-gold-700">
                  {i + 1}
                </span>
              </span>
              <span className="flex size-11 items-center justify-center border border-nasek-200 bg-nasek-50 text-nasek-700">
                <step.icon className="size-5" strokeWidth={1.7} />
              </span>
              <h3 className="display text-[19px] text-nasek-900">{t(step.title)}</h3>
              <p className="text-[13.5px] leading-relaxed text-ink-500">{t(step.body)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* =================================================== featured ==== */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={t('common.demoData')}
          title={t('home.featured')}
          subtitle={t('home.featuredSub')}
          action={
            <LinkButton to="/campaigns" variant="secondary" size="sm">
              {t('common.viewAll')}
              <Arrow className="size-4" />
            </LinkButton>
          }
        />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured
            ? featured.slice(0, 3).map((c) => <CampaignCard key={c.id} campaign={c} />)
            : [0, 1, 2].map((i) => <CampaignCardSkeleton key={i} />)}
        </div>
      </section>

      {/* ======================================================= why ===== */}
      <section className="border-y border-ivory-300 bg-ivory-200/50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading title={t('why.title')} subtitle={t('why.subtitle')} />
          <ul className="stagger mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                { icon: MapPinned, n: 1 },
                { icon: Coins, n: 2 },
                { icon: Ticket, n: 3 },
                { icon: Quote, n: 4 },
                { icon: Compass, n: 5 },
                { icon: MessageCircle, n: 6 },
              ] as const
            ).map((item) => (
              <li key={item.n} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center border border-gold-300 bg-ivory-50 text-nasek-700">
                  <item.icon className="size-[18px]" strokeWidth={1.7} />
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-ink-900">
                    {t(`why.${item.n}.title` as MessageKey)}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
                    {t(`why.${item.n}.body` as MessageKey)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ==================================================== popular ==== */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading title={t('home.popular')} subtitle={t('home.popularSub')} />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {popular
            ? popular.map((c) => <CampaignCard key={c.id} campaign={c} compact />)
            : [0, 1, 2, 3].map((i) => <CampaignCardSkeleton key={i} />)}
        </div>
      </section>

      {/* ======================================================== map ==== */}
      <section className="border-y border-ivory-300 bg-ivory-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading title={t('home.mapTitle')} subtitle={t('home.mapSub')} />
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <OmanMap
              campaigns={campaigns}
              selectedId={mapWilayah}
              onSelect={setMapWilayah}
              className="rounded-[3px] border border-ivory-300 bg-ivory-50/50 p-4"
            />

            <div>
              {mapWilayah ? (
                <>
                  <h3 className="text-lg font-bold text-ink-900">
                    {t('map.campaignsIn', {
                      name: WILAYAT.find((w) => w.id === mapWilayah)?.name[lang] ?? '',
                    })}
                  </h3>
                  <p className="mt-1 text-sm text-ink-400">
                    {mapCampaigns.length === 1
                      ? t('map.countOne')
                      : t('map.count', { n: mapCampaigns.length })}
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {mapCampaigns.slice(0, 5).map((c) => {
                      const provider = getProvider(c.providerId)
                      return (
                        <li key={c.id}>
                          <Link
                            to={`/campaigns/${c.id}`}
                            className="flex items-center gap-3 rounded-[3px] border border-ivory-300 bg-ivory-50 p-3 transition-all hover:-translate-y-px hover:border-nasek-200 hover:shadow-soft"
                          >
                            <span
                              className="flex size-10 shrink-0 items-center justify-center rounded-[3px] text-sm font-bold text-white"
                              style={{ background: provider?.brandColor }}
                              aria-hidden
                            >
                              {provider?.initials}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-bold text-ink-900">
                                {bl(c.title)}
                              </span>
                              <span className="flex items-center gap-2 text-[11px] text-ink-400">
                                <Rating value={c.rating} size="sm" />
                              </span>
                            </span>
                            <Badge tone={c.type === 'hajj' ? 'gold' : 'green'}>
                              {t(c.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
                            </Badge>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                  {mapCampaigns.length === 0 && (
                    <p className="rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50 p-5 text-sm text-ink-500">
                      {t('map.noneHint')}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col justify-center rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50/60 p-8 text-center">
                  <MapPinned className="mx-auto size-8 text-nasek-300" />
                  <p className="mt-3 text-sm font-semibold text-ink-700">{t('map.selectHint')}</p>
                  <p className="mt-1.5 text-[13px] text-ink-400">{t('map.subtitle')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================== reviews ==== */}
      {/* Dropped entirely rather than left as a heading over an empty grid. */}
      {testimonials.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading title={t('home.reviewsTitle')} subtitle={t('home.reviewsSub')} />
          <ul className="stagger mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((review) => (
              <li key={review.id} className="framed flex flex-col gap-4 p-7">
                <Quote className="size-6 text-gold-400 rtl:-scale-x-100" />
                <p className="flex-1 text-[14.5px] leading-relaxed text-ink-700">
                  {bl(review.comment)}
                </p>
                <div className="flex items-center justify-between border-t border-ivory-300 pt-4">
                  <span className="text-[13px] font-bold text-ink-800">{review.userName}</span>
                  <Rating value={review.rating} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* =================================================== provider ==== */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="framed-dark girih-gold relative overflow-hidden bg-nasek-900 p-8 sm:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_100%_0%,rgba(201,169,97,0.12),transparent)]" />
          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <Badge tone="gold" className="mb-4">
                {t('nav.forProviders')}
              </Badge>
              <h2 className="display text-[28px] text-ivory-50 sm:text-[34px]">
                {t('home.providerCta.title')}
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ivory-200/70">
                {t('home.providerCta.body')}
              </p>
              <ul className="mt-6 space-y-2.5">
                {(['home.providerCta.point1', 'home.providerCta.point2', 'home.providerCta.point3'] as MessageKey[]).map(
                  (key) => (
                    <li key={key} className="flex items-center gap-2.5 text-[14px] text-ivory-200/80">
                      <BadgeCheck className="size-4 shrink-0 text-gold-400" />
                      {t(key)}
                    </li>
                  ),
                )}
              </ul>
              <LinkButton to="/signup/provider" variant="gold" size="lg" className="mt-7">
                {t('home.providerCta.button')}
                <Arrow className="size-4" />
              </LinkButton>
            </div>

            {/* a glimpse of the owner dashboard, as a static preview */}
            <div className="border border-gold-400/25 bg-nasek-950/30 p-5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-gold-300/80">
                {t('prov.overview')}
              </p>
              <div className="mt-4 grid grid-cols-2 divide-x divide-y divide-gold-400/15 rtl:divide-x-reverse">
                {[
                  { label: t('prov.kpiBookings'), value: '184' },
                  { label: t('prov.kpiActive'), value: '4' },
                  { label: t('prov.kpiSeats'), value: '63' },
                  { label: t('prov.kpiRating'), value: '4.8' },
                ].map((kpi) => (
                  <div key={kpi.label} className="p-3.5">
                    <p className="nums text-[24px] font-bold leading-none text-ivory-50">
                      {kpi.value}
                    </p>
                    <p className="mt-1.5 text-[11px] text-ivory-200/50">{kpi.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-end gap-1.5 border-t border-gold-400/20 pt-4" aria-hidden>
                {[38, 52, 44, 67, 58, 74, 62, 88].map((h, i) => (
                  <div key={i} className="flex-1 bg-gold-400/45" style={{ height: `${h * 0.6}px` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================== giving ==== */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="framed flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:p-10">
          <span className="flex size-14 shrink-0 items-center justify-center border border-gold-300 bg-gold-50 text-gold-700">
            <HeartHandshake className="size-7" strokeWidth={1.6} />
          </span>
          <div className="flex-1">
            <h2 className="display text-2xl text-ink-900">{t('giving.title')}</h2>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">
              {t('giving.subtitle')}
            </p>
          </div>
          <LinkButton to="/giving" variant="secondary" size="lg" className="shrink-0">
            {t('common.view')}
            <Arrow className="size-4" />
          </LinkButton>
        </div>
      </section>

      {/* ================================================== final CTA ==== */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center sm:px-6">
        <Ornament className="mb-8" />
        <h2 className="display text-[30px] text-nasek-900 sm:text-[38px]">
          {t('home.finalCta.title')}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-500">{t('home.finalCta.body')}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton to="/smart-match" size="lg">
            <Sparkles className="size-4" />
            {t('smart.start')}
          </LinkButton>
          <LinkButton to="/campaigns" variant="secondary" size="lg">
            {t('hero.ctaSecondary')}
          </LinkButton>
        </div>
      </section>
    </main>
  )
}
