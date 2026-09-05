import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useI18n } from '@/i18n'
import { WILAYAT, wilayatByGovernorate } from '@/data/geo'
import { useStore } from '@/store/AppStore'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { isValidPhone } from '@/services/auth/phone'
import { uploadLicence } from '@/services/storage/licence'
import { LicencePicker, type LicenceSelection } from '@/components/auth/LicencePicker'
import { Button, Field, Input, Modal, Notice, Segmented, Select, Textarea } from '@/components/ui'
import { createOwnerAccount, type CreateOwnerError } from '@/admin/createOwner'

/**
 * Taking a campaign owner onto the platform.
 *
 * This form replaced a public one. Owners used to register themselves on the
 * customer website and wait in a queue; NASEK now enters the company details,
 * reads the permit, and sends an invitation — so the person on the other end
 * never fills in a registration at all. Their first contact with the platform
 * is a link that opens the portal.
 *
 * Which means this form has an audience it did not have before: not the owner
 * guessing what NASEK wants, but a member of staff with the company's paperwork
 * on the desk in front of them. The fields are the same ones the old
 * registration asked for, in the order somebody reading a licence would fill
 * them in — the company, where it operates, what it is licensed by, and who to
 * write to.
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
    address: '',
    commercialRegistration: '',
    permitNumber: '',
    permitExpiry: '',
    contactName: '',
    email: '',
    phone: '',
    verification: 'verified' as 'verified' | 'pending',
  })
  const [licence, setLicence] = useState<LicenceSelection | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const reset = () => {
    setForm((f) => ({ ...f, companyName: '', tagline: '', description: '', address: '',
      commercialRegistration: '', permitNumber: '', permitExpiry: '', contactName: '',
      email: '', phone: '', experienceYears: '' }))
    setLicence(null)
    setErrors({})
    setFailure('')
  }

  const MESSAGE: Record<CreateOwnerError, string> = {
    offline: t('admin.newOwnerOffline'),
    forbidden: t('admin.newOwnerForbidden'),
    permit_required: t('auth.licenceRequired'),
    is_admin_account: t('admin.newOwnerIsAdmin'),
    invite_failed: t('admin.newOwnerInviteFailed'),
    exists: t('admin.newOwnerExists'),
    failed: t('admin.newOwnerFailed'),
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.companyName.trim()) next.companyName = t('common.required')
    if (!form.contactName.trim()) next.contactName = t('common.required')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = t('auth.emailInvalid')
    if (!isValidPhone(form.phone)) next.phone = t('auth.phoneInvalid')
    if (!form.address.trim()) next.address = t('common.required')
    if (!form.permitNumber.trim()) next.permitNumber = t('common.required')
    if (!licence) next.licence = t('auth.licenceRequired')
    setErrors(next)
    if (Object.keys(next).length) return

    setFailure('')
    setBusy(true)

    /*
     * The permit goes to Storage first, and a failure stops everything.
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
     * bucket.
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
      contactName: form.contactName,
      companyName: form.companyName,
      tagline: form.tagline,
      description: form.description,
      wilayahId: form.wilayahId,
      governorate: form.governorate,
      address: form.address,
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
      setFailure(MESSAGE[outcome.error])
      return
    }

    /*
     * Created, but say which kind of created.
     *
     * The company and the account exist either way — that is the point of the
     * fallback in `admin-create-owner`. What differs is whether the owner has
     * been told, and an administrator who is not told the message failed will
     * sit waiting for somebody who never heard from us.
     */
    toast(
      outcome.invited
        ? t('admin.newOwnerCreated', { name: form.companyName })
        : t('admin.newOwnerCreatedNoEmail', { name: form.companyName }),
      outcome.invited ? 'success' : 'warning',
    )
    reset()
    onClose()
    await reload()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('admin.newOwnerTitle')} wide>
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
          <Field label={t('owner.governorate')} required>
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
          <Field label={t('common.wilayah')} required>
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

        <Field label={t('owner.address')} hint={t('owner.addressHint')} required error={errors.address}>
          {(p) => (
            <Textarea {...p} rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
          )}
        </Field>

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
          <Button type="button" variant="secondary" size="lg" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
