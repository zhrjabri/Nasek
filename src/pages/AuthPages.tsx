import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Search, ShieldCheck } from 'lucide-react'
import type { Role } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { authApi } from '@/services/api/auth'
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

// ------------------------------------------------------------------ sign in

export function SignInPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { dispatch } = useStore()
  const [busy, setBusy] = useState(false)

  const next = params.get('next')

  const enterAs = async (role: Role, name: string) => {
    setBusy(true)
    const user = await authApi.signInAs(role, name)
    dispatch({ type: 'signIn', user })
    setBusy(false)
    navigate(next ?? HOME_FOR[role], { replace: true })
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
      {/* Role entry is the whole sign-in page now: there are no accounts to
          authenticate against, and for a prototype getting in is the point. */}
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
            icon={<ShieldCheck className="size-4" />}
            label={t('auth.demoAdmin')}
            onClick={() => void enterAs('admin', t('auth.guestAdmin'))}
            disabled={busy}
          />
        </div>
      </div>
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
    dispatch({ type: 'signIn', user })
    setBusy(false)
    toast(t('dash.profileSaved'))
    navigate('/dashboard', { replace: true })
  }

  // Older links (the footer, the map page) still point at ?role=provider.
  if (params.get('role') === 'provider') {
    return <Navigate to="/signup/provider" replace />
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
