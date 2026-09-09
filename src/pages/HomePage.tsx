import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  MapPinned,
  Quote,
  Sparkles,
} from 'lucide-react'
import type { Campaign } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { WILAYAT } from '@/data/geo'

import { campaignsApi } from '@/services/api/campaigns'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useStore } from '@/store/AppStore'
import { SmartSearch } from '@/components/search/SmartSearch'
import { OmanMap } from '@/components/map/OmanMap'
import { Badge, LinkButton, Rating, RuleLink, cx } from '@/components/ui'
import { CampaignIndex, CampaignIndexSkeleton } from '@/components/home/CampaignIndex'
import {
  CountUp,
  HeroArch,
  JourneyLine,
  JourneyNode,
  MaskedLine,
  Reveal,
} from '@/components/home/Journey'

/**
 * The home page, as one journey from Oman to Makkah.
 *
 * It used to open on a photograph of the Haram — the same photograph every
 * Hajj and Umrah operator in the region opens on, which is exactly why it
 * could never make NASEK distinctive. It is gone, and nothing replaced it in
 * kind. The destination is not shown here at all; it is approached.
 *
 * What carries the page instead is a single gold hairline. It begins at the
 * foot of an arch in the hero and runs the whole length of the document,
 * drawing itself against scroll position and lighting a marker at each of the
 * eight stages. The sections are not eight independent blocks that happen to
 * sit near each other — they are eight places the line passes through, and
 * the numbering in each eyebrow is the reader's position on it.
 *
 * Three things are load-bearing about how this is built:
 *
 *   The page is readable before any of that runs. Every reveal starts from its
 *   final state, and `Journey.tsx` arms them only once the client has decided
 *   motion is wanted. Reduced motion, no JavaScript and the server render all
 *   produce the finished page on the first frame.
 *
 *   The warm canvas belongs to this route and no other. `data-canvas` is set on
 *   `body` while this page is mounted and removed when it unmounts, which also
 *   carries the navigation bar's ground with it — see `--nasek-nav-ground`.
 *
 *   Every figure on it is real. The counts are the session catalogue's, the
 *   campaigns are the ones an owner published and an administrator featured,
 *   and the quotes are reviews left after trips booked through the platform.
 *   There is no placeholder number anywhere on this page.
 */
export function HomePage() {
  const { t, lang, isRtl, n, bl } = useI18n()
  const { campaigns, providers, getProvider } = useCatalogue()
  const { hiddenReviewIds, reviews } = useStore()
  const [featured, setFeatured] = useState<Campaign[] | null>(null)
  const [popular, setPopular] = useState<Campaign[] | null>(null)
  const [mapWilayah, setMapWilayah] = useState<string | null>(null)
  const journeyRef = useRef<HTMLDivElement>(null)

  const Arrow = isRtl ? ArrowLeft : ArrowRight

  /*
   * The home page's own canvas, for as long as it is the page.
   *
   * An attribute on `body` rather than a class on this component, because the
   * two things that need to know are outside it: the document background,
   * which shows through under a short page and behind the overscroll, and the
   * navigation bar, which is a sibling. Both read `--nasek-nav-ground`.
   */
  useEffect(() => {
    document.body.dataset.canvas = 'warm'
    return () => {
      delete document.body.dataset.canvas
    }
  }, [])

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

  /* What is actually open, counted off the catalogue rather than asserted. */
  const openNow = useMemo(
    () => [
      { label: t('common.umrah'), value: campaigns.filter((c) => c.type === 'umrah').length },
      { label: t('common.hajj'), value: campaigns.filter((c) => c.type === 'hajj').length },
      {
        label: t('hero.statWilayat'),
        value: new Set(campaigns.map((c) => c.wilayahId)).size,
      },
    ],
    [campaigns, t],
  )

  /** The three five-star quotes the home page pulls out, if there are any. */
  const testimonials = reviews
    .filter((r) => r.rating === 5 && !r.hidden && !hiddenReviewIds.includes(r.id))
    .slice(0, 3)

  const mapCampaigns = mapWilayah ? campaigns.filter((c) => c.wilayahId === mapWilayah) : []

  return (
    <main className="journey">
      {/*
        Everything the line passes through lives inside this element, and the
        line is drawn across it. It is the positioning context and the height
        the scroll progress is measured against, so the footer — which is not
        part of the journey — sits outside it.
      */}
      <div ref={journeyRef} className="relative">
        <JourneyLine containerRef={journeyRef} />

        {/* ============================================ 01 · start ===== */}
        <section className="relative isolate overflow-hidden">
          {/*
            The hero's structure, with no photograph in it.

            An arch and an eight-point khatim, both in gold hairline, both
            behind the type at an opacity where they read as the paper's own
            texture rather than as pictures of anything. This is the entire
            visual device: whitespace, one arch, and very large Arabic.
          */}
          <HeroArch
            className="absolute -top-8 start-[4%] -z-10 hidden h-[560px] w-[min(380px,36vw)] opacity-90 sm:block"
          />
          <svg
            viewBox="0 0 200 200"
            aria-hidden
            focusable="false"
            className="khatim pointer-events-none absolute -top-10 -end-24 -z-10 size-[380px] opacity-[0.045]"
            fill="none"
            stroke="var(--color-nasek-900)"
            strokeWidth="1.4"
          >
            <path d="M100 6 L129 71 L194 100 L129 129 L100 194 L71 129 L6 100 L71 71 Z" />
            <path d="M100 26 L118 82 L174 100 L118 118 L100 174 L82 118 L26 100 L82 82 Z" />
            <circle cx="100" cy="100" r="58" />
            <circle cx="100" cy="100" r="34" />
          </svg>

          <div className="mx-auto max-w-6xl px-4 pt-12 pb-6 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
            <div className="grid items-end gap-10 lg:grid-cols-[1.45fr_0.55fr]">
              <div>
                <StageLabel index={1} label={t('home.stage1')} />

                <h1 className="display-j mt-6 text-[clamp(2.25rem,7.2vw,4.75rem)] text-nasek-900">
                  <MaskedLine delay={100}>
                    {t('hero.titlePre')}
                    <span className="relative">
                      {t('hero.titleMark')}
                      {/* The one gold mark in the headline. A rule under two
                          words, not a highlight behind them. */}
                      <span
                        aria-hidden
                        className="absolute inset-x-0 bottom-[0.08em] h-0.5 bg-gold-400/75"
                      />
                    </span>
                    {t('hero.titlePost')}
                  </MaskedLine>
                  <MaskedLine delay={190}>
                    <span className="font-normal text-nasek-700">{t('hero.titleB')}</span>
                  </MaskedLine>
                </h1>

                <Reveal as="p" delay={280} className="mt-7 max-w-lg text-md leading-loose text-ink-500">
                  {t('hero.subtitle')}
                </Reveal>

                <Reveal delay={340}>
                  <p className="mt-6 flex items-center gap-2.5 text-xs font-semibold text-gold-700">
                    <BadgeCheck className="size-4 shrink-0" strokeWidth={1.9} />
                    {t('hero.trust')}
                  </p>
                </Reveal>
              </div>

              {/* What is open, off the catalogue. Ruled, not boxed. */}
              <Reveal delay={400} className="lg:pb-2">
                <p className="eyebrow text-gold-600">{t('home.openNow')}</p>
                <ul className="mt-4 border-t border-ivory-300">
                  {openNow.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-baseline justify-between gap-4 border-b border-ivory-200 py-3"
                    >
                      <span className="text-sm text-ink-500">{item.label}</span>
                      <span className="nums display-j text-xl text-nasek-800">{n(item.value)}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            {/* The one control most people came to use, on the seam between
                the opening and the page. */}
            <Reveal delay={460} className="mt-10 sm:mt-12">
              <SmartSearch />
            </Reveal>

            {/* The count, ruled into four columns like a printed table. */}
            {/* No dividers between these. Four figures on one rule read as a
                table; four figures in four ruled cells read as four boxes,
                which is the thing this page is built to avoid. */}
            <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-ivory-300 pt-5 sm:grid-cols-4">
              {stats.map((stat) => (
                <li key={stat.label} className="py-1">
                  <p className="nums display-j text-3xl text-nasek-800 sm:text-4xl">
                    <CountUp value={stat.value} format={(v) => n(v)} />
                  </p>
                  <p className="mt-1.5 text-2xs tracking-wide text-ink-400">{stat.label}</p>
                </li>
              ))}
            </ul>

            <JourneyNode x={22} />
          </div>
        </section>

        {/* ======================================== 02 · smart match ===== */}
        <Stage index={2} label={t('home.stage2')} nodeX={76} tone="band">
          <StageHeading title={t('home.smartTitle')} subtitle={t('smart.subtitle')} />

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16">
            <Reveal as="ol" className="border-t border-ivory-300">
              {(['smart.q1', 'smart.q2', 'smart.q3', 'smart.q4'] as MessageKey[]).map(
                (key, i) => (
                  <li
                    key={key}
                    className="grid grid-cols-[2rem_1fr] gap-4 border-b border-ivory-200 py-4"
                  >
                    <span className="nums pt-1.5 text-xs font-bold text-gold-400">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>
                      <span className="display-j block text-lg text-nasek-900 sm:text-xl">
                        {t(key)}
                      </span>
                      <span className="mt-1 block text-sm text-ink-400">
                        {t(`${key}hint` as MessageKey)}
                      </span>
                    </span>
                  </li>
                ),
              )}
            </Reveal>

            <Reveal delay={120}>
              <p className="nums display-j text-[clamp(3rem,9vw,5rem)] leading-none text-nasek-800">
                <CountUp value={campaigns.length} format={(v) => n(v)} />
              </p>
              <p className="mt-3 text-md text-ink-500">{t('hero.statCampaigns')}</p>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-400">
                {t('smart.answeredNote')}
              </p>
              <div className="mt-8">
                <LinkButton to="/smart-match">
                  <Sparkles className="size-4" />
                  {t('smart.start')}
                </LinkButton>
              </div>
            </Reveal>
          </div>
        </Stage>

        {/* =========================================== 03 · campaigns ===== */}
        <Stage index={3} label={t('home.stage3')} nodeX={28}>
          <StageHeading
            title={t('home.featured')}
            subtitle={t('home.featuredSub')}
            action={<RuleLink to="/campaigns">{t('common.viewAll')}</RuleLink>}
          />

          {/* Three states, not two. The catalogue is empty until an owner
              publishes something and an administrator approves it, and an
              index of nothing under a heading promising featured trips reads
              as a fault rather than as a season that has not opened. */}
          {!featured ? (
            <CampaignIndexSkeleton />
          ) : featured.length > 0 ? (
            <CampaignIndex campaigns={featured.slice(0, 4)} />
          ) : (
            <p className="mt-8 border-t border-ivory-300 pt-6 text-md text-ink-500">
              {t('home.emptyCampaigns')}
            </p>
          )}

          {/* The season's most booked, kept from the old page and set as a
              second, quieter index rather than a second grid of cards. It is
              dropped altogether when there is nothing in it — a second empty
              heading says nothing the first has not. */}
          {(!popular || popular.length > 0) && (
            <div className="mt-16">
              <h3 className="eyebrow text-gold-600">{t('home.popular')}</h3>
              <p className="mt-2 text-sm text-ink-400">{t('home.popularSub')}</p>
              {popular ? (
                <CampaignIndex campaigns={popular.slice(0, 3)} />
              ) : (
                <CampaignIndexSkeleton rows={3} />
              )}
            </div>
          )}
        </Stage>

        {/* ================================================= 04 · map ===== */}
        <Stage index={4} label={t('home.stage4')} nodeX={78} tone="band">
          <StageHeading title={t('home.mapTitle')} subtitle={t('home.mapSub')} />

          <Reveal className="mt-10 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            {/* The map keeps its real coastline and its real markers, and
                loses the box it used to sit in. */}
            <OmanMap campaigns={campaigns} selectedId={mapWilayah} onSelect={setMapWilayah} />

            <div className="lg:border-s lg:border-ivory-300 lg:ps-10">
              {mapWilayah ? (
                <>
                  <h3 className="display-j text-2xl text-nasek-900">
                    {t('map.campaignsIn', {
                      name: WILAYAT.find((w) => w.id === mapWilayah)?.name[lang] ?? '',
                    })}
                  </h3>
                  <p className="mt-1.5 text-sm text-ink-400">
                    {mapCampaigns.length === 1
                      ? t('map.countOne')
                      : t('map.count', { n: mapCampaigns.length })}
                  </p>
                  <ul className="mt-6 border-t border-ivory-300">
                    {mapCampaigns.slice(0, 5).map((c) => {
                      const provider = getProvider(c.providerId)
                      return (
                        <li key={c.id}>
                          <Link
                            to={`/campaigns/${c.id}`}
                            className="group flex items-center gap-3.5 border-b border-ivory-200 py-3.5 transition-colors hover:bg-ivory-50"
                          >
                            <span
                              className="flex size-9 shrink-0 items-center justify-center rounded-[2px] text-xs font-bold text-white"
                              style={{ background: provider?.brandColor }}
                              aria-hidden
                            >
                              {provider?.initials}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-base font-semibold text-ink-900">
                                {bl(c.title)}
                              </span>
                              <Rating value={c.rating} size="sm" />
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
                    <p className="border-t border-ivory-300 pt-5 text-sm text-ink-500">
                      {t('map.noneHint')}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col justify-center">
                  <MapPinned className="size-7 text-gold-400" aria-hidden />
                  <p className="display-j mt-4 text-xl text-nasek-900">{t('map.selectHint')}</p>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-400">
                    {t('map.subtitle')}
                  </p>
                </div>
              )}
            </div>
          </Reveal>
        </Stage>

        {/* =============================================== 05 · steps ===== */}
        <Stage index={5} label={t('home.stage5')} nodeX={48}>
          <StageHeading title={t('how.title')} subtitle={t('how.subtitle')} />

          <Reveal as="ol" className="mt-10 border-t border-ivory-300">
            {([1, 2, 3, 4] as const).map((step) => (
              <li
                key={step}
                className="grid grid-cols-[2.75rem_1fr] items-start gap-5 border-b border-ivory-200 py-6 sm:gap-7"
              >
                {/* The stage marker, echoing the ones on the line itself. */}
                <span className="nums flex size-11 items-center justify-center rounded-full border border-gold-300 text-xs font-bold text-gold-700">
                  {String(step).padStart(2, '0')}
                </span>
                <span className="pt-1.5">
                  <span className="display-j block text-xl text-nasek-900 sm:text-2xl">
                    {t(`how.s${step}.title` as MessageKey)}
                  </span>
                  <span className="mt-1.5 block max-w-xl text-sm leading-relaxed text-ink-500">
                    {t(`how.s${step}.body` as MessageKey)}
                  </span>
                </span>
              </li>
            ))}
          </Reveal>
        </Stage>

        {/* =============================================== 06 · trust ===== */}
        <Stage index={6} label={t('home.stage6')} nodeX={24} tone="band">
          <StageHeading title={t('why.title')} subtitle={t('why.subtitle')} />

          <Reveal as="ul" className="mt-10 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
            {([1, 2, 3, 4, 5, 6] as const).map((item) => (
              <li key={item} className="border-t border-ivory-300 py-6">
                <h3 className="display-j text-lg text-nasek-900">
                  {t(`why.${item}.title` as MessageKey)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {t(`why.${item}.body` as MessageKey)}
                </p>
              </li>
            ))}
          </Reveal>

          {/* Reviews sit inside trust rather than in a section of their own:
              a traveller's sentence is evidence, and it belongs with the
              claims it is evidence for. */}
          {testimonials.length > 0 && (
            <Reveal className="mt-16">
              <h3 className="eyebrow text-gold-600">{t('home.reviewsTitle')}</h3>
              <ul className="mt-6 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
                {testimonials.map((review) => (
                  <li key={review.id} className="border-t border-ivory-300 pt-6">
                    <Quote className="size-5 text-gold-400 rtl:-scale-x-100" aria-hidden />
                    <p className="display-j mt-4 text-lg leading-relaxed text-nasek-800">
                      {bl(review.comment)}
                    </p>
                    <p className="mt-4 text-xs text-ink-400">
                      {review.userName || t('review.anonymous')}
                    </p>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </Stage>

        {/* ============================================== 07 · giving ===== */}
        {/*
          The quiet one. Deep green, one sentence, and more whitespace than
          anything else on the page — no statistics, no filled button, nothing
          asking to be clicked. `on-dark` raises the focus ring so the one
          link in here stays visible against the green.
        */}
        <section className="on-dark relative mt-8 bg-nasek-950 py-24 text-ivory-100 sm:py-32">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <svg
              viewBox="0 0 40 40"
              aria-hidden
              focusable="false"
              className="size-7 text-gold-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <path d="M20 2 L25 15 L38 20 L25 25 L20 38 L15 25 L2 20 L15 15 Z" />
            </svg>

            <Reveal>
              <p className="eyebrow mt-8 text-gold-300">
                <span className="nums me-2">07</span>
                {t('home.stage7')}
              </p>
              <h2 className="display-j mt-6 max-w-2xl text-[clamp(1.75rem,4.2vw,3rem)] font-normal text-ivory-50">
                {t('giving.subtitle')}
              </h2>
              {/* The planned-programme notice rather than the fuller
                  description, and not only because the longer one names
                  campaign owners in wording the public site keeps clear of.
                  This is the first place most people meet Giving, and the
                  first thing it should say is that it cannot yet take money. */}
              <p className="mt-6 max-w-md text-md leading-loose text-ivory-100/70">
                {t('giving.plannedBody')}
              </p>
              <div className="mt-10">
                <RuleLink to="/giving" onDark>
                  {t('giving.interest')}
                </RuleLink>
              </div>
            </Reveal>
            <JourneyNode x={72} />
          </div>
        </section>

        {/* =============================================== 08 · close ===== */}
        <section className="relative overflow-hidden py-24 text-center sm:py-32">
          <HeroArch
            className="absolute inset-x-0 top-16 -z-10 mx-auto h-[240px] w-[min(320px,72vw)] opacity-70"
          />
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Reveal>
              <p className="eyebrow justify-center text-gold-600">
                <span className="nums me-2">08</span>
                {t('home.stage8')}
              </p>
              <h2 className="display-j mt-6 text-[clamp(1.9rem,5.5vw,3.5rem)] text-nasek-900">
                {t('home.finalCta.title')}
              </h2>
              <p className="mx-auto mt-4 max-w-md text-md leading-loose text-ink-500">
                {t('home.finalCta.body')}
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <LinkButton to="/smart-match">
                  <Sparkles className="size-4" />
                  {t('smart.start')}
                </LinkButton>
                <LinkButton to="/campaigns" variant="hairline">
                  {t('hero.ctaSecondary')}
                  <Arrow className="size-4" />
                </LinkButton>
              </div>
            </Reveal>

            <JourneyNode x={50} />

            {/* The terminus. The line arrives at this star and stops. */}
            <svg
              viewBox="0 0 40 40"
              aria-hidden
              focusable="false"
              className="mx-auto mt-14 size-5 text-gold-400"
              fill="currentColor"
            >
              <path d="M20 0 L25.5 14.5 L40 20 L25.5 25.5 L20 40 L14.5 25.5 L0 20 L14.5 14.5 Z" />
            </svg>
          </div>
        </section>
      </div>
    </main>
  )
}

// ------------------------------------------------------------------ pieces

/** The numbered stage label. The number is the reader's position on the line. */
function StageLabel({ index, label }: { index: number; label: string }) {
  return (
    <p className="eyebrow flex items-center gap-3 text-gold-600">
      <span className="nums text-gold-500">{String(index).padStart(2, '0')}</span>
      {label}
      <span aria-hidden className="h-px w-14 bg-gold-300 sm:w-24" />
    </p>
  )
}

/**
 * One stage of the journey.
 *
 * `tone="band"` is the alternating warmer ground that separates a stage from
 * its neighbours without drawing a box around either. It is the only surface
 * treatment on the page.
 */
function Stage({
  index,
  label,
  nodeX,
  tone = 'canvas',
  children,
}: {
  index: number
  label: string
  nodeX: number
  tone?: 'canvas' | 'band'
  children: ReactNode
}) {
  return (
    <section className={cx('py-20 sm:py-28', tone === 'band' && 'bg-[#f4f0e6]')}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <StageLabel index={index} label={label} />
        {children}
        <JourneyNode x={nodeX} />
      </div>
    </section>
  )
}

/** A stage's title, its standfirst, and an optional link on the same rule. */
function StageHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="display-j max-w-2xl text-[clamp(1.6rem,4vw,2.75rem)] text-nasek-900">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-4 max-w-xl text-md leading-loose text-ink-500">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 sm:pb-2">{action}</div>}
    </div>
  )
}
