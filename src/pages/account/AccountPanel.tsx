import { useMemo, useRef, useState } from 'react'
import { Check, Mail, Pencil, ShieldCheck, UserRound, X } from 'lucide-react'
import type { User } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT, wilayahById, wilayatByGovernorate, wilayahName } from '@/data/geo'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { requestEmailChange, saveProfile } from '@/services/auth/session'
import { isValidPhone } from '@/services/auth/phone'
import { useStore } from '@/store/AppStore'
import { Button, Card, Field, Input, Notice, Select, Spinner, cx } from '@/components/ui'

/**
 * "My account" — a pilgrim's own details.
 *
 * Two sections, and the split is the point rather than layout. The first is
 * information a person may change freely, because nobody else has an interest
 * in it. The second is the address they sign in with, which is a credential and
 * therefore not a profile field at all — changing it is an authentication
 * operation with a confirmation email attached, and pretending otherwise is how
 * somebody locks themselves out of their own account with a typo.
 *
 * Read first, edit on request. A page that opens in edit mode invites a person
 * who came to check their phone number into a form they then have to cancel out
 * of; and an unsaved form is a thing a browser will happily throw away on a
 * stray click. The edit state is explicit, and leaving it with changes pending
 * asks first.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * Passport and civil ID numbers. They belong to a *booking* — one person may
 * book for family, the numbers differ per traveller, and NASEK has no reason to
 * hold identity documents for somebody who is only browsing. The booking form
 * collects them at the moment they become load-bearing and they stay on the
 * booking's traveller rows. Nationality is the exception and is here as well as
 * there, because it prefills usefully and is not identifying on its own.
 */

const GOVERNORATES = wilayatByGovernorate('en')

/**
 * Nationality, in the vocabulary the booking form already uses.
 *
 * `travellers.nationality` has held `'omani' | 'resident'` since the first
 * prototype, and the booking form branches on it — a non-Omani traveller is
 * additionally asked for a residence number and a sponsor. Introducing a
 * country list here would create a second vocabulary that the form could not
 * read, so this is the same two values with the same two labels.
 */
const NATIONALITIES = ['omani', 'resident'] as const

const nationalityLabel = (value: string, t: (k: 'booking.omani' | 'booking.nonOmani') => string) =>
  value === 'omani' ? t('booking.omani') : t('booking.nonOmani')

/** The governorate a wilayah belongs to, keyed the way the grouping is. */
const governorateOf = (wilayahId: string) =>
  wilayahById(wilayahId)?.governorate.en ?? GOVERNORATES[0][0]

const governorateLabel = (nameEn: string, lang: 'ar' | 'en') =>
  lang === 'en'
    ? nameEn
    : (WILAYAT.find((w) => w.governorate.en === nameEn)?.governorate.ar ?? nameEn)

interface Draft {
  name: string
  phone: string
  governorate: string
  wilayahId: string
  nationality: string
}

const draftFrom = (user: User): Draft => ({
  // Empty, not the greeting. A pilgrim who registered with an address alone is
  // shown the local part of it around the site; putting that into the editable
  // name field would invite them to save it as their actual name.
  name: user.nameIsPlaceholder ? '' : user.name,
  phone: user.phone ?? '',
  governorate: governorateOf(user.wilayahId),
  wilayahId: user.wilayahId,
  nationality: user.nationality ?? '',
})

export function AccountPanel({ user }: { user: User }) {
  const { t, lang } = useI18n()
  const { dispatch, toast } = useStore()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(user))
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const baseline = useRef<Draft>(draftFrom(user))

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline.current),
    [draft],
  )

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const beginEdit = () => {
    const fresh = draftFrom(user)
    baseline.current = fresh
    setDraft(fresh)
    setErrors({})
    setEditing(true)
  }

  const cancel = () => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    setDraft(baseline.current)
    setErrors({})
    setConfirmDiscard(false)
    setEditing(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Partial<Record<keyof Draft, string>> = {}
    // A phone number is optional — a pilgrim who has not booked has never been
    // asked for one — but a *wrong* one is worth catching, because it is what a
    // campaign uses to find somebody at an airport.
    if (draft.phone.trim() && !isValidPhone(draft.phone)) {
      next.phone = t('auth.phoneInvalid')
    }
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    /*
     * Write through, then apply what actually landed.
     *
     * `saveProfile` returns the row as the database stored it, which may differ
     * from what was typed — `guard_profile_privileges` reverts anything
     * privileged, silently and on purpose. Applying the returned row rather
     * than the form's own state is what stops the interface displaying a change
     * the database declined to make. With no backend it returns null and the
     * typed values stand, which is the offline prototype behaving as it always
     * has.
     */
    const saved = await saveProfile({
      name: draft.name,
      phone: draft.phone,
      wilayahId: draft.wilayahId,
      nationality: draft.nationality,
    })
    setSaving(false)

    dispatch({
      type: 'updateProfile',
      patch: saved ?? {
        name: draft.name,
        phone: draft.phone,
        wilayahId: draft.wilayahId,
        nationality: draft.nationality,
        nameIsPlaceholder: !draft.name.trim(),
      },
    })
    baseline.current = draft
    setEditing(false)
    setConfirmDiscard(false)
    toast(t('dash.profileSaved'), 'success')
  }

  return (
    <section className="max-w-2xl space-y-5">
      {/* ------------------------------------------------ personal details */}
      <Card className="p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
              <UserRound className="size-4.5" />
            </span>
            <div>
              <h2 className="text-md font-bold text-ink-900">{t('account.detailsTitle')}</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                {t('account.detailsBody')}
              </p>
            </div>
          </div>
          {!editing && (
            <Button variant="secondary" size="sm" onClick={beginEdit}>
              <Pencil className="size-3.5" />
              {t('common.edit')}
            </Button>
          )}
        </header>

        {editing ? (
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <Field label={t('common.name')} hint={t('account.nameHint')}>
              {(p) => (
                <Input
                  {...p}
                  autoComplete="name"
                  autoFocus
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              )}
            </Field>

            <Field label={t('common.phone')} hint={t('account.phoneHint')} error={errors.phone}>
              {(p) => (
                <Input
                  {...p}
                  type="tel"
                  dir="ltr"
                  autoComplete="tel"
                  placeholder="+968 9xxx xxxx"
                  value={draft.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('account.governorate')}>
                {(p) => (
                  <Select
                    {...p}
                    value={draft.governorate}
                    onChange={(e) => {
                      /*
                       * The wilayah moves with the governorate.
                       *
                       * Leaving it would let the form hold "Salalah, Muscat
                       * Governorate" — a contradiction nothing downstream could
                       * resolve. Only the wilayah is stored; the governorate is
                       * derived from it on the way back in, which is why there
                       * is no `governorate` column on `profiles` to fall out of
                       * step with this one.
                       */
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

              <Field label={t('common.wilayah')}>
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

            <Field label={t('account.nationality')} hint={t('account.nationalityHint')}>
              {(p) => (
                <Select
                  {...p}
                  value={draft.nationality}
                  onChange={(e) => set('nationality', e.target.value)}
                >
                  <option value="">{t('account.nationalityNone')}</option>
                  {NATIONALITIES.map((code) => (
                    <option key={code} value={code}>
                      {nationalityLabel(code, t)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

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
              <div className="flex gap-2.5 border-t border-ivory-300 pt-4">
                <Button type="submit" loading={saving}>
                  {saving ? <Spinner className="size-4" /> : <Check className="size-4" />}
                  {t('common.save')}
                </Button>
                <Button type="button" variant="secondary" onClick={cancel}>
                  <X className="size-4" />
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </form>
        ) : (
          <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Row
              label={t('common.name')}
              value={user.nameIsPlaceholder ? '' : user.name}
            />
            <Row label={t('common.phone')} value={user.phone} dir="ltr" />
            <Row label={t('account.governorate')} value={governorateLabel(governorateOf(user.wilayahId), lang)} />
            <Row label={t('common.wilayah')} value={wilayahName(user.wilayahId, lang)} />
            <Row
              label={t('account.nationality')}
              value={user.nationality ? nationalityLabel(user.nationality, t) : ''}
            />
          </dl>
        )}
      </Card>

      <EmailCard user={user} />

      {/* A quiet reminder of where the identity documents went, so nobody goes
          looking for a "passport" field that was deliberately never added. */}
      <p className="flex items-start gap-2 rounded-[3px] border border-ivory-300 bg-ivory-50 p-3.5 text-2xs leading-relaxed text-ink-400">
        <ShieldCheck className="mt-px size-3.5 shrink-0" />
        {t('account.documentsNote')}
      </p>
    </section>
  )
}

/**
 * The sign-in address.
 *
 * Its own card because it is a different kind of thing from everything above:
 * not a detail about a person but the credential their account is reachable at.
 * Changing it does not save — it *starts* a change, which completes only when a
 * link sent to the new address is followed, and the old address keeps working
 * until then.
 *
 * That asymmetry is the whole reason this is not a field in the form above. A
 * "Save" that leaves the screen showing the old value looks broken; a button
 * that says "send a confirmation" and is answered by "check your new inbox"
 * describes what actually happened.
 */
function EmailCard({ user }: { user: User }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (email.trim().toLowerCase() === user.email.trim().toLowerCase()) {
      setError(t('account.emailSame'))
      return
    }

    setBusy(true)
    const outcome = await requestEmailChange(email)
    setBusy(false)

    if (outcome.ok) {
      setSent(true)
      return
    }
    setError(
      t(
        outcome.error === 'invalid'
          ? 'auth.emailInvalid'
          : outcome.error === 'taken'
            ? 'account.emailTaken'
            : outcome.error === 'rate_limited'
              ? 'auth.errRateLimited'
              : 'account.emailFailed',
      ),
    )
  }

  return (
    <Card className="p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
            <Mail className="size-4.5" />
          </span>
          <div>
            <h2 className="text-md font-bold text-ink-900">{t('account.emailTitle')}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
              {t('account.emailBody')}
            </p>
          </div>
        </div>
        {!open && isSupabaseConfigured && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Pencil className="size-3.5" />
            {t('account.emailChange')}
          </Button>
        )}
      </header>

      <p
        dir="ltr"
        className={cx(
          'mt-4 rounded-[3px] border border-ivory-300 bg-ivory-50 px-3.5 py-2.5 text-start',
          'font-semibold text-ink-800',
        )}
      >
        {user.email}
      </p>

      {open && (
        <div className="mt-4 border-t border-ivory-300 pt-4">
          {sent ? (
            <Notice tone="success" live>
              {t('account.emailSent', { email })}
            </Notice>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field label={t('account.emailNew')} required error={error}>
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
              <p className="text-2xs leading-relaxed text-ink-400">
                {t('account.emailConfirmNote')}
              </p>
              <div className="flex gap-2.5">
                <Button type="submit" loading={busy}>
                  <Mail className="size-4" />
                  {t('account.emailSend')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setOpen(false)
                    setEmail('')
                    setError('')
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

/** One label/value pair, with an explicit "not set" rather than a blank. */
function Row({ label, value, dir }: { label: string; value?: string; dir?: 'ltr' | 'rtl' }) {
  const { t } = useI18n()
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.12em] text-ink-400">
        {label}
      </dt>
      <dd
        dir={dir}
        className={value ? 'mt-1 text-sm text-ink-800' : 'mt-1 text-sm italic text-ink-400'}
      >
        {value || t('account.notSet')}
      </dd>
    </div>
  )
}
