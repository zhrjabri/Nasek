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
import { OwnerSignUpPage } from './RegisterPage'

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
 * REGISTERING, AND WHY IT IS BACK
 *
 * Public self-registration was removed once, because anybody could create a
 * company row and put it in the verification queue — which made the queue a
 * moderation problem as well as a verification one. An administrator adding
 * companies by hand solved that and replaced it with a worse one: a company
 * that wants to join NASEK has to find someone at NASEK first, and the platform
 * grows only as fast as somebody types.
 *
 * It is back, and the thing that made it unsafe is not. A registration still
 * ends in `pending` and still cannot publish a single trip until an
 * administrator has looked at the permit — `provider_can_publish()` is what
 * enforces that, in the database, and no form on this screen can talk it round.
 * What self-registration costs is a queue with some applications in it that will
 * be refused, which is what a queue is.
 *
 * There is deliberately no one-time code. That is the pilgrims' method, and
 * offering it here would collapse the two doors back into one. An owner who has
 * lost their password resets it, which proves control of the same address a
 * code would and ends in a password rather than in a session with none.
 *
 * The number is a door too, once the project has an SMS provider — Supabase's
 * own phone identity, checked by Supabase. NASEK does not hold the password and
 * never compares one; the number on a company record is contact information.
 */
/** What to say when the link that brought them here could not be completed. */
const LINK_MESSAGE: Record<'expired' | 'wrong_browser' | 'failed', MessageKey> = {
  expired: 'auth.linkExpired',
  wrong_browser: 'auth.linkWrongBrowser',
  failed: 'auth.linkFailed',
}

export function OwnerLoginPage({
  onSignedIn,
  linkError,
}: {
  onSignedIn: () => Promise<void> | void
  /**
   * Set when this page load followed a dead invitation or reset link.
   *
   * Without it an invited owner who clicks a spent link is shown a password
   * form and nothing else — the one screen they cannot use, since not having a
   * password is why they were invited. The notice below names what happened and
   * puts them one button from a fresh link.
   */
  linkError?: 'expired' | 'wrong_browser' | 'failed'
}) {
  const { t } = useI18n()
  const { dispatch } = useStore()
  const [error, setError] = useState<MessageKey | null>(null)
  const [resetting, setResetting] = useState(false)
  const [registering, setRegistering] = useState(false)

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
    /*
     * An administrator is shown the door; anyone else is let through to the
     * gate, which offers them the company registration form.
     *
     * This used to bounce every non-owner, and that turned the confirmation
     * link at the end of a registration into a dead end: a freshly confirmed
     * account is a 'customer' until `register_provider` runs, and
     * `register_provider` cannot run for somebody who has just been signed out.
     */
    if (session.user.role === 'admin') {
      await signOutRemote()
      dispatch({ type: 'signOut' })
      setError('owner.wrongDoor')
      return
    }

    dispatch({ type: 'registerUser', user: session.user })
    dispatch({ type: 'signIn', user: session.user })
    await onSignedIn()
  }

  if (registering) return <OwnerSignUpPage onBackToSignIn={() => setRegistering(false)} />
  if (resetting) return <ResetRequest onBack={() => setResetting(false)} />

  return (
    <OwnerAuthShell
      title={t('owner.signInTitle')}
      subtitle={t('owner.signInSubtitle')}
      footer={
        <p className="leading-relaxed">
          <span className="font-semibold text-ink-700">{t('owner.noAccount')}</span>{' '}
          <button
            type="button"
            onClick={() => setRegistering(true)}
            className="font-bold text-ivory-50 underline underline-offset-2"
          >
            {t('owner.registerLink')}
          </button>
        </p>
      }
    >
      {linkError && !error && (
        <Notice tone="warn" live className="mb-5">
          <span className="block">{t(LINK_MESSAGE[linkError])}</span>
          {/* The way out, rather than an instruction to contact somebody. A
              reset link lands on the same set-password screen the invitation
              was going to, so an owner recovers this without NASEK. */}
          <button
            type="button"
            onClick={() => setResetting(true)}
            className="mt-2 font-bold underline underline-offset-2"
          >
            {t('owner.forgotSend')}
          </button>
        </Notice>
      )}

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
      {/*
        `allowPhone`, and only here.

        An owner registers with both an address and a number, and the number is
        the one they know without looking it up. It authenticates against
        Supabase's phone identity, not against anything on the company record —
        see `signInWithPhonePassword`. The public site does not get this prop:
        pilgrims sign in with a one-time code and have no password to pair with
        a number.
      */}
      <PasswordSignIn bare defaultOpen allowPhone onSignedIn={finish} />

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
