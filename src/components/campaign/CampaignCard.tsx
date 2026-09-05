import { Link } from 'react-router-dom'
import {
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  MapPin,
  Plane,
  Bus,
  Users,
} from 'lucide-react'
import type { Campaign } from '@/types'
import { useI18n } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { serviceLabel } from '@/data/services'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { campaignImageUrl } from '@/services/storage/campaignImages'
import { useToggleSaved } from '@/hooks/useToggleSaved'
import { tripDays } from '@/lib/trip'
import { Badge, Rating, cx } from '@/components/ui'

export function CampaignCard({
  campaign,
  compact = false,
}: {
  campaign: Campaign
  compact?: boolean
}) {
  const { t, lang, bl, money, n, dateRange } = useI18n()
  const { isSaved } = useStore()
  const toggleSave = useToggleSaved()
  const { getProvider } = useCatalogue()

  const provider = getProvider(campaign.providerId)
  const saved = isSaved(campaign.id)
  const days = tripDays(campaign)

  const seatRatio = campaign.seatsAvailable / campaign.seatsTotal
  const urgent = campaign.seatsAvailable > 0 && campaign.seatsAvailable <= 6
  const soldOut = campaign.seatsAvailable === 0

  return (
    <article
      className={cx(
        'surface group relative flex flex-col overflow-hidden transition-all duration-300',
        'hover:border-gold-300 hover:shadow-lift',
      )}
    >
      {/*
        The cover photograph, where the owner uploaded one.

        Above the existing header band rather than replacing it: the company
        strip — monogram, name, verified tick — is what makes this card a NASEK
        card, and swapping it for a picture would be a redesign rather than a
        new field. Cards with no image look exactly as they always have, which
        is most of them for a while yet.

        `compact` cards are the ones in sidebars and "similar trips" rows, where
        the whole card is a couple of hundred pixels tall; a picture there would
        crowd out the facts somebody is actually comparing.
      */}
      {!compact && campaign.images.length > 0 && (
        <Link
          to={`/campaigns/${campaign.id}`}
          className="block overflow-hidden border-b border-ivory-300"
          tabIndex={-1}
          aria-hidden
        >
          <img
            src={campaignImageUrl(campaign.images[0])}
            alt=""
            loading="lazy"
            className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </Link>
      )}

      {/* ------------------------------------------------------- header band */}
      <div className="girih relative flex items-start gap-3 border-b border-ivory-300 bg-ivory-100/70 p-4">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-[2px] text-lg font-bold text-ivory-50"
          style={{ background: provider?.brandColor ?? '#244a3f' }}
          aria-hidden
        >
          {provider?.initials ?? '؟'}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-ink-800">
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

        <Badge tone={campaign.type === 'hajj' ? 'gold' : 'green'} className="shrink-0">
          {t(campaign.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
        </Badge>
      </div>

      {/* ------------------------------------------------------------- body */}
      <div className="flex flex-1 flex-col p-4">
        <Link to={`/campaigns/${campaign.id}`} className="rounded-[2px]">
          <h3 className="display line-clamp-2 text-xl text-nasek-900 transition-colors group-hover:text-nasek-600">
            {bl(campaign.title)}
          </h3>
        </Link>

        <div className="mt-2 flex items-center gap-3">
          <Rating value={campaign.rating} count={campaign.reviewCount} size="sm" />
        </div>

        {!compact && (
          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-ink-500">
            {bl(campaign.description)}
          </p>
        )}

        {/* facts grid */}
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
          <Fact
            icon={<MapPin className="size-3.5" />}
            label={t('common.departure')}
            value={wilayahName(campaign.wilayahId, lang)}
          />
          <Fact
            icon={campaign.travelMethod === 'air' ? <Plane className="size-3.5" /> : <Bus className="size-3.5" />}
            label={t('filters.travelMethod')}
            value={t(campaign.travelMethod === 'air' ? 'common.air' : 'common.land')}
          />
          <Fact
            icon={<CalendarDays className="size-3.5" />}
            label={t('common.date')}
            value={dateRange(campaign.departureDate, campaign.returnDate)}
            wide
          />
          <Fact
            icon={<Users className="size-3.5" />}
            label={t('campaign.duration', { n: days })}
            value={
              soldOut
                ? t('common.soldOut')
                : t('common.seatsLeft', { n: campaign.seatsAvailable })
            }
            tone={soldOut ? 'muted' : urgent ? 'urgent' : 'normal'}
            wide
          />
        </dl>

        {/* seat pressure bar — a real decision aid, so it earns its space */}
        {!soldOut && (
          <div className="mt-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-ivory-300">
              <div
                className={cx(
                  'h-full rounded-full transition-all duration-500',
                  urgent ? 'bg-amber-500' : seatRatio < 0.4 ? 'bg-gold-500' : 'bg-nasek-500',
                )}
                style={{ width: `${Math.max(4, (1 - seatRatio) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-2xs text-ink-400">
              {t('campaign.seatsBar', {
                booked: n(campaign.seatsTotal - campaign.seatsAvailable),
                total: n(campaign.seatsTotal),
              })}
            </p>
          </div>
        )}

        {/* services */}
        {!compact && (
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
        )}
      </div>

      {/* ------------------------------------------------------------ footer */}
      <div className="flex items-end justify-between gap-3 border-t border-ivory-300 bg-ivory-100/70 p-4">
        <div>
          <p className="nums text-2xl font-bold leading-none text-nasek-700">
            {money(campaign.price)}
          </p>
          <p className="mt-1 text-2xs uppercase tracking-[0.1em] text-ink-400">
            {t('common.perPerson')}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton
            active={saved}
            onClick={() => toggleSave(campaign.id)}
            label={saved ? t('common.saved') : t('common.save')}
          >
            {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
          </IconButton>
          <Link
            to={`/campaigns/${campaign.id}`}
            className="rounded-[3px] border border-nasek-900 bg-nasek-800 px-3.5 py-2 text-sm font-semibold text-ivory-50 transition-colors hover:bg-nasek-900"
          >
            {t('common.viewDetails')}
          </Link>
        </div>
      </div>
    </article>
  )
}

function Fact({
  icon,
  label,
  value,
  wide,
  tone = 'normal',
}: {
  icon: React.ReactNode
  label: string
  value: string
  wide?: boolean
  tone?: 'normal' | 'urgent' | 'muted'
}) {
  return (
    <div className={cx('flex items-start gap-2', wide && 'col-span-2')}>
      <span className="mt-0.5 shrink-0 text-nasek-600/70" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="sr-only">{label}</dt>
        <dd
          className={cx(
            'truncate font-medium',
            tone === 'urgent'
              ? 'text-amber-700'
              : tone === 'muted'
                ? 'text-ink-400'
                : 'text-ink-700',
          )}
        >
          {value}
        </dd>
      </div>
    </div>
  )
}

function IconButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cx(
        'rounded-[3px] border p-2 transition-all duration-200',
        active
          ? 'border-nasek-900 bg-nasek-800 text-ivory-50'
          : 'border-ivory-400 bg-ivory-50 text-ink-500 hover:border-nasek-600 hover:text-nasek-700',
      )}
    >
      {children}
    </button>
  )
}

export function CampaignCardSkeleton() {
  return (
    <div className="surface flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-ivory-300 bg-ivory-100/60 p-4">
        <div className="shimmer size-11 rounded-[3px]" />
        <div className="flex-1 space-y-2">
          <div className="shimmer h-3 w-32 rounded" />
          <div className="shimmer h-2.5 w-20 rounded" />
        </div>
      </div>
      <div className="flex-1 space-y-3 p-4">
        <div className="shimmer h-5 w-4/5 rounded" />
        <div className="shimmer h-3 w-28 rounded" />
        <div className="shimmer h-3 w-full rounded" />
        <div className="shimmer h-3 w-2/3 rounded" />
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="shimmer h-3 rounded" />
          <div className="shimmer h-3 rounded" />
          <div className="shimmer col-span-2 h-3 rounded" />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-ivory-300 bg-ivory-50/70 p-4">
        <div className="shimmer h-7 w-24 rounded" />
        <div className="shimmer h-9 w-28 rounded-[3px]" />
      </div>
    </div>
  )
}
