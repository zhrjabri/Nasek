import { useState } from 'react'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { useI18n } from '@/i18n'
import { WILAYAT, wilayatByGovernorate } from '@/data/geo'
import { useStore } from '@/store/AppStore'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { isValidPhone } from '@/services/auth/phone'
import { uploadLicence } from '@/services/storage/licence'
import { LicencePicker, type LicenceSelection } from '@/components/auth/LicencePicker'
import { Button, Field, Input, Modal, Notice, Segmented, Select, Textarea } from '@/components/ui'
import {
  createOwnerAccount,
  temporaryPasswordProblem,
  TEMPORARY_PASSWORD_MIN_LENGTH,
  type CreateOwnerError,
  type TemporaryPasswordProblem,
} from '@/admin/createOwner'

/**
 * Taking a campaign owner onto the platform.
 *
 * A member of staff with the company's paperwork on the desk enters the company
 * details, uploads the permit, and sets the owner's sign-in email and a
 * temporary password. The account exists the moment this succeeds; the owner
 * signs in at the Campaign Owner Portal with that email and password. Nothing is
 * emailed — the administrator passes the password on themselves.
 *
 * Self-registration on the owner portal is a separate door and is unaffected.
 *
 * The fields run in the order somebody reading a licence would fill them in —
 * the company, where it operates, what it is licensed by, who to contact — and
 * then the account the owner will sign in with.
 */

const GOVERNORATES = wilayatByGovernorate('en')

/** The Arabic name of a governorate, found through any wilayah inside it. */
const governorateLabel = (nameEn: string, lang: 'ar' | 'en') =>
  lang === 'en'
    ? nameEn
    : (WILAYAT.find((w) => w.governorate.en === nameEn)?.governorate.ar ?? nameEn)

export function NewOwnerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const { toast } = useStore()
  const { reload } = useSnapshotLoader()

  const [form, setForm] = useState({
    companyName: '',
    tagline: '',
    description: '',
    experienceYears: '',
    governorate: GOVERNORATES[0][0],
    wilayahId: GOVERNORATES[0][1][0].id,
    commercialRegistration: '',
    permitNumber: '',
    permitExpiry: '',
    contactName: '',
    email: '',
    phone: '',
    verification: 'verified' as 'verified' | 'pending',
  })
  /*
   * The temporary password, kept out of `form` so nothing that copies the form
   * around can carry it. React state only — never storage — and cleared when
   * the account is created or the dialog is closed.
   */
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  /** The company just created, for the confirmation that replaces the form. */
  const [created, setCreated] = useState<{ name: string; email: string } | null>(null)
  const [licence, setLicence] = useState<LicenceSelection | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const forgetPassword = () => {
    setTemporaryPassword('')
    setConfirmPassword('')
    setReveal(false)
  }

  const reset = () => {
    setForm((f) => ({ ...f, companyName: '', tagline: '', description: '',
      commercialRegistration: '', permitNumber: '', permitExpiry: '', contactName: '',
      email: '', phone: '', experienceYears: '' }))
    forgetPassword()
    setLicence(null)
    setErrors({})
    setFailure('')
  }

  const close = () => {
    forgetPassword()
    setCreated(null)
    onClose()
  }

  const MESSAGE: Record<CreateOwnerError, string> = {
    offline: t('admin.newOwnerOffline'),
    forbidden: t('admin.newOwnerForbidden'),
    permit_required: t('auth.licenceRequired'),
    bad_request: t('admin.newOwnerFailed'),
    weak_password: t('admin.newOwnerWeakPassword'),
    email_exists: t('admin.newOwnerEmailExists'),
    create_failed: t('admin.newOwnerCreateFailed'),
    cleanup_failed: t('admin.newOwnerCleanupFailed'),
    unreachable: t('admin.newOwnerUnreachable'),
    failed: t('admin.newOwnerFailed'),
  }

  const PASSWORD_MESSAGE: Record<TemporaryPasswordProblem, string> = {
    short: t('admin.newOwnerPasswordShort', { n: TEMPORARY_PASSWORD_MIN_LENGTH }),
    long: t('admin.newOwnerPasswordLong'),
    spaces: t('admin.newOwnerPasswordSpaces'),
    simple: t('admin.newOwnerPasswordSimple'),
    is_email: t('admin.newOwnerPasswordIsEmail'),
    mismatch: t('admin.newOwnerPasswordMismatch'),
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.companyName.trim()) next.companyName = t('common.required')
    if (!form.contactName.trim()) next.contactName = t('common.required')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = t('auth.emailInvalid')
    if (!isValidPhone(form.phone)) next.phone = t('auth.phoneInvalid')
    // Both are `not null` and non-blank in the database as of 20260913000100.
    if (!form.governorate.trim()) next.governorate = t('common.required')
    if (!form.wilayahId.trim()) next.wilayahId = t('common.required')
    if (!form.permitNumber.trim()) next.permitNumber = t('common.required')
    if (!licence) next.licence = t('auth.licenceRequired')
    const problem = temporaryPasswordProblem(temporaryPassword, confirmPassword, form.email)
    if (problem === 'mismatch') next.confirmPassword = PASSWORD_MESSAGE.mismatch
    else if (problem) next.temporaryPassword = PASSWORD_MESSAGE[problem]
    setErrors(next)
    if (Object.keys(next).length) return

    setFailure('')
    setBusy(true)

    /*
     * The permit goes to Storage first, and a failure stops everything. Every
     * check above runs before this line, so a form that was going to be refused
     * never uploads anything.
     *
     * Creating the company and then failing to attach the document would leave
     * a verified company on NASEK with nothing behind the badge — which is the
     * one outcome the whole verification flow exists to prevent. The database
     * refuses a company with no permit path for the same reason.
     *
     * It lands in the administrator's own folder rather than the owner's,
     * because the owner's account id does not exist yet: the Edge Function
     * creates it. `20260905000100` adds the storage policy that allows this,
     * and the read policy already lets an administrator open anything in the
     * bucket. If the account or the company is then refused, the function
     * removes this file again.
     */
    let licencePath = ''
    if (licence?.file) {
      const upload = await uploadLicence(licence.file)
      if (!upload.ok) {
        setBusy(false)
        setErrors({ licence: t('auth.licenceUploadFailed') })
        return
      }
      licencePath = upload.upload.path
    }

    const outcome = await createOwnerAccount({
      email: form.email,
      temporaryPassword,
      contactName: form.contactName,
      companyName: form.companyName,
      tagline: form.tagline,
      description: form.description,
      wilayahId: form.wilayahId,
      governorate: form.governorate,
      experienceYears: form.experienceYears ? Number(form.experienceYears) : 0,
      phone: form.phone,
      commercialRegistration: form.commercialRegistration,
      permitNumber: form.permitNumber,
      permitExpiry: form.permitExpiry,
      licencePath,
      licenceFileName: licence?.fileName ?? '',
      licenceMime: licence?.mime ?? '',
      verification: form.verification,
    })

    setBusy(false)

    if (!outcome.ok) {
      // The service's own words where they name the fix: which database rule
      // refused the company, or which password policy refused the password.
      const detail =
        outcome.detail && ['create_failed', 'cleanup_failed', 'weak_password'].includes(outcome.error)
          ? ` (${outcome.detail})`
          : ''
      setFailure(`${MESSAGE[outcome.error]}${detail}`)
      return
    }

    /*
     * Say so plainly, and keep saying it until the administrator moves on. A
     * toast alone disappears while they are still reaching for the phone to
     * tell the owner. The password is not repeated — they typed it.
     */
    setCreated({ name: form.companyName.trim(), email: form.email.trim().toLowerCase() })
    toast(t('admin.newOwnerCreated', { name: form.companyName.trim() }), 'success')
    reset()
    await reload()
  }

  if (created) {
    return (
      <Modal open={open} onClose={close} title={t('admin.newOwnerTitle')} wide>
        <div className="space-y-4">
          <Notice tone="success" title={t('admin.newOwnerCreated', { name: created.name })} live>
            {t('admin.newOwnerCreatedBody', { email: created.email })}
          </Notice>
          <div className="flex gap-2.5 border-t border-ivory-300 pt-5">
            <Button type="button" size="lg" block onClick={close}>
              {t('admin.newOwnerDone')}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => setCreated(null)}>
              <UserPlus className="size-4" />
              {t('admin.newOwnerAnother')}
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={close} title={t('admin.newOwnerTitle')} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm leading-relaxed text-ink-500">{t('admin.newOwnerBody')}</p>

        {failure && (
          <Notice tone="danger" live>
            {failure}
          </Notice>
        )}

        {/* ------------------------------------------------------ company */}
        <p className="pt-1 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('owner.sectionCompany')}
        </p>

        <Field label={t('auth.companyName')} required error={errors.companyName}>
          {(p) => (
            <Input {...p} value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
          )}
        </Field>

        <Field label={t('auth.companyTagline')} hint={t('auth.companyTaglineHint')}>
          {(p) => (
            <Textarea {...p} rows={2} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
          )}
        </Field>

        <Field label={t('owner.description')} hint={t('owner.descriptionHint')}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
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

        {/* ----------------------------------------------------- location */}
        <p className="pt-1 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('owner.sectionLocation')}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('owner.governorate')} required error={errors.governorate}>
            {(p) => (
              <Select
                {...p}
                value={form.governorate}
                onChange={(e) => {
                  // The wilayah has to move with the governorate, or the form
                  // submits a contradiction somebody has to write back about.
                  const governorate = e.target.value
                  const first = GOVERNORATES.find(([name]) => name === governorate)?.[1][0]
                  setForm((f) => ({ ...f, governorate, wilayahId: first?.id ?? f.wilayahId }))
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
              <Select {...p} value={form.wilayahId} onChange={(e) => set('wilayahId', e.target.value)}>
                {(GOVERNORATES.find(([name]) => name === form.governorate)?.[1] ?? WILAYAT).map(
                  (w) => (
                    <option key={w.id} value={w.id}>
                      {w.name[lang]}
                    </option>
                  ),
                )}
              </Select>
            )}
          </Field>
        </div>

        {/*
          No address field. Governorate and wilayah above are the company's
          location of record; NASEK posts nothing to anyone. See
          `20260913000100`, which retires the column without dropping it.
        */}

        {/* ---------------------------------------------------- licensing */}
        <p className="pt-1 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('owner.sectionLicensing')}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('owner.permitNumber')}
            hint={t('owner.permitNumberHint')}
            required
            error={errors.permitNumber}
          >
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                value={form.permitNumber}
                onChange={(e) => set('permitNumber', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('owner.permitExpiry')} hint={t('owner.permitExpiryHint')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={form.permitExpiry}
                onChange={(e) => set('permitExpiry', e.target.value)}
              />
            )}
          </Field>
        </div>

        {form.permitExpiry && form.permitExpiry < new Date().toISOString().slice(0, 10) && (
          <Notice tone="warn">{t('admin.ownerPermitExpired')}</Notice>
        )}

        <Field label={t('owner.commercialRegistration')} hint={t('owner.commercialRegistrationHint')}>
          {(p) => (
            <Input
              {...p}
              dir="ltr"
              value={form.commercialRegistration}
              onChange={(e) => set('commercialRegistration', e.target.value)}
            />
          )}
        </Field>

        <LicencePicker
          value={licence}
          onChange={setLicence}
          error={errors.licence}
          onError={(message) => setErrors((e) => ({ ...e, licence: message }))}
        />

        {/* ------------------------------------------------------ contact */}
        <p className="pt-1 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('owner.sectionContact')}
        </p>

        <Field label={t('auth.contactName')} required error={errors.contactName}>
          {(p) => (
            <Input {...p} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('common.email')}
            hint={t('admin.newOwnerEmailHint')}
            required
            error={errors.email}
          >
            {(p) => (
              <Input
                {...p}
                type="email"
                dir="ltr"
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

        {/* ------------------------------------------------------ sign-in */}
        <p className="pt-1 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('admin.newOwnerSectionAccount')}
        </p>

        <Notice tone="info">{t('admin.newOwnerAccountNote')}</Notice>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('admin.newOwnerPassword')}
            hint={t('admin.newOwnerPasswordHint', { n: TEMPORARY_PASSWORD_MIN_LENGTH })}
            required
            error={errors.temporaryPassword}
          >
            {(p) => (
              // LTR as a whole, so the eye and the padding it needs sit on the
              // same side as the typed text in the Arabic interface too.
              <div className="relative" dir="ltr">
                <Input
                  {...p}
                  type={reveal ? 'text' : 'password'}
                  dir="ltr"
                  // The owner's password, not the administrator's: nothing a
                  // browser should fill in or remember for this site.
                  autoComplete="new-password"
                  spellCheck={false}
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
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
          <Field label={t('admin.newOwnerPasswordConfirm')} required error={errors.confirmPassword}>
            {(p) => (
              <Input
                {...p}
                type={reveal ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                spellCheck={false}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            )}
          </Field>
        </div>

        {/* --------------------------------------------------- the status */}
        <Field label={t('admin.newOwnerStatus')} hint={t('admin.newOwnerStatusHint')}>
          {() => (
            <Segmented
              className="w-full"
              size="sm"
              label={t('admin.newOwnerStatus')}
              value={form.verification}
              onChange={(v) => set('verification', v)}
              options={[
                { value: 'verified', label: t('admin.ownersApprovedTitle') },
                { value: 'pending', label: t('admin.ownersPendingTitle') },
              ]}
            />
          )}
        </Field>

        <div className="flex gap-2.5 border-t border-ivory-300 pt-5">
          <Button type="submit" size="lg" block loading={busy}>
            <UserPlus className="size-4" />
            {t('admin.newOwnerCreate')}
          </Button>
          <Button type="button" variant="secondary" size="lg" onClick={close}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
