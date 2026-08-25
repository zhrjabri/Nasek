import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Info, Search, ShieldCheck, UserRound } from 'lucide-react'
import type { Role } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { authApi } from '@/services/api/auth'
import { useStore } from '@/store/AppStore'
import { Logo } from '@/components/brand/Logo'
import { Button, Card, Checkbox, Field, Input, Select, cx } from '@/components/ui'

/** Where to send each role after authenticating. */
const HOME_FOR: Record<Role, string> = {
  customer: '/dashboard',
  provider: '/provider',
  admin: '/admin',
}

function AuthShell({
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

// ------------------------------------------------------------------ sign in

export function SignInPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { dispatch, toast } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const next = params.get('next')

  const enterAs = async (role: Role, name: string) => {
    setBusy(true)
    const user = await authApi.signInAs(role, name)
    dispatch({ type: 'signIn', user })
    setBusy(false)
    navigate(next ?? HOME_FOR[role], { replace: true })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError(t('auth.emailInvalid'))
      return
    }
    setBusy(true)
    try {
      const user = await authApi.signIn(email)
      dispatch({ type: 'signIn', user })
      navigate(next ?? HOME_FOR[user.role], { replace: true })
    } catch {
      setError(t('auth.emailInvalid'))
      toast(t('common.error'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-semibold text-nasek-700 hover:underline">
            {t('nav.signUp')}
          </Link>
        </>
      }
    >
      {/* The demo panel comes first: for a prototype, entering is the point. */}
      <div className="rounded-[3px] border border-nasek-200 bg-nasek-50/60 p-4">
        <p className="text-[13px] font-bold text-nasek-900">{t('auth.demoTitle')}</p>
        <p className="mt-1 text-[12px] text-ink-500">{t('auth.demoNote')}</p>
        <div className="mt-3.5 grid gap-2">
          <DemoButton
            icon={<Search className="size-4" />}
            label={t('auth.demoCustomer')}
            onClick={() => void enterAs('customer', t('auth.guestCustomer'))}
            disabled={busy}
          />
          <DemoButton
            icon={<Building2 className="size-4" />}
            label={t('auth.demoProvider')}
            onClick={() => void enterAs('provider', t('auth.guestProvider'))}
            disabled={busy}
          />
          <DemoButton
            icon={<ShieldCheck className="size-4" />}
            label={t('auth.demoAdmin')}
            onClick={() => void enterAs('admin', t('auth.guestAdmin'))}
            disabled={busy}
          />
        </div>
      </div>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ivory-300" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
          {t('nav.signIn')}
        </span>
        <span className="h-px flex-1 bg-ivory-300" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label={t('common.email')} error={error} required>
          {(p) => (
            <Input
              {...p}
              type="email"
              dir="ltr"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('auth.password')} required>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" size="lg" block loading={busy}>
          {t('nav.signIn')}
        </Button>
      </form>
    </AuthShell>
  )
}

function DemoButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50 px-3.5 py-2.5 text-start text-[13.5px] font-semibold text-ink-700 transition-all hover:border-nasek-400 hover:text-nasek-900 disabled:opacity-50"
    >
      <span className="text-nasek-600">{icon}</span>
      {label}
    </button>
  )
}

// ------------------------------------------------------------------ sign up

export function SignUpPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { dispatch, toast } = useStore()

  const [role, setRole] = useState<'customer' | 'provider'>(
    params.get('role') === 'provider' ? 'provider' : 'customer',
  )
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    wilayahId: 'muscat',
    password: '',
    confirm: '',
    companyName: '',
    experienceYears: '',
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
    if (role === 'provider' && !form.companyName.trim()) next.companyName = t('common.required')
    if (!agreed) next.terms = t('auth.termsRequired')
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    const user = await authApi.signUp({
      name: form.name,
      email: form.email,
      phone: form.phone,
      wilayahId: form.wilayahId,
      role,
      companyName: form.companyName || undefined,
      experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
    })
    dispatch({ type: 'signIn', user })
    setBusy(false)
    toast(t('dash.profileSaved'))
    navigate(role === 'provider' ? '/provider' : '/dashboard', { replace: true })
  }

  return (
    <AuthShell
      title={t('auth.signUpTitle')}
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
      {/* Role choice mirrors the original NASEK sign-up split. */}
      <div className="mb-6 grid gap-2.5 sm:grid-cols-2">
        <RoleCard
          selected={role === 'customer'}
          onClick={() => setRole('customer')}
          icon={<UserRound className="size-5" />}
          title={t('auth.asCustomer')}
          body={t('auth.asCustomerNote')}
        />
        <RoleCard
          selected={role === 'provider'}
          onClick={() => setRole('provider')}
          icon={<Building2 className="size-5" />}
          title={t('auth.asProvider')}
          body={t('auth.asProviderNote')}
        />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label={t('common.name')} required error={errors.name}>
          {(p) => (
            <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
          )}
        </Field>

        {role === 'provider' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('auth.companyName')} required error={errors.companyName}>
              {(p) => (
                <Input
                  {...p}
                  value={form.companyName}
                  onChange={(e) => set('companyName', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('auth.experienceYears')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  max={80}
                  value={form.experienceYears}
                  onChange={(e) => set('experienceYears', e.target.value)}
                />
              )}
            </Field>
          </div>
        )}

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

        {role === 'provider' && (
          <p className="flex items-start gap-2 rounded-[3px] bg-gold-50 p-3 text-[12px] leading-relaxed text-gold-800">
            <Info className="mt-px size-3.5 shrink-0" />
            {t('auth.providerPending')}
          </p>
        )}

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

function RoleCard({
  selected,
  onClick,
  icon,
  title,
  body,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'flex flex-col gap-2 rounded-[3px] border p-4 text-start transition-all duration-200',
        selected
          ? 'border-nasek-700 bg-nasek-900 text-ivory-50 shadow-lift'
          : 'border-ivory-300 bg-ivory-50 hover:border-nasek-300 hover:shadow-soft',
      )}
    >
      <span className={cx(selected ? 'text-gold-400' : 'text-nasek-600')}>{icon}</span>
      <span className="text-[14px] font-bold">{title}</span>
      <span className={cx('text-[12px] leading-relaxed', selected ? 'text-ivory-200/70' : 'text-ink-500')}>
        {body}
      </span>
    </button>
  )
}
