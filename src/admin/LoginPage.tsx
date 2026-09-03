import { useState } from 'react'
import { Eye, EyeOff, Lock, ShieldAlert } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { Button, Field, Input, Notice } from '@/components/ui'
import { OtpFlow } from '@/components/auth/OtpFlow'
import { PasswordSignIn } from '@/components/auth/PasswordSignIn'
import { AdminAuthShell } from '@/admin/layout/AdminAuthShell'
import { verifyAdminPassphrase } from '@/admin/access'
import { ADMIN_EMAIL, adminIdentityMisconfigured, hasFixedAdminIdentity } from '@/admin/identity'
import { loadAdminSession, markLocalGatePassed, type AdminGateReason } from '@/admin/session'

/**
 * The administration sign-in screen.
 *
 * Note what it does *not* offer: there is no "register", no "create the first
 * administrator", and no role selector. Holding administration is not something
 * this screen can grant, only something it can recognise — the grant happens in
 * the database, by someone who already holds it, and the copy says so rather
 * than leaving a visitor to guess why a correct sign-in was refused.
 *
 * The refusal itself is deliberately explicit here, unlike on the public site
 * where a vague message protects account privacy. There is nothing to protect:
 * anyone reaching this host already knows an administration area exists, and
 * telling a member of staff "your account is not an administrator" saves them
 * from retrying an address that was never going to work.
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
   * happens before this screen has done anything — showing an empty sign-in
   * form would invite the person to repeat exactly what already failed.
   */
  initialDenial?: AdminGateReason | null
}) {
  return isSupabaseConfigured ? (
    <RemoteLogin onAuthenticated={onAuthenticated} initialDenial={initialDenial} />
  ) : (
    <LocalGate onAuthenticated={onAuthenticated} />
  )
}

const DENIAL: Record<Exclude<AdminGateReason, 'anonymous'>, MessageKey> = {
  not_admin: 'admin.deniedNotAdmin',
  suspended: 'admin.deniedSuspended',
  unavailable: 'admin.deniedUnavailable',
}

/**
 * Prove who you are, then be checked for the role.
 *
 * The two are separate steps on purpose, and the separation is the whole
 * design. Authentication — a password, a second factor, or a one-time code —
 * establishes *who* you are, which Supabase does. Whether that person
 * administers NASEK is a second question, answered by `is_admin()` inside
 * Postgres against a JWT this browser cannot forge. Collapsing them would mean
 * the login screen deciding its own outcome, which is the shape of the guard
 * this whole change exists to remove.
 *
 * Three ways in, one gate behind all of them: a password, that password plus an
 * authenticator code where the account has one enrolled, and the one-time code
 * as the recovery path. Not one of them decides anything.
 *
 * The address is no longer asked for. There is one administration account and
 * it is named at build time (`VITE_ADMIN_EMAIL`), so typing it was reproducing
 * a constant under time pressure — and it never protected anything: knowing an
 * address has always granted nothing, and `is_admin()` inside Postgres is what
 * this screen actually has to satisfy. Where the variable is unset the address
 * field comes back, because the alternative is a dashboard nobody can open.
 */
function RemoteLogin({
  onAuthenticated,
  initialDenial,
}: {
  onAuthenticated: () => Promise<void> | void
  initialDenial?: AdminGateReason | null
}) {
  const { t } = useI18n()
  const [denied, setDenied] = useState<Exclude<AdminGateReason, 'anonymous'> | null>(
    initialDenial && initialDenial !== 'anonymous' ? initialDenial : null,
  )
  const [useCode, setUseCode] = useState(false)

  if (denied) {
    return (
      <AdminAuthShell title={t('admin.deniedTitle')} subtitle={t('admin.loginSubtitle')}>
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
            }}
          >
            {t('admin.signOutAndRetry')}
          </Button>
        </div>
      </AdminAuthShell>
    )
  }

  /**
   * What happens after *any* successful authentication here.
   *
   * The identifier is not needed: who signed in is settled by the session
   * Supabase just issued, and whether they administer NASEK is settled by
   * `is_admin()` inside Postgres. Neither answer comes from this form, which is
   * the entire difference between this gate and the one it replaced.
   */
  const check = async () => {
    const session = await loadAdminSession()
    if (session.reason && session.reason !== 'anonymous') {
      setDenied(session.reason)
      return
    }
    await onAuthenticated()
  }

  return (
    <AdminAuthShell
      title={t('admin.loginTitle')}
      subtitle={t('admin.loginSubtitle')}
      footer={t('admin.loginNote')}
    >
      {/*
        Password first, and second factor after it where the account has one.

        An administrator is the person called when something is wrong, and
        putting an email provider's delivery time between them and the dashboard
        is a bad trade at exactly the wrong moment. `PasswordSignIn` handles the
        authenticator step itself — a password on an account with a factor
        enrolled produces a session at assurance level `aal1`, which reads like
        success and is not one.
      */}
      {/* Warned about rather than ignored: a `VITE_ADMIN_EMAIL` that is not an
          address would otherwise surface as "invalid credentials" and send an
          administrator hunting for a password problem that does not exist. */}
      {adminIdentityMisconfigured && (
        <Notice tone="warn" className="mb-5">
          {t('admin.identityMisconfigured')}
        </Notice>
      )}

      <PasswordSignIn
        bare
        defaultOpen
        fixedEmail={hasFixedAdminIdentity ? ADMIN_EMAIL : undefined}
        onSignedIn={check}
      />

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-ivory-300" />
        <span className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('auth.or')}
        </span>
        <span className="h-px flex-1 bg-ivory-300" />
      </div>

      <button
        type="button"
        onClick={() => setUseCode((v) => !v)}
        aria-expanded={useCode}
        className="w-full text-center text-xs font-bold text-nasek-700 transition-colors hover:underline"
      >
        {t('admin.useCodeInstead')}
      </button>

      {useCode && (
        <div className="mt-5 border-t border-ivory-300 pt-5">
          {/*
            Kept, and not as a curiosity. It is how an administrator who has
            forgotten their password gets back in, and how accounts that predate
            passwords sign in at all — remove it and the recovery path for the
            highest-privilege role on the platform becomes "ask someone with
            database access".

            Email only. An administrator's address is a stable thing an
            organisation controls; a personal handset is not, and NASEK should
            not be one lost phone away from having no administrator.
          */}
          <OtpFlow
            channels={['email']}
            lockedValue={hasFixedAdminIdentity ? ADMIN_EMAIL : undefined}
            onSuccess={check}
          />
        </div>
      )}
    </AdminAuthShell>
  )
}

/**
 * The prototype's passphrase gate, kept for when no database is configured.
 *
 * It is exactly as strong as it ever was, which is to say: it makes guessing
 * expensive and nothing more, over data that never left this browser anyway.
 * The banner above it says so. Keeping it means `npm run dev` on a fresh clone
 * still opens the dashboard, which is worth having; pretending it were the real
 * thing would not be.
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
      title={t('admin.loginTitle')}
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
