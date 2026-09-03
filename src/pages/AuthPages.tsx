import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, ChevronRight, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import type { OtpTarget } from '@/services/auth/otp'
import { useCompleteSignIn, landingFor } from '@/hooks/useSignIn'
import { Logo } from '@/components/brand/Logo'
import { OtpFlow } from '@/components/auth/OtpFlow'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { PasswordSignIn } from '@/components/auth/PasswordSignIn'
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
 * One of the two doors on the sign-up screen.
 *
 * Sized like a card rather than a button: the choice between customer and
 * campaign owner decides which half of the product someone sees, so it should
 * not read as an afterthought tucked under a form.
 */
function RoleOption({
  icon,
  title,
  note,
  badge,
  to,
}: {
  icon: React.ReactNode
  title: string
  note: string
  badge?: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="group flex w-full items-start gap-3.5 rounded-[3px] border border-ivory-300 bg-ivory-50 p-4 text-start transition-all hover:border-nasek-400 hover:bg-nasek-50/40"
    >
      <span className="mt-px flex size-9 shrink-0 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700 transition-colors group-hover:bg-nasek-100">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-base font-bold text-ink-900 group-hover:text-nasek-900">
          {title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-ink-500">{note}</span>
        {badge && (
          <span className="mt-2 inline-flex items-center rounded-[3px] bg-gold-100 px-2 py-1 text-2xs font-bold text-gold-800">
            {badge}
          </span>
        )}
      </span>
      <ChevronRight className="mt-2 size-4 shrink-0 text-ink-300 transition-colors group-hover:text-nasek-600 rtl:rotate-180" />
    </Link>
  )
}

// ------------------------------------------------------------------ sign in

/**
 * Signing in.
 *
 * There is one screen now, and it does not ask what kind of account you have.
 *
 * It used to ask, and there is a reason that was wrong beyond the extra click:
 * the person signing in already knows who they are, and making them declare it
 * meant the form could reject a correct identifier for being typed under the
 * wrong heading — a campaign owner picking "Customer" got "those details do not
 * match an account", which is both true and useless. Identity comes from the
 * code; the role comes from the account the code unlocked; the destination
 * follows from the role. Nobody has to classify themselves to get in.
 *
 * There is also no separate registration path from here. Verifying a code on an
 * unknown address creates the account, so the same screen serves a returning
 * pilgrim and a first-time one.
 */
export function SignInPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const complete = useCompleteSignIn()
  const [error, setError] = useState<MessageKey | null>(null)

  const next = params.get('next')

  /**
   * The last step of every route in: work out who the proved identifier belongs
   * to, then send them to their own half of the product.
   *
   * Shared by the code, the password and — through the redirect hook — Google,
   * because the destination is a fact about the *account*, not about how
   * somebody got into it. `landingFor` reads the role that came back from
   * Postgres; a campaign owner whose company is still in the queue lands on
   * `/provider` and the route guard forwards them from there, so there is one
   * place that knows about company states and it is not this one.
   */
  const finish = async (target: OtpTarget) => {
    const outcome = await complete(target)
    if (outcome.error || !outcome.user) {
      setError(outcome.error ?? 'auth.sessionFailed')
      return
    }
    navigate(next ?? landingFor(outcome.user), { replace: true })
  }

  return (
    <AuthShell
      title={t('auth.otpTitle')}
      subtitle={t('auth.otpSubtitle')}
      footer={
        <>
          {t('auth.ownerRedirect')}{' '}
          <Link to="/signup/provider" className="font-semibold text-nasek-700 hover:underline">
            {t('auth.ownerRegisterLink')}
          </Link>
        </>
      }
    >
      {error && (
        <Notice tone="danger" live className="mb-5">
          {t(error)}
        </Notice>
      )}

      {/* Renders nothing unless the project actually has Google configured —
          see the component, and the reason a conditional button beats a broken
          one. */}
      <div className="mb-5">
        <GoogleButton />
      </div>

      {/*
        Email only, on the way in as well as on the way up.

        This screen registers as much as it signs in — `shouldCreateUser` is
        true, so a code verified against an unknown identifier creates the
        account — which means leaving the phone channel here would quietly
        reopen the registration path that customer sign-up just closed: an
        account created on a handset, with no address to reach it at.

        It costs nothing today. Phone codes need an SMS provider the project
        does not have, so the tab offered a channel that could not deliver; and
        an identifier that cannot be recovered when the handset is lost is a bad
        one for somebody who signs in around one trip in their life. Campaign
        owners and administrators were email-only already.
      */}
      <OtpFlow channels={['email']} onSuccess={finish} />

      {/*
        Folded away, and that placement is the decision rather than an
        afterthought. Almost everyone signing in here is a pilgrim who has no
        password and never will; campaign owners and administrators have one and
        know they do. Giving both equal billing would ask the majority to choose
        between two things when only one of them applies to them.
      */}
      <div className="mt-5">
        <PasswordSignIn onSignedIn={(email) => finish({ channel: 'email', value: email })} />
      </div>
    </AuthShell>
  )
}

/**
 * The old per-role sign-in addresses.
 *
 * Kept as redirects rather than deleted. They were linked from the sign-in
 * chooser, from the footer and from anywhere a person bookmarked them, and a
 * bookmark that returns "not found" is indistinguishable from a site that is
 * broken. `next` is carried through so an interrupted journey still resumes
 * where it left off.
 */
function RedirectToSignIn() {
  const [params] = useSearchParams()
  const next = params.get('next')
  return <Navigate to={next ? `/signin?next=${encodeURIComponent(next)}` : '/signin'} replace />
}

export const CustomerSignInPage = RedirectToSignIn
export const OwnerSignInPage = RedirectToSignIn

// ------------------------------------------------------------------ sign up

/**
 * The account-type chooser.
 *
 * Still here, and still worth a screen, even though signing in no longer asks.
 * The two registrations genuinely differ: a campaign owner uploads a trade
 * permit and registers a company, a pilgrim does not. The owner route is listed
 * first and carries the permit badge, because the permit is the whole basis of
 * trust on NASEK and someone registering a campaign should know it is coming
 * before they start filling anything in.
 */
export function SignUpPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()

  // Older links (the footer, the map page) still point at ?role=provider.
  if (params.get('role') === 'provider') {
    return <Navigate to="/signup/provider" replace />
  }

  return (
    <AuthShell
      title={t('auth.signUpTitle')}
      subtitle={t('auth.signUpChoose')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/signin" className="font-semibold text-nasek-700 hover:underline">
            {t('nav.signIn')}
          </Link>
        </>
      }
    >
      <div className="grid gap-3">
        <RoleOption
          icon={<Building2 className="size-4.5" />}
          title={t('auth.signUpOwner')}
          note={t('auth.signUpOwnerNote')}
          badge={t('auth.permitBadge')}
          to="/signup/provider"
        />
        <RoleOption
          icon={<UserIcon className="size-4.5" />}
          title={t('auth.signUpCustomer')}
          note={t('auth.signUpCustomerNote')}
          badge={t('auth.emailOnlyBadge')}
          to="/signup/customer"
        />
      </div>
    </AuthShell>
  )
}

// --------------------------------------------------- customer registration

/**
 * Registering as a pilgrim.
 *
 * One field. That is the whole form, and it is the decision this screen exists
 * to express rather than an omission to apologise for.
 *
 * It used to ask for a name, a phone number, a wilayah and an accepted terms
 * checkbox before it would send a code — four answers NASEK did not need yet,
 * standing between somebody and the campaign they had already chosen. None of
 * them made the account safer and none of them made the catalogue more useful;
 * they existed because registration forms traditionally ask. A pilgrim who
 * never books gave us four fields of nothing, and a pilgrim who does book has
 * to give the real details anyway — on the booking form, where a mistyped
 * passport number matters and a mistyped one on a sign-up screen does not.
 *
 * So the address is all that is collected here, because the address is all
 * that is used: it is the identifier, it is where the code goes, and it is how
 * a returning pilgrim is recognised. Everything else is asked at
 * `/booking/:id`, at the moment it becomes load-bearing, and written back to
 * the profile there so it is asked exactly once.
 *
 * This screen and `SignInPage` therefore do the same thing, which is correct
 * and not a duplication to collapse: `shouldCreateUser` is true on both, so a
 * code verified against an unknown address creates the account. The two screens
 * differ only in what they promise the person who arrived at them.
 */
export function CustomerSignUpPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const complete = useCompleteSignIn()
  const [failure, setFailure] = useState<MessageKey | null>(null)

  /**
   * No `details` argument, and that absence is the change.
   *
   * `useCompleteSignIn` still accepts the registration details a form gathered
   * — the campaign-owner flow has real ones to pass — and this one has nothing
   * to say beyond the address that was just proved. The profile is created by
   * the database trigger with an empty name, which `fallbackName` renders as
   * the local part of the address until a booking supplies a real one.
   */
  const finish = async (target: OtpTarget) => {
    const outcome = await complete(target)
    if (outcome.error || !outcome.user) {
      setFailure(outcome.error ?? 'auth.sessionFailed')
      return
    }
    navigate(landingFor(outcome.user), { replace: true })
  }

  return (
    <AuthShell
      title={t('auth.customerSignUpTitle')}
      subtitle={t('auth.customerSignUpSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/signin" className="font-semibold text-nasek-700 hover:underline">
            {t('nav.signIn')}
          </Link>
        </>
      }
    >
      {failure && (
        <Notice tone="danger" live className="mb-5">
          {t(failure)}
        </Notice>
      )}

      {/* Campaign owners register on their own page: the permit upload and the
          company details do not belong behind a toggle on a form whose entire
          content is one address. */}
      <p className="mb-5 flex items-start gap-2 rounded-[3px] border border-nasek-200 bg-nasek-50/60 p-3.5 text-xs leading-relaxed text-ink-600">
        <Building2 className="mt-px size-4 shrink-0 text-nasek-700" />
        <span>
          {t('auth.ownerRedirect')}{' '}
          <Link to="/signup/provider" className="font-semibold text-nasek-700 hover:underline">
            {t('auth.ownerRegisterLink')}
          </Link>
        </span>
      </p>

      {/* Renders nothing unless the project actually has Google configured.
          It collects no more than the code path does — an address and a
          verified claim to it — so it belongs on a screen that promises to ask
          for nothing else. */}
      <div className="mb-5">
        <GoogleButton />
      </div>

      {/* Email only. The phone channel exists and works, but an account whose
          only identifier is a handset cannot be recovered when the handset is
          lost, and a pilgrim signs in around one trip in their life — long
          enough to change numbers, rarely enough not to notice until it
          matters. */}
      <OtpFlow channels={['email']} onSuccess={finish} submitLabel={t('auth.createAccount')} />

      <p className="mt-5 text-xs leading-relaxed text-ink-500">{t('auth.bookingDetailsLater')}</p>

      {/*
        Consent as a sentence rather than a checkbox.

        The checkbox that used to be here could only ever produce one answer
        before the button would work, which makes it a click and not a choice.
        Saying what continuing means, immediately above the control that does
        it, is the same agreement with one less obstacle in front of it.
      */}
      <p className="mt-3 text-2xs leading-relaxed text-ink-400">{t('auth.termsNote')}</p>
    </AuthShell>
  )
}
