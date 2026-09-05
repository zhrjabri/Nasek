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
  Quote,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
} from 'lucide-react'
import type { Campaign } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { WILAYAT } from '@/data/geo'

import { campaignsApi } from '@/services/api/campaigns'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useStore } from '@/store/AppStore'
import { CampaignCard, CampaignCardSkeleton } from '@/components/campaign/CampaignCard'
import { SmartSearch } from '@/components/search/SmartSearch'
import { OmanMap } from '@/components/map/OmanMap'
import { Badge, LinkButton, Ornament, Rating, SectionHeading } from '@/components/ui'

import heroWide from '@/assets/hero/kaaba-wide.jpg'
import heroWideWebp from '@/assets/hero/kaaba-wide.webp'
import heroWideAvif from '@/assets/hero/kaaba-wide.avif'
import heroWideSm from '@/assets/hero/kaaba-wide-sm.jpg'
import heroWideSmWebp from '@/assets/hero/kaaba-wide-sm.webp'
import heroWideSmAvif from '@/assets/hero/kaaba-wide-sm.avif'
import heroTall from '@/assets/hero/kaaba-tall.jpg'
import heroTallWebp from '@/assets/hero/kaaba-tall.webp'
import heroTallAvif from '@/assets/hero/kaaba-tall.avif'

/**
 * A 32×21 blur of the hero photograph, inlined as a data URI.
 *
 * Roughly 1.5 KB, which buys the hero its ground from the first frame instead
 * of a white flash under white type. Recut whenever the photograph changes —
 * a blur of the wrong picture is worse than none, because it resolves into
 * something else.
 */
const LQIP = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABMNDhEODBMRDxEVFBMXHTAfHRoaHToqLCMwRT1JR0Q9Q0FMVm1dTFFoUkFDX4JgaHF1e3x7SlyGkIV3j214e3b/2wBDARQVFR0ZHTgfHzh2T0NPdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnb/wAARCAAVACADASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAMBAgQF/8QAJBAAAgIBAwQCAwAAAAAAAAAAAQIDEQAEEiETIjFBUWFxoeH/xAAWAQEBAQAAAAAAAAAAAAAAAAACAQP/xAAYEQEAAwEAAAAAAAAAAAAAAAAAAQIREv/aAAwDAQACEQMRAD8AgwqQSOfxizGp4AYEfIxS69OnThw3s81mPX69kAET7Qb7vJ/mCt7ac1htkTZGzVdC8SvdCrGhY95zF1k7yLHJPYPoiv3mkAA2zg1fAs8Zp3jPlfTxGSNXLUDIy0B6F5WTSJMz9Qsdj7Rz8gYYYcg1ItHE08jDcDE5Uc+aGMddrRCyd4N/XF4YZchH/9k='

export function HomePage() {
  const { t, lang, isRtl, n, bl } = useI18n()
  const { campaigns, providers, getProvider } = useCatalogue()
  const { hiddenReviewIds, reviews } = useStore()
  const [featured, setFeatured] = useState<Campaign[] | null>(null)
  const [popular, setPopular] = useState<Campaign[] | null>(null)
  const [mapWilayah, setMapWilayah] = useState<string | null>(null)

  const Arrow = isRtl ? ArrowLeft : ArrowRight

  useEffect(() => {
    let live = true
    // The session catalogue is passed in rather than left to the seed data:
    // every trip on NASEK is one an owner published, and the admin's featured
    // decisions ride along with it. Without this the strip below could only
    // ever show seeded trips, of which there are none.
    void campaignsApi.featured(campaigns).then((r) => live && setFeatured(r))
    void campaignsApi.popular(campaigns).then((r) => live && setPopular(r))
    return () => {
      live = false
    }
  }, [campaigns])

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
  const testimonials = reviews.filter(
    (r) => r.rating === 5 && !r.hidden && !hiddenReviewIds.includes(r.id),
  ).slice(0, 3)

  const mapCampaigns = mapWilayah
    ? campaigns.filter((c) => c.wilayahId === mapWilayah)
    : []

  return (
    <main>
      {/* ===================================================== hero ===== */}
      {/*
        The photograph carries the page, and the type sits in the corner of it.

        This is bottom-anchored rather than centred, and that is the decision
        the rest follows from. A centred plate has to darken whatever is behind
        it, because type lands wherever the picture is busiest; type gathered
        into the bottom-start corner only needs the bottom of the frame dimmed,
        which leaves the arcade, the courtyard and the Kaaba themselves in open
        light. The gold rule that used to box this content in is gone with the
        plate — a border around everything is not an accent.

        `-mt-17` pulls the section up under the navigation bar, which goes
        transparent here, so the picture starts at the top of the window. The
        matching `pt-17` inside keeps the content clear of it.
      */}
      <section className="on-dark relative isolate -mt-17 flex min-h-[88dvh] items-end overflow-hidden sm:min-h-[80dvh]">
        <HeroBackdrop alt={t('hero.imageAlt')} />

        <div className="mx-auto w-full max-w-7xl px-4 pt-17 pb-20 sm:px-6 sm:pb-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="eyebrow text-gold-300">{t('hero.eyebrow')}</p>

            <h1 className="display on-photo mt-4 text-balance text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.1] text-ivory-50">
              {t('hero.title')}
            </h1>

            <p className="on-photo mt-5 max-w-xl text-md leading-relaxed text-ivory-100/90 sm:text-lg">
              {t('hero.subtitle')}
            </p>

            {/* A rule, not a box. `border-s` is the start edge, so this sits on
                the right of the text in Arabic and the left in English without
                being told which. */}
            <p className="mt-7 flex items-center gap-2.5 border-s-2 border-gold-400 ps-3.5 text-xs font-semibold text-gold-200">
              <BadgeCheck className="size-4 shrink-0" strokeWidth={1.9} />
              {t('hero.trust')}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <LinkButton to="/campaigns" variant="gold" size="lg">
                {t('hero.ctaSecondary')}
                <Arrow className="size-4" />
              </LinkButton>
              <LinkButton
                to="/smart-match"
                size="lg"
                className="border-ivory-50/35 bg-ivory-50/10 text-ivory-50 backdrop-blur-sm hover:bg-ivory-50/20 active:bg-ivory-50/25"
              >
                <Compass className="size-4" />
                {t('hero.ctaPrimary')}
              </LinkButton>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================== the search === */}
      {/*
        Lifted off the photograph and onto the seam between the hero and the
        page, half on each. It was floating in the middle of a picture before,
        which is a decorative place for the one control most people came to
        use; straddling the edge makes it the hinge between looking and doing.
      */}
      <div className="relative z-20 mx-auto -mt-12 max-w-5xl px-4 sm:px-6 lg:px-8">
        <SmartSearch />
      </div>

      {/* ==================================================== the count === */}
      {/* Ruled into four columns like a printed table, and back on parchment:
          numbers this small are unreadable over a photograph. */}
      <section className="mt-14 border-y border-ivory-300 bg-ivory-100">
        <ul className="mx-auto grid max-w-3xl grid-cols-2 divide-x divide-ivory-300 px-4 py-6 rtl:divide-x-reverse sm:grid-cols-4 sm:px-6">
          {stats.map((stat) => (
            <li key={stat.label} className="px-3 py-2 text-center">
              <p className="nums display text-4xl text-nasek-700">{n(stat.value)}</p>
              <p className="mt-1 text-2xs font-medium tracking-wide text-ink-500">{stat.label}</p>
            </li>
          ))}
        </ul>
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
                <span className="nums -rotate-45 text-2xs font-bold text-gold-700">
                  {i + 1}
                </span>
              </span>
              <span className="flex size-11 items-center justify-center border border-nasek-200 bg-nasek-50 text-nasek-700">
                <step.icon className="size-5" strokeWidth={1.7} />
              </span>
              <h3 className="display text-xl text-nasek-900">{t(step.title)}</h3>
              <p className="text-sm leading-relaxed text-ink-500">{t(step.body)}</p>
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
                { icon: ShieldCheck, n: 6 },
              ] as const
            ).map((item) => (
              <li key={item.n} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center border border-gold-300 bg-ivory-50 text-nasek-700">
                  <item.icon className="size-[18px]" strokeWidth={1.7} />
                </span>
                <div>
                  <h3 className="text-md font-bold text-ink-900">
                    {t(`why.${item.n}.title` as MessageKey)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
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
                              <span className="block truncate text-base font-bold text-ink-900">
                                {bl(c.title)}
                              </span>
                              <span className="flex items-center gap-2 text-2xs text-ink-400">
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
                  <p className="mt-1.5 text-sm text-ink-400">{t('map.subtitle')}</p>
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
                <p className="flex-1 text-base leading-relaxed text-ink-700">
                  {bl(review.comment)}
                </p>
                <div className="flex items-center justify-between border-t border-ivory-300 pt-4">
                  <span className="text-sm font-bold text-ink-800">
                    {review.userName || t('review.anonymous')}
                  </span>
                  <Rating value={review.rating} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        The campaign-owner band used to sit here.

        It was owner marketing on a customer website: a headline, three
        selling points, a mock dashboard and a button to "list your
        campaign". All of it is gone, and not only the button — NASEK has
        three separate applications now, and a pilgrim reading the home
        page has no reason to be sold a portal they cannot use or told it
        exists. Campaign owners are taken on by the NASEK team, who give
        them the portal address directly.
      */}

      {/* ===================================================== giving ==== */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="framed flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:p-10">
          <span className="flex size-14 shrink-0 items-center justify-center border border-gold-300 bg-gold-50 text-gold-700">
            <HeartHandshake className="size-7" strokeWidth={1.6} />
          </span>
          <div className="flex-1">
            <h2 className="display text-2xl text-ink-900">{t('giving.title')}</h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-500">
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
        <h2 className="display text-4xl text-nasek-900 sm:text-6xl">
          {t('home.finalCta.title')}
        </h2>
        <p className="mt-3 text-md leading-relaxed text-ink-500">{t('home.finalCta.body')}</p>
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

/**
 * The Makkah photograph behind the hero, and everything that makes text
 * survive on top of it.
 *
 * Three sources rather than one. A 16:9 crop is the wrong shape for a phone
 * held upright — `object-cover` on a wide file throws away the courtyard and
 * leaves a band of sky — so a 3:4 crop of the same frame is served below
 * 640px, where the Kaaba sits in the middle of the frame at any height the
 * plate grows to. WebP is offered first and a JPEG follows for anything that
 * cannot take it.
 *
 * The blurred thumbnail underneath is inlined rather than fetched: it is the
 * ground the headline is read against for the few hundred milliseconds before
 * a 300 KB photograph arrives, and a request for it would land in the same
 * queue as the photograph itself.
 */
function HeroBackdrop({ alt }: { alt: string }) {
  return (
    <div className="absolute inset-0 -z-10" style={{ backgroundColor: '#0d0c0b' }}>
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${LQIP}")` }}
      />

      {/* `<picture>` is an inline wrapper with no box of its own, so it has to
          be stretched explicitly — the `<img>` inside it fills this, not the
          positioned parent. */}
      <picture className="absolute inset-0 block size-full">
        <source media="(max-width: 640px)" type="image/avif" srcSet={heroTallAvif} />
        <source media="(max-width: 640px)" type="image/webp" srcSet={heroTallWebp} />
        <source media="(max-width: 640px)" srcSet={heroTall} />
        <source
          type="image/avif"
          srcSet={`${heroWideSmAvif} 1100w, ${heroWideAvif} 1536w`}
          sizes="100vw"
        />
        <source
          type="image/webp"
          srcSet={`${heroWideSmWebp} 1100w, ${heroWideWebp} 1536w`}
          sizes="100vw"
        />
        <img
          src={heroWide}
          srcSet={`${heroWideSm} 1100w, ${heroWide} 1536w`}
          sizes="100vw"
          alt={alt}
          // The hero image is the largest paint on the page; letting it load
          // lazily would be optimising away the one image worth waiting for.
          loading="eager"
          fetchPriority="high"
          decoding="async"
          // 65% down rather than centred. The Kaaba sits low in this frame —
          // its base is at 88% of the height — and a centred crop lifts that
          // base out of shot on a wide, short window. Biasing down holds the
          // whole cube and the courtyard; there is sky enough to spare.
          className="size-full object-cover object-[50%_65%]"
        />
      </picture>

      {/*
        One gradient, where the type is — and nothing anywhere else.

        There used to be a flat 45% green wash across the whole frame with a
        second gradient over it, and between them and the text plate roughly a
        quarter of the photograph was reaching the eye. The wash is gone.

        The values below carry over unchanged from the previous photograph,
        and they still fit this one — worth stating, because the two frames are
        lit in opposite directions. Measured off the source: the bottom fifth,
        where the type sits, averages 65/255. The crowd there is backlit and
        already dark, so 0.82 at the very edge is comfortable rather than
        necessary; it thins to a third of that by a third of the way up and is
        gone by 60%. The Kaaba, its door and the calligraphy all sit above that
        line, untouched.

        The bright end of this frame is the top, not the bottom — a sunset sky
        at 103/255 where the old picture had black cloth. That is what the 0.42
        scrim over the first 160px is for: it is the transparent navigation's
        ground, and without it the ivory wordmark would sit on open sky.

        Near-black rather than green, because the photograph has no green in it
        and multiplying green over gold only dulls the gold. NASEK's green
        resumes immediately below, in the search card's ground and in the
        navigation the moment it leaves the picture.
      */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgb(9 12 11 / 0.82) 0%, rgb(9 12 11 / 0.26) 34%, transparent 60%)',
        }}
        aria-hidden
      />
      <div
        className="absolute inset-x-0 top-0 h-40"
        style={{ background: 'linear-gradient(to bottom, rgb(9 12 11 / 0.42), transparent)' }}
        aria-hidden
      />
      {/* Brand grain rather than a pattern — at 3% you feel it and never see it.
          Lower than before: this frame carries its own gold, and the lattice
          has nothing to add on top of the kiswah's. */}
      <div className="girih-gold absolute inset-0 opacity-[0.03]" aria-hidden />
    </div>
  )
}
