import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Bus,
  CalendarDays,
  Clock,
  MapPin,
  Plane,
  Users,
} from 'lucide-react'
import type { Campaign, Provider } from '@/types'
import { useI18n } from '@/i18n'
import { ProviderMark } from '@/components/brand/ProviderMark'
import { wilayahName } from '@/data/geo'
import { serviceLabel } from '@/data/services'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { campaignImageUrl } from '@/services/storage/campaignImages'
import { useToggleSaved } from '@/hooks/useToggleSaved'
import { tripDays } from '@/lib/trip'
import { Badge, IconButton, LinkButton, Ornament, Rating, cx } from '@/components/ui'

/*
 * The trip card, in two sizes.
 *
 * Full: a 16:9 cover over the company, the title and three lines of facts —
 * dates, where it leaves from and how, and seats. A trip with no photograph
 * gets the girih cover instead, in the same box, so a grid row that mixes the
 * two still lines up.
 *
 * Compact: the sidebars, the map list and "similar trips", where the card is a
 * couple of hundred pixels wide. No cover at all — a picture there would crowd
 * out the facts somebody is comparing — but the same facts, in the same order,
 * drawn by the same component, so the two sizes read as one card.
 *
 * Neither size books anything. The cover, the title and "عرض التفاصيل" all go
 * to the trip page, which is the one place that decides whether a trip can be
 * booked — sold out and closed are both checked there, and a second copy of
 * that rule on the card would be a second thing to keep in step.
 */
export function CampaignCard({
  campaign,
  compact = false,
}: {
  campaign: Campaign
  compact?: boolean
}) {
  const { t, bl } = useI18n()
  const { isSaved } = useStore()
  const toggleSave = useToggleSaved()
  const { getProvider } = useCatalogue()

  const provider = getProvider(campaign.providerId)
  const saved = isSaved(campaign.id)
  const href = `/campaigns/${campaign.id}`

  const saveButton = (
    <IconButton
      active={saved}
      onClick={() => toggleSave(campaign.id)}
      label={saved ? t('common.saved') : t('common.save')}
    >
      {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
    </IconButton>
  )

  const title = (
    <Link to={href} className="rounded-[2px]">
      <h3
        className={cx(
          'display line-clamp-2 text-nasek-900 transition-colors group-hover:text-nasek-600',
          compact ? 'text-lg' : 'text-xl',
        )}
      >
        {bl(campaign.title)}
      </h3>
    </Link>
  )

  if (compact) {
    return (
      <article className={CARD}>
        {/* The girih band stays behind the company line, never behind facts. */}
        <div className="girih flex items-start gap-2 border-b border-ivory-300 bg-ivory-100/70 px-4 py-3">
          <div className="min-w-0 flex-1">
            <CompanyLine provider={provider} small />
          </div>
          <TypeBadge campaign={campaign} className="shrink-0" />
        </div>

        <div className="flex flex-1 flex-col p-4">
          {title}
          <Rating
            value={campaign.rating}
            count={campaign.reviewCount}
            size="sm"
            className="mt-1.5"
          />
          <Facts campaign={campaign} className="mt-3.5" />
        </div>

        <div className="border-t border-ivory-300 bg-ivory-100/70 p-4">
          <div className="flex items-end justify-between gap-3">
            <Price campaign={campaign} />
            {saveButton}
          </div>
          <LinkButton to={href} variant="hairline" size="sm" block className="mt-3">
            {t('common.viewDetails')}
          </LinkButton>
        </div>
      </article>
    )
  }

  return <FullCard campaign={campaign} provider={provider} title={title} saveButton={saveButton} />
}

const CARD = cx(
  'surface group relative flex flex-col overflow-hidden transition-all duration-300',
  'hover:border-gold-300 hover:shadow-lift',
)

function FullCard({
  campaign,
  provider,
  title,
  saveButton,
}: {
  campaign: Campaign
  provider: Provider | undefined
  title: ReactNode
  saveButton: ReactNode
}) {
  const { t, lang, bl } = useI18n()
  const href = `/campaigns/${campaign.id}`
  const cover = campaign.images[0]
  const soldOut = campaign.seatsAvailable === 0

  return (
    <article className={CARD}>
      {/* ------------------------------------------------------------ cover */}
      <div className="relative aspect-[16/9] overflow-hidden border-b border-ivory-300">
        {/* The whole cover is a way to the trip, but not a second tab stop:
            the title below is the same link and carries the name. */}
        <Link to={href} tabIndex={-1} aria-hidden className="absolute inset-0 block">
          {cover ? (
            <>
              <img
                src={campaignImageUrl(cover)}
                alt=""
                loading="lazy"
                className={cx(
                  'size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]',
                  soldOut && 'grayscale-[40%]',
                )}
              />
              <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-nasek-950/65 to-transparent" />
            </>
          ) : (
            <CoverFallback campaign={campaign} />
          )}
        </Link>

        {/* Type at the start edge, save at the end. The girih cover already
            names the type in large letters, so it carries no badge. */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {cover ? <TypeBadge campaign={campaign} className="shadow-soft" /> : <span />}
          <span className="pointer-events-auto rounded-full bg-ivory-50/95 shadow-soft">
            {saveButton}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-[2px] bg-nasek-950/70 px-2 py-1 text-2xs font-semibold text-ivory-50 backdrop-blur-sm">
            <Clock className="size-3.5" aria-hidden />
            {t('campaign.duration', { n: tripDays(campaign) })}
          </span>
          {soldOut && <Badge tone="solid">{t('common.soldOut')}</Badge>}
        </div>
      </div>

      {/* ------------------------------------------------------------- body */}
      <div className="flex flex-1 flex-col p-4">
        <CompanyLine provider={provider} />
        <div className="mt-3">{title}</div>
        <Rating value={campaign.rating} count={campaign.reviewCount} size="sm" className="mt-2" />

        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-ink-500">
          {bl(campaign.description)}
        </p>

        <Facts campaign={campaign} className="mt-4" />

        <ul className="mt-3.5 flex flex-wrap gap-1.5">
          {campaign.services.slice(0, 3).map((s) => (
            <li key={s}>
              <span className="inline-block rounded-[2px] border border-ivory-300 bg-ivory-100 px-2 py-1 text-2xs font-medium text-ink-600">
                {serviceLabel(s, lang)}
              </span>
            </li>
          ))}
          {campaign.services.length > 3 && (
            <li>
              <span className="inline-block px-1.5 py-1 text-2xs font-semibold text-nasek-600">
                {t('campaign.moreServices', { n: campaign.services.length - 3 })}
              </span>
            </li>
          )}
        </ul>
      </div>

      {/* ----------------------------------------------------------- footer */}
      <div className="flex items-end justify-between gap-3 border-t border-ivory-300 bg-ivory-100/70 p-4">
        <Price campaign={campaign} />
        {/* A frame, not a fill: the card itself is already a link, so this
            never had to be the loudest thing in it. */}
        <LinkButton to={href} variant="hairline" size="sm">
          {t('common.viewDetails')}
        </LinkButton>
      </div>
    </article>
  )
}

/**
 * The cover for a trip with no photograph — which is most of them for a while
 * yet. The girih lattice in gold on the primary green, framed, with the trip
 * type set large and where it goes beneath. Not a placeholder image: nothing
 * here claims to be a picture of the trip.
 */
function CoverFallback({ campaign }: { campaign: Campaign }) {
  const { t } = useI18n()
  const route =
    campaign.type === 'hajj'
      ? t('campaign.coverHajj')
      : campaign.services.includes('hotel_madinah')
        ? t('campaign.coverMakkahMadinah')
        : t('campaign.coverMakkah')

  return (
    <div className="girih-gold relative flex size-full flex-col items-center justify-center gap-2.5 bg-nasek-800 px-6 text-center">
      <span className="absolute inset-2.5 rounded-[2px] border border-gold-300/25" aria-hidden />
      <span className="display text-4xl leading-none text-gold-300">
        {t(campaign.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
      </span>
      <Ornament tone="ivory" className="w-36" />
      <span className="text-xs font-medium text-ivory-50/85">{route}</span>
    </div>
  )
}

function TypeBadge({ campaign, className }: { campaign: Campaign; className?: string }) {
  const { t } = useI18n()
  return (
    <Badge tone={campaign.type === 'hajj' ? 'gold' : 'green'} className={className}>
      {t(campaign.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
    </Badge>
  )
}

/** The company's own logo, or its monogram when it has none. Every trip a
 *  company runs draws the same mark — it belongs to the company, not the trip. */
function CompanyLine({ provider, small }: { provider: Provider | undefined; small?: boolean }) {
  const { t, bl } = useI18n()
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <ProviderMark provider={provider} size="sm" className={small ? 'size-8 text-xs' : 'size-9'} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cx('truncate font-bold text-ink-800', small ? 'text-xs' : 'text-sm')}>
            {provider ? bl(provider.name) : ''}
          </p>
          {provider?.verification === 'verified' && (
            <BadgeCheck
              className="size-4 shrink-0 text-nasek-600"
              aria-label={t('common.verified')}
            />
          )}
        </div>
        <p className="mt-0.5 truncate text-2xs text-ink-400">
          {provider ? t('common.experience', { n: provider.experienceYears }) : ''}
        </p>
      </div>
    </div>
  )
}

/** Dates; where it leaves from and how; seats, with the pressure bar under
 *  them — a real decision aid, so it earns its space in both sizes. */
function Facts({ campaign, className }: { campaign: Campaign; className?: string }) {
  const { t, lang, n, dateRange } = useI18n()
  const seatRatio = campaign.seatsAvailable / campaign.seatsTotal
  const soldOut = campaign.seatsAvailable === 0
  const urgent = !soldOut && campaign.seatsAvailable <= 6

  return (
    <div className={className}>
      <dl className="space-y-2 text-sm">
        <Fact icon={<CalendarDays className="size-3.5" />} label={t('common.date')}>
          {dateRange(campaign.departureDate, campaign.returnDate)}
        </Fact>
        <Fact icon={<MapPin className="size-3.5" />} label={t('common.departure')}>
          {wilayahName(campaign.wilayahId, lang)}
          <span className="mx-1.5 text-ivory-400" aria-hidden>
            ·
          </span>
          <span className="inline-flex items-center gap-1 text-ink-500">
            {campaign.travelMethod === 'air' ? (
              <Plane className="size-3.5" aria-hidden />
            ) : (
              <Bus className="size-3.5" aria-hidden />
            )}
            {t(campaign.travelMethod === 'air' ? 'common.air' : 'common.land')}
          </span>
        </Fact>
        <Fact
          icon={<Users className="size-3.5" />}
          label={t('campaign.seatsLabel')}
          tone={soldOut ? 'muted' : urgent ? 'urgent' : 'normal'}
        >
          {soldOut ? t('common.soldOut') : t('common.seatsLeft', { n: campaign.seatsAvailable })}
        </Fact>
      </dl>

      {!soldOut && (
        <div className="mt-2 ps-5.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-ivory-300">
            <div
              className={cx(
                'h-full rounded-full transition-all duration-500',
                urgent ? 'bg-amber-500' : seatRatio < 0.4 ? 'bg-gold-500' : 'bg-nasek-500',
              )}
              style={{ width: `${Math.max(4, (1 - seatRatio) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-2xs text-ink-400">
            {t('campaign.seatsBar', {
              booked: n(campaign.seatsTotal - campaign.seatsAvailable),
              total: n(campaign.seatsTotal),
            })}
          </p>
        </div>
      )}
    </div>
  )
}

function Fact({
  icon,
  label,
  tone = 'normal',
  children,
}: {
  icon: ReactNode
  label: string
  tone?: 'normal' | 'urgent' | 'muted'
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 shrink-0 text-nasek-600/70" aria-hidden>
        {icon}
      </span>
      <dt className="sr-only">{label}</dt>
      <dd
        className={cx(
          'min-w-0 font-medium',
          tone === 'urgent' ? 'text-amber-700' : tone === 'muted' ? 'text-ink-400' : 'text-ink-700',
        )}
      >
        {children}
      </dd>
    </div>
  )
}

function Price({ campaign }: { campaign: Campaign }) {
  const { t, money } = useI18n()
  return (
    <div>
      <p className="nums text-2xl font-bold leading-none text-nasek-700">{money(campaign.price)}</p>
      <p className="mt-1 text-2xs uppercase tracking-[0.1em] text-ink-400">{t('common.perPerson')}</p>
    </div>
  )
}

/** Loading state for the campaigns grid, shaped like the full card. */
export function CampaignCardSkeleton() {
  return (
    <div className="surface flex flex-col overflow-hidden">
      <div className="shimmer aspect-[16/9] border-b border-ivory-300" />
      <div className="flex-1 space-y-3 p-4">
        <div className="flex items-center gap-2.5">
          <div className="shimmer size-9 rounded-[3px]" />
          <div className="flex-1 space-y-2">
            <div className="shimmer h-3 w-32 rounded" />
            <div className="shimmer h-2.5 w-20 rounded" />
          </div>
        </div>
        <div className="shimmer h-5 w-4/5 rounded" />
        <div className="shimmer h-3 w-28 rounded" />
        <div className="shimmer h-3 w-full rounded" />
        <div className="space-y-2 pt-2">
          <div className="shimmer h-3 w-2/3 rounded" />
          <div className="shimmer h-3 w-1/2 rounded" />
          <div className="shimmer h-3 w-2/5 rounded" />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-ivory-300 bg-ivory-50/70 p-4">
        <div className="shimmer h-7 w-24 rounded" />
        <div className="shimmer h-10 w-28 rounded-[3px]" />
      </div>
    </div>
  )
}
