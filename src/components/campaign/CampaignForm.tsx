import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Campaign, CampaignType, ContactPerson, Provider, TravelMethod } from '@/types'
import { useI18n } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import {
  INCLUDED_SERVICES_MAX_LENGTH,
  includedServiceLines,
  parseIncludedServices,
  servicesStillListed,
} from '@/data/services'
import { CampaignImagePicker } from '@/owner/CampaignImagePicker'
import {
  Button,
  Field,
  Input,
  Modal,
  Notice,
  Segmented,
  Select,
  Textarea,
  cx,
} from '@/components/ui'

/**
 * The one campaign form, used by an owner and by an administrator.
 *
 * There used to be no administrator version at all — a trip could only be
 * created by the company running it — and the obvious way to add one was to
 * copy this file. Two copies of a form this size diverge within a month: a
 * field added on one side, a validation rule tightened on the other, and a
 * campaign that means different things depending on who typed it.
 *
 * So the differences are parameters rather than files, and there are exactly
 * two of them:
 *
 *   * `providers` — supplied by the dashboard, absent for an owner. When it is
 *     present the form draws a company picker; when it is not, the trip belongs
 *     to `providerId` and there is nothing to choose.
 *   * the wording on the button, because "publish" and "send for review" are
 *     different promises and only one of them is true for each caller.
 *
 * WHAT THIS FORM DOES NOT DECIDE
 *
 * Whether the trip goes public. `guard_campaign_moderation` forces every
 * non-administrator insert to `pending_approval` and reverts any owner attempt
 * to move `status`; `campaigns_read` withholds anything that is not `active`.
 * An owner pressing "نشر الرحلة" is submitting, and the message afterwards says
 * so. Nothing here could publish a trip if it tried.
 */

/** A person a pilgrim can ring. Held as a row so the list can be edited in place. */
interface ContactRow extends ContactPerson {
  /** Stable across reorders, so React does not reuse the wrong input. */
  key: string
}

/** Longest departure location and office number the form accepts. Mirrors the column checks. */
const DEPARTURE_LOCATION_MAX_LENGTH = 1000
const OFFICE_NUMBER_MAX_LENGTH = 100

/*
 * A counter rather than `Math.random().toString(36).slice(2, 10)`.
 *
 * Both give a key that survives a reorder, which is the property these lists
 * need. The counter gives it without the two things random keys quietly bring
 * with them: a birthday collision — remote, but the failure mode is two rows
 * sharing a key, which React resolves by reusing the wrong input — and a
 * component whose output differs between two runs on identical input, which is
 * exactly what makes a rendering bug impossible to reproduce.
 *
 * Module scope, so it keeps counting across every form opened in one page
 * load; a key only has to be unique among its siblings, and this is stricter
 * than that.
 */
let rowKeys = 0
const rowKey = () => `row-${(rowKeys += 1)}`

/**
 * Today, in the browser's own timezone.
 *
 * `new Date().toISOString().slice(0, 10)` — which this replaces — is the UTC
 * day. Oman is UTC+4, so for the first four hours of every local day it names
 * yesterday. Harmless as a lower bound and wrong as a fact, and the same
 * expression copied somewhere it mattered would be a genuine off-by-one.
 */
function todayLocal(): string {
  const now = new Date()
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 10)
}

export function CampaignForm({
  campaign,
  providerId,
  providers,
  onClose,
  onSave,
}: {
  campaign: Campaign | null
  /** The company the trip belongs to. The initial choice when `providers` is given. */
  providerId: string
  /**
   * Every company, for an administrator to choose between.
   *
   * Absent for an owner, and that absence is the permission boundary as far as
   * this component is concerned — but only as far as this component. The real
   * one is `campaigns_insert_own`, whose `with check` is
   * `owns_provider(provider_id) or is_admin()`: an owner who edited this
   * bundle to send another company's id would be refused by Postgres.
   */
  providers?: Provider[]
  onClose: () => void
  onSave: (campaign: Campaign) => void
}) {
  const { t, lang, n } = useI18n()
  const isNew = campaign === null
  const isAdmin = providers !== undefined
  /*
   * Seats already sold, which the form can show but never set.
   *
   * `seats_available` belongs to the booking workflow: it goes down when an
   * owner confirms payment and back up when a confirmed booking is cancelled,
   * and nothing else writes it. A form that sent its own copy used to undo a
   * confirmation that landed while it was open, and sell the same seat twice.
   * So the figure is derived here, the update leaves the column out, and the
   * database moves it by exactly the change in `seats_total` (20260913000200).
   */
  const bookedSeats = campaign ? Math.max(0, campaign.seatsTotal - campaign.seatsAvailable) : 0

  const [form, setForm] = useState(() => ({
    titleAr: campaign?.title.ar ?? '',
    descAr: campaign?.description.ar ?? '',
    providerId,
    type: (campaign?.type ?? 'umrah') as CampaignType,
    price: String(campaign?.price ?? 150),
    wilayahId: campaign?.wilayahId ?? 'muscat',
    travelMethod: (campaign?.travelMethod ?? 'land') as TravelMethod,
    departureDate: campaign?.departureDate ?? '',
    returnDate: campaign?.returnDate ?? '',
    seatsTotal: String(campaign?.seatsTotal ?? 40),
    hotelMakkah: campaign?.hotelMakkah.ar ?? '',
    hotelMadinah: campaign?.hotelMadinah.ar ?? '',
    haramDistanceM: String(campaign?.haramDistanceM ?? 800),
    registrationDeadline: campaign?.registrationDeadline ?? '',
    images: campaign?.images ?? ([] as string[]),
    /*
     * One text area. An older trip opens with what its page already shows —
     * the labels of its fixed service keys, then anything typed — one per line,
     * so the owner edits the list a pilgrim reads rather than an empty box.
     */
    includedText: campaign ? includedServiceLines(campaign, lang).join('\n') : '',
    // '' for a trip created before these existed; the owner is asked on save.
    departureLocation: campaign?.departureLocation ?? '',
    officeNumber: campaign?.officeNumber ?? '',
    contacts: (campaign?.contactPersons ?? []).map((person) => ({
      ...person,
      key: rowKey(),
    })) as ContactRow[],
  }))

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmClose, setConfirmClose] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const initialForm = useRef(form)
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm.current)

  /**
   * Has this edit changed what the campaign *offers*?
   *
   * A mirror of the `material` expression in `guard_campaign_moderation`, and
   * mirrors are a liability, so it is worth saying exactly why this one earns
   * its place.
   *
   * `movesMaterially` used to live here — a list of the fields whose change
   * sent a live trip back to the review queue. It went with the queue. An
   * approved company may correct its own price, dates or hotels and the trip
   * stays live, which is the same trust the company's approval already
   * extended. See `20260911000100`.
   */

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const today = todayLocal()

  /*
   * The bounds on the deadline picker, and the bug they replace.
   *
   * It read `min={today} max={form.departureDate || undefined}`, which produces
   * an *empty range* whenever the departure date is earlier than today —
   * editing any trip that has already left. A native date input with min above
   * max greys out every day in the calendar, which is exactly "I cannot select
   * the date" and looks like the control is broken rather than constrained.
   *
   * So: the floor drops to an existing deadline when that is already in the
   * past, and the ceiling is only applied when it sits at or above the floor.
   * The range can no longer be empty, and an owner editing an old trip can
   * still see and change what it says.
   *
   * The real rule — deadline no later than departure — is enforced by
   * `submit()` below with a sentence, and by
   * `campaigns_deadline_before_departure` in Postgres regardless of either.
   */
  const deadlineMin =
    campaign?.registrationDeadline && campaign.registrationDeadline < today
      ? campaign.registrationDeadline
      : today
  const deadlineMax =
    form.departureDate && form.departureDate >= deadlineMin ? form.departureDate : undefined

  const FIELD_LABEL: Record<string, string> = {
    titleAr: t('prov.formTitleAr'),
    providerId: t('prov.formProvider'),
    departureDate: t('prov.formDeparture'),
    returnDate: t('prov.formReturn'),
    registrationDeadline: t('prov.formDeadline'),
    seatsTotal: t('prov.formSeats'),
    departureLocation: t('campaign.departureLocation'),
  }

  /** Closing a half-filled form is one stray click away — on the backdrop, on
   *  Escape. Ask before throwing the work away. */
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose())

  // ------------------------------------------------------- the contact list

  const addContact = () =>
    set('contacts', [...form.contacts, { key: rowKey(), name: '', phone: '' }])
  const setContact = (key: string, patch: Partial<ContactPerson>) =>
    set('contacts', form.contacts.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const removeContact = (key: string) =>
    set('contacts', form.contacts.filter((row) => row.key !== key))

  // ------------------------------------------------------------- submit

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.titleAr.trim()) next.titleAr = t('common.required')
    if (isAdmin && !form.providerId) next.providerId = t('common.required')
    if (!form.departureDate) next.departureDate = t('common.required')
    if (!form.returnDate) next.returnDate = t('common.required')
    // Whitespace alone is not a place. The database trims and refuses the same
    // (`campaigns_departure_rules`); this says so in a sentence first.
    if (!form.departureLocation.trim()) {
      next.departureLocation = t('prov.errDepartureLocation')
    }
    /*
     * The price and the seat count, which nothing was checking.
     *
     * Both carry a `min` on the input — 20 rial, one seat — and the browser
     * enforces that for a value somebody types. It does not enforce it for a
     * field somebody *clears*: an empty number input is valid unless it is
     * `required`, and neither of these was. `Number('')` is 0, and the column
     * checks are `price >= 0` and `seats_total >= 0`, so a cleared field
     * published a trip at 0 OMR with no seats on it — through the approval
     * queue, in front of a pilgrim, with nothing anywhere having objected.
     */
    if (!form.price.trim() || !Number.isFinite(Number(form.price))) {
      next.price = t('common.required')
    }
    if (!form.seatsTotal.trim() || !Number.isFinite(Number(form.seatsTotal))) {
      next.seatsTotal = t('common.required')
    } else if (Number(form.seatsTotal) < bookedSeats) {
      // Mirrors the database, which refuses a total below what is confirmed.
      next.seatsTotal = t('prov.errSeatsBelowBooked', { n: bookedSeats })
    }
    // These two used to report "Required" on a field that was filled in,
    // which said nothing about what was actually wrong with it.
    if (form.returnDate && form.departureDate && form.returnDate < form.departureDate) {
      next.returnDate = t('prov.errReturnBefore')
    }
    // Mirrors `campaigns_deadline_before_departure` in Postgres. Checked here so
    // the owner reads a sentence instead of a constraint name.
    if (
      form.registrationDeadline &&
      form.departureDate &&
      form.registrationDeadline > form.departureDate
    ) {
      next.registrationDeadline = t('prov.errDeadlineAfter')
    }
    setErrors(next)
    if (Object.keys(next).length) {
      // The offending field can sit well below the fold in a form this long.
      setTimeout(() => summaryRef.current?.focus(), 0)
      return
    }

    /*
     * The Arabic title carries both columns.
     *
     * The form no longer asks for English, because asking an Arabic-speaking
     * owner to transliterate their own trip produced either a blank or a worse
     * name than the one they had already typed. `title_en` still exists and the
     * customer site in English still reads it, so writing the Arabic there
     * means an English-speaking pilgrim sees the trip's real name rather than
     * an empty heading.
     */
    const includedLines = parseIncludedServices(form.includedText)
    onSave({
      id: campaign?.id ?? `own-${Date.now()}`,
      providerId: form.providerId,
      type: form.type,
      title: { ar: form.titleAr, en: form.titleAr },
      description: { ar: form.descAr, en: form.descAr },
      price: Number(form.price),
      wilayahId: form.wilayahId,
      travelMethod: form.travelMethod,
      departureDate: form.departureDate,
      returnDate: form.returnDate,
      seatsTotal: Number(form.seatsTotal),
      // What the database will hold after the save. Sent only for a new trip.
      seatsAvailable: Math.max(0, Number(form.seatsTotal) - bookedSeats),
      // No longer chosen here. A new trip has none; an edited one keeps only the
      // keys its owner's text still lists (see `servicesStillListed`).
      services: campaign ? servicesStillListed(campaign.services, includedLines) : [],
      hotelMakkah: { ar: form.hotelMakkah, en: form.hotelMakkah },
      hotelMadinah: { ar: form.hotelMadinah, en: form.hotelMadinah },
      haramDistanceM: Number(form.haramDistanceM),
      rating: campaign?.rating ?? 0,
      reviewCount: campaign?.reviewCount ?? 0,
      featured: campaign?.featured ?? false,
      bookingsCount: campaign?.bookingsCount ?? 0,
      registrationDeadline: form.registrationDeadline || undefined,
      images: form.images,
      includedServices: includedLines,
      departureLocation: form.departureLocation.trim(),
      officeNumber: form.officeNumber.trim(),
      contactPersons: form.contacts
        .map((row) => ({ name: row.name.trim(), phone: row.phone.trim() }))
        .filter((person) => person.name !== ''),
      // Carried through, never asked for. The form dropped the terms field;
      // a campaign written before that still has terms worth showing, and
      // deleting somebody's text to tidy a form is not a trade worth making.
      terms: campaign?.terms ?? { ar: '', en: '' },
      contactName: campaign?.contactName,
      contactPhone: campaign?.contactPhone,
      contactEmail: campaign?.contactEmail,
      suspended: campaign?.suspended ?? false,
      deleted: campaign?.deleted ?? false,
      /*
       * The optimistic guess, not the decision.
       *
       * `guard_campaign_moderation` decides for real: an approved company's new
       * trip is written 'active', an ineligible company's insert is refused
       * outright, and an edit never moves the status in either direction.
       * `onSave` reloads and shows whatever the database returned.
       *
       * An edit therefore keeps the status the trip already has — including
       * 'rejected', which only an administrator can lift. Guessing 'active'
       * there would show an owner a live trip that no pilgrim can see.
       */
      status: campaign ? campaign.status : ('active' as const),
      rejectionReason: campaign?.rejectionReason,
      submittedAt: campaign?.submittedAt,
      reviewedAt: campaign?.reviewedAt,
    })
  }

  return (
    <Modal
      open
      wide
      onClose={requestClose}
      title={campaign ? t('prov.editCampaign') : t('prov.newCampaign')}
    >
      <form onSubmit={submit} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <div
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            className="rounded-[3px] border border-red-200 bg-red-50 p-4 focus:outline-none focus:ring-1 focus:ring-red-400"
          >
            <p className="text-sm font-bold text-red-800">{t('prov.fixErrors')}</p>
            <ul className="mt-1.5 list-disc space-y-0.5 ps-5 text-xs leading-relaxed text-red-700">
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>
                  <span className="font-semibold">{FIELD_LABEL[key] ?? key}</span> — {message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Administrators only. An owner has exactly one company and is never
            asked which. */}
        {providers && (
          <Field label={t('prov.formProvider')} required error={errors.providerId}>
            {(p) => (
              <Select
                {...p}
                value={form.providerId}
                onChange={(e) => set('providerId', e.target.value)}
              >
                <option value="">{t('prov.formProviderPick')}</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name[lang]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label={t('prov.formTitleAr')} required error={errors.titleAr}>
          {(p) => (
            <Input {...p} dir="rtl" value={form.titleAr} onChange={(e) => set('titleAr', e.target.value)} />
          )}
        </Field>

        <Field label={t('prov.formDescAr')}>
          {(p) => (
            <Textarea {...p} dir="rtl" value={form.descAr} onChange={(e) => set('descAr', e.target.value)} />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formType')}>
            {() => (
              <Segmented
                className="w-full"
                size="sm"
                label={t('prov.formType')}
                value={form.type}
                onChange={(v) => set('type', v)}
                options={[
                  { value: 'umrah', label: t('common.umrah') },
                  { value: 'hajj', label: t('common.hajj') },
                ]}
              />
            )}
          </Field>
          <Field label={t('prov.formMethod')}>
            {() => (
              <Segmented
                className="w-full"
                size="sm"
                label={t('prov.formMethod')}
                value={form.travelMethod}
                onChange={(v) => set('travelMethod', v)}
                options={[
                  { value: 'land', label: t('common.land') },
                  { value: 'air', label: t('common.air') },
                ]}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formPrice')} required error={errors.price}>
            {(p) => (
              <Input {...p} type="number" min={20} value={form.price} onChange={(e) => set('price', e.target.value)} />
            )}
          </Field>
          <Field label={t('prov.formWilayah')}>
            {(p) => (
              <Select {...p} value={form.wilayahId} onChange={(e) => set('wilayahId', e.target.value)}>
                {WILAYAT.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name[lang]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formDeparture')} required error={errors.departureDate}>
            {(p) => (
              <Input
                {...p}
                type="date"
                min={today}
                value={form.departureDate}
                onChange={(e) => set('departureDate', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('prov.formReturn')} required error={errors.returnDate}>
            {(p) => (
              <Input
                {...p}
                type="date"
                min={form.departureDate || today}
                value={form.returnDate}
                onChange={(e) => set('returnDate', e.target.value)}
              />
            )}
          </Field>
        </div>

        {/*
          Where the trip leaves from, in the owner's words. Free text on
          purpose: a car park, a gate, a landmark — nothing a list of wilayat or
          a map pin says well. The wilayah above stays; it is what the
          catalogue filters on.
        */}
        <Field label={t('campaign.departureLocation')} required error={errors.departureLocation}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={DEPARTURE_LOCATION_MAX_LENGTH}
              placeholder={t('prov.formDepartureLocationPlaceholder')}
              value={form.departureLocation}
              onChange={(e) => set('departureLocation', e.target.value)}
            />
          )}
        </Field>

        {/* Free text: "12", "Office 204", "مكتب 5 - الدور الثاني". Not a number field. */}
        <Field label={t('prov.formOfficeNumber')}>
          {(p) => (
            <Input
              {...p}
              maxLength={OFFICE_NUMBER_MAX_LENGTH}
              value={form.officeNumber}
              onChange={(e) => set('officeNumber', e.target.value)}
            />
          )}
        </Field>

        <Field
          label={t('prov.formDeadline')}
          hint={t('prov.formDeadlineHint')}
          error={errors.registrationDeadline}
        >
          {(p) => (
            <Input
              {...p}
              type="date"
              min={deadlineMin}
              max={deadlineMax}
              value={form.registrationDeadline}
              onChange={(e) => set('registrationDeadline', e.target.value)}
            />
          )}
        </Field>

        <div className={cx('grid gap-4', isNew ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
          <Field label={t('prov.formSeats')} required error={errors.seatsTotal}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                value={form.seatsTotal}
                onChange={(e) => set('seatsTotal', e.target.value)}
              />
            )}
          </Field>
          {!isNew && (
            <Field label={t('prov.formSeatsAvailable')} hint={t('prov.seatsAvailableHint')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  readOnly
                  value={String(Math.max(0, (Number(form.seatsTotal) || 0) - bookedSeats))}
                />
              )}
            </Field>
          )}
          <Field label={t('prov.formHaram')}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                step={50}
                value={form.haramDistanceM}
                onChange={(e) => set('haramDistanceM', e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('prov.formHotelMakkah')}>
            {(p) => (
              <Input {...p} value={form.hotelMakkah} onChange={(e) => set('hotelMakkah', e.target.value)} />
            )}
          </Field>
          <Field label={t('prov.formHotelMadinah')}>
            {(p) => (
              <Input {...p} value={form.hotelMadinah} onChange={(e) => set('hotelMadinah', e.target.value)} />
            )}
          </Field>
        </div>

        {/*
          What the price includes, in the owner's own words — one service per
          line. It replaced a set of tick-boxes and a list of input rows: no
          fixed menu covers what a campaign offers, and a pilgrim reads the
          list exactly as it is typed here.
        */}
        <Field label={t('campaign.includes')}>
          {(p) => (
            <Textarea
              {...p}
              rows={6}
              maxLength={INCLUDED_SERVICES_MAX_LENGTH}
              placeholder={t('prov.formIncludedPlaceholder')}
              value={form.includedText}
              onChange={(e) => set('includedText', e.target.value)}
            />
          )}
        </Field>

        {/* --------------------------------------------------- photographs */}
        <p className="border-t border-ivory-300 pt-4 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('prov.sectionMedia')}
        </p>

        <CampaignImagePicker value={form.images} onChange={(images) => set('images', images)} />

        {/* ------------------------------------------------------- contact */}
        <p className="border-t border-ivory-300 pt-4 text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('prov.formContact')}
        </p>
        <p className="-mt-2 text-xs leading-relaxed text-ink-400">{t('prov.formContactHint')}</p>

        <div className="space-y-3">
          {form.contacts.map((row, index) => (
            <div key={row.key} className="flex items-end gap-2">
              <Field label={`${t('prov.formContactName')} ${n(index + 1)}`} className="flex-1">
                {(p) => (
                  <Input
                    {...p}
                    value={row.name}
                    onChange={(e) => setContact(row.key, { name: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t('common.phone')} className="flex-1">
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    dir="ltr"
                    value={row.phone}
                    onChange={(e) => setContact(row.key, { phone: e.target.value })}
                  />
                )}
              </Field>
              <button
                type="button"
                onClick={() => removeContact(row.key)}
                aria-label={t('common.remove')}
                className="mb-1.5 rounded-[3px] p-2 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={addContact}>
          <Plus className="size-3.5" />
          {t('prov.addContact')}
        </Button>

        {/*
          What saving will actually do, said before the button rather than
          discovered after it.

          A live campaign returning to the queue because somebody corrected a
          price used to send a live trip back into a review queue, and this
          notice warned about it. It no longer happens — approval is the
          company's, not the trip's — so the notice says the opposite, which is
          the thing an owner about to change a price actually wants to know:
          the change is public as soon as it is saved.
        */}
        {!isAdmin && campaign && campaign.status === 'active' && (
          <Notice tone="info">{t('campaignStatus.editsGoLiveNote')}</Notice>
        )}
        {campaign && campaign.status === 'rejected' && campaign.rejectionReason && (
          <Notice tone="danger" title={t('campaignStatus.reason')}>
            {campaign.rejectionReason}
          </Notice>
        )}

        {confirmClose ? (
          <div className="rounded-[3px] border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">{t('prov.discardAsk')}</p>
            <div className="mt-2.5 flex gap-2">
              <Button type="button" variant="danger" size="sm" onClick={onClose}>
                {t('prov.discard')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmClose(false)}
              >
                {t('prov.keepEditing')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2.5 border-t border-ivory-300 pt-5">
            {/*
              The label names what the owner is doing, not what NASEK does next.
              It used to read "send for review", which is the platform's word for
              its own queue and told an owner their trip had gone somewhere
              rather than that it was done. The queue has not gone away — the
              confirmation after this says so plainly.
            */}
            <Button type="submit" size="md" block>
              {isNew
                ? t('prov.publishCampaign')
                : t('prov.saveCampaign')}
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={requestClose}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
      </form>
    </Modal>
  )
}
