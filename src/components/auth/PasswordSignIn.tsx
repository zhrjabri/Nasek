import { useState } from 'react'
import { ChevronDown, Eye, EyeOff, KeyRound } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import {
  signInWithPassword,
  verifyMfaCode,
  type PasswordError,
} from '@/services/auth/password'
import { Button, Field, Input, cx } from '@/components/ui'
import { CODE_LENGTH, CodeInput } from './CodeInput'

/**
 * Signing in with a password.
 *
 * Offered, never imposed. NASEK's front door is still a one-time code, and for
 * a pilgrim it is the only sensible option — but campaign owners register with
 * a password and administrators sign in with one, and both of them use this
 * site far too often to wait on an inbox each time. Folding it away rather than
 * giving it equal billing keeps the simple path simple for the many people who
 * have no password at all and never will.
 *
 * Two factors are handled here as well, because an administrator whose account
 * has an authenticator enrolled reaches this component like anyone else. A
 * password on such an account produces a session at assurance level `aal1` —
 * which reads as success and is not one — so the second step is not optional
 * and not something the caller can forget to ask for.
 */

const ERROR_KEY: Record<PasswordError, MessageKey> = {
  offline: 'auth.errSendFailed',
  // Deliberately the same message for "no such account" and "wrong password".
  // Distinguishing them turns this form into an oracle for which addresses hold
  // NASEK accounts, which is exactly the enumeration Supabase declines to give
  // away at the API.
  invalid_credentials: 'auth.signInFailed',
  email_not_confirmed: 'auth.errEmailUnconfirmed',
  // Not `auth.passwordShort`: that string carries a {n} placeholder for the
  // registration form, and this component has no vars to substitute into it.
  weak_password: 'auth.passwordRejected',
  rate_limited: 'auth.errRateLimited',
  failed: 'auth.errSendFailed',
}

export function PasswordSignIn({
  /** Runs once the session is fully established — after MFA, when there is any. */
  onSignedIn,
  /** Rendered open, for the administration dashboard where it is the main path. */
  defaultOpen = false,
  /** Hide the disclosure entirely and render just the form. */
  bare = false,
}: {
  onSignedIn: (email: string) => void | Promise<void>
  defaultOpen?: boolean
  bare?: boolean
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(defaultOpen)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)

  // Set once the password was right and a second factor is owed. The form is
  // replaced rather than extended, so there is no way to resubmit the password
  // half from a state where it has already been accepted.
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('auth.emailInvalid')
      return
    }
    if (!password) {
      setError('auth.passwordRequired')
      return
    }

    setBusy(true)
    const outcome = await signInWithPassword(email, password)

    if (outcome.mfaRequired && outcome.factorId) {
      setBusy(false)
      setFactorId(outcome.factorId)
      return
    }
    if (!outcome.ok) {
      setBusy(false)
      setPassword('')
      setError(ERROR_KEY[outcome.error ?? 'failed'])
      return
    }

    await onSignedIn(email.trim().toLowerCase())
    setBusy(false)
  }

  const submitFactor = async (candidate: string) => {
    setError(null)
    setBusy(true)
    const outcome = await verifyMfaCode(factorId!, candidate)
    if (!outcome.ok) {
      setBusy(false)
      setCode('')
      setError(outcome.error === 'wrong_code' ? 'auth.errWrongCode' : 'auth.errSendFailed')
      return
    }
    await onSignedIn(email.trim().toLowerCase())
    setBusy(false)
  }

  // ------------------------------------------------------------ second factor
  const form = factorId ? (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submitFactor(code)
      }}
      className="space-y-4"
    >
      <p className="text-center text-sm leading-relaxed text-ink-600">{t('auth.mfaPrompt')}</p>
      <CodeInput
        autoFocus
        label={t('auth.mfaLabel')}
        value={code}
        onChange={setCode}
        onComplete={(full) => void submitFactor(full)}
        disabled={busy}
        invalid={!!error}
      />
      {error && (
        <p role="alert" className="text-center text-xs font-medium text-danger-fg">
          {t(error)}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        block
        loading={busy}
        disabled={code.replace(/\D/g, '').length !== CODE_LENGTH}
      >
        {busy ? t('auth.verifying') : t('auth.verify')}
      </Button>
    </form>
  ) : (
    // ----------------------------------------------------------- credentials
    <form noValidate onSubmit={submit} className="space-y-4">
      <Field label={t('common.email')} required>
        {(p) => (
          <Input
            {...p}
            type="email"
            dir="ltr"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
          />
        )}
      </Field>

      <Field label={t('auth.password')} required error={error ? t(error) : undefined}>
        {(p) => (
          <div className="relative">
            <Input
              {...p}
              type={reveal ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              className="pe-10"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={t(reveal ? 'auth.hidePassword' : 'auth.showPassword')}
              className="absolute top-1/2 end-2 -translate-y-1/2 rounded-[3px] p-1.5 text-ink-400 transition-colors hover:text-ink-700"
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        )}
      </Field>

      <Button type="submit" size="lg" block loading={busy}>
        {busy ? t('auth.signInChecking') : t('nav.signIn')}
      </Button>
    </form>
  )

  if (bare) return form

  return (
    <div className="rounded-[3px] border border-ivory-300 bg-ivory-100/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-start text-xs font-bold text-ink-700 transition-colors hover:text-nasek-800"
      >
        <span className="flex items-center gap-2">
          <KeyRound className="size-3.5 shrink-0" aria-hidden />
          {t('auth.passwordSignInTitle')}
        </span>
        <ChevronDown
          className={cx('size-4 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-ivory-300 p-3.5">
          <p className="text-xs leading-relaxed text-ink-500">{t('auth.passwordSignInBody')}</p>
          {form}
        </div>
      )}
    </div>
  )
}
