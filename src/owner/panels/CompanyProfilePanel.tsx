import { useEffect, useRef, useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Check,
  Clock,
  ExternalLink,
  FileWarning,
  ImagePlus,
  Lock,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import type { Provider } from '@/types'
import { isPendingProvider } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT, wilayahById, wilayatByGovernorate, wilayahName } from '@/data/geo'
import { licenceUrl, setProviderLogo } from '@/services/data/catalogue'
import { fetchPendingChange, submitOwnerProfile } from '@/services/data/ownerProfile'
import type { ProviderProfileChangeRow } from '@/services/supabase/schema'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { isValidPhone } from '@/services/auth/phone'
import { uploadLicence } from '@/services/storage/licence'
import {
  checkProviderLogo,
  removeProviderLogoObject,
  uploadProviderLogo,
  type ProviderLogoError,
} from '@/services/storage/providerLogo'
import { ProviderMark } from '@/components/brand/ProviderMark'
import { useStore } from '@/store/AppStore'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { LicencePicker, type LicenceSelection } from '@/components/auth/LicencePicker'
import { Badge, Button, Card, EmptyState, Field, Input, Notice, Select, Textarea } from '@/components/ui'

/**
 * The company, as NASEK holds it — and as its owner may change it.
 *
 * Two sections, and the split is not a layout decision: it is the security
 * model made visible.
 *
 *   **Public details** are marketing. A tagline, a description, a phone number,
 *   an address. Wrong, they are embarrassing; they are not evidence. They save
 *   immediately.
 *
 *   **Verified details** are what an administrator checked the company on: the
 *   legal name, the commercial registration, the permit number and its expiry,
 *   and the permit document itself. An approved company cannot write these at
 *   all — `guard_provider_privileges` reverts them — so editing them submits a
 *   *proposal*, and the badge keeps describing the information somebody
 *   actually read until an administrator approves the new one.
 *
 * The screen says which is which, before the owner types anything. Discovering
 * after saving that half your changes are in a queue is the kind of surprise
 * that gets a form filled in twice.
 *
 * A company that is not yet approved edits both halves freely. There is nothing
 * to protect — nobody has approved anything — and making a pending application
 * wait for a review of a change to itself would be a queue inside a queue.
 */

const GOVERNORATES = wilayatByGovernorate('en')

const governorateOf = (provider: Provider) =>
  provider.governorate || wilayahById(provider.wilayahId)?.governorate.en || GOVERNORATES[0][0]

const governorateLabel = (nameEn: string, lang: 'ar' | 'en') =>
  lang === 'en'
    ? nameEn
    : (WILAYAT.find((w) => w.governorate.en === nameEn)?.governorate.ar ?? nameEn)

interface Draft {
  // public
  tagline: string
  description: string
  governorate: string
  wilayahId: string
  phone: string
  email: string
  experienceYears: string
  // verified
  name: string
  commercialRegistration: string
  permitNumber: string
  permitExpiry: string
}

/**
 * The draft for a company that is not here yet.
 *
 * `useState` runs before the `if (!provider)` guard below can return — hooks
 * always do — so the initialiser has to have an answer for the case that guard
 * exists for. It used to give it `draftFrom({} as Provider)`, and the cast was
 * the bug written down: `p.tagline.en` on an object with no `tagline` throws,
 * and it threw on every load of the portal that opened on this tab, because the
 * company row arrives a beat after the session on all of them. An owner who
 * bookmarked or refreshed `?tab=profile` met an error page rather than their
 * own company.
 */
const EMPTY_DRAFT: Draft = {
  tagline: '',
  description: '',
  governorate: GOVERNORATES[0][0],
  wilayahId: GOVERNORATES[0][1][0]?.id ?? '',
  phone: '',
  email: '',
  experienceYears: '0',
  name: '',
  commercialRegistration: '',
  permitNumber: '',
  permitExpiry: '',
}

const draftFrom = (p: Provider): Draft => ({
  tagline: p.tagline.en || p.tagline.ar,
  description: p.description.en || p.description.ar,
  governorate: governorateOf(p),
  wilayahId: p.wilayahId,
  phone: p.phone ?? '',
  email: p.email ?? '',
  experienceYears: String(p.experienceYears ?? 0),
  name: p.name.en || p.name.ar,
  commercialRegistration: p.commercialRegistration ?? '',
  permitNumber: p.permitNumber ?? '',
  permitExpiry: p.permitExpiry ?? '',
})

/** Which fields go through review. Mirrors `submit_provider_profile`. */
const SENSITIVE: (keyof Draft)[] = [
  'name',
  'commercialRegistration',
  'permitNumber',
  'permitExpiry',
]

export function CompanyProfilePanel({ provider }: { provider?: Provider }) {
  const { t, lang, date, n } = useI18n()
  const { toast } = useStore()
  const { reload } = useSnapshotLoader()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => (provider ? draftFrom(provider) : EMPTY_DRAFT))
  const [licence, setLicence] = useState<LicenceSelection | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft | 'licence', string>>>({})
  const [failure, setFailure] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [permitState, setPermitState] = useState<'idle' | 'opening' | 'failed'>('idle')
  const [pending, setPending] = useState<ProviderProfileChangeRow | null>(null)
  const baseline = useRef<Draft | null>(null)

  /*
   * The change already waiting, if any.
   *
   * Read on mount and after every save, because it is the difference between
   * "your details" and "your details, plus the ones NASEK has not agreed to
   * yet". An owner who submitted a new permit yesterday should see that on this
   * screen rather than wonder whether the form worked.
   */
  useEffect(() => {
    if (!provider) return
    let live = true
    void fetchPendingChange(provider.id).then((row) => {
      if (live) setPending(row)
    })
    return () => {
      live = false
    }
  }, [provider])

  if (!provider) {
    return <EmptyState title={t('owner.profileNotSet')} body={t('owner.profileBody')} />
  }

  const approved = provider.verification === 'verified'
  const current = baseline.current ?? draftFrom(provider)

  /*
   * A plain comparison rather than `useMemo`, and deliberately so.
   *
   * This sits below the `if (!provider)` return above, and a hook below a
   * conditional return is a hook that runs on some renders and not others —
   * React counts them positionally, so the first render where a company row
   * arrives would throw "rendered more hooks than during the previous render".
   * The alternative is hoisting the memo above the guard, which buys nothing:
   * this is a JSON compare of a dozen short strings, run once per keystroke on
   * a form somebody is already typing into.
   */
  const dirty = JSON.stringify(draft) !== JSON.stringify(current) || !!licence

  /** Does this edit touch anything an administrator has to agree to? */
  const touchesVerified =
    approved && (SENSITIVE.some((k) => draft[k] !== current[k]) || !!licence)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const beginEdit = () => {
    const fresh = draftFrom(provider)
    baseline.current = fresh
    setDraft(fresh)
    setLicence(null)
    setErrors({})
    setFailure('')
    setEditing(true)
  }

  const cancel = () => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    setDraft(baseline.current ?? draftFrom(provider))
    setLicence(null)
    setErrors({})
    setFailure('')
    setConfirmDiscard(false)
    setEditing(false)
  }

  const openPermit = async () => {
    setPermitState('opening')
    const url = provider.licencePath
      ? await licenceUrl(provider.licencePath)
      : provider.licenceImage
    if (!url) {
      setPermitState('failed')
      return
    }
    setPermitState('idle')
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Partial<Record<keyof Draft | 'licence', string>> = {}
    if (!draft.name.trim()) next.name = t('common.required')
    /*
     * Governorate and wilayah are checked even though both are `<select>`s
     * with a value already in them.
     *
     * The database made them `not null` and non-blank in 20260913000100, so a
     * blank one is now a rejected save rather than a null column — and a
     * rejected save arrives as an error banner with a server's wording on it.
     * Checking here means the owner is told which field, in their own
     * language, before anything is sent.
     */
    if (!draft.governorate.trim()) next.governorate = t('common.required')
    if (!draft.wilayahId.trim()) next.wilayahId = t('common.required')
    if (!isValidPhone(draft.phone)) next.phone = t('auth.phoneInvalid')
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) next.email = t('auth.emailInvalid')
    setErrors(next)
    if (Object.keys(next).length) return

    setFailure('')
    setSaving(true)

    /*
     * A replacement permit goes to Storage first, and a failure stops the save.
     *
     * The object lands under the owner's own folder in the private bucket —
     * `uploadLicence` builds the path from `auth.uid()`, so it cannot be aimed
     * anywhere else — and only its *path* travels to the RPC. Submitting the
     * rest of the change while the document failed to upload would put a
     * proposal in front of an administrator with nothing to read.
     */
    let licencePath: string | undefined
    if (licence?.file && isSupabaseConfigured) {
      const upload = await uploadLicence(licence.file)
      if (!upload.ok) {
        setSaving(false)
        setErrors({ licence: t('auth.licenceUploadFailed') })
        return
      }
      licencePath = upload.upload.path
    }

    const outcome = await submitOwnerProfile({
      tagline: draft.tagline,
      description: draft.description,
      wilayahId: draft.wilayahId,
      governorate: draft.governorate,
      phone: draft.phone,
      email: draft.email,
      experienceYears: Number(draft.experienceYears) || 0,
      name: draft.name,
      commercialRegistration: draft.commercialRegistration,
      permitNumber: draft.permitNumber,
      permitExpiry: draft.permitExpiry,
      licencePath,
      licenceFileName: licence?.fileName,
      licenceMime: licence?.mime,
    })

    setSaving(false)

    if (!outcome.ok) {
      setFailure(outcome.error)
      return
    }

    baseline.current = draft
    setLicence(null)
    setEditing(false)
    setConfirmDiscard(false)
    toast(
      outcome.reviewRequired ? t('owner.profileUnderReview') : t('owner.profileSaved'),
      outcome.reviewRequired ? 'info' : 'success',
    )
    // Re-read: the marketing half landed on the row, and the verified half may
    // now be sitting in the queue. Both are read back rather than assumed.
    await reload()
    setPending(await fetchPendingChange(provider.id))
  }

  return (
    <div className="space-y-6">
      <VerificationCard provider={provider} />

      {pending && <PendingCard change={pending} />}

      {!editing && (
        <div className="flex justify-end">
          <Button size="sm" onClick={beginEdit}>
            <Pencil className="size-4" />
            {t('owner.profileEdit')}
          </Button>
        </div>
      )}

      {/*
        The logo, outside the profile form and outside edit mode.

        It was inside both, and that is why it never worked. Inside `{editing ?
        (<form>` it was invisible until the owner pressed Edit, and once they
        did, its buttons were `<button>` elements inside a `<form>` — which
        default to `type="submit"`, so pressing "Upload Logo" submitted the
        company profile and never opened the file dialog. Nothing threw; the
        control simply appeared to do nothing.

        It belongs out here on its own terms anyway. The logo has its own save
        path — `set_provider_logo`, applied immediately — and is not part of the
        profile form's data, none of which is sent when a logo changes.
      */}
      <LogoCard provider={provider} onChanged={reload} />

      {editing ? (
        <form onSubmit={submit} className="space-y-6" noValidate>
          {failure && (
            <Notice tone="danger" live>
              {failure}
            </Notice>
          )}

          {/* ------------------------------------------------ public details */}
          <Card className="p-6">
            <h2 className="text-md font-bold text-ink-900">{t('owner.profilePublic')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              {t('owner.profilePublicEditNote')}
            </p>

            <div className="mt-5 space-y-4">
              <Field label={t('auth.companyTagline')} hint={t('auth.companyTaglineHint')}>
                {(p) => (
                  <Textarea
                    {...p}
                    rows={2}
                    value={draft.tagline}
                    onChange={(e) => set('tagline', e.target.value)}
                  />
                )}
              </Field>

              <Field label={t('owner.description')} hint={t('owner.descriptionHint')}>
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
                        // The wilayah moves with the governorate, or the form
                        // holds a contradiction nothing downstream can resolve.
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
                      {(GOVERNORATES.find(([g]) => g === draft.governorate)?.[1] ?? WILAYAT).map(
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
                No address field.

                It was here, and required, and it asked a company for a postal
                address NASEK had no use for: the catalogue locates a company by
                governorate and wilayah, the pilgrim contacts them by phone, and
                nothing in the platform has ever posted anything to anyone. The
                two location fields above are the location of record and both
                are required.

                The column is not dropped and the values two companies already
                typed are kept — see `20260913000100`. Nothing reads them.
              */}

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t('common.phone')} required error={errors.phone}>
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
                <Field label={t('common.email')} required error={errors.email}>
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
                      value={draft.experienceYears}
                      onChange={(e) => set('experienceYears', e.target.value)}
                    />
                  )}
                </Field>
              </div>
            </div>
          </Card>

          {/* ---------------------------------------------- verified details */}
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-nasek-700" />
              <h2 className="text-md font-bold text-ink-900">{t('owner.profileVerified')}</h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-500">
              {approved ? t('owner.profileVerifiedNote') : t('owner.profileVerifiedFree')}
            </p>

            <div className="mt-5 space-y-4">
              <Field label={t('auth.companyName')} required error={errors.name}>
                {(p) => (
                  <Input {...p} value={draft.name} onChange={(e) => set('name', e.target.value)} />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('owner.permitNumber')} hint={t('owner.permitNumberHint')}>
                  {(p) => (
                    <Input
                      {...p}
                      dir="ltr"
                      value={draft.permitNumber}
                      onChange={(e) => set('permitNumber', e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('owner.permitExpiry')} hint={t('owner.permitExpiryHint')}>
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

              {draft.permitExpiry &&
                draft.permitExpiry < new Date().toISOString().slice(0, 10) && (
                  <Notice tone="warn">{t('owner.permitExpired')}</Notice>
                )}

              <Field
                label={t('owner.commercialRegistration')}
                hint={t('owner.commercialRegistrationHint')}
              >
                {(p) => (
                  <Input
                    {...p}
                    dir="ltr"
                    value={draft.commercialRegistration}
                    onChange={(e) => set('commercialRegistration', e.target.value)}
                  />
                )}
              </Field>

              <LicencePicker
                value={licence}
                onChange={setLicence}
                error={errors.licence}
                onError={(message) => setErrors((x) => ({ ...x, licence: message }))}
                label={t('owner.permitReplace')}
                hint={t('owner.permitReplaceHint')}
              />
            </div>

            {/*
              Said before the button, not after it.

              An approved company whose legal name goes into a queue while its
              phone number saves is a perfectly reasonable design and a very
              unpleasant surprise. The banner appears the moment a sensitive
              field actually differs, so it describes *this* edit rather than
              warning about one in general.
            */}
            {touchesVerified && (
              <Notice tone="info" className="mt-5">
                {t('owner.profileWillReview')}
              </Notice>
            )}
          </Card>

          {confirmDiscard ? (
            <div className="rounded-[3px] border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-900">{t('account.discardAsk')}</p>
              <div className="mt-2.5 flex gap-2">
                <Button type="button" variant="danger" size="sm" onClick={cancel}>
                  {t('account.discard')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmDiscard(false)}
                >
                  {t('account.keepEditing')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2.5">
              <Button type="submit" size="sm" loading={saving}>
                <Check className="size-4" />
                {touchesVerified ? t('owner.profileSubmit') : t('common.save')}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={cancel}>
                <X className="size-4" />
                {t('common.cancel')}
              </Button>
            </div>
          )}
        </form>
      ) : (
        <>
          <Card className="p-6">
            <h2 className="text-md font-bold text-ink-900">{t('owner.profilePublic')}</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Row label={t('auth.companyTagline')} value={provider.tagline.en || provider.tagline.ar} />
              <Row label={t('owner.governorate')} value={governorateLabel(governorateOf(provider), lang)} />
              <Row label={t('common.wilayah')} value={wilayahName(provider.wilayahId, lang)} />
              <Row
                label={t('auth.experienceYears')}
                value={provider.experienceYears ? n(provider.experienceYears) : undefined}
              />
              <Row label={t('common.email')} value={provider.email} dir="ltr" />
              <Row label={t('common.phone')} value={provider.phone} dir="ltr" />
              <Row
                label={t('owner.description')}
                value={provider.description.en || provider.description.ar}
                wide
              />
            </dl>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-nasek-700" />
              <h2 className="text-md font-bold text-ink-900">{t('owner.profilePrivate')}</h2>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">
              {t('owner.profilePrivateNote')}
            </p>

            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Row label={t('auth.companyName')} value={provider.name.en || provider.name.ar} />
              <Row label={t('owner.permitNumber')} value={provider.permitNumber} dir="ltr" />
              <Row
                label={t('owner.permitExpiry')}
                value={provider.permitExpiry ? date(provider.permitExpiry) : undefined}
              />
              <Row
                label={t('owner.commercialRegistration')}
                value={provider.commercialRegistration}
                dir="ltr"
              />
            </dl>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ivory-300 pt-4">
              <span className="text-2xs font-bold uppercase tracking-[0.12em] text-ink-400">
                {t('owner.permitOnFile')}
              </span>
              {provider.licencePath || provider.licenceImage ? (
                <>
                  <span className="text-sm font-semibold text-ink-800">
                    {provider.licenceFileName || t('owner.permitOnFile')}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={permitState === 'opening'}
                    disabled={!isSupabaseConfigured && !provider.licenceImage}
                    onClick={() => void openPermit()}
                  >
                    <ExternalLink className="size-3.5" />
                    {permitState === 'opening' ? t('owner.permitOpening') : t('owner.permitView')}
                  </Button>
                </>
              ) : (
                <span className="text-sm text-ink-400">{t('owner.permitNone')}</span>
              )}
            </div>

            {permitState === 'failed' && (
              <Notice tone="danger" live className="mt-3">
                {t('owner.permitFailed')}
              </Notice>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

/**
 * A submission an administrator has not read yet.
 *
 * Shown above the company's own details rather than beside them, because the
 * question it answers — "did my change go through?" — is the one an owner comes
 * to this screen with after submitting. The values are the *proposed* ones; the
 * cards below still show what NASEK has approved, and the difference between
 * the two is exactly what is waiting.
 */
function PendingCard({ change }: { change: ProviderProfileChangeRow }) {
  const { t, date } = useI18n()

  const LABEL: Record<string, string> = {
    name: t('auth.companyName'),
    commercial_registration: t('owner.commercialRegistration'),
    permit_number: t('owner.permitNumber'),
    permit_expiry: t('owner.permitExpiry'),
    licence_path: t('owner.permitReplace'),
  }

  const entries = Object.entries(change.proposed).filter(([key]) => key !== 'licence_path')

  return (
    <Card className="border-gold-300 bg-gold-50/50 p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[3px] bg-gold-100 text-gold-800">
          <Clock className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-md font-bold text-ink-900">{t('owner.profilePendingTitle')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            {t('owner.profilePendingBody')}
          </p>
          <p className="mt-2 text-2xs text-ink-400">
            {t('campaignStatus.submittedOn')} · {date(change.created_at)}
          </p>

          <dl className="mt-4 space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <dt className="font-semibold text-ink-700">{LABEL[key] ?? key}:</dt>
                <dd className="text-ink-800">{value || '—'}</dd>
              </div>
            ))}
            {change.licence_path && (
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <dt className="font-semibold text-ink-700">{LABEL.licence_path}:</dt>
                <dd className="text-ink-800">{change.licence_file_name || '—'}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </Card>
  )
}

/**
 * Where the company stands, and what that means for its campaigns.
 *
 * Given its own card at the top because it is the one thing on this screen an
 * owner might have come looking for, and because each state has a genuinely
 * different consequence rather than a different colour.
 */
function VerificationCard({ provider }: { provider: Provider }) {
  const { t, date } = useI18n()

  const state = provider.verification
  const pending = isPendingProvider(state)

  const look = pending
    ? { icon: <Clock className="size-5" />, tone: 'gold' as const, body: t('owner.pendingBody') }
    : state === 'verified'
      ? {
          icon: <BadgeCheck className="size-5" />,
          tone: 'green' as const,
          body: t('owner.verifiedBody'),
        }
      : state === 'rejected'
        ? {
            icon: <FileWarning className="size-5" />,
            tone: 'red' as const,
            body: t('owner.rejectedBody'),
          }
        : { icon: <Ban className="size-5" />, tone: 'red' as const, body: t('owner.suspendedBody') }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[3px] bg-ivory-200 text-nasek-800">
          {look.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-md font-bold text-ink-900">{t('owner.verificationTitle')}</h2>
            <Badge tone={look.tone}>
              {t(
                pending
                  ? 'common.pendingVerification'
                  : state === 'verified'
                    ? 'common.verified'
                    : state === 'rejected'
                      ? 'campaignStatus.rejected'
                      : 'campaignStatus.suspended',
              )}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{look.body}</p>
          {provider.submittedAt && (
            <p className="mt-2 text-2xs text-ink-400">
              {t('prov.submittedOn')} · {date(provider.submittedAt)}
            </p>
          )}
        </div>
      </div>

      {provider.rejectionReason && (
        <Notice tone="danger" title={t('prov.reasonGiven')} className="mt-4">
          {provider.rejectionReason}
        </Notice>
      )}
    </Card>
  )
}

/** One label/value pair, absent values rendered as "not provided" rather than blank. */
function Row({
  label,
  value,
  dir,
  wide,
}: {
  label: string
  value?: string
  dir?: 'ltr' | 'rtl'
  wide?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-2xs font-bold uppercase tracking-[0.12em] text-ink-400">{label}</dt>
      <dd
        dir={dir}
        className={value ? 'mt-1 text-sm text-ink-800' : 'mt-1 text-sm italic text-ink-400'}
      >
        {value || t('owner.profileNotSet')}
      </dd>
    </div>
  )
}

/**
 * The company's logo: upload, replace, remove.
 *
 * Its own card and its own save, deliberately separate from the profile form
 * below it. That form has two halves — details that apply immediately and
 * details that go to an administrator because they are what NASEK verified the
 * company against — and folding a logo into it would drag a picture through a
 * review queue built for permit numbers. A logo is presentation. It applies at
 * once, it opens no review, and it touches no campaign, so changing it cannot
 * move a trip. See `20260911000100`.
 *
 * The preview is the file the owner just chose, not a re-read of the bucket: an
 * object URL shows instantly and does not depend on a CDN that has not been
 * told about the new file yet. It is revoked when it is replaced or the card
 * unmounts, because an object URL pins the whole file in memory until it is.
 */
function LogoCard({
  provider,
  onChanged,
}: {
  provider?: Provider
  onChanged: () => Promise<unknown> | void
}) {
  const { t } = useI18n()
  const { toast } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** The chosen file, shown before the bucket has heard of it. */
  const [preview, setPreview] = useState<string>('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  if (!provider) return null

  /**
   * Which sentence the owner sees, and it is never "something went wrong".
   *
   * Five different things can stop a logo being saved and they have five
   * different fixes — pick a smaller file, pick a PNG, sign in again, try
   * again. A single generic message makes the owner retry the one thing that
   * cannot work. None of these leaks a SQL error or an internal identifier.
   */
  const message = (reason: ProviderLogoError | 'permission' | 'save') =>
    t(
      reason === 'type'
        ? 'owner.logoWrongType'
        : reason === 'size'
          ? 'owner.logoTooBig'
          : reason === 'unauthenticated'
            ? 'owner.logoSignedOut'
            : reason === 'permission'
              ? 'owner.logoNotAllowed'
              : reason === 'save'
                ? 'owner.logoSaveFailed'
                : 'owner.logoUploadFailed',
    )

  const choose = async (file: File | undefined) => {
    if (!file) return
    setError('')

    /*
     * Refused here, and refused again by the bucket and by
     * `set_provider_logo`. Saying so before the upload is a courtesy; the two
     * server-side checks are what make it a rule.
     */
    const invalid = checkProviderLogo(file)
    if (invalid) {
      setError(message(invalid))
      return
    }

    setBusy(true)
    const previous = provider.logoPath
    const uploaded = await uploadProviderLogo(file)
    if (!uploaded.ok) {
      setBusy(false)
      setError(message(uploaded.error))
      return
    }

    const saved = await setProviderLogo(provider.id, uploaded.path)
    if ('error' in saved) {
      // The row still points at the old logo, so the new object is unreferenced.
      // Take it back out rather than leaving it in the bucket for ever.
      await removeProviderLogoObject(uploaded.path)
      setBusy(false)
      /*
       * A refusal from the RPC and a broken connection are different problems.
       * `insufficient_privilege` and `check_violation` are the two the function
       * raises deliberately — the caller does not own the company, or the path
       * is not theirs — and both mean "this will not work", not "try again".
       */
      setError(message(/permission|not yours|must be a file|must be a PNG/i.test(saved.error)
        ? 'permission'
        : 'save'))
      return
    }

    // Only once the row points somewhere else is the old file safe to drop.
    await removeProviderLogoObject(previous)

    const url = URL.createObjectURL(file)
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return url })
    setBusy(false)
    toast(t('owner.logoSaved'), 'success')
    await onChanged()
  }

  const remove = async () => {
    setBusy(true)
    setError('')
    const previous = provider.logoPath
    const saved = await setProviderLogo(provider.id, null)
    if ('error' in saved) {
      setBusy(false)
      setError(message('save'))
      return
    }
    await removeProviderLogoObject(previous)
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return '' })
    setBusy(false)
    toast(t('owner.logoRemoved'), 'success')
    await onChanged()
  }

  const has = !!(preview || provider.logoPath)

  return (
    <Card className="p-6">
      <h2 className="text-md font-bold text-ink-900">{t('owner.logoTitle')}</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">{t('owner.logoNote')}</p>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        {/*
          The preview wins while it exists, because it is the file in front of
          the owner. Otherwise `ProviderMark` draws the saved logo, or the
          monogram when there is none — the same fallback every other screen
          uses, rather than a second opinion about what "no logo" looks like.
        */}
        {preview ? (
          <img
            src={preview}
            alt={provider.name.en || provider.name.ar}
            className="size-16 shrink-0 rounded-[3px] border border-ivory-300 bg-ivory-50 object-contain p-1"
          />
        ) : (
          <ProviderMark provider={provider} size="lg" />
        )}

        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files?.[0])
              // Cleared so choosing the same file twice still fires a change.
              e.target.value = ''
            }}
          />
          {/* Explicit, even though the kit now defaults to it and this card is
              no longer inside a form. Two of the three reasons this failed were
              defaults nobody had looked at. */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlus className="size-4" />
            {t(has ? 'owner.logoChange' : 'owner.logoUpload')}
          </Button>
          {has && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="size-4" />
              {t('owner.logoRemove')}
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 text-2xs leading-relaxed text-ink-400">{t('owner.logoHint')}</p>
      {error && (
        <Notice tone="danger" className="mt-3" live>
          {error}
        </Notice>
      )}
    </Card>
  )
}
