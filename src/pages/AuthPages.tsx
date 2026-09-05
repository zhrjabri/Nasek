import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import type { OtpTarget } from '@/services/auth/otp'
import { useCompleteSignIn } from '@/hooks/useSignIn'
import { Logo } from '@/components/brand/Logo'
import { OtpFlow } from '@/components/auth/OtpFlow'
import { Card, Notice } from '@/components/ui'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <main className="relative mx-auto flex max-w-lg flex-col px-4 py-12 sm:px-6 lg:py-16">
      <div className="mb-8 text-center">
        <Link to="/" className="inline-block">
          <Logo size="lg" />
        </Link>
        <h1 className="display mt-7 text-4xl text-ink-900 sm:text-5xl">{title}</h1>
        <p className="mt-2.5 text-md text-ink-500">{subtitle}</p>
      </div>

      <Card className="p-6 sm:p-7">{children}</Card>

      {footer && <p className="mt-6 text-center text-sm text-ink-500">{footer}</p>}

      <p className="mt-8 flex items-start gap-2 rounded-[3px] border border-ivory-300 bg-ivory-50 p-3.5 text-2xs leading-relaxed text-ink-400">
        <ShieldCheck className="mt-px size-3.5 shrink-0" />
        {t('trust.disclaimer')}
      </p>
    </main>
  )
}

/**
 * Signing in — the only authentication this website has.
 *
 * One field, one method, one audience. An address, a code, and you are in.
 *
 * WHAT IS DELIBERATELY NOT ON THIS PAGE, AND WHY
 *
 * *No "create account".* Verifying a code against an unknown address creates
 * the account — `shouldCreateUser` is true — so registering and signing in were
 * always the same operation under two names. Offering both made a pilgrim
 * choose between two doors into the same room, and made a returning one wonder
 * whether they had used the other. There is one button and it says "sign in",
 * which is what somebody arriving here thinks they are doing whether or not
 * NASEK has heard of them before.
 *
 * *No password.* Nobody who signs in here has one. Campaign owners and
 * administrators do, and each of them has an application of their own on a host
 * of their own — a password field here could only ever reject the people who
 * saw it.
 *
 * *No "Continue with Google".* The same argument one step further: a second way
 * to do the one thing this page does.
 *
 * *No link to the Campaign Owner Portal, and none to administration.* Not
 * folded away, not in small print, not in the footer. A pilgrim should not
 * learn from this site that either application exists, and the way to guarantee
 * that is for this bundle not to contain them — which
 * `npm run verify:isolation` checks against the built output rather than
 * against anybody's intentions.
 */
export function SignInPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const complete = useCompleteSignIn()
  const [error, setError] = useState<MessageKey | null>(null)

  const next = params.get('next')

  /**
   * The last step: turn the proved address into a session, then go on.
   *
   * `next` is what makes booking feel uninterrupted — somebody who pressed
   * "Book now" on a campaign is returned to that campaign's booking form rather
   * than to a dashboard, which is the whole reason authentication is asked for
   * at the moment of booking instead of at the door.
   */
  const finish = async (target: OtpTarget) => {
    const outcome = await complete(target)
    if (outcome.error || !outcome.user) {
      setError(outcome.error ?? 'auth.sessionFailed')
      return
    }
    navigate(next ?? '/dashboard', { replace: true })
  }

  return (
    <AuthShell title={t('auth.otpTitle')} subtitle={t('auth.otpSubtitle')}>
      {error && (
        <Notice tone="danger" live className="mb-5">
          {t(error)}
        </Notice>
      )}

      {/*
        Email only.

        This screen registers as much as it signs in, which is what rules the
        phone channel out rather than any difficulty in building it: an account
        whose only identifier is a handset cannot be recovered when the handset
        is lost, and a pilgrim signs in around one trip in their life — long
        enough to change numbers, rarely enough not to notice until it matters.
      */}
      <OtpFlow channels={['email']} onSuccess={finish} />

      <p className="mt-5 border-t border-ivory-300 pt-4 text-2xs leading-relaxed text-ink-400">
        {t('auth.noAccountNeeded')}
      </p>
    </AuthShell>
  )
}

/**
 * Every address this site used to offer a second way in from.
 *
 * `/signup`, `/signup/customer`, `/signin/customer`, `/signin/owner` and
 * `/signup/provider` — a role chooser, two registrations and a per-role sign-in,
 * all of which now resolve to the single door above. They are kept rather than
 * deleted because they were linked from the footer, from the home page and from
 * anywhere somebody bookmarked them, and a bookmark that returns "not found" is
 * indistinguishable from a site that is broken.
 *
 * `next` is carried through, so an interrupted booking still resumes where it
 * left off even when the link that interrupted it is three renames old.
 */
export function SignInRedirect() {
  const [params] = useSearchParams()
  const next = params.get('next')
  return <Navigate to={next ? `/signin?next=${encodeURIComponent(next)}` : '/signin'} replace />
}
