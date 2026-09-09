import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgeCheck } from 'lucide-react'
import type { Campaign } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { tripDays } from '@/lib/trip'
import { useCatalogue } from '@/hooks/useCatalogue'
import { Rating, cx } from '@/components/ui'

/**
 * The home page's campaigns, as an index rather than a grid of cards.
 *
 * A card is the right shape on `/campaigns`, where somebody is comparing forty
 * trips and scanning by photograph and badge. It is the wrong shape here: four
 * cards on the home page are four boxes competing for the same attention, and
 * they say the same four things at four different heights.
 *
 * A row says them on one baseline — name, operator and wilayah, length,
 * rating, price — in the order a pilgrim actually reads them, and stacks that
 * order down the page instead of across it. The only decoration is the rule
 * between rows and the gold one that draws under whichever row is under the
 * cursor.
 *
 * The card component is untouched and still used everywhere else.
 */
export function CampaignIndex({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <ol className="mt-8 border-t border-ivory-300">
      {campaigns.map((campaign, i) => (
        <li key={campaign.id}>
          <CampaignRow campaign={campaign} index={i + 1} />
        </li>
      ))}
    </ol>
  )
}

function CampaignRow({ campaign, index }: { campaign: Campaign; index: number }) {
  const { t, lang, bl, money, isRtl } = useI18n()
  const { getProvider } = useCatalogue()

  const provider = getProvider(campaign.providerId)
  const wilayah = WILAYAT.find((w) => w.id === campaign.wilayahId)
  const days = tripDays(campaign)
  const soldOut = campaign.seatsAvailable === 0
  const urgent = !soldOut && campaign.seatsAvailable <= 6
  const Arrow = isRtl ? ArrowLeft : ArrowRight

  return (
    <Link
      to={`/campaigns/${campaign.id}`}
      className={cx(
        'group relative grid grid-cols-[2rem_1fr_auto] items-center gap-x-4 gap-y-1 border-b border-ivory-200 py-5',
        'transition-colors duration-300 ease-out-soft hover:bg-ivory-50',
        // The columns only separate out once there is width for them to mean
        // something. Below that, length and rating fold under the title, which
        // is where a phone reads them anyway.
        'lg:grid-cols-[2.5rem_2.1fr_1fr_auto_auto_1.5rem] lg:gap-x-6 lg:px-3',
      )}
    >
      {/* The gold rule that draws under the row. It replaces the border rather
          than sitting beside it, so nothing moves when it appears. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-px h-px w-0 bg-gold-400 transition-[width] duration-300 ease-out-soft group-hover:w-full"
      />

      <span className="nums self-start pt-1 text-xs font-bold text-gold-300 transition-colors duration-300 group-hover:text-gold-500 lg:self-center lg:pt-0">
        {String(index).padStart(2, '0')}
      </span>

      <span className="min-w-0">
        <span className="display-j block text-xl text-nasek-900 sm:text-2xl">
          {bl(campaign.title)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            {bl(provider?.name)}
            {provider?.verification === 'verified' && (
              <BadgeCheck
                className="size-3.5 shrink-0 text-gold-600"
                strokeWidth={2}
                aria-label={t('common.verified')}
              />
            )}
          </span>
          <span aria-hidden className="text-ivory-400">
            ·
          </span>
          <span>{wilayah?.name[lang]}</span>
          {/* Length and rating live here below 1024px, and in their own
              columns above it — one set of facts, never two copies of it. */}
          <span aria-hidden className="text-ivory-400 lg:hidden">
            ·
          </span>
          <span className="lg:hidden">{t('campaign.duration', { n: days })}</span>
          {urgent && (
            <span className="inline-flex items-center gap-1.5 text-gold-700">
              <span aria-hidden className="size-1 rounded-full bg-gold-400" />
              {t('common.seatsLeft', { n: campaign.seatsAvailable })}
            </span>
          )}
          {soldOut && <span className="text-ink-500">{t('common.soldOut')}</span>}
        </span>
      </span>

      <span className="hidden text-sm text-ink-500 lg:block">
        {t('campaign.duration', { n: days })}
      </span>

      {/* The site's own rating control, which carries the screen-reader text
          with it — a bare number and a star would say "4.8" and nothing else. */}
      <Rating
        value={campaign.rating}
        count={campaign.reviewCount}
        size="sm"
        className="hidden lg:inline-flex"
      />

      <span className="text-end">
        <span className="nums display-j block text-xl text-nasek-700">
          {money(campaign.price)}
        </span>
        <span className="mt-0.5 block text-2xs tracking-wide text-ink-400">
          {t('common.perPerson')}
        </span>
      </span>

      <Arrow
        aria-hidden
        className="hidden size-4 text-gold-600 opacity-0 transition-all duration-300 ease-out-soft group-hover:opacity-100 lg:block rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1"
        strokeWidth={2}
      />
    </Link>
  )
}

/** What the index looks like while the catalogue is still being read. */
export function CampaignIndexSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="mt-8 border-t border-ivory-300" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 border-b border-ivory-200 py-5"
        >
          <span className="shimmer block h-3 w-5 rounded-[2px]" />
          <span className="block">
            <span className="shimmer block h-5 w-3/5 rounded-[2px]" />
            <span className="shimmer mt-2 block h-3 w-2/5 rounded-[2px]" />
          </span>
          <span className="shimmer block h-6 w-20 rounded-[2px]" />
        </li>
      ))}
    </ul>
  )
}
