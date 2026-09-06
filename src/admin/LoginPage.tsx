import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Lock, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { verifyMfaCode } from '@/services/auth/password'
import { Button, Field, Input, Notice } from '@/components/ui'
import { TOTP_CODE_LENGTH, CodeInput } from '@/components/auth/CodeInput'
import { AdminAuthShell } from '@/admin/layout/AdminAuthShell'
import { verifyAdminPassphrase } from '@/admin/access'
import { redeemAccessCode, type AccessCodeError } from '@/admin/accessCode'
import { loadAdminSession, markLocalGatePassed, type AdminGateReason } from '@/admin/session'

/**
 * The administration sign-in screen.
 *
 * One field, and it is not an email address or a password.
 *
 * WHAT CHANGED, AND WHY IT IS NOT A WEAKENING
 *
 * This screen used to ask for a password against an account named at build time
 * in `VITE_ADMIN_EMAIL`. That worked. What it was not is what NASEK asked for —
 * a single access code, checked on the server, with nothing about it anywhere in
 * this bundle — and it had a property worth losing: the address the dashboard
 * opens was a compile-time constant sitting in the JavaScript, which told anyone
 * reading it precisely which inbox to go after.
 *
 * The code replaces the password and *not* the authorisation. What the code
 * buys is a session; whether that session administers NASEK is still decided by
 * `is_admin()` running inside Postgres against a signature this browser cannot
 * forge, and still enforced row by row by the policies. `admin-access` even
 * re-checks the role in the database before it mints anything, so a code that
 * is right for a project whose administrator has been demoted opens nothing.
 *
 * Note what this screen still does not offer: no registration, no "create the
 * first administrator", no role selector. Holding administration is not
 * something a login screen can grant, only something it can recognise.
 *
 * The two-factor step is kept. An account with an authenticator enrolled
 * produces a session at assurance level `aal1` however it was opened — a
 * password, an emailed link, or a token this screen redeemed — and the gate
 * refuses any of them until the factor is satisfied. Removing it because the
 * door changed would be exactly the sort of quiet regression that door was
 * supposed to prevent.
 */
export default function AdminLoginPage({
  onAuthenticated,
  initialDenial,
}: {
  /** Re-runs the server-side check in AdminApp. */
  onAuthenticated: () => Promise<void> | void
  /**
   * Why the check that just ran said no.
   *
   * Passed in rather than rediscovered because arriving with a signed-in
   * account that lacks the role is the case most worth explaining, and it
   * happens before this screen has done anything — showing an empty form would
   * invite the person to repeat exactly what already failed.
   */
  initialDenial?: AdminGateReason | null
}) {
  return isSupabaseConfigured ? (
    <RemoteLogin onAuthenticated={onAuthenticated} initialDenial={initialDenial} />
  ) : (
    <LocalGate onAuthenticated={onAuthenticated} />
  )
}

/** Reasons that end the attempt. `mfa_required` is not one — it has a step. */
type Denial = Exclude<AdminGateReason, 'anonymous' | 'mfa_required'>

const DENIAL: Record<Denial, MessageKey> = {
  not_admin: 'admin.deniedNotAdmin',
  suspended: 'admin.deniedSuspended',
  unavailable: 'admin.deniedUnavailable',
}

/** What each refusal from the access service says on screen. */
const CODE_ERROR: Record<AccessCodeError, MessageKey> = {
  offline: 'admin.codeUnavailable',
  empty: 'admin.codeEmpty',
  invalid_code: 'admin.codeWrong',
  rate_limited: 'admin.codeRateLimited',
  not_configured: 'admin.codeNotConfigured',
  no_admin: 'admin.codeNoAdmin',
  ambiguous_admin: 'admin.codeAmbiguous',
  session_failed: 'admin.codeSessionFailed',
  unavailable: 'admin.codeUnavailable',
}

function RemoteLogin({
  onAuthenticated,
  initialDenial,
}: {
  onAuthenticated: () => Promise<void> | void
  initialDenial?: AdminGateReason | null
}) {
  const { t } = useI18n()
  const [denied, setDenied] = useState<Denial | null>(
    initialDenial && initialDenial !== 'anonymous' && initialDenial !== 'mfa_required'
      ? initialDenial
      : null,
  )
  const [code, setCode] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)

  /*
   * The authenticator step, when the gate says one is still owed.
   *
   * Held here rather than inside the code form because it is not that form's
   * business: a session restored from storage owes the same factor, and so
   * would any door added later. The gate refuses every session that owes one,
   * and this is where that refusal is answered.
   */
  const [factorId, setFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState<MessageKey | null>(null)
  const [verifying, setVerifying] = useState(false)

  /**
   * What happens after the code has been redeemed for a session.
   *
   * Note that this asks Postgres rather than believing the exchange. The Edge
   * Function already checked the role before minting anything, and this checks
   * it again from inside the database with the session that actually resulted —
   * because those are two different questions and only the second one governs
   * what any subsequent query returns.
   */
  const check = async () => {
    const session = await loadAdminSession()
    if (session.reason === 'mfa_required' && session.factorId) {
      setFactorId(session.factorId)
      return
    }
    if (session.reason && session.reason !== 'anonymous') {
      setDenied(session.reason as Denial)
      return
    }
    await onAuthenticated()
  }

  /*
   * A session restored from storage that still owes its factor.
   *
   * `AdminApp` runs the gate before this screen is drawn and passes on the
   * reason, but not the factor — so the id is fetched once here rather than
   * threaded through. Without it an administrator who reloaded mid-sign-in
   * would be shown the code form again with no indication that the code was
   * never the thing outstanding.
   */
  useEffect(() => {
    if (initialDenial === 'mfa_required') void check()
    // Once, on mount, for the state this screen was opened in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (denied) {
    return (
      <AdminAuthShell title={t('admin.deniedTitle')} subtitle={t('admin.codeSubtitle')}>
        <div className="space-y-5 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-[3px] bg-red-50 text-red-600">
            <ShieldAlert className="size-6" />
          </span>
          <p className="text-sm leading-relaxed text-ink-600">{t(DENIAL[denied])}</p>
          <Button
            variant="secondary"
            block
            onClick={async () => {
              // Sign the rejected account out before offering the form again,
              // or the next attempt silently reuses the session that just
              // failed and appears to fail for no reason.
              const { endAdminSession } = await import('@/admin/session')
              await endAdminSession()
              setDenied(null)
              setCode('')
            }}
          >
            {t('admin.signOutAndRetry')}
          </Button>
        </div>
      </AdminAuthShell>
    )
  }

  const submitFactor = async (candidate: string) => {
    if (!factorId) return
    setMfaError(null)
    setVerifying(true)
    const outcome = await verifyMfaCode(factorId, candidate)
    setVerifying(false)
    if (!outcome.ok) {
      setMfaCode('')
      setMfaError(outcome.error === 'wrong_code' ? 'auth.errWrongCode' : 'auth.errSendFailed')
      return
    }
    setFactorId(null)
    setMfaCode('')
    // Back through the gate, which now has an `aal2` session to look at.
    await check()
  }

  if (factorId) {
    return (
      <AdminAuthShell
        title={t('admin.mfaTitle')}
        subtitle={t('admin.mfaSubtitle')}
        footer={t('admin.codeNote')}
      >
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
              <ShieldCheck className="size-6" />
            </span>
            <p className="text-sm leading-relaxed text-ink-600">{t('admin.mfaBody')}</p>
          </div>

          <CodeInput
            label={t('admin.mfaCodeLabel')}
            value={mfaCode}
            onChange={setMfaCode}
            onComplete={(v) => void submitFactor(v)}
            disabled={verifying}
            invalid={mfaError !== null}
            autoFocus
          />
          {mfaError && (
            <p role="alert" className="text-center text-sm font-medium text-red-700">
              {t(mfaError)}
            </p>
          )}

          <Button
            block
            loading={verifying}
            disabled={mfaCode.replace(/\D/g, '').length !== TOTP_CODE_LENGTH}
            onClick={() => void submitFactor(mfaCode)}
          >
            {t('auth.verify')}
          </Button>

          <Button
            variant="ghost"
            block
            onClick={async () => {
              // Abandoning the step must end the half-finished session, or the
              // next load walks back in at `aal1` and is refused again with no
              // explanation of what changed.
              const { endAdminSession } = await import('@/admin/session')
              await endAdminSession()
              setFactorId(null)
              setMfaCode('')
              setMfaError(null)
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </AdminAuthShell>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const outcome = await redeemAccessCode(code)
    if (!outcome.ok) {
      setBusy(false)
      // The field is cleared on a wrong code and kept on a service failure.
      // Retyping a long secret because the function was not deployed is a
      // punishment for somebody else's mistake.
      if (outcome.error === 'invalid_code') setCode('')
      setError(CODE_ERROR[outcome.error])
      return
    }
    await check()
    setBusy(false)
  }

  return (
    <AdminAuthShell
      title={t('admin.codeTitle')}
      subtitle={t('admin.codeSubtitle')}
      footer={t('admin.codeNote')}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('admin.codeLabel')} required error={error ? t(error) : undefined}>
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                type={reveal ? 'text' : 'password'}
                dir="ltr"
                autoFocus
                // Never offered to a password manager and never restored by the
                // browser: this is a shared operational secret, not a personal
                // credential, and a machine that remembers it is a machine that
                // has the code.
                autoComplete="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
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
          {busy ? t('admin.codeChecking') : t('admin.codeEnter')}
        </Button>
      </form>

      <p className="mt-5 flex items-start gap-2 border-t border-ivory-300 pt-4 text-2xs leading-relaxed text-ink-400">
        <KeyRound className="mt-px size-3.5 shrink-0" />
        {t('admin.codeNote')}
      </p>
    </AdminAuthShell>
  )
}

/**
 * The prototype's passphrase gate, kept for when no database is configured.
 *
 * Unchanged, and unchanged deliberately. It is exactly as strong as it ever
 * was, which is to say: it makes guessing expensive and nothing more, over data
 * that never left this browser anyway. The banner above it says so. Keeping it
 * means `npm run dev:admin` on a fresh clone still opens the dashboard, which
 * is worth having; the access code cannot serve here because there is no server
 * to check it against, and pretending otherwise would be the exact confusion
 * this file exists to remove.
 */
function LocalGate({ onAuthenticated }: { onAuthenticated: () => Promise<void> | void }) {
  const { t } = useI18n()
  const [phrase, setPhrase] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phrase.trim()) {
      setError(t('admin.gateEmpty'))
      return
    }

    setBusy(true)
    setError('')
    const ok = await verifyAdminPassphrase(phrase)
    if (!ok) {
      setBusy(false)
      setPhrase('')
      setError(t('admin.gateWrong'))
      return
    }

    markLocalGatePassed()
    await onAuthenticated()
    setBusy(false)
  }

  return (
    <AdminAuthShell
      title={t('admin.gateTitle')}
      subtitle={t('admin.gateSubtitle')}
      footer={t('admin.gateNote')}
    >
      <Notice tone="warn" title={t('admin.localModeTitle')} className="mb-5">
        {t('admin.localModeBody')}
      </Notice>

      <form onSubmit={submit} className="space-y-4">
        <Field label={t('admin.gatePassphrase')} required error={error}>
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                type={reveal ? 'text' : 'password'}
                dir="ltr"
                autoFocus
                autoComplete="off"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
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
          {busy ? t('admin.gateChecking') : t('admin.gateEnter')}
        </Button>
      </form>

      <p className="mt-5 flex items-start gap-2 border-t border-ivory-300 pt-4 text-2xs leading-relaxed text-ink-400">
        <Lock className="mt-px size-3.5 shrink-0" />
        {t('admin.gateNote')}
      </p>
    </AdminAuthShell>
  )
}
