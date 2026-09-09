import { useState } from 'react'
import { Ban, Clock, FileWarning, Mail, ShieldAlert } from 'lucide-react'
import type { Provider } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT, wilayahById } from '@/data/geo'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { isValidPhone } from '@/services/auth/phone'
import { resubmitProviderAccount } from '@/services/auth/registerProvider'
import { signOutRemote } from '@/services/auth/session'
import { uploadLicence } from '@/services/storage/licence'
import { LicencePicker, type LicenceSelection } from '@/components/auth/LicencePicker'
import { OwnerAuthShell } from './layout/OwnerShell'
import { Button, Field, Input, Notice, Select, Textarea } from '@/components/ui'

/**
 * The three screens a campaign owner sees when their company is not (yet)
 * approved.
 *
 * NASEK's whole proposition to a pilgrim is that somebody checked the permit
 * before the trip appeared. The cost of that promise falls entirely on the
 * owner, who registers and then waits — so what these screens owe them is not
 * decoration but information: which state they are in, why, and what, if
 * anything, they can do about it.
 *
 * That is why refusal has its own address and its own form. Before this, a
 * refused application was set back to `pending`, which is the same state as
 * "not looked at yet" — so the owner was told nothing, could correct nothing,
 * and their application sat in the queue behind the same objection for ever.
 */

// ---------------------------------------------------------------- waiting

/**
 * Registered, in the queue.
 *
 * Deliberately not a dashboard with everything greyed out. An owner in this
 * state genuinely cannot do anything yet, and a screen full of disabled
 * controls invites them to try each one and work out why from the silence.
 */
export function PendingPage() {
  const { t, date } = useI18n()
  const { user } = useStore()
  const { getProvider } = useCatalogue()
  const { reload } = useSnapshotLoader()
  const [checking, setChecking] = useState(false)

  const provider = user?.providerId ? getProvider(user.providerId) : undefined

  return (
    <OwnerAuthShell title={t('prov.pendingTitle')} subtitle={t('prov.pendingSubtitle')}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-[3px] bg-gold-100 text-gold-800">
            <Clock className="size-6" />
          </span>
          <p className="text-sm leading-relaxed text-ink-600">{t('prov.pendingBody')}</p>
        </div>

        <dl className="grid gap-3 rounded-[3px] border border-ivory-300 bg-ivory-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-500">{t('auth.companyName')}</dt>
            {/* `en || ar`, as every other reader of this field does. NASEK
                writes one typed name into both columns — see
                `register_provider` — but a row that carries only the Arabic
                one would otherwise show this owner a dash where their own
                company name belongs. */}
            <dd className="font-semibold text-ink-900">
              {provider?.name.en || provider?.name.ar || '—'}
            </dd>
          </div>
          {provider?.submittedAt && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-500">{t('prov.submittedOn')}</dt>
              <dd className="font-semibold text-ink-900">{date(provider.submittedAt)}</dd>
            </div>
          )}
        </dl>

        <Notice tone="info">{t('prov.pendingMeanwhile')}</Notice>

        {/*
          A refresh button rather than polling. An approval lands whenever an
          administrator gets to it — minutes or days — and a timer firing every
          few seconds against a queue that moves that slowly is a lot of
          requests to save one click.
        */}
        <Button
          variant="secondary"
          block
          loading={checking}
          onClick={async () => {
            setChecking(true)
            await reload()
            setChecking(false)
          }}
        >
          {t('prov.checkAgain')}
        </Button>

        <StatusFooter />
      </div>
    </OwnerAuthShell>
  )
}

// ---------------------------------------------------------------- suspended

/**
 * Approved once, barred since.
 *
 * A dead end by design — there is no self-service route out of a suspension,
 * because the whole point of one is that NASEK decided something and an owner
 * cannot undecide it. What the screen does owe them is the reason and a way to
 * reach a person.
 */
export function SuspendedPage({ provider }: { provider?: Provider }) {
  const { t } = useI18n()
  return (
    <OwnerAuthShell title={t('prov.suspendedTitle')} subtitle={t('prov.suspendedSubtitle')}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-[3px] bg-red-50 text-red-600">
            <Ban className="size-6" />
          </span>
          <p className="text-sm leading-relaxed text-ink-600">{t('prov.suspendedBody')}</p>
        </div>
        {provider?.rejectionReason && (
          <Notice tone="danger" title={t('prov.reasonGiven')}>
            {provider.rejectionReason}
          </Notice>
        )}
        <StatusFooter />
      </div>
    </OwnerAuthShell>
  )
}

// ---------------------------------------------------------------- refused

/**
 * Refused, with the reason and the form to answer it.
 *
 * The fields are pre-filled from the submitted application, because the usual
 * correction is one of them — a permit photographed too dark to read, a phone
 * number with a digit missing — and retyping a company profile to fix a
 * photograph is how an owner decides NASEK is not worth the trouble.
 *
 * A new permit is optional. Resubmitting with the same document is a legitimate
 * answer when the objection was to something else entirely.
 */
export function RejectedPage() {
  const { t, lang } = useI18n()
  const { user, dispatch, toast } = useStore()
  const { getProvider } = useCatalogue()
  const { reload } = useSnapshotLoader()

  const provider = user?.providerId ? getProvider(user.providerId) : undefined

  const [form, setForm] = useState({
    // `en || ar` throughout, matching `CompanyProfilePanel`: one typed value
    // is written to both columns, and a row holding only the Arabic side must
    // prefill this form rather than blank a required field on it.
    companyName: provider?.name.en || provider?.name.ar || '',
    tagline: provider?.tagline.en || provider?.tagline.ar || '',
    description: provider?.description.en || provider?.description.ar || '',
    experienceYears: provider ? String(provider.experienceYears) : '',
    phone: provider?.phone ?? user?.phone ?? '',
    email: provider?.email ?? user?.email ?? '',
    wilayahId: provider?.wilayahId ?? user?.wilayahId ?? 'muscat',
    /*
     * The licensing fields are prefilled and editable here for the same reason
     * the company details are: the usual refusal is one of them — an expired
     * permit, a number that does not match the scan — and an owner who has to
     * retype their whole company profile to correct a date is an owner who
     * decides NASEK is not worth the trouble.
     */
    address: provider?.address ?? '',
    commercialRegistration: provider?.commercialRegistration ?? '',
    permitNumber: provider?.permitNumber ?? '',
    permitExpiry: provider?.permitExpiry ?? '',
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
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = t('auth.emailInvalid')
    if (!isValidPhone(form.phone)) next.phone = t('auth.phoneInvalid')
    setErrors(next)
    if (Object.keys(next).length) return

    setFailure('')
    setBusy(true)
    try {
      // A replacement permit goes to Storage first. If that fails there is
      // nothing to resubmit — sending the application without the corrected
      // document would put it back in the queue against the same objection.
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

      // With no backend there is no row to update and no queue to rejoin: the
      // store is the whole platform, so moving the status there *is* the
      // resubmission. Calling the RPC would throw, and stranding the one
      // dashboard a fresh clone can open is not worth the purity.
      if (isSupabaseConfigured) {
        await resubmitProviderAccount({
          name: user?.name ?? '',
          email: form.email,
          phone: form.phone,
          wilayahId: form.wilayahId,
          // Derived rather than asked for again: the wilayah already determines
          // it, and a second dropdown on a correction form is a second thing to
          // get wrong.
          governorate: wilayahById(form.wilayahId)?.governorate.en,
          address: form.address,
          companyName: form.companyName,
          tagline: form.tagline,
          description: form.description,
          commercialRegistration: form.commercialRegistration,
          permitNumber: form.permitNumber,
          permitExpiry: form.permitExpiry,
          experienceYears: form.experienceYears ? Number(form.experienceYears) : 0,
          licenceImage: licencePath ? '' : (licence?.dataUrl ?? ''),
          licenceFileName: licence?.fileName ?? '',
          licencePath,
          licenceMime: licence?.mime,
        })

        // Re-read rather than patch: the status moved server-side, and the
        // route guard reads it from the catalogue. Without this the owner would
        // sit on a "refused" screen that has already stopped being true.
        await reload()
      }
      if (provider) {
        dispatch({ type: 'setVerification', providerId: provider.id, status: 'pending' })
      }
      setBusy(false)
      toast(t('prov.resubmitted'), 'success')
    } catch (reason) {
      setBusy(false)
      setFailure(reason instanceof Error ? reason.message : t('auth.sessionFailed'))
    }
  }

  return (
    <OwnerAuthShell title={t('prov.rejectedTitle')} subtitle={t('prov.rejectedSubtitle')}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-[3px] bg-red-50 text-red-600">
            <FileWarning className="size-6" />
          </span>
        </div>

        <Notice tone="danger" title={t('prov.reasonGiven')}>
          {provider?.rejectionReason || t('prov.reasonMissing')}
        </Notice>

        {failure && (
          <Notice tone="danger" live>
            {failure}
          </Notice>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.email')} required error={errors.email}>
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
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              )}
            </Field>
          </div>

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

          <Field label={t('owner.address')} hint={t('owner.addressHint')}>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('owner.permitNumber')}>
              {(p) => (
                <Input
                  {...p}
                  dir="ltr"
                  value={form.permitNumber}
                  onChange={(e) => set('permitNumber', e.target.value)}
                />
              )}
            </Field>
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
          </div>

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

          <LicencePicker
            value={licence}
            onChange={setLicence}
            error={errors.licence}
            onError={(message) => setErrors((e) => ({ ...e, licence: message }))}
            label={t('prov.replaceLicence')}
            hint={t('prov.replaceLicenceHint')}
          />

          <Button type="submit" size="lg" block loading={busy}>
            {busy ? t('auth.creating') : t('prov.resubmit')}
          </Button>
        </form>

        <StatusFooter />
      </div>
    </OwnerAuthShell>
  )
}

// ------------------------------------------------------------------ shared

/**
 * The two things every one of these screens has to offer.
 *
 * Somewhere to go — the catalogue is still worth browsing while you wait — and
 * a way out of an account you may have signed into on a shared machine.
 */
function StatusFooter() {
  const { t } = useI18n()
  const { dispatch } = useStore()

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ivory-300 pt-4 text-xs">
      <a
        href="mailto:support@nasek.om"
        className="flex items-center gap-1.5 font-semibold text-nasek-700 hover:underline"
      >
        <Mail className="size-3.5" />
        {t('prov.contactSupport')}
      </a>
      <button
        type="button"
        onClick={async () => {
          await signOutRemote()
          dispatch({ type: 'signOut' })
        }}
        className="flex items-center gap-1.5 font-semibold text-ink-500 transition-colors hover:text-ink-900"
      >
        <ShieldAlert className="size-3.5" />
        {t('nav.signOut')}
      </button>
    </div>
  )
}
