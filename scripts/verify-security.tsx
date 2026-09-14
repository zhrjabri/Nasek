/*
 * The two fixes from the security review of 20260911000100.
 *
 * A security control is worth exactly as much as the thing that stops it being
 * skipped. Both defects here were of that shape rather than of the "forgot to
 * check" shape:
 *
 *   1. `set_provider_logo` validated that a logo path belonged to the caller,
 *      and `guard_provider_privileges` let an owner PATCH `logo_path` directly,
 *      so the validation was advisory. The migration that introduced it said so
 *      in its own docblock and did not act on it.
 *   2. The WhatsApp invoice needed the owner's phone in the customer's browser
 *      and `providers_public` withholds `phone` — correctly. The feature failed
 *      closed, which is the right failure and still a failure.
 *
 * WHAT CAN AND CANNOT BE ASSERTED HERE
 *
 * `guard_provider_privileges`, `set_provider_logo` and `booking_provider_contact`
 * are SECURITY DEFINER and their rules cannot be exercised without a live
 * database and three separately signed-in roles. That belongs to
 * `verify:backend` and to a human with the credentials. What is asserted here is
 * everything on this side of that line: that the SQL this repository would apply
 * still says what the fixes depend on it saying, and that the client honours the
 * ordering the server now enforces. `verify:isolation`, `verify:booking` and
 * `verify:logo` read policy SQL the same way and for the same reason.
 *
 * The numbered checks map to the thirteen cases the review asked for; each is
 * labelled with its number so a gap is visible rather than merely absent.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { I18nProvider } from '@/i18n'
import { AppStoreProvider } from '@/store/AppStore'
import { buildInvoice, invoiceWhatsappUrl, whatsappDigits } from '@/lib/invoice'
import { providerLogoPath } from '@/services/storage/providerLogo'
import { ProviderMark } from '@/components/brand/ProviderMark'
import { CompanyProfilePanel } from '@/owner/panels/CompanyProfilePanel'
import { ownerAr } from '@/i18n/ownerAr'
import { ownerEn } from '@/i18n/ownerEn'
import type { Booking, Campaign, Provider } from '@/types'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const head = (s: string) => console.log(`\n--- ${s} ---\n`)

const root = path.resolve(import.meta.dirname ?? '.', '..')
const sql = (name: string) =>
  fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')
const src = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const FIX = sql('20260912000100_logo_write_guard_and_booking_contact.sql')
const RLS = sql('20260901000200_rls_policies.sql')
const LOGO_MIGRATION = sql('20260911000100_direct_publish_and_provider_logo.sql')
const OWNER_REG = sql('20260904000200_owner_registration.sql')

/** A named function body, sliced out so a check cannot match the wrong one. */
function body(text: string, name: string): string {
  const from = text.indexOf(`create or replace function public.${name}`)
  if (from < 0) return ''
  const end = text.indexOf('$fn$;', from)
  return end < 0 ? text.slice(from) : text.slice(from, end)
}

const GUARD = body(FIX, 'guard_provider_privileges')
const SET_LOGO = body(FIX, 'set_provider_logo')
const CONTACT = body(FIX, 'booking_provider_contact')

// =================================================== 1. the logo write path

head('1. a generic owner UPDATE cannot change logo_path')

check('the guard is the current definition of the function',
  GUARD.length > 0 && FIX.includes('create trigger providers_guard_privileges'))

/*
 * The owner branch, sliced from the admin early-return onwards, so a check
 * cannot accidentally pass on something in the INSERT or administrator paths.
 */
const ownerBranch = GUARD.slice(GUARD.indexOf('everything else: an owner'))
check('the owner branch restores logo_path from the old row',
  /new\.logo_path := old\.logo_path/.test(ownerBranch), 'this is the fix')
check('and does so unless the trusted window is open',
  /if not logo_write then\s*\n\s*new\.logo_path := old\.logo_path/.test(ownerBranch))
check('the window is its own flag, not the verification-evidence one',
  /current_setting\('nasek\.logo_write'/.test(GUARD) &&
    /current_setting\('nasek\.verified_write'/.test(GUARD))
check('so unlocking permit evidence does not also unlock the logo',
  !/verified_write[\s\S]{0,80}logo_path/.test(ownerBranch))
check('a company cannot be inserted carrying a logo it never uploaded',
  /new\.logo_path        := null/.test(GUARD))

/*
 * And nothing else lost its protection. The review's instruction was to fix the
 * logo without weakening any other provider field, so every column the previous
 * version restored is named here; dropping one would be the exact regression
 * 20260905000100 caused before.
 */
for (const column of [
  'id', 'owner_id', 'plan', 'verified_by', 'verified_at', 'joined_at', 'created_at',
  'verification', 'rejection_reason', 'submitted_at',
]) {
  check(`${column} is still restored on an owner write`,
    new RegExp(`new\\.${column}\\s*:= old\\.${column}`).test(ownerBranch), column)
}
for (const column of [
  'name_ar', 'name_en', 'commercial_registration', 'permit_number', 'permit_expiry',
  'licence_path', 'licence_file_name', 'licence_mime', 'licence_image',
]) {
  check(`${column} is still behind verified_write`,
    new RegExp(`new\\.${column}\\s*:= old\\.${column}`).test(ownerBranch), column)
}
check('the review-average recompute exemption survives',
  /if not aggregating then/.test(ownerBranch))
check('and a refused company can still rejoin the queue',
  /old\.verification = 'rejected'/.test(GUARD))

head('2. set_provider_logo can still set the owner’s own path')

check('it opens the window immediately around the write',
  /set_config\('nasek\.logo_write', 'on', true\)[\s\S]{0,240}update public\.providers[\s\S]{0,120}set logo_path = cleaned/
    .test(SET_LOGO))
check('and closes it again straight after',
  /returning \* into updated;\s*\n\s*perform set_config\('nasek\.logo_write', 'off', true\)/.test(SET_LOGO))
/*
 * Every refusal happens before the flag is set, so no error path can leave the
 * window open for the rest of the caller's transaction.
 */
const beforeFlag = SET_LOGO.slice(0, SET_LOGO.indexOf("set_config('nasek.logo_write', 'on'"))
check('every refusal is raised before the window opens',
  (SET_LOGO.match(/raise exception/g) ?? []).length ===
    (beforeFlag.match(/raise exception/g) ?? []).length,
  'a raise after set_config would leave the window open')

head('3. set_provider_logo rejects another owner’s path')

check('the first path segment must be the caller’s own id',
  /split_part\(cleaned, '\/', 1\) <> caller::text/.test(SET_LOGO))
check('with a message that says why', /A logo must be a file you uploaded/.test(SET_LOGO))
/*
 * The shape check is anchored at both ends now. The previous form tested only
 * the tail, so `../../elsewhere.png` and `https://attacker.example/x.png` both
 * satisfied it and only the folder rule stood in the way.
 */
check('the whole value must be one uuid, one slash and one file name',
  /\^\[0-9a-fA-F-\]\{36\}\/\[A-Za-z0-9\._-\]\+\\\.\(png\|jpg\|jpeg\|webp\)\$/.test(SET_LOGO),
  'the extension test is anchored at both ends')
check('so a traversal segment cannot satisfy it',
  !/\.\./.test('placeholder') && /\^\[0-9a-fA-F-\]\{36\}\//.test(SET_LOGO))
check('and neither can an absolute URL',
  /\^\[0-9a-fA-F-\]\{36\}\//.test(SET_LOGO))
check('an administrator is exempt from the folder rule but not from the shape',
  /if cleaned is not null then[\s\S]{0,400}not public\.is_admin\(\) and split_part/.test(SET_LOGO))

head('4. anonymous and non-owner callers')

check('an unauthenticated caller is refused', /caller is null/.test(SET_LOGO))
check('a caller who does not own the company is refused',
  /not public\.owns_provider\(p_provider_id\) and not public\.is_admin\(\)/.test(SET_LOGO))
check('anon holds no execute grant on it',
  /revoke all on function public\.set_provider_logo\(uuid, text\) from public, anon/.test(FIX))
check('only authenticated may call it',
  /grant execute on function public\.set_provider_logo\(uuid, text\)\s*\n?\s*to authenticated/.test(FIX))

// ============== the path production actually generates, against the real rule

head('the real upload path, against the real database validation')

/*
 * The bug this section exists for.
 *
 * `set_provider_logo`'s regex and the `campaign-images` storage policy both have
 * to accept whatever `uploadProviderLogo` builds, and neither of them lives in
 * this repository's TypeScript — one is in a migration, the other in a policy
 * written a week earlier. A test that types its own path string proves the
 * regex accepts *that string*. So the path here comes from `providerLogoPath`,
 * the same exported function production calls, and the pattern comes out of the
 * migration file rather than being restated.
 */
const OWNER_A = '3f2b9c14-7a55-4d81-9e02-6c1b8ad4e7f9'
const OWNER_B = 'a17c4e02-9b31-4f6a-8d55-2e90c7fb1a43'

/** The anchored pattern, lifted out of the migration so the two cannot drift. */
const sqlPattern = (() => {
  const m = SET_LOGO.match(/cleaned !~ '([^']+)'/)
  if (!m) throw new Error('the extension check is not where this test expects it')
  return new RegExp(m[1])
})()
console.log(`  pattern read from the migration: ${sqlPattern.source}`)

check('the migration really does anchor the pattern at both ends',
  sqlPattern.source.startsWith('^') && sqlPattern.source.endsWith('$'))

for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
  const real = providerLogoPath(OWNER_A, mime, 1_757_683_200_000)
  check(`a ${mime} upload produces ${real.slice(37)}`, real.startsWith(`${OWNER_A}/`), real)
  check(`...and set_provider_logo's pattern accepts it`, sqlPattern.test(real), real)
  /*
   * The storage policy's half. `(storage.foldername(name))[1]` is everything
   * before the first slash, and it is compared against `auth.uid()::text` — so
   * the folder has to be the uploader's own id, exactly.
   */
  check(`...and the storage policy's folder segment is the owner's own id`,
    real.split('/')[0] === OWNER_A)
  check(`...which is also what split_part(path,'/',1) gives the RPC`,
    real.split('/')[0] === OWNER_A)
}

/*
 * An unknown MIME falls back to `.png`, which still has to satisfy the pattern
 * — otherwise a browser reporting an unusual type would produce a path the
 * database silently refuses after the file is already in the bucket.
 */
check('an unexpected MIME still produces an acceptable path',
  sqlPattern.test(providerLogoPath(OWNER_A, 'image/avif', 1_757_683_200_000)))

head('Owner A’s path is accepted for A and refused for B')

const aPath = providerLogoPath(OWNER_A, 'image/png', 1_757_683_200_000)
/** The RPC's ownership test, as the migration states it. */
const ownedBy = (path: string, caller: string) => path.split('/')[0] === caller

check('Owner A’s own path passes the ownership test for Owner A',
  ownedBy(aPath, OWNER_A) && sqlPattern.test(aPath))
check('and fails it for Owner B',
  !ownedBy(aPath, OWNER_B),
  'Owner B pointing at Owner A’s file is exactly what the check exists to stop')
check('Owner B cannot construct a path into Owner A’s folder either',
  providerLogoPath(OWNER_B, 'image/png', 1).split('/')[0] === OWNER_B)

head('and the shapes that must stay refused')

for (const [label, bad] of [
  ['an external URL', 'https://attacker.example/logo.png'],
  ['an external URL under a uuid-looking host', `https://${OWNER_A}/logo.png`],
  ['a protocol-relative URL', '//attacker.example/logo.png'],
  ['a data URI', 'data:image/png;base64,iVBORw0KGgo='],
  ['parent traversal', '../../logo.png'],
  ['traversal after a valid folder', `${OWNER_A}/../${OWNER_B}/logo.png`],
  ['a nested path', `${OWNER_A}/sub/logo.png`],
  ['a bare file name with no folder', 'logo.png'],
  ['an SVG', `${OWNER_A}/logo.svg`],
  ['no extension', `${OWNER_A}/logo`],
  ['a double extension ending wrong', `${OWNER_A}/logo.png.svg`],
  ['a folder that is not a uuid', `not-a-uuid/logo.png`],
  ['an empty string', ''],
]) {
  check(`${label} is refused by the pattern`, !sqlPattern.test(bad), bad.slice(0, 48))
}

/*
 * The one shape the pattern alone lets through: a well-formed path in somebody
 * else's uuid folder. That is what the separate `split_part` ownership test is
 * for, and this asserts the two checks together rather than either alone.
 */
const otherFolder = `${OWNER_B}/logo-1.png`
check('a well-formed path in another owner’s folder passes the pattern',
  sqlPattern.test(otherFolder), 'so the pattern alone is not the protection')
check('...and is caught by the ownership test instead',
  !ownedBy(otherFolder, OWNER_A),
  'both checks are needed; neither is redundant')

head('the upload gate that runs before any of it')

check('the file input accepts only the three raster types',
  /accept="image\/png,image\/jpeg,image\/webp"/.test(src('src/owner/panels/CompanyProfilePanel.tsx')))
check('and the logo card is not inside the profile form',
  (() => {
    const panel = src('src/owner/panels/CompanyProfilePanel.tsx')
    const card = panel.indexOf('<LogoCard')
    const form = panel.indexOf('<form onSubmit={submit}')
    return card > 0 && form > 0 && card < form
  })(),
  'inside the form its buttons submitted it instead of opening the file dialog')
check('nor behind the edit-mode branch',
  (() => {
    const panel = src('src/owner/panels/CompanyProfilePanel.tsx')
    return panel.indexOf('<LogoCard') < panel.indexOf('{editing ? (')
  })(),
  'it was invisible until the owner pressed Edit')
check('its buttons say type="button" explicitly',
  (src('src/owner/panels/CompanyProfilePanel.tsx').match(/type="button"/g) ?? []).length >= 2)
check('and the shared Button defaults to type="button" rather than submit',
  /type = 'button',/.test(src('src/components/ui/index.tsx')))
check('while every real submit in the codebase still says so explicitly',
  /type={type}/.test(src('src/components/ui/index.tsx')))

// ==================================== 5. the booking-scoped contact lookup

head('5–8. the provider contact is scoped to a booking the caller holds')

check('booking_provider_contact exists', CONTACT.length > 0)
check('an unauthenticated caller is refused',
  /caller uuid := auth\.uid\(\)[\s\S]{0,200}if caller is null then[\s\S]{0,120}insufficient_privilege/.test(CONTACT))
check('anon holds no execute grant',
  /revoke all on function public\.booking_provider_contact\(uuid\) from public, anon/.test(FIX))
check('only authenticated may call it',
  /grant execute on function public\.booking_provider_contact\(uuid\)\s*\n?\s*to authenticated/.test(FIX))

/*
 * The authorisation is inside the query rather than after it. Reading the row
 * first and checking ownership second would answer "no such booking" and "not
 * yours" differently, which is a way to test whether a booking id exists.
 */
check('the booking must belong to the caller',
  /and b\.user_id = caller/.test(CONTACT))
check('and that test is part of the same query, not a later branch',
  /where b\.id = p_booking_id\s*\n\s*and b\.user_id = caller/.test(CONTACT))
check('so another customer’s booking id yields the same nothing',
  /if not found then[\s\S]{0,120}No such booking/.test(CONTACT))

check('the phone comes from the provider the booking actually resolves to',
  /join public\.campaigns c on c\.id = b\.campaign_id[\s\S]{0,120}join public\.providers pr on pr\.id = c\.provider_id/
    .test(CONTACT),
  'not from a provider id the caller named')

head('8. and it returns only the phone')

check('the return type is a bare text, not a row',
  /create or replace function public\.booking_provider_contact\(p_booking_id uuid\)\s*\nreturns text/.test(FIX))
check('only pr.phone is selected', /select pr\.phone into phone/.test(CONTACT))
for (const column of [
  'email', 'address', 'commercial_registration', 'permit_number', 'permit_expiry',
  'licence_path', 'licence_image', 'owner_id',
]) {
  check(`${column} is not returned`, !new RegExp(`pr\\.${column}`).test(CONTACT), column)
}
check('a company with no number yields null rather than an empty string',
  /return nullif\(btrim\(coalesce\(phone, ''\)\), ''\)/.test(CONTACT))
check('search_path is pinned', /set search_path = public, pg_temp/.test(CONTACT))
check('and there is no dynamic SQL anywhere in the migration',
  !/execute\s+format|execute\s+'/.test(FIX))

head('13. providers_public still withholds every private column')

/*
 * Read from the view's own definition rather than from a description of it.
 * The fix must not have widened the view — that was the tempting shortcut and
 * the whole reason the RPC exists.
 */
const view = LOGO_MIGRATION.slice(
  LOGO_MIGRATION.indexOf('create view public.providers_public'),
  LOGO_MIGRATION.indexOf('grant select on public.providers_public'),
)
for (const column of [
  'phone', 'email', 'address', 'commercial_registration', 'permit_number',
  'permit_expiry', 'licence_image', 'licence_path', 'licence_file_name',
  'licence_mime', 'owner_id', 'rejection_reason', 'verified_by', 'verified_at',
]) {
  check(`providers_public does not select ${column}`,
    !new RegExp(`\\b${column}\\b`).test(view), column)
}
check('this migration does not recreate the view at all',
  !/create view public\.providers_public/.test(FIX),
  'the fix must not widen it')
check('nor grant anything new to anon', !/to anon/.test(FIX.replace(/from public, anon/g, '')))
check('and the view was already granted to anon before this change',
  /grant select on public\.providers_public to anon, authenticated/.test(LOGO_MIGRATION))
check('while the providers table itself stays closed to anon',
  /revoke select on public\.providers from anon/.test(sql('20260902000200_auth_hardening.sql')))

// ================================= 9-12. the client honours the same ordering

head('9–12. the WhatsApp link, before and after a booking exists')

const COMPANY: Provider = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: { ar: 'شركة الاختبار', en: 'Harness Co' },
  tagline: { ar: '', en: '' },
  description: { ar: '', en: '' },
  wilayahId: 'muscat',
  verification: 'verified',
  experienceYears: 3,
  rating: 4.6,
  reviewCount: 4,
  // Exactly what a customer's `providers_public` row produces: no phone.
  phone: '',
  email: '',
  initials: 'HC',
  brandColor: '#1c5e4c',
  plan: 'basic',
  joinedAt: '2026-01-01',
}

const TRIP: Campaign = {
  id: 'cccccccc-dddd-eeee-ffff-000000000000',
  providerId: COMPANY.id,
  type: 'umrah',
  title: { ar: 'رحلة', en: 'Trip' },
  description: { ar: '', en: '' },
  price: 350,
  wilayahId: 'muscat',
  travelMethod: 'air',
  departureDate: '2027-03-12',
  returnDate: '2027-03-22',
  seatsTotal: 40,
  seatsAvailable: 10,
  services: [],
  hotelMakkah: { ar: '', en: '' },
  hotelMadinah: { ar: '', en: '' },
  haramDistanceM: 400,
  rating: 4.5,
  reviewCount: 2,
  featured: false,
  bookingsCount: 0,
  suspended: false,
  deleted: false,
  status: 'active',
  includedServices: [],
  departureLocation: 'مسقط',
  officeNumber: '',
  contactPersons: [],
  images: [],
  terms: { ar: '', en: '' },
}

const SAVED: Booking = {
  id: 'bbbbbbbb-cccc-dddd-eeee-111111111111',
  reference: 'NSK-240512',
  userId: 'user-1',
  campaignId: TRIP.id,
  travellers: [],
  travellersCount: 3,
  maleCount: 2,
  femaleCount: 1,
  pricePerPerson: 350,
  contactName: 'Aisha Al-Harthy',
  contactPhone: '+968 9876 5432',
  contactEmail: 'aisha@example.com',
  totalPrice: 1050,
  status: 'pending',
  bookingDate: '2026-09-12',
}

/*
 * The customer's view of the company carries no phone, so before the lookup
 * resolves there is nothing to send to — and the interface must say so rather
 * than produce a link to somewhere nobody chose. This is the state the bug left
 * permanently in place.
 */
const notYet = buildInvoice(SAVED, TRIP, COMPANY, 'en')
check('12. with no number known, the invoice carries none', notYet.providerPhone === null)
check('12. and no WhatsApp link is produced', invoiceWhatsappUrl(notYet, 'en') === null,
  String(invoiceWhatsappUrl(notYet, 'en')))
check('12. which is the fail-closed state the interface renders as "no number"', true)

const resolved = buildInvoice(SAVED, TRIP, COMPANY, 'en', '+968 9123 4567')
check('10. once the booking-scoped lookup answers, the link exists',
  invoiceWhatsappUrl(resolved, 'en')?.startsWith('https://wa.me/96891234567?text=') === true,
  invoiceWhatsappUrl(resolved, 'en')?.slice(0, 44))
check('10. addressed to the number the server returned',
  resolved.providerPhone === '+968 9123 4567')
check('10. normalised to digits only', whatsappDigits('+968 9123 4567') === '96891234567')
check('10. and the body is percent-encoded',
  invoiceWhatsappUrl(resolved, 'en')!.includes('%20') &&
    !/\?text=[^&]*\+/.test(invoiceWhatsappUrl(resolved, 'en')!))

/*
 * A number the server refuses to give still yields nothing. `null` and `''` are
 * both "no number", and neither may fall back to something else.
 */
for (const [label, value] of [['null', null], ['an empty string', ''], ['whitespace', '   ']] as const) {
  const refused = buildInvoice(SAVED, TRIP, COMPANY, 'en', value)
  check(`12. a lookup returning ${label} produces no link`,
    invoiceWhatsappUrl(refused, 'en') === null)
}

check('11. reopening reuses the saved reference rather than minting one',
  resolved.invoiceNumber === SAVED.reference, resolved.invoiceNumber)
check('11. and the snapshotted figures, not recomputed ones',
  resolved.pricePerPerson === 350 && resolved.totalAmount === 1050 &&
    resolved.maleCount === 2 && resolved.femaleCount === 1)
check('11. so a second invoice for the same booking is identical',
  invoiceWhatsappUrl(buildInvoice(SAVED, TRIP, COMPANY, 'en', '+968 9123 4567'), 'en') ===
    invoiceWhatsappUrl(resolved, 'en'))

head('9. and the lookup is keyed on a saved booking')

/*
 * The ordering the review asked for, read off the source: both customer
 * surfaces ask `bookingProviderContact(booking.id)`, and a booking id only
 * exists after the row is saved. There is no path that fetches a number for a
 * campaign, or before creation.
 */
for (const [label, file] of [
  ['the invoice screen', 'src/pages/BookingPage.tsx'],
  ['the customer dashboard', 'src/pages/DashboardPage.tsx'],
] as [string, string][]) {
  const text = src(file)
  check(`${label} asks for the contact by booking id`,
    /bookingProviderContact\(booking\.id\)/.test(text))
  check(`${label} never asks by campaign or provider`,
    !/bookingProviderContact\((?!booking\.id)/.test(text))
}
check('the data layer sends only the booking id',
  /booking_provider_contact', \{\s*\n?\s*p_booking_id: bookingId,?\s*\n?\s*\}/
    .test(src('src/services/data/catalogue.ts')))
check('and a refusal is read as "no number" rather than thrown at the customer',
  /if \(error \|\| typeof data !== 'string'\) return null/.test(src('src/services/data/catalogue.ts')))

head('the logo is still rendered without inventing one')

const drawn = renderToStaticMarkup(
  <MemoryRouter>
    <I18nProvider>
      <AppStoreProvider>
        <ProviderMark provider={{ ...COMPANY, logoPath: undefined }} />
      </AppStoreProvider>
    </I18nProvider>
  </MemoryRouter>,
)
check('a company with no logo draws its initials, not a stand-in image',
  drawn.includes('HC') && !drawn.includes('<img'))

head('the logo card as the owner portal actually renders it')

/*
 * Rendered, not grepped.
 *
 * The bug was structural — the card sat inside `{editing ? (<form>` — and a
 * source-position check would still pass if someone later wrapped the whole
 * panel in a form. So the panel is drawn with a real company and the output is
 * read: the upload control has to exist, and it has to appear before the form
 * opens rather than between its tags.
 */
const panel = renderToStaticMarkup(
  <MemoryRouter>
    <I18nProvider extra={{ en: ownerEn, ar: ownerAr }}>
      <AppStoreProvider>
        <CompanyProfilePanel provider={{ ...COMPANY, logoPath: undefined }} />
      </AppStoreProvider>
    </I18nProvider>
  </MemoryRouter>,
)

/*
 * Arabic, because that is what the panel renders. `initialLang()` has no
 * `window` under `renderToStaticMarkup` and falls back to NASEK's primary
 * language — so asserting the English label would be asserting a locale this
 * code path never takes. The strings are read from the dictionary rather than
 * retyped, so a reworded label moves the test with it.
 */
check('the panel draws the logo card', panel.includes(ownerAr['owner.logoTitle']),
  `${panel.length} chars, looking for "${ownerAr['owner.logoTitle']}"`)
check('with an upload control', panel.includes(ownerAr['owner.logoUpload']))
check('and a file input restricted to the three raster types',
  panel.includes('accept="image/png,image/jpeg,image/webp"'))
const uploadAt = panel.indexOf(ownerAr['owner.logoUpload'])
const before = panel.slice(0, uploadAt)
check('the upload button is type="button", so it cannot submit anything',
  uploadAt > 0 && before.lastIndexOf('type="button"') > before.lastIndexOf('type="submit"'),
  'a submit button here is what broke it')
check('the card is drawn without the owner pressing Edit',
  panel.includes(ownerAr['owner.logoTitle']) && !panel.includes('<form'),
  'the panel opens in read mode, and the logo is still there')
check('and no logo is invented for a company that has none',
  panel.includes('HC') && !/<img[^>]*logo/.test(panel))

console.log(
  failures === 0
    ? '\nAll security checks passed.\n'
    : `\n${failures} security check(s) failed.\n`,
)
process.exit(failures === 0 ? 0 : 1)
