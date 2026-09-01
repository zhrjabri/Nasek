import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  KeyRound,
  Link as LinkIcon,
  Mail,
  Smartphone,
} from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import {
  RESEND_COOLDOWN_SECONDS,
  cancelOtp,
  isDemoOtp,
  normaliseTarget,
  startOtp,
  verifyOtp,
  type OtpChannel,
  type OtpTarget,
} from '@/services/auth/otp'
import { maskEmail, maskPhone } from '@/services/auth/phone'
import { parseSignInLink, verifyEmailLink } from '@/services/auth/redirect'
import { Button, Field, Input, Notice, Segmented, Textarea, cx } from '@/components/ui'
import { CODE_LENGTH, CodeInput } from './CodeInput'

/**
 * Sign in without a password.
 *
 * Two steps and nothing else: say where to reach you, then prove you were
 * reached. Both applications use this — the public site offering email and
 * phone, the administration dashboard offering email only — because an
 * authentication flow that is written twice is a flow with two sets of bugs and
 * two sets of edge cases about resending.
 *
 * The component owns no session state. It reports success and lets the caller
 * decide what that means, which is what keeps the same two steps able to serve
 * a pilgrim landing on their dashboard and an administrator being checked for a
 * role before anything is drawn.
 */

/** Every failure the two calls can produce, mapped to something a person can act on. */
const ERROR_KEY: Record<string, MessageKey> = {
  invalid: 'auth.errInvalidTarget',
  send_failed: 'auth.errSendFailed',
  rate_limited: 'auth.errRateLimited',
  wrong_code: 'auth.errWrongCode',
  expired: 'auth.errExpired',
  too_many: 'auth.errTooMany',
  code_format: 'auth.errCodeFormat',
}

export function OtpFlow({
  channels = ['email', 'phone'],
  initialValue = '',
  onSuccess,
  submitLabel,
  busyLabel,
}: {
  channels?: OtpChannel[]
  /**
   * Pre-fill the identifier.
   *
   * The registration forms already collected an address a screen ago, and
   * asking for it a second time reads as though the first answer was lost. It
   * is filled rather than skipped past: someone who spots a typo in it can fix
   * it here instead of going back, and nobody is sent a code they did not press
   * a button for.
   */
  initialValue?: string
  /**
   * Resolve once the session is established; the flow stays busy until it does.
   *
   * Handed the identifier that was just proved, because the caller has no other
   * way to know it — the choice of channel and the value typed into it are this
   * component's state, and a caller that guessed would be looking up the wrong
   * account the moment someone switched from email to phone.
   */
  onSuccess: (target: OtpTarget) => void | Promise<void>
  submitLabel?: string
  busyLabel?: string
}) {
  const { t } = useI18n()
  const [channel, setChannel] = useState<OtpChannel>(channels[0])
  const [value, setValue] = useState(initialValue)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'identify' | 'code'>('identify')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [demoCode, setDemoCode] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [link, setLink] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkError, setLinkError] = useState<MessageKey | null>(null)
  const liveRef = useRef(true)

  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
    }
  }, [])

  // The resend countdown. One interval, cleared when it reaches zero, so a
  // screen left open does not tick forever in a background tab.
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const send = useCallback(
    async (resend = false) => {
      setError(null)
      if (!normaliseTarget({ channel, value })) {
        setError('auth.errInvalidTarget')
        return
      }
      setBusy(true)
      const result = await startOtp({ channel, value })
      if (!liveRef.current) return
      setBusy(false)

      if (!result.ok) {
        setError(ERROR_KEY[result.error ?? 'send_failed'] ?? 'auth.errSendFailed')
        return
      }
      setDemoCode(result.demoCode ?? null)
      setCooldown(result.cooldownSeconds || RESEND_COOLDOWN_SECONDS)
      if (!resend) {
        setStep('code')
        setCode('')
      }
    },
    [channel, value],
  )

  const submitCode = useCallback(
    async (candidate: string) => {
      setError(null)
      setBusy(true)
      const result = await verifyOtp({ channel, value }, candidate)
      if (!liveRef.current) return

      if (!result.ok) {
        setBusy(false)
        setCode('')
        setError(ERROR_KEY[result.error ?? 'wrong_code'] ?? 'auth.errWrongCode')
        // A rejected code that cannot be retried has to send the person back to
        // the start, or they sit typing into a field that will never accept
        // anything again.
        if (result.error === 'too_many' || result.error === 'expired') {
          setStep('identify')
          setDemoCode(null)
        }
        return
      }

      // Stay busy across the caller's work: establishing the session involves
      // its own round trip, and a button that springs back to "Verify" while
      // that happens invites a second submission.
      await onSuccess({ channel, value })
      if (liveRef.current) setBusy(false)
    },
    [channel, value, onSuccess],
  )

  /**
   * Redeem a link the person pasted rather than followed.
   *
   * The route that works when the message was opened on a different device —
   * which during local development is the only route that can, since a link to
   * `localhost` means nothing on a phone.
   */
  const submitLink = async () => {
    setLinkError(null)
    if (!link.trim()) {
      setLinkError('auth.pasteLinkEmpty')
      return
    }
    if (!parseSignInLink(link)) {
      setLinkError('auth.pasteLinkInvalid')
      return
    }

    setBusy(true)
    const outcome = await verifyEmailLink(link)
    if (!liveRef.current) return

    if (outcome.kind !== 'signed-in') {
      setBusy(false)
      setLinkError(
        outcome.kind === 'error' && outcome.reason === 'expired'
          ? 'auth.linkExpired'
          : outcome.kind === 'error' && outcome.reason === 'wrong_browser'
            ? 'auth.linkWrongBrowser'
            : 'auth.linkFailed',
      )
      return
    }

    await onSuccess({ channel, value })
    if (liveRef.current) setBusy(false)
  }

  const back = () => {
    cancelOtp()
    setStep('identify')
    setCode('')
    setError(null)
    setDemoCode(null)
    setCooldown(0)
  }

  // ------------------------------------------------------------- step one
  if (step === 'identify') {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="space-y-5"
      >
        {channels.length > 1 && (
          <Segmented<OtpChannel>
            value={channel}
            onChange={(next) => {
              setChannel(next)
              setValue('')
              setError(null)
            }}
            label={t('auth.chooseChannel')}
            options={[
              { value: 'email', label: t('auth.continueEmail') },
              { value: 'phone', label: t('auth.continuePhone') },
            ]}
          />
        )}

        <Field
          label={t(channel === 'email' ? 'common.email' : 'common.phone')}
          hint={t(channel === 'email' ? 'auth.emailHint' : 'auth.phoneHint')}
          error={error ? t(error) : undefined}
          required
        >
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-400">
                {channel === 'email' ? (
                  <Mail className="size-4" />
                ) : (
                  <Smartphone className="size-4" />
                )}
              </span>
              <Input
                {...p}
                dir="ltr"
                autoFocus
                type={channel === 'email' ? 'email' : 'tel'}
                inputMode={channel === 'email' ? 'email' : 'tel'}
                autoComplete={channel === 'email' ? 'email' : 'tel'}
                placeholder={channel === 'email' ? 'name@example.com' : '+968 9123 4567'}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setError(null)
                }}
                className="ps-9"
              />
            </div>
          )}
        </Field>

        <Button type="submit" size="lg" block loading={busy}>
          {busy ? t('auth.sending') : t('auth.sendCode')}
        </Button>

        <p className="flex items-start gap-2 rounded-[3px] border border-nasek-200 bg-nasek-50/50 p-3.5 text-xs leading-relaxed text-ink-600">
          <KeyRound className="mt-px size-4 shrink-0 text-nasek-700" aria-hidden />
          {t('auth.noPasswordNote')}
        </p>
      </form>
    )
  }

  // ------------------------------------------------------------- step two
  const masked = channel === 'email' ? maskEmail(value.trim()) : maskPhone(value)

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-sm leading-relaxed text-ink-600">
          {t(channel === 'email' ? 'auth.codeSentEmail' : 'auth.codeSentPhone')}
        </p>
        <p className="nums mt-1 text-base font-bold text-ink-900" dir="ltr">
          {masked}
        </p>
      </div>

      {/*
        The fallback prints the code on screen. It is labelled as a fallback in
        the strongest terms the layout allows, because a demo notice that looks
        like a normal hint is how a prototype gets mistaken for a product.
      */}
      {isDemoOtp && demoCode && (
        <Notice tone="warn" title={t('auth.demoTitle')}>
          {t('auth.demoBody')}
          <p className="nums mt-2 text-center text-3xl font-bold tracking-[0.3em]" dir="ltr">
            {demoCode}
          </p>
        </Notice>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submitCode(code)
        }}
        className="space-y-4"
      >
        <CodeInput
          autoFocus
          label={t('auth.codeLabel')}
          value={code}
          onChange={setCode}
          onComplete={(full) => void submitCode(full)}
          disabled={busy}
          invalid={!!error}
        />

        {error && (
          <p role="alert" className="text-center text-xs font-medium text-danger-fg">
            {t(error)}
          </p>
        )}

        {/*
          Supabase's default email templates render a link rather than a code,
          and on newer projects they cannot be edited without custom SMTP. Both
          paths work — this screen accepts a typed code, and clicking the link
          completes the same sign-in — so the copy names both rather than
          leaving someone staring at six empty boxes wondering what to type.
        */}
        {!isDemoOtp && (
          <p className="text-center text-xs leading-relaxed text-ink-500">
            {t('auth.orUseLink')}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          block
          loading={busy}
          disabled={code.replace(/\D/g, '').length !== CODE_LENGTH}
        >
          {busy ? (busyLabel ?? t('auth.verifying')) : (submitLabel ?? t('auth.verify'))}
        </Button>
      </form>

      {/*
        Supabase's default templates send a link and no code, and they cannot be
        edited without custom SMTP — so for many projects this is not a fallback
        at all, it is the way in. It is offered rather than forced because a
        project with editable templates sends a code, and six boxes are far less
        work than copying a URL.
      */}
      {!isDemoOtp && (
        <div className="rounded-[3px] border border-ivory-300 bg-ivory-100/60">
          <button
            type="button"
            onClick={() => setLinkOpen((v) => !v)}
            aria-expanded={linkOpen}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-start text-xs font-bold text-ink-700 transition-colors hover:text-nasek-800"
          >
            <span className="flex items-center gap-2">
              <LinkIcon className="size-3.5 shrink-0" aria-hidden />
              {t('auth.pasteLinkTitle')}
            </span>
            <ChevronDown
              className={cx('size-4 shrink-0 transition-transform', linkOpen && 'rotate-180')}
              aria-hidden
            />
          </button>

          {linkOpen && (
            <div className="space-y-3 border-t border-ivory-300 p-3.5">
              <p className="text-xs leading-relaxed text-ink-500">{t('auth.pasteLinkBody')}</p>
              <Field label={t('auth.pasteLinkLabel')} error={linkError ? t(linkError) : undefined}>
                {(p) => (
                  <Textarea
                    {...p}
                    dir="ltr"
                    rows={3}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="https://…supabase.co/auth/v1/verify?token=…"
                    value={link}
                    onChange={(e) => {
                      setLink(e.target.value)
                      setLinkError(null)
                    }}
                    className="min-h-20 text-xs"
                  />
                )}
              </Field>
              <Button
                type="button"
                variant="secondary"
                block
                loading={busy}
                onClick={() => void submitLink()}
              >
                {t('auth.pasteLinkAction')}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ivory-300 pt-4">
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-ink-900"
        >
          <ArrowLeft className="size-3.5 rtl:rotate-180" />
          {t('auth.changeTarget')}
        </button>

        <button
          type="button"
          disabled={cooldown > 0 || busy}
          onClick={() => void send(true)}
          className={cx(
            'text-xs font-semibold transition-colors',
            cooldown > 0 || busy
              ? 'cursor-not-allowed text-ink-300'
              : 'text-nasek-700 hover:underline',
          )}
        >
          {cooldown > 0 ? t('auth.resendIn', { n: cooldown }) : t('auth.resend')}
        </button>
      </div>
    </div>
  )
}
