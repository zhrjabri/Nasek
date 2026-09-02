import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, FileImage, Info, KeyRound } from 'lucide-react'
import { useI18n } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { isValidPhone } from '@/services/auth/phone'
import { MIN_PASSWORD_LENGTH, passwordProblem, setPassword } from '@/services/auth/password'
import { registerProviderAccount } from '@/services/auth/registerProvider'
import { uploadLicence } from '@/services/storage/licence'
import { useCompleteSignIn } from '@/hooks/useSignIn'
import { useStore } from '@/store/AppStore'
import { AuthShell } from '@/pages/AuthPages'
import { OtpFlow } from '@/components/auth/OtpFlow'
import { LicencePicker, type LicenceSelection } from '@/components/auth/LicencePicker'
import { Button, Checkbox, Field, Input, Notice, Select, Textarea } from '@/components/ui'

/**
 * Campaign-owner registration.
 *
 * Separate from the customer sign-up because it asks for a company, its
 * trading history and — the part that matters for trust — the operating
 * permit. Registering creates the company in `pending` state, which puts it
 * straight into the admin's verification queue and keeps its trips out of the
 * public catalogue until somebody has looked at the permit. That last part is
 * enforced by `campaigns_read` in Postgres, not by this screen.
 *
 * Two stages: the company, then a code sent to the contact address. The order
 * matters — the permit and the company details are gathered first, so that
 * verifying the code is the last action and produces a complete, queued
 * registration rather than an empty owner account somebody abandoned halfway.
 *
 * ---------------------------------------------------------------------------
 * WHY AN OWNER GETS A PASSWORD AND A PILGRIM DOES NOT
 *
 * A pilgrim uses NASEK around one trip in their life; a password is pure cost
 * to them, and the code flow is already the recovery path every password system
 * needs. An owner runs a live inventory of seats and signs in constantly — and
 * putting an email provider's delivery time between them and a seat count that
 * is wrong right now is a bad trade at exactly the wrong moment.
 *
 * The password is set *after* the code is verified rather than sent with the
 * registration, and that ordering is the whole design. It means one email
 * instead of two, it means the same screen works whether or not the address
 * already had a pilgrim account on it, and it means a password is only ever
 * attached to an address somebody has just proved they can receive mail at.
 * The one-time code keeps working afterwards; it is how an owner who forgets
 * the password gets back in.
 * ---------------------------------------------------------------------------
 */
export function ProviderSignUpPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const { dispatch, toast } = useStore()

  const [form, setForm] = useState({
    companyName: '',
    tagline: '',
    experienceYears: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
    wilayahId: 'muscat',
  })
  const [licence, setLicence] = useState<LicenceSelection | null>(null)
  const [reveal, setReveal] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'details' | 'verify'>('details')
  const [failure, setFailure] = useState('')
  const complete = useCompleteSignIn()

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.companyName.trim()) next.companyName = t('common.required')
    if (!form.name.trim()) next.name = t('auth.nameRequired')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = t('auth.emailInvalid')
    if (!isValidPhone(form.phone)) next.phone = t('auth.phoneInvalid')

    const password = passwordProblem(form.password, form.confirm)
    if (password === 'short') next.password = t('auth.passwordShort', { n: MIN_PASSWORD_LENGTH })
    if (password === 'mismatch') next.confirm = t('auth.passwordMismatch')

    // The permit is the point of this form, so it is not optional.
    if (!licence) next.licence = t('auth.licenceRequired')
    if (!agreed) next.terms = t('auth.termsRequired')
    setErrors(next)
    if (Object.keys(next).length) return
    setStage('verify')
  }

  /**
   * Everything that happens once the contact address is proved.
   *
   * The order is not arbitrary and each step depends on the one before it:
   *
   *   1. Establish the session. `register_provider` runs as the signed-in
   *      caller and promotes *them*, so it has nobody to promote until now.
   *   2. Set the password, on the session that now exists.
   *   3. Upload the permit. Its object path starts with the account id, so this
   *      is the first moment there is a folder to write into.
   *   4. Register the company, referencing the uploaded path.
   *
   * Each failure is reported for what it is. "Registration failed" after step 1
   * would be actively misleading — the account exists and is signed in — and is
   * how somebody ends up creating a second one.
   */
  const finish = async () => {
    setFailure('')
    setBusy(true)

    const outcome = await complete(
      { channel: 'email', value: form.email },
      { name: form.name, phone: form.phone, wilayahId: form.wilayahId },
    )
    if (outcome.error || !outcome.user) {
      setBusy(false)
      setFailure(t(outcome.error ?? 'auth.sessionFailed'))
      return
    }

    if (isSupabaseConfigured) {
      const saved = await setPassword(form.password)
      if (!saved.ok) {
        // Not fatal, and saying so matters: the account is live and the code
        // still opens it. Stopping here would strand a registration over a
        // convenience.
        setFailure(t('auth.passwordNotSet'))
      }
    }

    let licencePath: string | undefined
    if (licence?.file && isSupabaseConfigured) {
      const upload = await uploadLicence(licence.file)
      if (!upload.ok) {
        setBusy(false)
        setFailure(t('auth.licenceUploadFailed'))
        return
      }
      licencePath = upload.upload.path
    }

    try {
      const { user, provider } = await registerProviderAccount({
        name: form.name,
        email: form.email,
        phone: form.phone,
        wilayahId: form.wilayahId,
        companyName: form.companyName,
        tagline: form.tagline,
        experienceYears: form.experienceYears ? Number(form.experienceYears) : 0,
        licenceImage: licencePath ? '' : (licence?.dataUrl ?? ''),
        licenceFileName: licence?.fileName ?? '',
        licencePath,
      })
      dispatch({ type: 'addProvider', provider })
      dispatch({ type: 'registerUser', user })
      dispatch({ type: 'signIn', user })
      setBusy(false)
      toast(t('auth.providerRegistered'), 'success')
      // Straight to the waiting room, not to the dashboard. The company is
      // `pending` and its trips would not be public anyway; a dashboard that
      // silently publishes nothing is the worst of both.
      navigate('/provider/pending', { replace: true })
    } catch (reason) {
      // The account exists and is signed in at this point; only the company
      // failed. Saying so, rather than "registration failed", is the difference
      // between someone retrying the form and someone creating a second account.
      setBusy(false)
      setFailure(reason instanceof Error ? reason.message : t('auth.sessionFailed'))
    }
  }

  if (stage === 'verify') {
    return (
      <AuthShell
        title={t('auth.providerSignUpTitle')}
        subtitle={t('auth.providerSignUpSubtitle')}
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
            {failure}
          </Notice>
        )}

        <Notice tone="info" className="mb-5">
          {t('auth.providerPending')}
        </Notice>

        <OtpFlow
          channels={['email']}
          initialValue={form.email}
          submitLabel={t('auth.registerCompany')}
          busyLabel={t('auth.creating')}
          onSuccess={finish}
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('auth.providerSignUpTitle')}
      subtitle={t('auth.providerSignUpSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/signin" className="font-semibold text-nasek-700 hover:underline">
            {t('nav.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('auth.sectionCompany')}
        </p>

        <Field label={t('auth.companyName')} required error={errors.companyName}>
          {(p) => (
            <Input
              {...p}
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
            />
          )}
        </Field>

        <Field label={t('auth.companyTagline')} hint={t('auth.companyTaglineHint')}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={form.tagline}
              onChange={(e) => set('tagline', e.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
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
          <Field label={t('common.wilayah')}>
            {(p) => (
              <Select
                {...p}
                value={form.wilayahId}
                onChange={(e) => set('wilayahId', e.target.value)}
              >
                {WILAYAT.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name[lang]} — {w.governorate[lang]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {/* ------------------------------------------------------- licence */}
        <p className="pt-2 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('auth.sectionLicence')}
        </p>

        <LicencePicker
          value={licence}
          onChange={setLicence}
          error={errors.licence}
          onError={(message) => setErrors((e) => ({ ...e, licence: message }))}
        />

        <p className="flex items-start gap-2 rounded-[3px] bg-gold-50 p-3 text-xs leading-relaxed text-gold-800">
          <FileImage className="mt-px size-3.5 shrink-0" />
          {t('auth.licenceNote')}
        </p>

        {/* --------------------------------------------------- the account */}
        <p className="pt-2 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('auth.sectionAccount')}
        </p>

        <Field label={t('auth.contactName')} required error={errors.name}>
          {(p) => (
            <Input
              {...p}
              autoComplete="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
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

        {/*
          The password, and the one line of copy that stops it reading as a
          contradiction. NASEK tells pilgrims, loudly, that it never asks for a
          password — so an owner who has read the home page needs to be told why
          this form does, before they wonder whether they are on the right site.
        */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('auth.password')}
            hint={t('auth.passwordHint', { n: MIN_PASSWORD_LENGTH })}
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
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
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
          <Field label={t('auth.confirmPassword')} required error={errors.confirm}>
            {(p) => (
              <Input
                {...p}
                type={reveal ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
              />
            )}
          </Field>
        </div>

        <p className="flex items-start gap-2 rounded-[3px] border border-nasek-200 bg-nasek-50/50 p-3 text-xs leading-relaxed text-ink-600">
          <KeyRound className="mt-px size-3.5 shrink-0 text-nasek-700" />
          {t('auth.providerPasswordNote')}
        </p>

        <p className="flex items-start gap-2 rounded-[3px] bg-gold-50 p-3 text-xs leading-relaxed text-gold-800">
          <Info className="mt-px size-3.5 shrink-0" />
          {t('auth.providerPending')}
        </p>

        <div>
          <Checkbox checked={agreed} onChange={setAgreed} label={t('auth.termsAgree')} />
          {errors.terms && (
            <p role="alert" className="mt-1 text-xs font-medium text-red-600">
              {errors.terms}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" block loading={busy}>
          {busy ? t('auth.creating') : t('common.continue')}
        </Button>
      </form>
    </AuthShell>
  )
}
