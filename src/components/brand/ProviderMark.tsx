import { useState } from 'react'
import type { Provider } from '@/types'
import { providerLogoUrl } from '@/services/storage/providerLogo'
import { cx } from '@/components/ui'

/**
 * How a company is shown wherever it is shown: its logo, or its monogram.
 *
 * One component so the decision is made once. Before this, four screens each
 * drew `provider.initials` on a coloured square inline, which was fine while a
 * monogram was the only thing there was — and would have become four places to
 * remember to add a logo to, three of which somebody would eventually miss.
 *
 * THE FALLBACK IS NOT AN IMAGE
 *
 * A company with no logo gets the monogram it has always had: its initials on
 * its own brand colour. Not a grey placeholder, not a stock building icon, and
 * certainly not a stand-in logo — a logo is a claim about who somebody is, and
 * inventing one is worse than showing initials. A path whose object has since
 * been deleted takes the same route, so a stale reference degrades to the
 * monogram rather than to a broken-image glyph on every card the company runs.
 *
 * NOT DISTORTED
 *
 * `object-contain` inside a square, so a wide wordmark and a tall crest both
 * keep their proportions and neither is cropped. The ground stays neutral
 * rather than the brand colour: a logo with its own white background sitting on
 * a dark green square looks like a mistake, and the colour belongs to the
 * monogram alone.
 */

const BOX = {
  sm: 'size-9 text-sm',
  md: 'size-12 text-lg',
  lg: 'size-16 text-2xl',
} as const

export type ProviderMarkSize = keyof typeof BOX

export function ProviderMark({
  provider,
  size = 'md',
  className,
}: {
  provider: Pick<Provider, 'name' | 'initials' | 'brandColor' | 'logoPath'> | undefined
  size?: ProviderMarkSize
  className?: string
}) {
  /*
   * A logo that failed to load is a logo this company does not have.
   *
   * State rather than DOM poking: the fallback has to survive a re-render, and
   * an `onError` that hides a node imperatively is undone the next time React
   * touches the tree.
   */
  const [broken, setBroken] = useState(false)

  const url = provider?.logoPath ? providerLogoUrl(provider.logoPath) : ''
  if (!url || broken) {
    return <ProviderMonogram provider={provider} size={size} className={className} />
  }

  return (
    <img
      src={url}
      /*
       * Named, not decorative.
       *
       * On a campaign card this image is often the only thing identifying who
       * runs the trip, so a screen reader has to be able to say the company's
       * name. `alt=""` would be right only if the name were already beside it
       * in text on every surface, and it is not.
       */
      alt={provider ? provider.name.en || provider.name.ar : ''}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={cx(
        'shrink-0 rounded-[3px] border border-ivory-300 bg-ivory-50 object-contain p-1',
        BOX[size],
        className,
      )}
    />
  )
}

/** The initials treatment on its own — the fallback, and what a caller wants
 *  when it needs the company's colour rather than its logo. */
export function ProviderMonogram({
  provider,
  size = 'md',
  className,
}: {
  provider: Pick<Provider, 'initials' | 'brandColor'> | undefined
  size?: ProviderMarkSize
  className?: string
}) {
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center rounded-[3px] font-bold text-white',
        BOX[size],
        className,
      )}
      style={{ background: provider?.brandColor ?? '#1c5e4c' }}
      aria-hidden
    >
      {provider?.initials ?? '—'}
    </span>
  )
}
