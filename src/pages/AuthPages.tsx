import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, ChevronRight, Eye, EyeOff, Lock, ShieldCheck, User as UserIcon } from 'lucide-react'
import type { Role } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { authApi } from '@/services/api/auth'
import {
  createCredential,
  findCredential,
  identifierKey,
  lockRemainingMs,
  verifyPassword,
  MAX_ATTEMPTS,
} from '@/services/api/credentials'
import { useStore } from '@/store/AppStore'
import { Logo } from '@/components/brand/Logo'
import { Button, Card, Checkbox, Field, Input, Select } from '@/components/ui'

/** Where to send each role after authenticating. */
const HOME_FOR: Record<Role, string> = {
  customer: '/dashboard',
  provider: '/provider',
  admin: '/admin',
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <main className="relative mx-auto flex max-w-lg flex-col px-4 py-12 sm:px-6 lg:py-16">
      <div className="mb-8 text-center">
        <Link to="/" className="inline-block">
          <Logo size="lg" />
        </Link>
        <h1 className="display mt-7 text-[28px] text-ink-900 sm:text-[34px]">{title}</h1>
        <p className="mt-2.5 text-[15px] text-ink-500">{subtitle}</p>
      </div>

      <Card className="p-6 sm:p-7">{children}</Card>

      <p className="mt-6 text-center text-[13.5px] text-ink-500">{footer}</p>

      <p className="mt-8 flex items-start gap-2 rounded-[3px] border border-ivory-300 bg-ivory-50 p-3.5 text-[11.5px] leading-relaxed text-ink-400">
        <ShieldCheck className="mt-px size-3.5 shrink-0" />
        {t('trust.disclaimer')}
      </p>
    </main>
  )
}

/**
 * One of the two doors on the sign-in and sign-up screens.
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
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  note: string
  badge?: string
  to?: string
  onClick?: () => void
  disabled?: boolean
}) {
  const className =
    'group flex w-full items-start gap-3.5 rounded-[3px] border border-ivory-300 bg-ivory-50 p-4 text-start transition-all hover:border-nasek-400 hover:bg-nasek-50/40 disabled:pointer-events-none disabled:opacity-50'

  const body = (
    <>
      <span className="mt-px flex size-9 shrink-0 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700 transition-colors group-hover:bg-nasek-100">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-[14.5px] font-bold text-ink-900 group-hover:text-nasek-900">
          {title}
        </span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-500">{note}</span>
        {badge && (
          <span className="mt-2 inline-flex items-center rounded-[3px] bg-gold-100 px-2 py-1 text-[11px] font-bold text-gold-800">
            {badge}
          </span>
        )}
      </span>
      <ChevronRight className="mt-2 size-4 shrink-0 text-ink-300 transition-colors group-hover:text-nasek-600 rtl:rotate-180" />
    </>
  )

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {body}
    </button>
  )
}

// ------------------------------------------------------------------ sign in

/**
 * Two doors: customer and campaign owner.
 *
 * Administration is deliberately absent. It lives at an unlisted address
 * (see `services/api/adminAccess.ts`) behind a passphrase, so this page gives
 * no hint that an admin area exists at all.
 */
export function SignInPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()

  // Carry any "next" destination through the chooser to the form.
  const next = params.get('next')
  const suffix = next ? `?next=${encodeURIComponent(next)}` : ''

  return (
    <AuthShell
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInChoose')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-semibold text-nasek-700 hover:underline">
            {t('nav.signUp')}
          </Link>
        </>
      }
    >
      <div className="grid gap-3">
        <RoleOption
          icon={<UserIcon className="size-4.5" />}
          title={t('auth.signInCustomer')}
          note={t('auth.signInCustomerNote')}
          to={`/signin/customer${suffix}`}
        />
        <RoleOption
          icon={<Building2 className="size-4.5" />}
          title={t('auth.signInOwner')}
          note={t('auth.signInOwnerNote')}
          to={`/signin/owner${suffix}`}
        />
      </div>
    </AuthShell>
  )
}

// ------------------------------------------------------------- credentials

export function CustomerSignInPage() {
  return <SignInForm role="customer" />
}

export function OwnerSignInPage() {
  return <SignInForm role="provider" />
}

/**
 * The credential form.
 *
 * Both roles share it because the checks are identical — only the account it
 * looks for and where it lands afterwards differ.
 *
 * Every rejection says the same thing. Telling someone "no such account"
 * rather than "wrong password" would let a stranger discover which addresses
 * are registered here simply by trying them, which is a privacy leak before
 * it is a security one. The single message costs a little clarity and closes
 * that off. The one exception is a suspended account, which has to say so —
 * a person locked out by a decision NASEK made deserves to know that is why,
 * and not be left retyping a password that was correct all along.
 */
function SignInForm({ role }: { role: 'customer' | 'provider' }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const {
    dispatch,
    credentials,
    lockouts,
    sessionUsers,
    suspendedUserIds,
    removedUserIds,
  } = useStore()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const next = params.get('next')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotice('')

    const found: Record<string, string> = {}
    if (!identifier.trim()) found.identifier = t('auth.identifierRequired')
    if (!password) found.password = t('auth.passwordRequired')
    setErrors(found)
    if (Object.keys(found).length) return

    const key = identifierKey(identifier)
    const now = Date.now()

    // A locked identifier is turned away before any work is done, so a
    // guessing script cannot keep the expensive hash running either.
    const waiting = lockRemainingMs(lockouts[key], now)
    if (waiting > 0) {
      setNotice(t('auth.signInLocked', { n: Math.ceil(waiting / 1000) }))
      return
    }

    setBusy(true)
    const credential = findCredential(credentials, identifier, role)
    const ok = credential ? await verifyPassword(credential, password) : false

    if (!ok) {
      dispatch({ type: 'signInFailed', key, now })
      const fails = (lockouts[key]?.fails ?? 0) + 1
      const left = MAX_ATTEMPTS - fails
      setBusy(false)
      setPassword('')
      setNotice(
        left > 0
          ? `${t('auth.signInFailed')} ${t('auth.attemptsLeft', { n: left })}`
          : t('auth.signInLocked', { n: 60 }),
      )
      return
    }

    // The admin's decisions are enforced here rather than only displayed in
    // the dashboard: suspending an account has to actually keep it out.
    if (removedUserIds.includes(credential!.userId)) {
      setBusy(false)
      setNotice(t('auth.signInFailed'))
      return
    }
    if (suspendedUserIds.includes(credential!.userId)) {
      setBusy(false)
      setNotice(t('auth.signInSuspended'))
      return
    }

    const account = sessionUsers.find((u) => u.id === credential!.userId)
    if (!account) {
      // The credential outlived the account it belonged to — nothing to sign
      // in to, and saying more would leak that the credential was right.
      setBusy(false)
      setNotice(t('auth.signInFailed'))
      return
    }

    dispatch({ type: 'signInSucceeded', key })
    dispatch({ type: 'signIn', user: account })
    setBusy(false)
    navigate(next ?? HOME_FOR[role], { replace: true })
  }

  return (
    <AuthShell
      title={t(role === 'provider' ? 'auth.signInOwner' : 'auth.signInCustomer')}
      subtitle={t('auth.credentialsSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link
            to={role === 'provider' ? '/signup/provider' : '/signup/customer'}
            className="font-semibold text-nasek-700 hover:underline"
          >
            {t('nav.signUp')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('auth.identifier')} hint={t('auth.identifierHint')} required error={errors.identifier}>
          {(p) => (
            <Input
              {...p}
              dir="ltr"
              autoFocus
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          )}
        </Field>

        <Field label={t('auth.password')} required error={errors.password}>
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

        {notice && (
          <p
            role="alert"
            className="rounded-[3px] border border-red-200 bg-red-50 p-3 text-[12.5px] font-medium leading-relaxed text-red-700"
          >
            {notice}
          </p>
        )}

        <Button type="submit" size="lg" block loading={busy}>
          {busy ? t('auth.signInChecking') : t('nav.signIn')}
        </Button>
      </form>

      <p className="mt-5 flex items-start gap-2 border-t border-ivory-300 pt-4 text-[11.5px] leading-relaxed text-ink-400">
        <Lock className="mt-px size-3.5 shrink-0" />
        {t('auth.securityNote')}
      </p>
    </AuthShell>
  )
}

// ------------------------------------------------------------------ sign up

/**
 * The account-type chooser.
 *
 * The owner route is listed first and carries the permit badge, because the
 * permit is the whole basis of trust on NASEK and someone registering a
 * campaign should know it is coming before they start filling anything in.
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

// --------------------------------------------------------- customer sign up

export function CustomerSignUpPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const { dispatch, toast } = useStore()

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    wilayahId: 'muscat',
    password: '',
    confirm: '',
  })
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = t('auth.nameRequired')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = t('auth.emailInvalid')
    if (form.phone.replace(/\D/g, '').length < 8) next.phone = t('auth.phoneInvalid')
    if (form.password.length < 8) next.password = t('auth.passwordShort')
    if (form.password !== form.confirm) next.confirm = t('auth.passwordMismatch')
    if (!agreed) next.terms = t('auth.termsRequired')
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    const user = await authApi.signUp({
      name: form.name,
      email: form.email,
      phone: form.phone,
      wilayahId: form.wilayahId,
      role: 'customer',
    })
    // The password is turned into a stored credential here and nowhere else:
    // this is the only moment it exists in the app, and it leaves as a hash.
    const credential = await createCredential({
      userId: user.id,
      role: 'customer',
      email: form.email,
      phone: form.phone,
      password: form.password,
    })
    dispatch({ type: 'addCredential', credential })
    dispatch({ type: 'registerUser', user })
    dispatch({ type: 'signIn', user })
    setBusy(false)
    toast(t('dash.profileSaved'))
    navigate('/dashboard', { replace: true })
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
      <p className="mb-6 flex items-start gap-2 rounded-[3px] border border-nasek-200 bg-nasek-50/60 p-3.5 text-[12.5px] leading-relaxed text-ink-600">
        <Building2 className="mt-px size-4 shrink-0 text-nasek-700" />
        <span>
          {t('auth.ownerRedirect')}{' '}
          <Link to="/signup/provider" className="font-semibold text-nasek-700 hover:underline">
            {t('auth.ownerRegisterLink')}
          </Link>
        </span>
      </p>

      <form onSubmit={submit} className="space-y-4">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.password')} required error={errors.password}>
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('auth.confirmPassword')} required error={errors.confirm}>
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
              />
            )}
          </Field>
        </div>

        <div>
          <Checkbox checked={agreed} onChange={setAgreed} label={t('auth.termsAgree')} />
          {errors.terms && (
            <p role="alert" className="mt-1 text-xs font-medium text-red-600">
              {errors.terms}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" block loading={busy}>
          {busy ? t('auth.creating') : t('nav.signUp')}
        </Button>
      </form>
    </AuthShell>
  )
}
