import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileImage, Info, Trash2, Upload } from 'lucide-react'
import { useI18n } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { isValidPhone } from '@/services/auth/phone'
import { registerProviderAccount } from '@/services/auth/registerProvider'
import { useCompleteSignIn } from '@/hooks/useSignIn'
import { useStore } from '@/store/AppStore'
import { readImageFile, type ImageReadError } from '@/lib/imageFile'
import { AuthShell } from '@/pages/AuthPages'
import { OtpFlow } from '@/components/auth/OtpFlow'
import { Button, Checkbox, Field, Input, Notice, Select, Textarea } from '@/components/ui'

interface Licence {
  dataUrl: string
  fileName: string
  storedBytes: number
}

/**
 * Campaign-owner registration.
 *
 * Separate from the customer sign-up because it asks for a company, its
 * trading history and — the part that matters for trust — the operating
 * permit. Registering creates the company in `pending` state, which puts it
 * straight into the admin's verification queue.
 *
 * Two stages now: the company, then a code sent to the contact address. The
 * password fields are gone along with the rest of them. The order matters —
 * the permit and the company details are gathered first, so that verifying the
 * code is the last action and produces a complete, queued registration rather
 * than an empty owner account somebody abandoned halfway.
 */
export function ProviderSignUpPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const { dispatch, toast } = useStore()
  const fileInput = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    companyName: '',
    tagline: '',
    experienceYears: '',
    name: '',
    email: '',
    phone: '',
    wilayahId: 'muscat',
  })
  const [licence, setLicence] = useState<Licence | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'details' | 'verify'>('details')
  const [failure, setFailure] = useState('')
  const complete = useCompleteSignIn()

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const pickLicence = async (file: File | undefined) => {
    if (!file) return
    setErrors((e) => ({ ...e, licence: '' }))
    try {
      const result = await readImageFile(file)
      setLicence(result)
    } catch (reason) {
      const key: Record<ImageReadError, string> = {
        type: t('auth.licenceTypeError'),
        size: t('auth.licenceSizeError'),
        decode: t('auth.licenceDecodeError'),
      }
      setLicence(null)
      setErrors((e) => ({ ...e, licence: key[reason as ImageReadError] ?? t('auth.licenceDecodeError') }))
    }
  }

  const clearLicence = () => {
    setLicence(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.companyName.trim()) next.companyName = t('common.required')
    if (!form.name.trim()) next.name = t('auth.nameRequired')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = t('auth.emailInvalid')
    if (!isValidPhone(form.phone)) next.phone = t('auth.phoneInvalid')
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
   * The order is deliberate: establish the session first, then register the
   * company. `register_provider` runs as the signed-in caller and promotes
   * *them*, so it has nobody to promote until the session exists.
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

    try {
      const { user, provider } = await registerProviderAccount({
        name: form.name,
        email: form.email,
        phone: form.phone,
        wilayahId: form.wilayahId,
        companyName: form.companyName,
        tagline: form.tagline,
        experienceYears: form.experienceYears ? Number(form.experienceYears) : 0,
        licenceImage: licence!.dataUrl,
        licenceFileName: licence!.fileName,
      })
      dispatch({ type: 'addProvider', provider })
      dispatch({ type: 'registerUser', user })
      dispatch({ type: 'signIn', user })
      setBusy(false)
      toast(t('auth.providerRegistered'), 'success')
      navigate('/provider', { replace: true })
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

        <Field
          label={t('auth.licenceLabel')}
          hint={t('auth.licenceHint')}
          required
          error={errors.licence}
        >
          {(p) => (
            <div>
              <input
                {...p}
                ref={fileInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void pickLicence(e.target.files?.[0])}
              />
              {licence ? (
                <div className="flex items-center gap-3 rounded-[3px] border border-ivory-400 bg-ivory-50 p-3">
                  <img
                    src={licence.dataUrl}
                    alt={t('auth.licencePreviewAlt')}
                    className="size-16 shrink-0 rounded-[2px] border border-ivory-300 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {licence.fileName}
                    </p>
                    <p className="nums mt-0.5 text-2xs text-ink-400">
                      {Math.max(1, Math.round(licence.storedBytes / 1024))} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearLicence}
                    className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-semibold text-ink-500 transition-colors hover:bg-ivory-200 hover:text-red-700"
                  >
                    <Trash2 className="size-3.5" />
                    {t('auth.licenceRemove')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-[3px] border border-dashed border-ivory-400 bg-ivory-50 p-6 text-sm font-semibold text-ink-500 transition-colors hover:border-nasek-700 hover:text-nasek-800"
                >
                  <Upload className="size-4" />
                  {t('auth.licenceUpload')}
                </button>
              )}
            </div>
          )}
        </Field>

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
