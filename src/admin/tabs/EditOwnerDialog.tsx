import { useEffect, useState } from 'react'
import type { Provider } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT, wilayatByGovernorate } from '@/data/geo'
import { isValidPhone } from '@/services/auth/phone'
import { adminUpdateProvider, type AdminProviderEdit } from '@/services/data/adminProvider'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { useStore } from '@/store/AppStore'
import { Button, Field, Input, Modal, Notice, Select, Textarea } from '@/components/ui'

const GOVERNORATES = wilayatByGovernorate('en')

/** The Arabic name of a governorate, found through any wilayah inside it. */
const governorateLabel = (nameEn: string, lang: 'ar' | 'en') =>
  lang === 'en'
    ? nameEn
    : (WILAYAT.find((w) => w.governorate.en === nameEn)?.governorate.ar ?? nameEn)

/** A company's governorate, falling back to the one its wilayah belongs to. */
const governorateOf = (p: Provider) =>
  p.governorate ||
  (WILAYAT.find((w) => w.id === p.wilayahId)?.governorate.en ?? GOVERNORATES[0][0])

interface Draft {
  name: string
  tagline: string
  description: string
  governorate: string
  wilayahId: string
  phone: string
  email: string
  experienceYears: string
  commercialRegistration: string
  permitNumber: string
  permitExpiry: string
}

const EMPTY_DRAFT: Draft = {
  name: '',
  tagline: '',
  description: '',
  governorate: GOVERNORATES[0][0],
  wilayahId: GOVERNORATES[0][1][0]?.id ?? '',
  phone: '',
  email: '',
  experienceYears: '0',
  commercialRegistration: '',
  permitNumber: '',
  permitExpiry: '',
}

const draftFrom = (p: Provider): Draft => ({
  name: p.name.en || p.name.ar,
  tagline: p.tagline.en || p.tagline.ar,
  description: p.description.en || p.description.ar,
  governorate: governorateOf(p),
  wilayahId: p.wilayahId,
  phone: p.phone ?? '',
  email: p.email ?? '',
  experienceYears: String(p.experienceYears ?? 0),
  commercialRegistration: p.commercialRegistration ?? '',
  permitNumber: p.permitNumber ?? '',
  permitExpiry: p.permitExpiry ?? '',
})

/**
 * An administrator correcting a company's record.
 *
 * NASEK onboards companies rather than letting them apply, which means an
 * administrator types the details in the first place — and typing them means
 * getting one wrong eventually. Until now the only fix was to ask the owner to
 * sign in and correct their own profile, which for an approved company routes
 * the important half through a review queue the administrator would then have
 * to approve. Two people and three steps to fix a phone number.
 *
 * Three things this deliberately does not do:
 *
 *   It does not touch the verification badge. Approve, refuse and suspend are
 *   the buttons in the row, and they attach a reason and notify the owner. An
 *   edit form that could quietly flip a company to "verified" would be a way to
 *   grant the badge with none of that happening.
 *
 *   It does not send fields nobody touched. `admin_update_provider` reads null
 *   as "leave alone", so only the diff travels — which is also what lands in
 *   `admin_audit`. Correcting a typo should not produce an audit entry listing
 *   eleven unchanged fields.
 *
 *   It does not collect an address. The column is retired; governorate and
 *   wilayah are the location of record, and both are required.
 */
export function EditOwnerDialog({
  provider,
  onClose,
}: {
  provider: Provider | null
  onClose: () => void
}) {
  const { t, lang, bl } = useI18n()
  const { toast } = useStore()
  const { reload } = useSnapshotLoader()

  /*
   * `EMPTY_DRAFT` rather than a cast of `{}`.
   *
   * `useState` runs before this component can decide it has nothing to show —
   * hooks always do — so the initialiser needs an answer for the closed case.
   * Reading `p.name.en` off an empty object throws, and it would throw on every
   * render of the owners list, not merely when the dialog opens.
   */
  const [draft, setDraft] = useState<Draft>(() =>
    provider ? draftFrom(provider) : EMPTY_DRAFT,
  )
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)

  /*
   * Re-seed when the dialog is pointed at a different company.
   *
   * It is mounted once and handed whichever company the administrator clicked,
   * so without this the second company opened would be edited through the
   * first one's values — and saved over its record.
   */
  useEffect(() => {
    if (!provider) return
    setDraft(draftFrom(provider))
    setErrors({})
    setFailure('')
  }, [provider])

  const set = (key: keyof Draft, value: string) => setDraft((d) => ({ ...d, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!provider) return

    const next: Partial<Record<keyof Draft, string>> = {}
    if (!draft.name.trim()) next.name = t('common.required')
    // Both are `not null` and non-blank in the database as of 20260913000100.
    if (!draft.governorate.trim()) next.governorate = t('common.required')
    if (!draft.wilayahId.trim()) next.wilayahId = t('common.required')
    if (draft.phone.trim() && !isValidPhone(draft.phone)) next.phone = t('auth.phoneInvalid')
    if (draft.email.trim() && !/^\S+@\S+\.\S+$/.test(draft.email)) {
      next.email = t('auth.emailInvalid')
    }
    setErrors(next)
    if (Object.keys(next).length) return

    /*
     * Only what moved. Anything equal to the company as it stands is left out
     * of the payload, so the server sees null and skips the column.
     */
    const base = draftFrom(provider)
    const edit: AdminProviderEdit = {}
    if (draft.name !== base.name) edit.name = draft.name.trim()
    if (draft.tagline !== base.tagline) edit.tagline = draft.tagline.trim()
    if (draft.description !== base.description) edit.description = draft.description.trim()
    if (draft.governorate !== base.governorate) edit.governorate = draft.governorate
    if (draft.wilayahId !== base.wilayahId) edit.wilayahId = draft.wilayahId
    if (draft.phone !== base.phone) edit.phone = draft.phone.trim()
    if (draft.email !== base.email) edit.email = draft.email.trim()
    if (draft.experienceYears !== base.experienceYears) {
      edit.experienceYears = Number(draft.experienceYears) || 0
    }
    if (draft.commercialRegistration !== base.commercialRegistration) {
      edit.commercialRegistration = draft.commercialRegistration.trim()
    }
    if (draft.permitNumber !== base.permitNumber) edit.permitNumber = draft.permitNumber.trim()
    if (draft.permitExpiry !== base.permitExpiry) edit.permitExpiry = draft.permitExpiry

    if (Object.keys(edit).length === 0) {
      setFailure(t('admin.editOwnerNoChange'))
      return
    }

    setFailure('')
    setBusy(true)
    const outcome = await adminUpdateProvider(provider.id, edit)
    setBusy(false)

    if (!outcome.ok) {
      setFailure(outcome.error || t('admin.editOwnerFailed'))
      return
    }

    toast(t('admin.editOwnerSaved', { name: bl(provider.name) }), 'success')
    // The row on the list behind this dialog is stale until the snapshot
    // reloads, and an administrator who just corrected a name expects to see it.
    void reload()
    onClose()
  }

  const wilayat = GOVERNORATES.find(([g]) => g === draft.governorate)?.[1] ?? WILAYAT

  return (
    <Modal open={!!provider} onClose={onClose} title={t('admin.editOwnerTitle')} wide>
      {provider && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-500">{t('admin.editOwnerBody')}</p>

          <Field label={t('auth.companyName')} required error={errors.name}>
            {(p) => (
              <Input {...p} value={draft.name} onChange={(e) => set('name', e.target.value)} />
            )}
          </Field>

          <Field label={t('auth.companyTagline')}>
            {(p) => (
              <Input
                {...p}
                value={draft.tagline}
                onChange={(e) => set('tagline', e.target.value)}
              />
            )}
          </Field>

          <Field label={t('owner.description')}>
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('owner.governorate')} required error={errors.governorate}>
              {(p) => (
                <Select
                  {...p}
                  value={draft.governorate}
                  onChange={(e) => {
                    // The wilayah moves with the governorate, or the form holds
                    // a contradiction the database would have to resolve.
                    const governorate = e.target.value
                    const first = GOVERNORATES.find(([g]) => g === governorate)?.[1][0]
                    setDraft((d) => ({
                      ...d,
                      governorate,
                      wilayahId: first?.id ?? d.wilayahId,
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
                  value={draft.wilayahId}
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

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('common.phone')} error={errors.phone}>
              {(p) => (
                <Input
                  {...p}
                  type="tel"
                  dir="ltr"
                  value={draft.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('common.email')} error={errors.email}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  dir="ltr"
                  value={draft.email}
                  onChange={(e) => set('email', e.target.value)}
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
                  value={draft.experienceYears}
                  onChange={(e) => set('experienceYears', e.target.value)}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('owner.commercialRegistration')}>
              {(p) => (
                <Input
                  {...p}
                  dir="ltr"
                  value={draft.commercialRegistration}
                  onChange={(e) => set('commercialRegistration', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('owner.permitNumber')}>
              {(p) => (
                <Input
                  {...p}
                  dir="ltr"
                  value={draft.permitNumber}
                  onChange={(e) => set('permitNumber', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('owner.permitExpiry')}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={draft.permitExpiry}
                  onChange={(e) => set('permitExpiry', e.target.value)}
                />
              )}
            </Field>
          </div>

          <p className="text-2xs leading-relaxed text-ink-400">{t('admin.editOwnerNote')}</p>

          {failure && <Notice tone="danger">{failure}</Notice>}

          <div className="flex justify-end gap-2 border-t border-ivory-300 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={busy}>
              {t('admin.editOwnerSave')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
