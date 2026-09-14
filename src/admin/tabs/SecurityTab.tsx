import { useEffect, useState } from 'react'
import { Mail, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { fetchEmailOutbox } from '@/services/data/catalogue'
import type { EmailOutboxRow } from '@/services/supabase/schema'
import {
  confirmMfa,
  enrolMfa,
  mfaStatus,
  unenrolMfa,
  type MfaEnrolment,
} from '@/services/auth/password'
import { Button, Notice, Spinner } from '@/components/ui'
import { TOTP_CODE_LENGTH, CodeInput } from '@/components/auth/CodeInput'

/**
 * The administrator's own account.
 *
 * The authenticator that accompanies the access code, and whether NASEK's mail
 * went out. It is about the person signed in — an administrator cannot enrol
 * anyone else's phone from here, and there is deliberately no screen that could.
 * The one function that changes a *role* is granted to `service_role` alone.
 *
 * There is no password here, and that is the rule rather than an omission. The
 * dashboard is opened with the administration access code and nothing else; a
 * password set on the account would be a second way in that skips the code
 * entirely, straight through Supabase's own sign-in endpoint. The panel that
 * used to set one is gone, and `is_admin()` refuses a session that signed in
 * with a password (20260913000200), so a password set before it went buys
 * nothing either.
 *
 * Two-factor is the reason this section exists. An administration account is
 * the single most valuable credential on the platform — it can suspend a
 * company, hide a review and read every booking. Supabase supports TOTP on
 * every plan; nothing here needed buying.
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

      <MailPanel />
    </section>
  )
}

// ------------------------------------------------------------ mail delivery

/**
 * Did the approval email actually go out?
 *
 * A question with no answer anywhere before this panel, and one worth being
 * able to answer, because NASEK's messages are deliberately sent in two steps.
 * A decision writes a row into `email_outbox` inside its own transaction; the
 * `send-emails` Edge Function drains that queue later. So "approved" and "the
 * owner was told" are genuinely two facts, and on a project with no mail
 * provider configured the second one is permanently `queued`.
 *
 * That is a supported state — every decision also writes an in-app
 * notification, which is what the owner's portal shows — but an administrator
 * should be able to see it rather than assume an email went somewhere. A row
 * stuck at `queued` here means the function has not run; a row at `failed`
 * carries the provider's own error.
 *
 * Read-only, and it could not be otherwise: `email_outbox` has no write policy
 * at all, so even an administrator's session cannot insert into it.
 */
function MailPanel() {
  const { t, date } = useI18n()
  const [rows, setRows] = useState<EmailOutboxRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setRows(await fetchEmailOutbox(15))
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const LABEL: Record<EmailOutboxRow['status'], string> = {
    queued: t('admin.mailQueued'),
    sending: t('admin.mailSending'),
    sent: t('admin.mailSent'),
    failed: t('admin.mailFailed'),
  }

  return (
    <Panel
      icon={<Mail className="size-4" />}
      title={t('admin.mailTitle')}
      body={t('admin.mailBody')}
    >
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-5 text-nasek-600" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-400">{t('admin.mailEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[3px] border border-ivory-300 bg-ivory-50 px-3 py-2 text-xs"
            >
              <span
                className={
                  row.status === 'sent'
                    ? 'font-bold text-nasek-700'
                    : row.status === 'failed'
                      ? 'font-bold text-red-700'
                      : 'font-bold text-gold-700'
                }
              >
                {LABEL[row.status]}
              </span>
              <span className="font-semibold text-ink-700">{row.template}</span>
              <span className="min-w-0 flex-1 truncate text-ink-500" dir="ltr">
                {row.to_email}
              </span>
              <span className="text-ink-400">{date(row.created_at)}</span>
              {row.last_error && (
                <span className="w-full truncate text-2xs text-red-600" dir="ltr">
                  {row.last_error}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button variant="secondary" size="xs" className="mt-4" onClick={() => void load()}>
        {t('admin.mailRefresh')}
      </Button>
    </Panel>
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
          size="sm"
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
          size="sm"
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
            size="sm"
            block
            loading={busy}
            disabled={code.replace(/\D/g, '').length !== TOTP_CODE_LENGTH}
            onClick={() => void confirm(code)}
          >
            {t('admin.mfaConfirm')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEnrolment(null)}>
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
