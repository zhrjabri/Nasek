import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Star, X } from 'lucide-react'
import { useI18n } from '@/i18n'

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ')

// ------------------------------------------------------------------ Button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

/* Buttons are ruled blocks, not pills: a hairline border on every variant and
   a square-ish radius, so they sit in the same visual language as the framed
   panels rather than looking like a modern app pasted onto parchment. */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-nasek-800 text-ivory-50 border border-nasek-900 hover:bg-nasek-900 active:bg-nasek-950',
  secondary:
    'bg-ivory-50 text-nasek-800 border border-ivory-400 hover:border-nasek-700 hover:bg-nasek-50',
  outline:
    'bg-transparent text-nasek-800 border border-nasek-700/35 hover:border-nasek-700 hover:bg-nasek-50',
  ghost: 'bg-transparent text-ink-600 border border-transparent hover:bg-ivory-200 hover:text-ink-800',
  gold: 'bg-gold-400 text-nasek-950 border border-gold-500 hover:bg-gold-300',
  danger: 'bg-ivory-50 text-red-800 border border-red-300/70 hover:bg-red-50 hover:border-red-400',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-[3px]',
  md: 'h-11 px-5 text-sm gap-2 rounded-[3px]',
  lg: 'h-12.5 px-8 text-[15px] gap-2.5 rounded-[3px] tracking-[0.02em]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap',
        'transition-all duration-200 ease-out',
        'disabled:opacity-45 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
})

/** Same look as Button, but renders a router link. */
export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
  ...rest
}: {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  className?: string
  children: ReactNode
} & Omit<React.ComponentProps<typeof Link>, 'to' | 'className'>) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap',
        'transition-all duration-200 ease-out',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  )
}

// ----------------------------------------------------------------- Spinner

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ------------------------------------------------------------------- Badge

type BadgeTone = 'green' | 'gold' | 'neutral' | 'red' | 'amber' | 'solid'

const BADGE_TONES: Record<BadgeTone, string> = {
  green: 'bg-nasek-50 text-nasek-700 border-nasek-300/70',
  gold: 'bg-gold-50 text-gold-700 border-gold-300',
  neutral: 'bg-ivory-200 text-ink-600 border-ivory-400/70',
  red: 'bg-red-50 text-red-800 border-red-300/70',
  amber: 'bg-amber-50 text-amber-900 border-amber-300/70',
  solid: 'bg-nasek-800 text-ivory-50 border-nasek-800',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-[2px] border px-2 py-1',
        'text-[10.5px] font-semibold uppercase leading-none tracking-[0.1em]',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * A ruled ornament used to separate major sections — a small rotated square
 * flanked by tapering gold hairlines. It is the printed-book device that
 * carries most of the classical feel between blocks of content.
 */
export function Ornament({
  className,
  tone = 'gold',
}: {
  className?: string
  tone?: 'gold' | 'ivory'
}) {
  const line = tone === 'ivory' ? 'via-gold-300/45' : 'via-gold-400'
  const mark = tone === 'ivory' ? 'border-gold-300/70' : 'border-gold-500'
  return (
    <div className={cx('flex items-center justify-center gap-3', className)} aria-hidden>
      <span className={cx('h-px w-full max-w-24 bg-gradient-to-r from-transparent', line)} />
      <span className="flex items-center gap-1.5">
        <span className={cx('size-1 rotate-45 border', mark)} />
        <span className={cx('size-1.5 rotate-45 border', mark)} />
        <span className={cx('size-1 rotate-45 border', mark)} />
      </span>
      <span className={cx('h-px w-full max-w-24 bg-gradient-to-l from-transparent', line)} />
    </div>
  )
}

// -------------------------------------------------------------------- Card

export function Card({
  className,
  children,
  id,
  as: As = 'div',
}: {
  className?: string
  children: ReactNode
  id?: string
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  return (
    <As id={id} className={cx('surface', className)}>
      {children}
    </As>
  )
}

// ------------------------------------------------------------------ Rating

export function Rating({
  value,
  count,
  size = 'md',
  className,
}: {
  value: number
  count?: number
  size?: 'sm' | 'md'
  className?: string
}) {
  const { t, n } = useI18n()
  const starSize = size === 'sm' ? 'size-3.5' : 'size-4'
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <span className="inline-flex" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            className={cx(
              starSize,
              i < Math.round(value) ? 'fill-gold-400 text-gold-400' : 'text-ivory-400',
            )}
            strokeWidth={1.5}
          />
        ))}
      </span>
      <span className={cx('nums font-semibold text-ink-800', size === 'sm' ? 'text-xs' : 'text-sm')}>
        {n(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      </span>
      {count != null && (
        <span className="text-xs text-ink-400">({n(count)})</span>
      )}
      <span className="sr-only">
        {t('common.rating')} {value} — {count != null ? t('common.reviews', { n: count }) : ''}
      </span>
    </span>
  )
}

// ------------------------------------------------------------------ Fields

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
  className?: string
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-700">
        {label}
        {required && <span className="text-red-600 ms-1" aria-hidden>*</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': !!error })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-400 leading-relaxed">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

const CONTROL =
  'w-full rounded-[3px] border bg-ivory-50 px-3.5 text-sm text-ink-800 placeholder:text-ink-400 ' +
  'transition-colors duration-150 border-ivory-400 hover:border-ink-400/60 ' +
  'focus:border-nasek-700 focus:bg-ivory-50 focus:outline-none focus:ring-1 focus:ring-nasek-700/25 ' +
  'aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-500/20 disabled:bg-ivory-200'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(CONTROL, 'h-11', className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(CONTROL, 'py-2.5 min-h-24 resize-y', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cx(CONTROL, 'h-11 appearance-none pe-9 cursor-pointer', className)}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
          aria-hidden
        />
      </div>
    )
  },
)

export function Checkbox({
  checked,
  onChange,
  label,
  count,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  count?: number
  disabled?: boolean
}) {
  return (
    <label
      className={cx(
        'group flex cursor-pointer items-center gap-2.5 rounded-[3px] py-1.5 px-2 -mx-2',
        'transition-colors hover:bg-ivory-200',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cx(
          'flex size-[17px] shrink-0 items-center justify-center rounded-[2px] border transition-all',
          checked
            ? 'border-nasek-800 bg-nasek-800 text-ivory-50'
            : 'border-ivory-400 bg-ivory-50 group-hover:border-nasek-500',
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3.5} />}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex-1 text-sm text-ink-700">{label}</span>
      {count != null && <span className="nums text-xs text-ink-400">{count}</span>}
    </label>
  )
}

/** Segmented control — used for trip type, travel method, language. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  label,
}: {
  value: T
  onChange: (next: T) => void
  options: { value: T; label: ReactNode }[]
  size?: 'sm' | 'md'
  className?: string
  label?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'inline-flex rounded-[3px] border border-ivory-400 bg-ivory-200 p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cx(
              'flex-1 rounded-[2px] font-semibold transition-all duration-200',
              size === 'sm' ? 'px-3 py-1.5 text-[13px]' : 'px-4 py-2 text-sm',
              active
                ? 'bg-nasek-800 text-ivory-50'
                : 'text-ink-500 hover:text-ink-800',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------- Modal

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-90 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-nasek-950/45 backdrop-blur-sm animate-fade"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'relative w-full overflow-hidden rounded-t-[3px] border border-gold-300 bg-ivory-50 shadow-deep animate-pop',
          'sm:rounded-[3px] focus:outline-none',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-ivory-300 bg-ivory-100 px-5 py-4">
          <h2 className="display text-[19px] text-nasek-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-[3px] p-1.5 text-ink-400 transition-colors hover:bg-ivory-200 hover:text-ink-700"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ States

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('shimmer rounded-[3px]', className)} aria-hidden />
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50/60 px-6 py-14 text-center">
      {icon && (
        <div className="flex size-12 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-ink-800">{title}</h3>
      {body && <p className="max-w-sm text-sm leading-relaxed text-ink-500">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <EmptyState
      title={t('state.errorTitle')}
      body={t('state.errorBody')}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )
      }
    />
  )
}

// ------------------------------------------------------------- Section head

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  action,
  align = 'start',
  className,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
  align?: 'start' | 'center'
  className?: string
}) {
  return (
    <div
      className={cx(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
        className,
      )}
    >
      <div className={cx('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h2 className="display text-[26px] text-nasek-900 sm:text-[34px]">{title}</h2>
        <div
          className={cx(
            'rule-gold mt-3.5 w-16',
            align === 'center' && 'mx-auto',
          )}
          aria-hidden
        />
        {subtitle && (
          <p className="mt-3.5 text-[15px] leading-relaxed text-ink-500">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// --------------------------------------------------------------- Progress

export function ProgressBar({
  value,
  max = 100,
  tone = 'green',
  className,
  label,
}: {
  value: number
  max?: number
  tone?: 'green' | 'gold' | 'amber'
  className?: string
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const fill =
    tone === 'gold' ? 'bg-gold-400' : tone === 'amber' ? 'bg-amber-500' : 'bg-nasek-600'
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cx('h-1.5 w-full overflow-hidden rounded-full bg-ivory-300', className)}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-500 ease-out', fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Circular score ring used by Smart Match. */
export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const { n } = useI18n()
  const stroke = size >= 60 ? 5 : 4
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - score / 100)
  const tone = score >= 85 ? '#23765e' : score >= 70 ? '#c9a961' : '#8d9189'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f4f1e8" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span
        className="nums absolute inset-0 flex items-center justify-center font-bold text-ink-900"
        style={{ fontSize: size / 3.6 }}
      >
        {n(score)}
        <span className="text-[0.6em] font-semibold text-ink-400">%</span>
      </span>
    </div>
  )
}
