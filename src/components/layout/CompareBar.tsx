import { useLocation } from 'react-router-dom'
import { Scale, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { MAX_COMPARE, useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { LinkButton } from '@/components/ui'

/**
 * Persistent comparison tray.
 *
 * It follows the user across pages, because the moment someone adds a second
 * campaign they are in comparison mode — making them navigate to find the
 * comparison would break that thread.
 */
export function CompareBar() {
  const { t, bl, money } = useI18n()
  const { compareIds, dispatch } = useStore()
  const { getCampaign } = useCatalogue()
  const location = useLocation()

  // The tray would be redundant on the comparison page itself.
  if (compareIds.length === 0 || location.pathname === '/compare') return null

  const campaigns = compareIds.map(getCampaign).filter(Boolean)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-60 px-4 pb-4 sm:pb-6">
      <div className="pointer-events-auto mx-auto flex max-w-4xl flex-col gap-3 rounded-[3px] border border-nasek-800/20 bg-nasek-950/95 p-3 shadow-deep backdrop-blur-xl sm:flex-row sm:items-center sm:gap-4 sm:ps-5 animate-rise">
        <div className="flex items-center gap-2 text-ivory-100">
          <Scale className="size-[18px] text-gold-400" />
          <span className="text-sm font-semibold">
            {t('compare.bar', { n: compareIds.length })}
          </span>
          <span className="nums text-xs text-ivory-200/40">/ {MAX_COMPARE}</span>
        </div>

        <ul className="flex flex-1 flex-wrap items-center gap-2">
          {campaigns.map((c) => (
            <li
              key={c!.id}
              className="flex items-center gap-2 rounded-[3px] bg-ivory-50/10 py-1.5 ps-3 pe-1.5"
            >
              <span className="max-w-40 truncate text-[13px] font-medium text-ivory-100">
                {bl(c!.title)}
              </span>
              <span className="nums text-[11px] font-semibold text-gold-300">
                {money(c!.price)}
              </span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'toggleCompare', id: c!.id })}
                aria-label={`${t('common.remove')} — ${bl(c!.title)}`}
                className="rounded-md p-1 text-ivory-200/50 transition-colors hover:bg-ivory-50/10 hover:text-ivory-50"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'clearCompare' })}
            className="rounded-[3px] px-3 py-2 text-[13px] font-semibold text-ivory-200/60 transition-colors hover:text-ivory-50"
          >
            {t('common.clear')}
          </button>
          <LinkButton to="/compare" variant="gold" size="sm">
            {t('compare.open')}
          </LinkButton>
        </div>
      </div>
    </div>
  )
}
