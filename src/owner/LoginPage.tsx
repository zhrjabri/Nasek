import { useState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { loadSessionSettled, signOutRemote } from '@/services/auth/session'
import { requestPasswordReset } from '@/services/auth/password'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { PasswordSignIn } from '@/components/auth/PasswordSignIn'
import { Button, Field, Input, Notice } from '@/components/ui'
import { OwnerAuthShell } from './layout/OwnerShell'

/**
 * The campaign owner's door — the only one this application has.
 *
 * NASEK has three doors and they are three separate applications now:
 *
 *   pilgrims        the public site, an address and a one-time code
 *   campaign owners this portal, email and password
 *   administrators  a third build, one access code
 *
 * Nothing here links to either of the others, and nothing on the public site
 * links here. A pilgrim never learns this portal exists; an owner is given its
 * address by NASEK along with their invitation.
 *
 * WHY THERE IS NO "REGISTER" ON THIS SCREEN
 *
 * There used to be. Public self-registration meant anybody could create a
 * company row and put it in the verification queue, which made the queue a
 * moderation problem as much as a verification one. Owners are now created by
 * an administrator — who enters the company details, uploads and checks the
 * permit, and sends an invitation — so by the time somebody reaches this screen
 * NASEK has already decided they belong here.
 *
 * There is deliberately no one-time code either. That is the pilgrims' method,
 * and offering it here would collapse the two doors back into one. An owner who
 * has lost their password resets it, which proves control of the same address a
 * code would and ends in a password rather than in a session with none.
 */
export function OwnerLoginPage({ onSignedIn }: { onSignedIn: () => Promise<void> | void }) {
  const { t } = useI18n()
  const { dispatch } = useStore()
  const [error, setError] = useState<MessageKey | null>(null)
  const [resetting, setResetting] = useState(false)

  /**
   * What happens after the password is accepted.
   *
   * The password proves who you are; it does not prove you are a campaign
   * owner, and this is where the two questions are kept apart. The profile is
   * read back from Postgres — where `role` lives, and where nothing this
   * browser says can change it — and an account that turns out to be a
   * pilgrim's or an administrator's is signed straight back out with an
   * explanation.
   *
   * Signing them out rather than leaving the half-session is the important
   * half. Somebody left signed in after being told they are in the wrong place
   * would be bounced by the gate on the next render, with no way to tell what
   * had happened.
   */
  const finish = async () => {
    setError(null)
    const session = await loadSessionSettled()

    if (session.blocked === 'suspended') {
      setError('auth.blockedSuspended')
      return
    }
    if (session.blocked === 'removed') {
      setError('auth.blockedRemoved')
      return
    }
    if (!session.user) {
      setError('auth.sessionFailed')
      return
    }
    if (session.user.role !== 'provider') {
      await signOutRemote()
      dispatch({ type: 'signOut' })
      setError('owner.wrongDoor')
      return
    }

    dispatch({ type: 'registerUser', user: session.user })
    dispatch({ type: 'signIn', user: session.user })
    await onSignedIn()
  }

  if (resetting) return <ResetRequest onBack={() => setResetting(false)} />

  return (
    <OwnerAuthShell
      title={t('owner.signInTitle')}
      subtitle={t('owner.signInSubtitle')}
      footer={
        <p className="leading-relaxed">
          <span className="font-semibold text-ink-700">{t('owner.noAccount')}</span>{' '}
          {t('owner.noAccountBody')}
        </p>
      }
    >
      {error && (
        <Notice tone="danger" live className="mb-5">
          {t(error)}
        </Notice>
      )}

      {/*
        `bare` and `defaultOpen`: the disclosure that folds this away on the
        public site is exactly wrong here. There is nothing else on this page
        for it to be folded away *from* — the password is the whole method — and
        a collapsed form would suggest an alternative exists.
      */}
      <PasswordSignIn bare defaultOpen onSignedIn={finish} />

      <button
        type="button"
        onClick={() => setResetting(true)}
        className="mt-4 w-full text-center text-xs font-bold text-nasek-700 transition-colors hover:underline"
      >
        {t('owner.forgot')}
      </button>

      <p className="mt-5 flex items-start gap-2 border-t border-ivory-300 pt-4 text-2xs leading-relaxed text-ink-400">
        <KeyRound className="mt-px size-3.5 shrink-0" />
        {t('owner.passwordOnly')}
      </p>
    </OwnerAuthShell>
  )
}

/**
 * Forgotten password.
 *
 * The reason this portal can offer email-and-password only and still have a way
 * back in. The confirmation is deliberately unconditional — "if that address
 * has an owner account" — and never says whether one was found. Anything else
 * turns this box into a way to discover which companies NASEK has taken on.
 */
function ResetRequest({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError(t('auth.emailInvalid'))
      return
    }
    setError('')
    setBusy(true)
    await requestPasswordReset(email)
    setBusy(false)
    setSent(true)
  }

  return (
    <OwnerAuthShell
      title={t('owner.forgotTitle')}
      subtitle={t('owner.forgotBody')}
      footer={
        <button
          type="button"
          onClick={onBack}
          className="font-semibold text-nasek-700 hover:underline"
        >
          {t('owner.forgotBack')}
        </button>
      }
    >
      {sent ? (
        <Notice tone="success" live>
          {t('owner.forgotSent')}
        </Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {!isSupabaseConfigured && <Notice tone="warn">{t('auth.errSendFailed')}</Notice>}
          <Field label={t('common.email')} required error={error}>
            {(p) => (
              <Input
                {...p}
                type="email"
                dir="ltr"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="lg" block loading={busy}>
            <Mail className="size-4" />
            {t('owner.forgotSend')}
          </Button>
        </form>
      )}
    </OwnerAuthShell>
  )
}
