import { useEffect, useRef } from 'react'
import { cx } from '@/components/ui'

/**
 * The one-time code field.
 *
 * One box per digit rather than a single text input, because the boxes tell you
 * how long the code is before you start typing and show you where you are while
 * you do. That is also why the length is a *prop* and no longer a constant in
 * this file: the boxes are a promise about the code's length, and a promise
 * that does not match what the sender issued is worse than having no boxes at
 * all. NASEK sends two codes, of two different lengths, and this component was
 * written assuming one:
 *
 *   * An emailed sign-in code. Its length is Supabase's `Email OTP Length`
 *     setting — 8 on this project — so callers pass `EMAIL_CODE_LENGTH` from
 *     `services/auth/otp.ts`, which is the single place that mirrors it.
 *   * An authenticator code. Six digits, by RFC 6238, on every app that
 *     implements TOTP. That is `TOTP_CODE_LENGTH` below, and the default,
 *     because it is the one of the two that is a fact rather than a setting.
 *
 * Three details do most of the remaining work and are easy to leave out:
 *
 *   * Pasting. Almost nobody types a code they can copy. Any box accepts a
 *     paste of the whole code and distributes it, and `onPaste` strips
 *     non-digits first, so pasting "1234 5678" or "Your code is 12345678" from
 *     a message works rather than filling one box with a space.
 *   * `autocomplete="one-time-code"`. iOS and Android offer the code from the
 *     message above the keyboard, and Chrome can pull it from an SMS. The
 *     attribute belongs on the first box only; repeated across every box, the
 *     platform fills the first and the rest stay empty.
 *   * Direction. The boxes are `dir="ltr"` even in Arabic. A code is a number,
 *     read left to right in both languages, and letting it mirror would put
 *     the first digit you type on the right-hand side of the row.
 */

/** An authenticator app's code. Six, by RFC 6238, and not a project setting. */
export const TOTP_CODE_LENGTH = 6

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  label,
  autoFocus,
  length = TOTP_CODE_LENGTH,
}: {
  value: string
  onChange: (next: string) => void
  /** Fired once the last digit lands, so nobody has to press a button. */
  onComplete?: (code: string) => void
  disabled?: boolean
  invalid?: boolean
  label: string
  autoFocus?: boolean
  /** How many digits this particular code has. See the note above. */
  length?: number
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(length, ' ').slice(0, length).split('')

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  const set = (index: number, digit: string) => {
    const next = value.padEnd(length, ' ').split('')
    next[index] = digit || ' '
    const joined = next.join('').replace(/\s+$/, '')
    onChange(joined.trimEnd())
    return joined.replace(/\s/g, '')
  }

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const complete = set(index, digit)
    if (digit && index < length - 1) refs.current[index + 1]?.focus()
    if (complete.length === length) onComplete?.(complete)
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index].trim() && index > 0) {
      // Backspace in an empty box steps back and clears, which is what the
      // keypress is for — otherwise it does nothing and feels broken.
      e.preventDefault()
      set(index - 1, '')
      refs.current[index - 1]?.focus()
      return
    }
    // Arrow keys move by box, and are flipped under RTL so "next" is still the
    // box the eye expects even though the row itself is not mirrored.
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    e.preventDefault()
    onChange(pasted)
    refs.current[Math.min(pasted.length, length - 1)]?.focus()
    if (pasted.length === length) onComplete?.(pasted)
  }

  return (
    <div
      role="group"
      aria-label={label}
      dir="ltr"
      className="flex justify-center gap-2 sm:gap-2.5"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          aria-label={`${label} ${index + 1}`}
          aria-invalid={invalid || undefined}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          value={digit.trim()}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          className={cx(
            'nums size-12 rounded-[3px] border bg-ivory-50 text-center text-xl font-bold text-ink-900',
            'transition-colors duration-150 sm:size-13',
            'focus:border-nasek-700 focus:outline-none focus:ring-1 focus:ring-nasek-700/25',
            'disabled:bg-ivory-200 disabled:opacity-60',
            invalid
              ? 'border-red-400 ring-1 ring-red-500/20'
              : 'border-ivory-400 hover:border-ink-400/60',
          )}
        />
      ))}
    </div>
  )
}
