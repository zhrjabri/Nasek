import { Search } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { Card, Input, Segmented, cx } from '@/components/ui'

/**
 * Pieces every tab of the administration dashboard shares.
 *
 * Kept together so the tabs look and behave alike: an admin who learns how
 * the campaign list filters should not have to learn the booking list from
 * scratch.
 */

export function Kpi({
  label,
  value,
  icon,
  hint,
  highlight,
  tone,
}: {
  label: string
  value: string
  icon: React.ReactNode
  hint?: string
  highlight?: boolean
  /** Draws attention to a number that means work is waiting. */
  tone?: 'alert'
}) {
  return (
    <li>
      <Card
        className={cx(
          'h-full p-5',
          highlight && 'border-nasek-200 bg-nasek-50/60',
          tone === 'alert' && 'border-amber-300 bg-amber-50/60',
        )}
      >
        <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-ink-400">
          <span className={tone === 'alert' ? 'text-amber-600' : 'text-nasek-600'}>{icon}</span>
          {label}
        </div>
        <p className="nums mt-2.5 text-4xl font-bold leading-none text-ink-900">{value}</p>
        {hint && <p className="mt-2 text-2xs leading-snug text-ink-400">{hint}</p>}
      </Card>
    </li>
  )
}

/**
 * The search box and filter row that sits above every list.
 *
 * The count is deliberately always shown, even when nothing is filtered: an
 * admin acting on a list should be able to see at a glance whether they are
 * looking at all of it or a slice.
 */
export function Toolbar<T extends string>({
  query,
  onQuery,
  placeholder,
  filter,
  onFilter,
  options,
  filterLabel,
  count,
}: {
  query: string
  onQuery: (next: string) => void
  placeholder: string
  filter: T
  onFilter: (next: T) => void
  options: { value: T; label: string }[]
  filterLabel: string
  count: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="ps-9"
          />
        </div>
        <Segmented<T>
          size="sm"
          value={filter}
          onChange={onFilter}
          label={filterLabel}
          options={options.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>
      <p className="nums text-xs text-ink-400">{count}</p>
    </div>
  )
}

/** A labelled value inside a detail dialog. */
export function DetailRow({
  label,
  value,
  ltr,
  wide,
}: {
  label: string
  value: React.ReactNode
  ltr?: boolean
  wide?: boolean
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">{label}</dt>
      <dd
        className={cx('mt-1 break-words text-sm text-ink-800', ltr && 'nums')}
        dir={ltr ? 'ltr' : undefined}
      >
        {value}
      </dd>
    </div>
  )
}

/** The wrapper every data table shares — one place to fix scrolling on a phone. */
export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[3px] border border-ivory-300 bg-ivory-50">
      {children}
    </div>
  )
}

export function Th({ children, end }: { children: React.ReactNode; end?: boolean }) {
  return (
    <th scope="col" className={cx('p-3.5', end ? 'text-end' : 'text-start')}>
      {children}
    </th>
  )
}

export function HeadRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-ivory-300 bg-ivory-100 text-2xs font-bold uppercase tracking-wider text-ink-500">
      {children}
    </tr>
  )
}

export function BodyRow({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <tr
      className={cx(
        'border-b border-ivory-300 last:border-0 even:bg-ivory-50/50',
        dim && 'opacity-55',
      )}
    >
      {children}
    </tr>
  )
}

/** A small square action button, used where a full labelled button is too loud. */
export function IconAction({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        'rounded-[3px] border border-ivory-300 p-2 text-ink-400 transition-colors',
        danger
          ? 'hover:border-red-300 hover:bg-red-50 hover:text-red-600'
          : 'hover:border-nasek-400 hover:bg-nasek-50 hover:text-nasek-700',
      )}
    >
      {icon}
    </button>
  )
}

/** Formats "showing 12 of 40" without either language needing its own branch. */
export function useCountLabel() {
  const { t, n } = useI18n()
  return (shown: number, total: number, key: MessageKey = 'admin.showingOf') =>
    t(key, { shown: n(shown), total: n(total) })
}
