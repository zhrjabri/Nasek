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
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Info,
  Star,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useI18n } from '@/i18n'

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ')

// ------------------------------------------------------------------ Button

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'hairline'
  | 'hairlineDark'
  | 'ghost'
  | 'gold'
  | 'approve'
  | 'danger'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

/*
 * SIX TIERS, THREE APPLICATIONS.
 *
 * Buttons are ruled blocks, not pills: a hairline border on every variant and
 * a square-ish radius, so they sit in the same visual language as the framed
 * panels rather than looking like a modern app pasted onto parchment. The one
 * round thing in the system is the icon tier, and that is a seal rather than
 * a pill.
 *
 *   1 primary     filled green, gold rule inset along the bottom
 *   2 secondary   a frame; `hairline` is the same frame in gold, for the
 *                 customer site where warmth is wanted
 *   3 tertiary    not here — see `RuleLink` and `RuleButton` below
 *   4 icon        not here — see `IconButton`
 *   5 danger      red hairline that fills only on hover
 *   6 approve     gold, so yes and no are separable across a table
 *
 * No two tiers share a weight. That is the whole point: the audit that
 * produced this found `حذف الحملة` and `اعتماد ونشر` rendering identically,
 * `رفض` drawn two different ways, and suspend, restore and unverify — three
 * different consequences — sharing one look.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  /*
   * Tier one, and it carries the sign-in control's gold rule inside its own
   * bottom edge — the same gesture drawn under a filled block instead of
   * under bare text. That single detail is what ties the filled tier to the
   * chromeless one. The rule reaches wider on hover rather than changing
   * colour, so a filled button and a ruled link animate the same way.
   */
  primary:
    'relative bg-nasek-800 text-ivory-50 border border-nasek-900 hover:bg-nasek-900 active:bg-nasek-950 ' +
    "after:content-[''] after:absolute after:bottom-1.5 after:inset-x-3.5 after:h-px " +
    'after:bg-gold-400 after:opacity-85 after:transition-all after:duration-300 after:ease-out-soft ' +
    'hover:after:inset-x-2.5 hover:after:opacity-100',
  /* A frame, not a fill — the white ground it used to carry made it read as a
     second filled tier on a parchment page. */
  secondary:
    'bg-transparent text-nasek-800 border border-ivory-400 hover:border-nasek-700 hover:bg-nasek-50',
  /* The same frame in gold, for the customer site. Gold at 60% so it reads as
     a drawn line rather than a border the browser happened to put there. */
  hairline:
    'bg-transparent text-nasek-800 border border-gold-300/60 hover:border-gold-400 hover:bg-nasek-50',
  /*
   * The same frame over the hero photograph, and a separate variant rather
   * than `hairline` plus a `text-ivory-50` override, because that override
   * silently loses: Tailwind orders two text-colour utilities by its own
   * scale, not by the order they appear in the class attribute, so the
   * variant's `text-nasek-800` won and the hero shipped dark green text on a
   * dark photograph. A variant cannot lose to itself.
   *
   * Gold-300 rather than gold-400 — the darker gold does not survive a bright
   * sky at hairline weight.
   */
  hairlineDark:
    'bg-transparent text-ivory-50 border border-gold-300/75 backdrop-blur-sm ' +
    'hover:border-gold-300 hover:bg-ivory-50/12',
  ghost: 'bg-transparent text-ink-600 border border-transparent hover:bg-ivory-200 hover:text-ink-800',
  /* The brand's one moment, spent on the hero and nowhere else on the
     customer site. In the two operator applications gold means `approve`. */
  gold: 'bg-gold-400 text-nasek-950 border border-gold-500 hover:bg-gold-300',
  /*
   * Tier six. Approving is the affirming act in both operator applications,
   * and gold is already NASEK's mark of endorsement — which also means
   * اعتماد and رفض no longer read as "important" and "unimportant" the way a
   * primary/secondary pairing made them.
   */
  approve: 'bg-gold-400 text-nasek-950 border border-gold-500 hover:bg-gold-300 active:bg-gold-500',
  /*
   * Tier five. Obvious, never aggressive: a red hairline over the page's own
   * ground that fills only on hover, so a table of destructive row actions
   * does not become a wall of red blocks. Uses the semantic tokens in
   * `index.css` rather than Tailwind's raw red ramp, which is what three
   * different spellings of "this is dangerous" grew out of.
   */
  danger:
    'bg-transparent text-danger-fg border border-danger-border ' +
    'hover:bg-danger-surface hover:border-danger-fg/45',
}

/*
 * Heights, not paddings, so a row of buttons lines up whatever is inside them.
 *
 * `sm` was 36px and is now 40. WCAG 2.2 asks for 24px on the web and Apple asks
 * for 44 on touch; 40 with the 8px gaps used around it clears the first
 * comfortably and comes close enough to the second that the small variant can
 * still sit in a dense table row without turning it into a list.
 */
const SIZES: Record<ButtonSize, string> = {
  /*
   * 36px, and the administration's working size. It goes inside table rows
   * carrying four actions, where 40 turns every row into two lines. Below the
   * 44px Apple asks for, which is why it is confined to pointer-driven
   * operator screens and never used on the customer site.
   */
  xs: 'h-9 px-3 text-sm gap-1.5 rounded-[3px]',
  sm: 'h-10 px-3.5 text-sm gap-1.5 rounded-[3px]',
  md: 'h-11 px-5 text-sm gap-2 rounded-[3px]',
  /*
   * 50px, and now reserved for the one place a full-width target is right:
   * the sign-in and one-time-code submits, where the button is the only thing
   * on the screen. Everywhere else it made a page of slabs.
   */
  lg: 'h-12.5 px-8 text-md gap-2.5 rounded-[3px] tracking-[0.02em]',
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
      // Disabling alone tells a screen reader the control is unavailable, not
      // that it is working — and the two call for very different reactions.
      aria-busy={loading || undefined}
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

/** Shared by `RuleLink`, `RuleAnchor` and `RuleButton` — tier three, drawn once. */
const RULE_BASE =
  'group relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap ' +
  'rounded-[3px] px-1 text-sm font-semibold transition-colors duration-200 ease-out-soft ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2'

const ruleTone = (onDark?: boolean) =>
  onDark
    ? 'text-ivory-50/90 hover:text-ivory-50 focus-visible:outline-gold-300'
    : 'text-ink-700 hover:text-nasek-800 focus-visible:outline-nasek-800'

/**
 * The gold rule itself: 38% of the control at rest, full width on hover.
 *
 * The `@media (hover: none)` rule is not a flourish. Tailwind wraps every
 * `group-hover:` rule in `@media (hover: hover)`, so on a phone the growing
 * rule never fires at all — and a control whose only affordance is a hover
 * state has no affordance on a touch screen.
 */
function RuleMark({ onDark }: { onDark?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute start-1 bottom-2 h-px w-[38%]',
        'transition-[width] duration-300 ease-out-soft',
        'group-hover:w-[calc(100%-0.5rem)]',
        '[@media(hover:none)]:w-[calc(100%-0.5rem)]',
        onDark ? 'bg-gold-300' : 'bg-gold-400',
      )}
    />
  )
}

/** The arrow points the way the reader is travelling, which is the opposite
 *  edge in each language. Written per language rather than as an `rtl:`
 *  variant: the glyph is already flipped by `rtl:rotate-180`, and a translate
 *  composes with that rotation in the parent's axes, not the glyph's. */
function RuleArrow({ lang }: { lang: string }) {
  return (
    <ArrowRight
      className={cx(
        'size-3.5 transition-transform duration-300 ease-out-soft rtl:rotate-180',
        lang === 'ar' ? 'group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5',
      )}
      strokeWidth={2}
    />
  )
}

/**
 * Tier three as a router link: onward navigation, not a decision.
 *
 * This deliberately duplicates the navbar's `SignInLink` rather than sharing
 * with it. That control is finished and frozen; extracting it would mean
 * editing it, and a refactor that "cannot change the pixels" is exactly the
 * claim that turns out to be wrong on the one screen nobody re-checked.
 */
export function RuleLink({
  to,
  children,
  className,
  onDark,
}: {
  to: string
  children: ReactNode
  className?: string
  onDark?: boolean
}) {
  const { lang } = useI18n()
  return (
    <Link to={to} className={cx(RULE_BASE, ruleTone(onDark), className)}>
      {/* Kufi carries line-height 1.95 from the base layer — right for running
          Arabic, and enough to push a label off centre in a 40px control. */}
      <span className="leading-none">{children}</span>
      <RuleArrow lang={lang} />
      <RuleMark onDark={onDark} />
    </Link>
  )
}

/**
 * Tier three as an ordinary anchor: somewhere that is not this application.
 *
 * `RuleLink` above is a router link, and a router link is a promise that the
 * destination is a route in the application drawing it. The owner portal has
 * no router at all and the administration dashboard's routes are its own, so
 * both need a way to say "the public site" that is a plain `href` and not a
 * navigation this application is expected to service.
 *
 * Same three parts and the same pixels as `RuleLink` — the shared `RULE_BASE`,
 * the arrow and the gold rule — because it is the same tier: an onward link,
 * not a decision. What differs is only where it goes.
 */
export function RuleAnchor({
  href,
  children,
  className,
  onDark,
  newTab,
}: {
  href: string
  children: ReactNode
  className?: string
  onDark?: boolean
  /** `rel` is set with it, so an opened tab cannot reach back through `opener`. */
  newTab?: boolean
}) {
  const { lang } = useI18n()
  return (
    <a
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noreferrer noopener' : undefined}
      className={cx(RULE_BASE, ruleTone(onDark), className)}
    >
      <span className="leading-none">{children}</span>
      <RuleArrow lang={lang} />
      <RuleMark onDark={onDark} />
    </a>
  )
}

/** Tier three for the cases that run a handler rather than navigate. */
export function RuleButton({
  onClick,
  children,
  className,
  onDark,
  type = 'button',
  disabled,
}: {
  onClick?: () => void
  children: ReactNode
  className?: string
  onDark?: boolean
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const { lang } = useI18n()
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(RULE_BASE, ruleTone(onDark), 'disabled:pointer-events-none disabled:opacity-45', className)}
    >
      <span className="leading-none">{children}</span>
      <RuleArrow lang={lang} />
      <RuleMark onDark={onDark} />
    </button>
  )
}

/**
 * Tier four: no room for a word.
 *
 * A ring rather than a square — the icon tier is the one place this system
 * can be round without arguing with the framed panels, and it echoes the seal
 * the sign-in proofs settled on. `active` fills it solid, so a saved trip and
 * an unsaved one differ by more than a glyph that gained a tick.
 *
 * 36px everywhere except the administration's table rows, where `sm` gives 32
 * and keeps four actions on one line.
 */
export function IconButton({
  label,
  onClick,
  active,
  size = 'md',
  tone = 'neutral',
  className,
  children,
}: {
  label: string
  onClick?: () => void
  active?: boolean
  size?: 'sm' | 'md'
  tone?: 'neutral' | 'danger'
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full border',
        'transition-all duration-200 ease-out-soft',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasek-800',
        size === 'sm' ? 'size-8' : 'size-9',
        tone === 'danger'
          ? 'border-danger-border bg-transparent text-danger-fg hover:bg-danger-surface hover:border-danger-fg/45'
          : active
            ? 'border-nasek-800 bg-nasek-800 text-ivory-50'
            : 'border-ivory-400 bg-transparent text-ink-500 hover:border-gold-400 hover:text-nasek-800',
        className,
      )}
    >
      {children}
    </button>
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
        'text-2xs font-semibold uppercase leading-none tracking-[0.1em]',
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
      <label htmlFor={id} className="text-sm font-semibold text-ink-700">
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

/*
 * The shared control skin.
 *
 * `text-base sm:text-sm` is not a style choice — it is a bug fix. Safari on iOS
 * zooms the whole page in whenever a focused input's text is under 16px, and
 * then leaves it zoomed, so filling a form meant the layout lurching sideways
 * on every field. The interface size applies from the small breakpoint up,
 * where no phone keyboard is involved.
 */
const CONTROL =
  'w-full rounded-[3px] border bg-ivory-50 px-3.5 text-[16px] sm:text-sm text-ink-800 placeholder:text-ink-400 ' +
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
  tone = 'solid',
}: {
  value: T
  onChange: (next: T) => void
  options: { value: T; label: ReactNode }[]
  size?: 'sm' | 'md'
  className?: string
  label?: string
  /**
   * `solid` fills the chosen tab with nasek-800 and is what the owner portal,
   * the administration and the rest of the customer site already use. `rule`
   * empties the tray and marks the chosen tab with a gold rule instead, for
   * the customer surfaces that follow the sign-in control's language.
   *
   * Opt-in rather than a new default: this control is named in ten places
   * across all three applications.
   */
  tone?: 'solid' | 'rule'
}) {
  const ruled = tone === 'rule'

  return (
    <div
      role="radiogroup"
      aria-label={label}
      /*
       * The tray scrolls rather than overflowing the page.
       *
       * The administration's campaign filter carries six options — الكل,
       * مميّزة, موقوفة, مرفوضة, منشورة, بانتظار المراجعة — which come to 427px.
       * On a 390px phone that pushed the layout viewport wider than the device
       * and cut الكل off the edge, and no ancestor clipped it because the tray
       * was a bare `inline-flex`.
       *
       * `max-w-full` gives it a width to overflow *within*, and `overflow-x-auto`
       * makes the overflow the tray's problem instead of the document's. Where
       * there is room — every laptop, and every two- or three-option tray on a
       * phone — nothing overflows, so nothing scrolls and nothing about the
       * control changes.
       *
       * The scrollbar is hidden in both engines. A visible one inside a 36px
       * control is bulky, and this scrolls by touch and by trackpad; the edge
       * of a cut-off option is its own affordance.
       */
      className={cx(
        'inline-flex max-w-full overflow-x-auto rounded-[3px] border border-ivory-400 p-0.5',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        ruled ? 'bg-transparent' : 'bg-ivory-200',
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
              /*
               * `whitespace-nowrap` is what makes the tray above scroll rather
               * than crush. A flex item's `min-width` is `auto`, so it will not
               * shrink below its own min-content — and with the label allowed
               * to wrap, min-content was one word, so six options folded into
               * two lines each and *still* overflowed. Nowrap makes min-content
               * the whole label: the options keep their size and the tray takes
               * the overflow. `flex-1` is untouched, so a two-option tray with
               * room to spare still divides it evenly.
               */
              'relative flex-1 rounded-[2px] font-semibold whitespace-nowrap transition-all duration-200',
              size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm',
              ruled
                ? active
                  ? "text-nasek-800 after:content-[''] after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:bg-gold-400"
                  : 'text-ink-500 hover:text-ink-800'
                : active
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

  /*
   * The escape handler, held where re-rendering cannot reach it.
   *
   * This is not a micro-optimisation; it is the fix for a defect that made
   * every form in NASEK unusable. `onClose` is a new function on every render
   * of every caller — `requestClose` in `CampaignForm` is declared in the
   * component body, as such handlers almost always are — so naming it in the
   * dependency array below meant "re-run this effect after every render".
   *
   * The effect focuses the dialog. So: an owner clicked the Arabic title, typed
   * one character, `setForm` re-rendered the form, the effect tore down and ran
   * again, and `panelRef.current.focus()` took the focus off the input and put
   * it on the panel. The second character went nowhere. Every text field in
   * every modal behaved the same way, and it looked like an Arabic or an
   * input-method problem because Arabic is what people were typing.
   *
   * A ref read at event time keeps the handler current without making the
   * effect depend on its identity, so the effect now runs when the dialog opens
   * and closes — which is what "focus the dialog when it opens" always meant.
   */
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    /*
     * Where the focus was before the dialog took it, so it can be given back.
     *
     * A dialog that moves focus and does not return it leaves a keyboard reader
     * at the top of the document every time they close one — in the
     * administration's campaign table that means tabbing back through the whole
     * page to reach the next row. Captured here rather than on the click,
     * because a dialog can be opened from several places and this is the only
     * one that knows it happened.
     *
     * Deliberately narrow: this restores focus and does nothing else. It does
     * not trap Tab inside the panel, which is the other half of a dialog's
     * keyboard contract and is not attempted here — the effect above is the one
     * whose dependency list once put the focus on the panel after every
     * keystroke, and a trap is a much larger change to make on the same lines.
     */
    const opener = document.activeElement
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
      // Only if it is still on the page and is not the body itself — a row that
      // was deleted while the dialog was open has nothing left to focus.
      if (
        opener instanceof HTMLElement &&
        opener !== document.body &&
        opener.isConnected
      ) {
        opener.focus()
      }
    }
  }, [open])

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
          <h2 className="display text-xl text-nasek-900">{title}</h2>
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

// ------------------------------------------------------------------ Notice

type NoticeTone = 'danger' | 'warn' | 'success' | 'info'

/*
 * Every tone, defined once.
 *
 * These blocks were being written inline wherever one was needed, which is how
 * an interface ends up spelling "something went wrong" four slightly different
 * ways — `border-red-200 bg-red-50 text-red-700` in one place, `border-red-300
 * bg-red-50 text-red-600` a screen later. The colours come from the semantic
 * tokens in index.css, each pair already checked to clear 4.5:1 on its own
 * surface, so a tone can be adjusted in one file rather than hunted for.
 */
const NOTICE_TONES: Record<NoticeTone, string> = {
  danger: 'border-danger-border bg-danger-surface text-danger-fg',
  warn: 'border-warn-border bg-warn-surface text-warn-fg',
  success: 'border-success-border bg-success-surface text-success-fg',
  info: 'border-info-border bg-info-surface text-info-fg',
}

const NOTICE_ICON: Record<NoticeTone, typeof CircleAlert> = {
  danger: CircleAlert,
  warn: TriangleAlert,
  success: CircleCheck,
  info: Info,
}

/**
 * An inline message about what just happened.
 *
 * Carries an icon as well as a colour, always. Colour alone is not information:
 * roughly one man in twelve cannot separate the danger tone from the success
 * one, and nobody can when a page is printed or read in bright sun.
 *
 * `role="alert"` is opt-in via `live`, because the two cases genuinely differ.
 * A message that appears in response to something the person just did should
 * interrupt and be read out; a standing note that was on the page when it
 * loaded should not, and marking every one of them live turns the screen
 * reader into noise nobody listens to.
 */
export function Notice({
  tone = 'info',
  title,
  live,
  className,
  children,
}: {
  tone?: NoticeTone
  title?: string
  live?: boolean
  className?: string
  children: ReactNode
}) {
  const Icon = NOTICE_ICON[tone]
  return (
    <div
      role={live ? 'alert' : undefined}
      className={cx('flex gap-2.5 rounded-[3px] border p-3.5', NOTICE_TONES[tone], className)}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && (
          <p className="text-2xs font-bold uppercase tracking-wider">{title}</p>
        )}
        <div className={cx('text-xs leading-relaxed', title && 'mt-1.5')}>{children}</div>
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
      {/* `h2` for the same reason the footer's column titles are: an empty
          state is usually the only thing in its section, and following an `h1`
          with an `h3` skips a level. The size is a class, not the tag. */}
      <h2 className="text-base font-bold text-ink-800">{title}</h2>
      {body && <p className="max-w-sm text-sm leading-relaxed text-ink-500">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
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
  level = 2,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
  align?: 'start' | 'center'
  className?: string
  /**
   * The heading level, for the one caller where this *is* the page title.
   *
   * `h2` everywhere else, which is what a section heading is. The map page uses
   * this component for its own title and had no `h1` at all as a result — a
   * page with no top-level heading, which is the first thing a screen reader
   * looks for. A prop rather than a second component, because the difference
   * between the two cases is one tag and nothing else.
   */
  level?: 1 | 2
}) {
  const Heading = level === 1 ? 'h1' : 'h2'
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
        <Heading className="display text-3xl text-nasek-900 sm:text-5xl">{title}</Heading>
        <div
          className={cx(
            'rule-gold mt-3.5 w-16',
            align === 'center' && 'mx-auto',
          )}
          aria-hidden
        />
        {subtitle && (
          <p className="mt-3.5 text-md leading-relaxed text-ink-500">{subtitle}</p>
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
