import { useI18n } from '@/i18n'
import { cx } from '@/components/ui'

import markDark from '@/assets/brand/nasek-logo.png'
import markLight from '@/assets/brand/nasek-logo-light.png'
import markGold from '@/assets/brand/nasek-logo-gold.png'

/**
 * The official NASEK mark — the vertical calligraphic "ناسِك" ligature.
 *
 * Supplied as a white-plated PNG; the build assets in `public/` are the same
 * artwork with the plate removed and the edges un-matted, plus ivory and gold
 * recolourings so the mark can sit on parchment or on the deep green ground
 * without a visible box around it.
 */
const SOURCES = {
  green: markDark,
  ivory: markLight,
  gold: markGold,
} as const

export type MarkTone = keyof typeof SOURCES

export function LogoMark({
  className,
  tone = 'green',
}: {
  className?: string
  tone?: MarkTone
}) {
  return (
    <img
      src={SOURCES[tone]}
      alt=""
      aria-hidden
      draggable={false}
      className={cx('select-none object-contain', className)}
    />
  )
}

export function Logo({
  className,
  tone = 'green',
  showWordmark = true,
  size = 'md',
}: {
  className?: string
  tone?: 'green' | 'ivory'
  showWordmark?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const { lang, t } = useI18n()

  const markSize = size === 'sm' ? 'h-8' : size === 'lg' ? 'h-16' : 'h-11'
  const textSize = size === 'sm' ? 'text-[19px]' : size === 'lg' ? 'text-[32px]' : 'text-[24px]'
  const onDark = tone === 'ivory'

  return (
    <span className={cx('inline-flex items-center gap-3', className)}>
      <LogoMark className={cx(markSize, 'w-auto')} tone={onDark ? 'ivory' : 'green'} />

      {showWordmark && (
        <span className="flex flex-col justify-center leading-none">
          <span
            className={cx(
              textSize,
              'font-bold',
              lang === 'ar'
                ? 'font-[family-name:var(--font-ar)]'
                : 'font-[family-name:var(--font-display)] tracking-[0.06em]',
              onDark ? 'text-ivory-50' : 'text-nasek-700',
            )}
          >
            {t('common.appName')}
          </span>

          {size !== 'sm' && (
            <>
              <span
                className={cx(
                  'mt-1.5 h-px w-full',
                  onDark ? 'bg-gold-400/40' : 'bg-gold-400/50',
                )}
              />
              <span
                className={cx(
                  'mt-1.5 text-[9px] font-semibold uppercase tracking-[0.3em]',
                  onDark ? 'text-gold-300/75' : 'text-gold-600/80',
                )}
              >
                {lang === 'ar' ? 'NASEK' : 'ناسِك'}
              </span>
            </>
          )}
        </span>
      )}

      <span className="sr-only">NASEK — ناسِك</span>
    </span>
  )
}
