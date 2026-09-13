import { useState } from 'react'
import { Building2, Eye, EyeOff, MailCheck, UserPlus } from 'lucide-react'
import { useI18n } from '@/i18n'
import { WILAYAT, wilayatByGovernorate } from '@/data/geo'
import { useStore } from '@/store/AppStore'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { isValidPhone } from '@/services/auth/phone'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/services/auth/password'
import { signUpOwner } from '@/services/auth/signUpOwner'
import { registerProviderAccount } from '@/services/auth/registerProvider'
import { signOutRemote } from '@/services/auth/session'
import { uploadLicence } from '@/services/storage/licence'
import { LicencePicker, type LicenceSelection } from '@/components/auth/LicencePicker'
import { Button, Field, Input, Notice, Select, Textarea } from '@/components/ui'
import { OwnerAuthShell } from './layout/OwnerShell'

/**
 * A company registering itself on NASEK.
 *
 * WHY THIS IS TWO SCREENS
 *
 * The project requires email confirmation (`mailer_autoconfirm` is off), so
 * `supabase.auth.signUp` returns no session — and without a session nothing on
 * the second screen can run: `register_provider` promotes *the caller*, and the
 * permit goes into a private bucket whose policy keys the folder on
 * `auth.uid()`. One combined form would either have to hold a company's permit
 * and details in the browser across an email round-trip — losing them entirely
 * if the link is opened on a phone, which is where email is read — or turn the
 * confirmation off, which would let a company into the verification queue at an
 * address NASEK cannot reach it on.
 *
 * So: create the sign-in, confirm the address, then describe the company. Both
 * screens say which step they are, because a form that appears to have worked
 * and has not finished is worse than an extra click.
 *
 * WHAT IS NEVER STORED
 *
 * The password reaches Supabase and nothing else. It is not written to
 * `providers`, not to `profiles`, not to storage of any kind, and no query in
 * this repository reads a credential out of a NASEK table. Phone sign-in, when
 * it is switched on, is Supabase's own phone identity — never a lookup of the
 * number on a company record against a password NASEK holds.
 */

const GOVERNORATES = wilayatByGovernorate('en')

/** The Arabic name of a governorate, found through any wilayah inside it. */
const governorateLabel = (nameEn: string, lang: 'ar' | 'en') =>
  lang === 'en'
    ? nameEn
    : (WILAYAT.find((w) => w.governorate.en === nameEn)?.governorate.ar ?? nameEn)

// ============================================================ step one of two

/**
 * The sign-in, and only the sign-in.
 *
 * Email, password, confirm password. Nothing about the company is asked for
 * here, because none of it could be saved yet.
 */
export function OwnerSignUpPage({ onBackToSignIn }: { onBackToSignIn: () => void }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reveal, setReveal] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = t('auth.emailInvalid')

    const problem = passwordProblem(password, confirm)
    if (problem === 'short') next.password = t('auth.passwordShort', { n: MIN_PASSWORD_LENGTH })
    if (problem === 'mismatch') next.confirm = t('owner.passwordMismatch')

    setErrors(next)
    if (Object.keys(next).length) return

    setFailure('')
    setBusy(true)
    const outcome = await signUpOwner(email, password)
    setBusy(false)

    if (!outcome.ok) {
      setFailure(
        outcome.error === 'email_taken'
          ? t('auth.emailTaken')
          : outcome.error === 'weak_password'
            ? t('auth.passwordRejected')
            : outcome.error === 'rate_limited'
              ? t('auth.errRateLimited')
              : t('auth.errSendFailed'),
      )
      return
    }

    /*
     * With a session already in hand there is nothing to wait for: the gate in
     * `OwnerApp` re-checks on the auth-state change and lands them on the
     * company form. That branch is unreachable on this project today and is
     * here so that turning confirmation off later needs no code change.
     */
    if (outcome.needsEmailConfirmation) setSent(email.trim().toLowerCase())
  }

  if (sent) {
    return (
      <OwnerAuthShell title={t('owner.confirmSentTitle')} subtitle={t('owner.registerStep1')}>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
            <MailCheck className="size-6" />
          </span>
          <p className="text-sm leading-relaxed text-ink-600">
            {t('owner.confirmSentBody', { email: sent })}
          </p>
          <button
            type="button"
            onClick={onBackToSignIn}
            className="text-xs font-bold text-nasek-700 hover:underline"
          >
            {t('owner.signUpBackToSignIn')}
          </button>
        </div>
      </OwnerAuthShell>
    )
  }

  return (
    <OwnerAuthShell
      title={t('owner.signUpTitle')}
      subtitle={t('owner.signUpSubtitle')}
      footer={
        <p className="leading-relaxed">
          <span className="font-semibold text-ink-700">{t('owner.signUpHaveAccount')}</span>{' '}
          <button
            type="button"
            onClick={onBackToSignIn}
            className="font-bold text-nasek-700 hover:underline"
          >
            {t('owner.signUpBackToSignIn')}
          </button>
        </p>
      }
    >
      <p className="mb-4 text-2xs font-bold uppercase tracking-[0.16em] text-ink-400">
        {t('owner.registerStep1')}
      </p>

      <form onSubmit={submit} className="space-y-4" noValidate>
        {!isSupabaseConfigured && <Notice tone="warn">{t('auth.errSendFailed')}</Notice>}

        <Field label={t('common.email')} required error={errors.email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              dir="ltr"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field
          label={t('auth.password')}
          hint={t('auth.passwordShort', { n: MIN_PASSWORD_LENGTH })}
          required
          error={errors.password}
        >
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                type={reveal ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={t(reveal ? 'auth.hidePassword' : 'auth.showPassword')}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-400 hover:text-ink-700"
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>

        {/*
          A second field rather than a "show password" toggle alone. A typo in a
          password nobody can read costs an account that has to be recovered by
          email before it has ever been used — and this account has not
          confirmed its email yet.
        */}
        <Field label={t('owner.passwordConfirm')} required error={errors.confirm}>
          {(p) => (
            <Input
              {...p}
              type={reveal ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>

        {failure && <Notice tone="danger">{failure}</Notice>}

        <Button type="submit" size="lg" block loading={busy}>
          <UserPlus className="size-4" />
          {t('owner.signUpSubmit')}
        </Button>
      </form>
    </OwnerAuthShell>
  )
}

// ============================================================ step two of two

/**
 * The company, once the address is confirmed and there is a session.
 *
 * Reached from the portal's gate whenever somebody is signed in here and owns
 * no company. That covers the owner who has just confirmed their email, and it
 * covers anyone else who arrives with a NASEK account and wants to register a
 * business — `register_provider` promotes the caller and leaves the company
 * `pending`, so nothing is granted by reaching this form that an administrator
 * has not still to approve.
 */
export function CompanyRegistrationPage({ onDone }: { onDone: () => Promise<void> | void }) {
  const { t, lang } = useI18n()
  const { user, dispatch } = useStore()

  const [form, setForm] = useState({
    companyName: '',
    tagline: '',
    description: '',
    governorate: GOVERNORATES[0][0],
    wilayahId: GOVERNORATES[0][1][0]?.id ?? '',
    experienceYears: '',
    phone: '',
    commercialRegistration: '',
    permitNumber: '',
    permitExpiry: '',
  })
  const [licence, setLicence] = useState<LicenceSelection | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.companyName.trim()) next.companyName = t('common.required')
    /*
     * Governorate and wilayah are both required, and both are checked even
     * though each is a `<select>` with a value already in it. They are
     * `not null` and non-blank in the database as of 20260913000100, so a blank
     * one is a rejected registration with a server's wording on it rather than
     * a named field the owner can fix.
     */
    if (!form.governorate.trim()) next.governorate = t('common.required')
    if (!form.wilayahId.trim()) next.wilayahId = t('common.required')
    if (!isValidPhone(form.phone)) next.phone = t('auth.phoneInvalid')
    if (!form.permitNumber.trim()) next.permitNumber = t('common.required')
    if (!licence) next.licence = t('auth.licenceRequired')
    setErrors(next)
    if (Object.keys(next).length) return

    setFailure('')
    setBusy(true)

    try {
      /*
       * The permit goes to Storage first, and a failure stops the whole thing.
       *
       * `uploadLicence` builds the object path from `auth.uid()`, so it cannot
       * be aimed at another company's folder. Registering without it would put
       * an application in front of an administrator with nothing to verify it
       * against, which is the one thing the queue exists to prevent.
       */
      let licencePath: string | undefined
      if (licence?.file && isSupabaseConfigured) {
        const upload = await uploadLicence(licence.file)
        if (!upload.ok) {
          setBusy(false)
          setErrors({ licence: t('auth.licenceUploadFailed') })
          return
        }
        licencePath = upload.upload.path
      }

      await registerProviderAccount({
        name: user?.name ?? '',
        email: user?.email ?? '',
        phone: form.phone,
        wilayahId: form.wilayahId,
        governorate: form.governorate,
        companyName: form.companyName,
        tagline: form.tagline,
        description: form.description,
        experienceYears: form.experienceYears ? Number(form.experienceYears) : 0,
        commercialRegistration: form.commercialRegistration,
        permitNumber: form.permitNumber,
        permitExpiry: form.permitExpiry,
        licenceImage: licencePath ? '' : (licence?.dataUrl ?? ''),
        licenceFileName: licence?.fileName ?? '',
        licencePath,
        licenceMime: licence?.mime,
      })

      /*
       * The number is written to the company record and nowhere else.
       *
       * It used to be offered to Supabase as a second sign-in identity as well,
       * which is what made an SMS provider a dependency of registration. It is
       * not one any more: the owner signs in with the address and password they
       * created a moment ago, and this number is how a pilgrim reaches them.
       */

      setBusy(false)
      await onDone()
    } catch (error) {
      setBusy(false)
      setFailure(error instanceof Error ? error.message : t('owner.registerFailed'))
    }
  }

  const wilayat = GOVERNORATES.find(([g]) => g === form.governorate)?.[1] ?? WILAYAT

  return (
    <OwnerAuthShell
      title={t('owner.companyTitle')}
      subtitle={t('owner.companySubtitle')}
      footer={
        <button
          type="button"
          onClick={async () => {
            await signOutRemote()
            dispatch({ type: 'signOut' })
          }}
          className="font-semibold text-nasek-700 hover:underline"
        >
          {t('owner.signOutInstead')}
        </button>
      }
    >
      <p className="mb-4 text-2xs font-bold uppercase tracking-[0.16em] text-ink-400">
        {t('owner.registerStep2')}
      </p>

      {/* Says which account is about to become the company's owner. Somebody
          who signed in on the wrong one should find that out here, not after
          an administrator has verified the wrong person's business. */}
      {user?.email && (
        <p className="mb-4 text-xs leading-relaxed text-ink-500">
          {t('owner.companyWrongAccount', { email: user.email })}
        </p>
      )}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('auth.companyName')} required error={errors.companyName}>
          {(p) => (
            <Input
              {...p}
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
            />
          )}
        </Field>

        <Field label={t('auth.companyTagline')}>
          {(p) => (
            <Input {...p} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
          )}
        </Field>

        <Field label={t('owner.description')}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('owner.governorate')} required error={errors.governorate}>
            {(p) => (
              <Select
                {...p}
                value={form.governorate}
                onChange={(e) => {
                  // The wilayah moves with the governorate, or the form submits
                  // a contradiction nothing downstream can resolve.
                  const governorate = e.target.value
                  const first = GOVERNORATES.find(([g]) => g === governorate)?.[1][0]
                  setForm((f) => ({
                    ...f,
                    governorate,
                    wilayahId: first?.id ?? f.wilayahId,
                  }))
                }}
              >
                {GOVERNORATES.map(([nameEn]) => (
                  <option key={nameEn} value={nameEn}>
                    {governorateLabel(nameEn, lang)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('common.wilayah')} required error={errors.wilayahId}>
            {(p) => (
              <Select
                {...p}
                value={form.wilayahId}
                onChange={(e) => set('wilayahId', e.target.value)}
              >
                {wilayat.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name[lang]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('common.phone')}
            hint={t('owner.registerPhoneNote')}
            required
            error={errors.phone}
          >
            {(p) => (
              <Input
                {...p}
                type="tel"
                dir="ltr"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
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
                dir="ltr"
                value={form.experienceYears}
                onChange={(e) => set('experienceYears', e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('owner.commercialRegistration')}>
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                value={form.commercialRegistration}
                onChange={(e) => set('commercialRegistration', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('owner.permitNumber')} required error={errors.permitNumber}>
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                value={form.permitNumber}
                onChange={(e) => set('permitNumber', e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label={t('owner.permitExpiry')}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={form.permitExpiry}
              onChange={(e) => set('permitExpiry', e.target.value)}
            />
          )}
        </Field>

        <LicencePicker
          value={licence}
          onChange={setLicence}
          error={errors.licence}
          onError={(message) => setErrors((e) => ({ ...e, licence: message }))}
        />

        {failure && <Notice tone="danger">{failure}</Notice>}

        <Button type="submit" size="lg" block loading={busy}>
          <Building2 className="size-4" />
          {t('owner.companySubmit')}
        </Button>
      </form>
    </OwnerAuthShell>
  )
}
