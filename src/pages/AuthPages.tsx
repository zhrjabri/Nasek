import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, ChevronRight, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { isValidPhone } from '@/services/auth/phone'
import type { OtpChannel } from '@/services/auth/otp'
import { useCompleteSignIn, landingFor } from '@/hooks/useSignIn'
import { useStore } from '@/store/AppStore'
import { Logo } from '@/components/brand/Logo'
import { OtpFlow } from '@/components/auth/OtpFlow'
import { Button, Card, Checkbox, Field, Input, Notice, Select } from '@/components/ui'

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

      <OtpFlow
        onSuccess={async (target) => {
          const outcome = await complete(target)
          if (outcome.error || !outcome.user) {
            setError(outcome.error ?? 'auth.sessionFailed')
            return
          }
          navigate(next ?? landingFor(outcome.user), { replace: true })
        }}
      />
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
 * Two steps: the details NASEK needs, then the code that proves the address is
 * yours. The password and its confirmation are gone — there is nothing left for
 * them to protect, and they were the two fields most likely to end a
 * registration halfway through.
 *
 * The details are collected *before* the code rather than after, which is worth
 * a word. Asking afterwards would let someone abandon the form with a live
 * account and no name on it; asking first means the account that gets created
 * is complete from its first moment, and the code stays the last thing between
 * a finished form and a working dashboard.
 */
export function CustomerSignUpPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const { toast } = useStore()

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    wilayahId: 'muscat',
  })
  const [channel, setChannel] = useState<OtpChannel>('email')
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [stage, setStage] = useState<'details' | 'verify'>('details')
  const [failure, setFailure] = useState<MessageKey | null>(null)

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = t('auth.nameRequired')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = t('auth.emailInvalid')
    if (!isValidPhone(form.phone)) next.phone = t('auth.phoneInvalid')
    if (!agreed) next.terms = t('auth.termsRequired')
    setErrors(next)
    if (Object.keys(next).length) return
    setStage('verify')
  }

  if (stage === 'verify') {
    return (
      <AuthShell
        title={t('auth.customerSignUpTitle')}
        subtitle={t('auth.signUpSubtitle')}
        footer={
          <button
            type="button"
            onClick={() => setStage('details')}
            className="font-semibold text-nasek-700 hover:underline"
          >
            {t('common.back')}
          </button>
        }
      >
        {failure && (
          <Notice tone="danger" live className="mb-5">
            {t(failure)}
          </Notice>
        )}

        {/* The channel is fixed to whichever identifier the form is verifying,
            so the two screens cannot disagree about which address is being
            confirmed. */}
        <VerifyStep
          channel={channel}
          value={channel === 'email' ? form.email : form.phone}
          details={{
            name: form.name,
            phone: form.phone,
            wilayahId: form.wilayahId,
            role: 'customer',
          }}
          onFailure={setFailure}
          onDone={(path) => {
            toast(t('dash.profileSaved'))
            navigate(path, { replace: true })
          }}
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('auth.customerSignUpTitle')}
      subtitle={t('auth.signUpSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/signin" className="font-semibold text-nasek-700 hover:underline">
            {t('nav.signIn')}
          </Link>
        </>
      }
    >
      {/* Campaign owners register on their own page: the licence upload and
          company details do not belong behind a toggle on this form. */}
      <p className="mb-6 flex items-start gap-2 rounded-[3px] border border-nasek-200 bg-nasek-50/60 p-3.5 text-xs leading-relaxed text-ink-600">
        <Building2 className="mt-px size-4 shrink-0 text-nasek-700" />
        <span>
          {t('auth.ownerRedirect')}{' '}
          <Link to="/signup/provider" className="font-semibold text-nasek-700 hover:underline">
            {t('auth.ownerRegisterLink')}
          </Link>
        </span>
      </p>

      <form onSubmit={submitDetails} className="space-y-4" noValidate>
        <Field label={t('common.name')} required error={errors.name}>
          {(p) => (
            <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.email')} required error={errors.email}>
            {(p) => (
              <Input
                {...p}
                type="email"
                dir="ltr"
                autoComplete="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('common.phone')} required error={errors.phone}>
            {(p) => (
              <Input
                {...p}
                type="tel"
                dir="ltr"
                autoComplete="tel"
                placeholder="+968 9xxx xxxx"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label={t('common.wilayah')} hint={t('smart.q2hint')}>
          {(p) => (
            <Select {...p} value={form.wilayahId} onChange={(e) => set('wilayahId', e.target.value)}>
              {WILAYAT.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name[lang]} — {w.governorate[lang]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* Which of the two identifiers to confirm. Both were collected; only
            one has to be proved, and the person should pick which — an email
            they can open on this device beats an SMS they cannot. */}
        <Field label={t('auth.chooseChannel')}>
          {() => (
            <div className="grid grid-cols-2 gap-2">
              {(['email', 'phone'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setChannel(option)}
                  aria-pressed={channel === option}
                  className={
                    channel === option
                      ? 'rounded-[3px] border border-nasek-700 bg-nasek-50 px-3 py-2.5 text-sm font-bold text-nasek-900'
                      : 'rounded-[3px] border border-ivory-400 bg-ivory-50 px-3 py-2.5 text-sm font-semibold text-ink-600 transition-colors hover:border-ink-400/60'
                  }
                >
                  {t(option === 'email' ? 'auth.continueEmail' : 'auth.continuePhone')}
                </button>
              ))}
            </div>
          )}
        </Field>

        <div>
          <Checkbox checked={agreed} onChange={setAgreed} label={t('auth.termsAgree')} />
          {errors.terms && (
            <p role="alert" className="mt-1 text-xs font-medium text-red-600">
              {errors.terms}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" block>
          {t('common.continue')}
        </Button>
      </form>
    </AuthShell>
  )
}

/**
 * The verification half of a registration form.
 *
 * Shared by the pilgrim and campaign-owner registrations, which collect very
 * different things and finish identically.
 */
export function VerifyStep({
  channel,
  value,
  details,
  onDone,
  onFailure,
}: {
  channel: OtpChannel
  value: string
  details: Parameters<ReturnType<typeof useCompleteSignIn>>[1]
  onDone: (path: string) => void
  onFailure: (error: MessageKey) => void
}) {
  const complete = useCompleteSignIn()

  return (
    <OtpFlow
      channels={[channel]}
      initialValue={value}
      onSuccess={async (target) => {
        const outcome = await complete(target, details)
        if (outcome.error || !outcome.user) {
          onFailure(outcome.error ?? 'auth.sessionFailed')
          return
        }
        onDone(landingFor(outcome.user))
      }}
    />
  )
}
