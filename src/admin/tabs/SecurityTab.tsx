import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { isSupabaseConfigured } from '@/services/supabase/client'
import {
  MIN_PASSWORD_LENGTH,
  confirmMfa,
  enrolMfa,
  mfaStatus,
  passwordProblem,
  setPassword,
  unenrolMfa,
  type MfaEnrolment,
} from '@/services/auth/password'
import { Button, Field, Input, Notice, Spinner } from '@/components/ui'
import { CODE_LENGTH, CodeInput } from '@/components/auth/CodeInput'

/**
 * The administrator's own account.
 *
 * Two controls and nothing else: the password this dashboard is opened with,
 * and the authenticator that has to accompany it. Both are about the person
 * signed in — an administrator cannot set anyone else's password or enrol
 * anyone else's phone from here, and there is deliberately no screen that could.
 * Supabase holds credentials in a schema NASEK's key cannot reach, and the one
 * function that changes a *role* is granted to `service_role` alone.
 *
 * Two-factor is the reason this section exists. An administration account is
 * the single most valuable credential on the platform — it can suspend a
 * company, hide a review and read every booking — and a password on its own is
 * one phishing email away from all of that. Supabase supports TOTP on every
 * plan; nothing here needed buying.
 */
export function SecurityTab() {
  const { t } = useI18n()
  const { user, toast } = useStore()

  const [loading, setLoading] = useState(true)
  const [enrolled, setEnrolled] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    const status = await mfaStatus()
    setEnrolled(status.enrolled)
    setFactorId(status.factorId)
    setLoading(false)
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    void refresh()
  }, [])

  if (!isSupabaseConfigured) {
    return (
      <section className="max-w-2xl space-y-5">
        <Notice tone="warn" title={t('admin.localModeTitle')}>
          {t('admin.securityLocalMode')}
        </Notice>
      </section>
    )
  }

  return (
    <section className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-bold text-ink-900">{t('admin.securityTitle')}</h2>
        <p className="text-sm leading-relaxed text-ink-500">{t('admin.securityBody')}</p>
        {user?.email && (
          <p className="nums text-xs text-ink-400" dir="ltr">
            {user.email}
          </p>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-6 text-nasek-600" />
        </div>
      ) : (
        <TwoFactorPanel
          enrolled={enrolled}
          factorId={factorId}
          onChanged={refresh}
          notify={toast}
        />
      )}

      <PasswordPanel notify={toast} />
    </section>
  )
}

// ------------------------------------------------------------------ 2FA

function TwoFactorPanel({
  enrolled,
  factorId,
  onChanged,
  notify,
}: {
  enrolled: boolean
  factorId: string | null
  onChanged: () => Promise<void>
  notify: (message: string, tone?: 'success' | 'info' | 'warning') => void
}) {
  const { t } = useI18n()
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (enrolled) {
    return (
      <Panel
        icon={<ShieldCheck className="size-4" />}
        title={t('admin.mfaOnTitle')}
        body={t('admin.mfaOnBody')}
      >
        <Button
          variant="secondary"
          loading={busy}
          onClick={async () => {
            if (!factorId) return
            setBusy(true)
            const ok = await unenrolMfa(factorId)
            setBusy(false)
            if (!ok) {
              setError(t('admin.mfaRemoveFailed'))
              return
            }
            await onChanged()
            notify(t('admin.mfaRemoved'), 'info')
          }}
        >
          <ShieldOff className="size-3.5" />
          {t('admin.mfaTurnOff')}
        </Button>
        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-danger-fg">
            {error}
          </p>
        )}
      </Panel>
    )
  }

  if (!enrolment) {
    return (
      <Panel
        icon={<Smartphone className="size-4" />}
        title={t('admin.mfaOffTitle')}
        body={t('admin.mfaOffBody')}
      >
        <Button
          loading={busy}
          onClick={async () => {
            setError('')
            setBusy(true)
            const result = await enrolMfa()
            setBusy(false)
            if (!result.ok) {
              setError(result.error)
              return
            }
            setEnrolment(result.enrolment)
          }}
        >
          <ShieldCheck className="size-3.5" />
          {t('admin.mfaTurnOn')}
        </Button>
        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-danger-fg">
            {error}
          </p>
        )}
      </Panel>
    )
  }

  return (
    <Panel
      icon={<Smartphone className="size-4" />}
      title={t('admin.mfaSetupTitle')}
      body={t('admin.mfaSetupBody')}
    >
      <div className="space-y-4">
        {/*
          Supabase returns the QR code as an SVG string. It is generated by the
          auth server from the secret it just minted for this account — not user
          content, not remote markup — so rendering it is the intended use of
          the field rather than a shortcut around one.
        */}
        <div
          className="mx-auto w-fit rounded-[3px] border border-ivory-300 bg-white p-3"
          dangerouslySetInnerHTML={{ __html: enrolment.qrSvg }}
        />

        {/* Typed by hand when the camera will not focus, or when the
            authenticator lives on the same device as this browser. */}
        <div className="rounded-[3px] border border-ivory-300 bg-ivory-50 p-3 text-center">
          <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">
            {t('admin.mfaSecret')}
          </p>
          <p className="nums mt-1 break-all text-xs font-semibold text-ink-800" dir="ltr">
            {enrolment.secret}
          </p>
        </div>

        <CodeInput
          label={t('admin.mfaConfirmLabel')}
          value={code}
          onChange={setCode}
          onComplete={(full) => void confirm(full)}
          disabled={busy}
          invalid={!!error}
        />

        {error && (
          <p role="alert" className="text-center text-xs font-medium text-danger-fg">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            block
            loading={busy}
            disabled={code.replace(/\D/g, '').length !== CODE_LENGTH}
            onClick={() => void confirm(code)}
          >
            {t('admin.mfaConfirm')}
          </Button>
          <Button variant="secondary" onClick={() => setEnrolment(null)}>
            {t('common.back')}
          </Button>
        </div>
      </div>
    </Panel>
  )

  async function confirm(candidate: string) {
    setError('')
    setBusy(true)
    const result = await confirmMfa(enrolment!.factorId, candidate)
    setBusy(false)
    if (!result.ok) {
      setCode('')
      setError(t('admin.mfaWrongCode'))
      return
    }
    setEnrolment(null)
    await onChanged()
    notify(t('admin.mfaEnabled'), 'success')
  }
}

// ------------------------------------------------------------- password

function PasswordPanel({
  notify,
}: {
  notify: (message: string, tone?: 'success' | 'info' | 'warning') => void
}) {
  const { t } = useI18n()
  const [password, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  return (
    <Panel
      icon={<KeyRound className="size-4" />}
      title={t('admin.passwordTitle')}
      body={t('admin.passwordBody')}
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          const problem = passwordProblem(password, confirm)
          if (problem === 'short') {
            setErrors({ password: t('auth.passwordShort', { n: MIN_PASSWORD_LENGTH }) })
            return
          }
          if (problem === 'mismatch') {
            setErrors({ confirm: t('auth.passwordMismatch') })
            return
          }
          setErrors({})
          setBusy(true)
          const result = await setPassword(password)
          setBusy(false)
          if (!result.ok) {
            setErrors({ password: t('admin.passwordFailed') })
            return
          }
          setNext('')
          setConfirm('')
          notify(t('admin.passwordSaved'), 'success')
        }}
      >
        <Field
          label={t('auth.password')}
          hint={t('auth.passwordHint', { n: MIN_PASSWORD_LENGTH })}
          error={errors.password}
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('auth.confirmPassword')} error={errors.confirm}>
          {(p) => (
            <Input
              {...p}
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={busy} disabled={!password}>
          {t('admin.passwordSave')}
        </Button>
      </form>
    </Panel>
  )
}

function Panel({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[3px] border border-ivory-300 bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-px flex size-8 shrink-0 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink-900">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">{body}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
