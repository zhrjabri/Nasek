/*
 * The 2026-09-13 release, checked: seats on confirmation, visitor analytics,
 * the administration's invoice ledger and company editor, the retired address,
 * required location fields, self-registration, and the approved palette.
 *
 * Everything here is either a pure rule, a rendered screen, or the text of a
 * migration this repository would apply. What it cannot do is exercise a
 * SECURITY DEFINER function — that needs a live database and three signed-in
 * roles, which is `verify:backend`'s job and a person's.
 *
 * The negatives are the point of most of it. A privacy promise is a list of
 * things that must NOT be in the request; a retired field is a list of places
 * it must NOT appear; "NASEK never stores a password" is a grep that must come
 * back empty. Those are the assertions that rot silently, so those are the ones
 * written down.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'
import { I18nProvider } from '@/i18n'
import { AppStoreProvider } from '@/store/AppStore'
import { AnalyticsTab } from '@/admin/tabs/AnalyticsTab'
import { EditOwnerDialog } from '@/admin/tabs/EditOwnerDialog'
import { OwnerSignUpPage, CompanyRegistrationPage } from '@/owner/RegisterPage'
import { OwnerLoginPage } from '@/owner/LoginPage'
import { visitRequest, visitorId } from '@/services/analytics/visits'
import type { Provider } from '@/types'
import { normalisePath, visitKind } from '@/services/analytics/visits'
import { passwordProblem, MIN_PASSWORD_LENGTH } from '@/services/auth/password'
import { en } from '@/i18n/en'
import { ar } from '@/i18n/ar'
import { adminEn } from '@/i18n/adminEn'
import { adminAr } from '@/i18n/adminAr'
import { ownerEn } from '@/i18n/ownerEn'
import { ownerAr } from '@/i18n/ownerAr'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const head = (s: string) => console.log(`\n--- ${s} ---\n`)

const root = path.resolve(import.meta.dirname ?? '.', '..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const readSql = (name: string) => read(`supabase/migrations/${name}`)

const MIGRATION = readSql('20260913000100_seats_on_confirm_analytics_and_admin_edit.sql')

// ==================================================== 1. seats on confirmation

head('a request holds no seat; a confirmation takes one')

/*
 * The inventory rule, read out of the migration rather than described.
 *
 * `book_campaign` must not touch `seats_available`, and `set_booking_status`
 * must. Getting this backwards is not a cosmetic error: it is either a trip
 * that sells seats it has already given away, or one whose seats are held
 * indefinitely by requests nobody paid for.
 */
const bookFn = MIGRATION.slice(
  MIGRATION.indexOf('create or replace function public.book_campaign'),
  MIGRATION.indexOf('create or replace function public.set_booking_status'),
)
const confirmFn = MIGRATION.slice(
  MIGRATION.indexOf('create or replace function public.set_booking_status'),
  MIGRATION.indexOf('create or replace function public.cancel_booking'),
)
const cancelFn = MIGRATION.slice(
  MIGRATION.indexOf('create or replace function public.cancel_booking'),
  MIGRATION.indexOf('create table if not exists public.site_visits'),
)

check(
  'book_campaign does not decrement seats_available',
  !/seats_available\s*=\s*seats_available\s*-/.test(bookFn),
)
check(
  'book_campaign still counts the request',
  /bookings_count\s*=\s*bookings_count\s*\+\s*1/.test(bookFn),
)
check(
  'set_booking_status decrements seats_available',
  /seats_available\s*=\s*seats_available\s*-\s*target\.travellers_count/.test(confirmFn),
)
check(
  'and locks the campaign row before it does',
  /for update/.test(confirmFn),
  'without the lock two confirmations can share the last seat',
)
check(
  'and re-checks the seats at confirmation time, not at request time',
  /trip\.seats_available\s*<\s*target\.travellers_count/.test(confirmFn),
)
check(
  'a booking already confirmed is returned unchanged rather than deducted twice',
  /confirmed_at/.test(confirmFn) && /return\s+target/.test(confirmFn),
)
check(
  'cancel_booking returns seats only from confirmed or completed',
  /'confirmed'\s*,\s*'completed'|'completed'\s*,\s*'confirmed'/.test(cancelFn),
  'cancelling a pending request must give back nothing, because it held nothing',
)
check(
  'confirmed_at is recorded, so an administrator can see when the seats moved',
  /alter table public\.bookings[\s\S]{0,200}confirmed_at/.test(MIGRATION),
)

/*
 * The one-shot reconciliation, and its guard.
 *
 * It released the seats that pending bookings were holding under the old rule.
 * Running it twice would release them again — against bookings that have since
 * been confirmed — so the marker row is what makes the migration replayable.
 */
check(
  'the reconciliation is guarded by an admin_audit marker',
  /seats_released_for_pending/.test(MIGRATION) &&
    /from\s+public\.admin_audit[\s\S]{0,200}seats_released_for_pending/.test(MIGRATION),
)
check(
  'and it only ever touched pending bookings',
  /where\s+b\.status\s*=\s*'pending'/.test(MIGRATION),
)

head('and both parties are told')

check(
  'the customer is told their seat is not held yet, in English',
  /not reserved yet/i.test(en['booking.seatNotHeld']),
  en['booking.seatNotHeld'],
)
check('and in Arabic', /محجوز/.test(ar['booking.seatNotHeld']), ar['booking.seatNotHeld'])
check(
  'the reason is given, not just the fact',
  /on sale|confirm/i.test(en['booking.seatNotHeldBody']),
)
check(
  'the customer dashboard repeats it where they come back to look',
  'dash.seatNotHeld' in en && 'dash.seatNotHeld' in ar,
)
check(
  'the owner is told a request holds nothing',
  /holds no seat/i.test(ownerEn['prov.seatsOnConfirm']),
  ownerEn['prov.seatsOnConfirm'],
)
check(
  'and warned when the requests in front of them exceed the seats left',
  /\{pending\}/.test(ownerEn['prov.pendingExceedSeats']) &&
    /\{available\}/.test(ownerEn['prov.pendingExceedSeats']),
)
check(
  'the Arabic warning carries the same two figures',
  /\{pending\}/.test(ownerAr['prov.pendingExceedSeats']) &&
    /\{available\}/.test(ownerAr['prov.pendingExceedSeats']),
)

// ========================================================= 2. visitor analytics

head('what a recorded visit contains, and what it must never contain')

check("'/' stays '/'", normalisePath('/') === '/')
check(
  'a campaign id is collapsed out of the path',
  normalisePath('/campaigns/9f3c1d20-0000-4000-8000-000000000000') === '/campaigns/:id',
)
check(
  'a booking id too',
  normalisePath('/booking/9f3c1d20-0000-4000-8000-000000000000') === '/booking/:id',
)
/*
 * The query string is where a search term lives, and a search term is something
 * a person typed. Dropping it is a privacy rule, not tidiness.
 */
check(
  'the query string is dropped, not trimmed',
  normalisePath('/campaigns?q=makkah&price=500') === '/campaigns',
  'filters and search terms live there',
)
check('a trailing slash does not make a second page', normalisePath('/about/') === '/about')
check('the path is capped', normalisePath(`/${'a'.repeat(400)}`).length <= 200)

check('a campaign page is bucketed as a campaign', visitKind('/campaigns/abc') === 'campaign')
check('smart match has its own bucket', visitKind('/smart-match') === 'smart_match')
check('everything else is a page', visitKind('/about') === 'page')

/*
 * The source of the module, read as text.
 *
 * These are absence checks and there is no other way to make them: the point is
 * that no line anywhere in this file reaches for an account. A runtime
 * assertion could only prove the paths it happened to exercise.
 */
/*
 * Comments stripped first, and that is not a loophole.
 *
 * The header of that module lists what it does *not* collect, by name — "no
 * account, no name, no email, no phone" — which is exactly the sentence this
 * check is here to keep true, and exactly the sentence a naive grep trips over.
 * The assertion is about the code.
 */
const VISITS = read('src/services/analytics/visits.ts')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
for (const forbidden of [
  'getSession',
  'getUser',
  'auth.uid',
  'user_id',
  'userId',
  'email',
  'document.referrer',
  'navigator.userAgent',
  'window.location.search',
]) {
  check(`the visit recorder never reads ${forbidden}`, !VISITS.includes(forbidden))
}
check(
  'the visitor id travels in a header, not in the body',
  VISITS.includes("'x-nasek-visitor'") && !/p_visitor/.test(VISITS),
)
check(
  'no visitor id means no row, rather than an invented one',
  /if \(!visitor\) return/.test(VISITS),
  'a fabricated id would produce a fabricated visitor count',
)
check(
  'every failure is swallowed, so analytics cannot break a booking',
  /catch\s*\(\)?\s*\{?/.test(VISITS) && /\.catch\(\(\) => \{\}\)/.test(VISITS),
)

head('the table is unreadable, and the screen says so rather than showing zeros')

check(
  'site_visits has no SELECT policy at all',
  !/create policy[^;]*on public\.site_visits\s+for select/i.test(MIGRATION),
  'the aggregate function is the only door',
)
check(
  'anon and authenticated are granted INSERT and nothing else',
  /grant insert on public\.site_visits to anon, authenticated/.test(MIGRATION) &&
    /revoke all on public\.site_visits from anon, authenticated/.test(MIGRATION),
)
check(
  'site_analytics refuses a caller who is not an administrator',
  /if not public\.is_admin\(\) then[\s\S]{0,160}raise exception/.test(MIGRATION),
)
check(
  'and returns no visitor_id in any of its fields',
  !/'[a-z_]*visitor_id[a-z_]*'\s*,/.test(
    MIGRATION.slice(MIGRATION.indexOf('function public.site_analytics')),
  ),
)

/*
 * A failed read must not render as a dashboard of noughts. This is the whole
 * reason the tab has three states rather than two.
 */
const adminShell = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <I18nProvider extra={{ en: adminEn, ar: adminAr }}>
      <AppStoreProvider>{node}</AppStoreProvider>
    </I18nProvider>,
  )

const analyticsUnavailable = adminShell(<AnalyticsTab />)
check(
  'and it renders its own strings rather than raw key names',
  !analyticsUnavailable.includes('admin.analytics'),
  'a dictionary the entry point forgot to supply looks exactly like this',
)
check(
  'with no backend the analytics screen shows no figure at all',
  !/>\s*0\s*</.test(analyticsUnavailable),
  'a nought here is a number somebody would act on',
)
check(
  'the privacy note is on the screen, in Arabic',
  /عشوائي/.test(adminAr['admin.analyticsPrivacy']),
)
check(
  'and the English one names what is not collected',
  /never joined to an account/i.test(adminEn['admin.analyticsPrivacy']),
)

// ================================================ 3. the administration ledger

head('the invoice ledger, and the company editor')

const BOOKINGS_TAB = read('src/admin/tabs/BookingsTab.tsx')
check('bookings can be searched by company name', /owner \? owner\.name\.ar/.test(BOOKINGS_TAB))
check('and by trip title', /campaign \? campaign\.title\.ar/.test(BOOKINGS_TAB))
check('and by trip reference', /tripReference\(campaign\.id\)/.test(BOOKINGS_TAB))
check('a date window filters on the request date', /b\.bookingDate < from/.test(BOOKINGS_TAB))
check(
  'the dates are compared as ISO strings, not parsed',
  !/new Date\(from\)|new Date\(to\)/.test(BOOKINGS_TAB),
  'parsing them is how a boundary-day booking vanishes from its own range',
)
check('the ledger shows when payment was recorded', /confirmedAt/.test(BOOKINGS_TAB))
check(
  'the invoice is built by the shared builder, not rebuilt here',
  /buildInvoice\(invoice, campaign, owner, lang\)/.test(BOOKINGS_TAB),
  'two invoices for one booking is the failure this avoids',
)
check(
  "the ledger does not fetch the company's private number",
  !/bookingProviderContact/.test(BOOKINGS_TAB),
  'that RPC answers only to the customer on the booking',
)

const EDIT_DIALOG = read('src/admin/tabs/EditOwnerDialog.tsx')
check(
  'the company editor cannot change the verification badge',
  !/verification/.test(EDIT_DIALOG.replace(/\/\*[\s\S]*?\*\//g, '')),
  'approve, refuse and suspend attach a reason and notify the owner',
)
check(
  'it sends only the fields that changed',
  /const base = draftFrom\(provider\)/.test(EDIT_DIALOG) &&
    /if \(draft\.name !== base\.name\)/.test(EDIT_DIALOG),
)
check(
  'and refuses a save with nothing in it',
  /Object\.keys\(edit\)\.length === 0/.test(EDIT_DIALOG),
)
check(
  'admin_update_provider writes the diff to admin_audit',
  /insert into public\.admin_audit/.test(
    MIGRATION.slice(MIGRATION.indexOf('function public.admin_update_provider')),
  ),
)

// ================================================== 4. the retired address

head('the address has left the workflow, and the data has not been deleted')

check(
  'the migration does NOT drop the column',
  !/alter table public\.providers[\s\S]{0,80}drop column[\s\S]{0,20}address/.test(MIGRATION),
  'two companies typed one; deleting real data to tidy a form is a loss',
)
check(
  'and says so, in a comment on the column itself',
  /comment on column public\.providers\.address is/.test(MIGRATION),
)

for (const [file, source] of [
  ['the Provider type', read('src/types.ts')],
  ['the row mapper', read('src/services/data/mappers.ts')],
  ["the owner's profile form", read('src/owner/panels/CompanyProfilePanel.tsx')],
  ['the resubmission form', read('src/owner/StatusPages.tsx')],
  ["the administration's new-company dialog", read('src/admin/tabs/NewOwnerDialog.tsx')],
  ['the company editor', EDIT_DIALOG],
  ['the registration form', read('src/owner/RegisterPage.tsx')],
] as [string, string][]) {
  // Comments are allowed to explain the removal; code is not allowed to do it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check(`${file} collects no address`, !/\baddress\b/i.test(code))
}

for (const key of ['owner.address', 'owner.addressHint']) {
  check(`the owner dictionaries have no ${key}`, !(key in ownerEn) && !(key in ownerAr), key)
}
check(
  'and the administration has no address label either',
  !('admin.ownerAddress' in adminEn) && !('admin.ownerAddress' in adminAr),
)

// ======================================= 5. governorate and wilayah are required

head('the two location fields are required everywhere a company is written')

check(
  'the database makes governorate NOT NULL',
  /alter column governorate set not null/.test(MIGRATION),
)
check('and wilayah_id too', /alter column wilayah_id\s+set not null/.test(MIGRATION))
check(
  'and neither may be blank',
  /check \(btrim\(governorate\) <> ''\)/.test(MIGRATION),
  'not null alone does not say non-empty',
)

for (const [label, source, fields] of [
  [
    "the owner's profile form",
    read('src/owner/panels/CompanyProfilePanel.tsx'),
    ['draft.governorate', 'draft.wilayahId'],
  ],
  [
    "the administration's new-company dialog",
    read('src/admin/tabs/NewOwnerDialog.tsx'),
    ['form.governorate', 'form.wilayahId'],
  ],
  ['the company editor', EDIT_DIALOG, ['draft.governorate', 'draft.wilayahId']],
  [
    'the registration form',
    read('src/owner/RegisterPage.tsx'),
    ['form.governorate', 'form.wilayahId'],
  ],
] as [string, string, string[]][]) {
  for (const field of fields) {
    check(
      `${label} refuses a blank ${field.split('.')[1]}`,
      new RegExp(`if \\(!${field.replace('.', '\\.')}\\.trim\\(\\)\\)`).test(source),
    )
  }
}
check(
  'the resubmission form requires its wilayah',
  /if \(!form\.wilayahId\.trim\(\)\)/.test(read('src/owner/StatusPages.tsx')),
)

// ============================================ 6. registering, and the password

head('a company registers itself, and NASEK never holds the password')

/*
 * The rule stated as a grep, over every file that could break it.
 *
 * "We never store passwords" is only true if nothing writes one and nothing
 * reads one back to compare. A password column on `providers` would satisfy
 * every other test in this repository.
 */
const AUTH_SOURCES = [
  'src/owner/RegisterPage.tsx',
  'src/services/auth/signUpOwner.ts',
  'src/services/auth/password.ts',
  'src/services/auth/registerProvider.ts',
  'src/services/data/ownerProfile.ts',
  'src/services/data/adminProvider.ts',
]
for (const rel of AUTH_SOURCES) {
  const source = read(rel)
  check(
    `${rel} writes no password into a NASEK table`,
    !/p_password|password_hash|\bpassword:\s*(form|draft|input)\./.test(source),
  )
}
for (const rel of ['src/services/data/mappers.ts', 'src/services/supabase/schema.ts']) {
  check(`${rel} has no password column`, !/password/i.test(read(rel)))
}

const SIGNUP = read('src/services/auth/signUpOwner.ts')
check(
  'sign-up hands the password to Supabase and nothing else',
  /supabase\.auth\.signUp\(/.test(SIGNUP),
)
check(
  'the confirmation link comes back to this portal, not to the public site',
  /emailRedirectTo: authRedirectTarget\(\)/.test(SIGNUP),
)

const PASSWORDS = read('src/services/auth/password.ts')
check(
  'there is no query anywhere that reads a credential off providers',
  !/from\('providers'\)[\s\S]{0,200}password/i.test(PASSWORDS),
)

head('a campaign owner signs in with an email address and a password, and nothing else')

/*
 * Phone authentication, gone and staying gone.
 *
 * It existed for one release. An owner could sign in with the number on their
 * company record and their password, which made an SMS provider — Twilio — a
 * paid third-party dependency standing between an owner and their dashboard.
 *
 * These are absence checks over every file that could bring it back, because
 * the failure mode is somebody adding a "sign in with your number" convenience
 * and nothing else noticing. The number itself is checked further down: it is
 * still collected, still required, and still what a WhatsApp invoice is
 * addressed to.
 */
const AUTH_SURFACE = [
  'src/services/auth/password.ts',
  'src/services/auth/signUpOwner.ts',
  'src/services/auth/session.ts',
  'src/components/auth/PasswordSignIn.tsx',
  'src/owner/LoginPage.tsx',
  'src/owner/RegisterPage.tsx',
  'src/owner/OwnerApp.tsx',
]
for (const rel of AUTH_SURFACE) {
  // Comments may explain the removal; code may not perform it.
  const code = read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  check(`${rel} has no phone sign-in call`, !/signInWithPassword\(\s*\{[^}]*phone/.test(code))
  check(`${rel} names no phone sign-in helper`, !/signInWithPhonePassword|attachPhone|confirmPhoneChange/.test(code))
  check(`${rel} performs no phone verification`, !/verifyOtp\([^)]*phone|'phone_change'|type:\s*'sms'/.test(code))
}
check(
  'the sign-in component takes no phone option',
  !/allowPhone/.test(read('src/components/auth/PasswordSignIn.tsx')),
)
check(
  'and its one identifier field is an email field',
  /type="email"/.test(read('src/components/auth/PasswordSignIn.tsx')),
)
for (const key of ['auth.emailOrPhone', 'auth.emailOrPhoneInvalid', 'auth.phoneSignInUnavailable']) {
  check(
    `no dictionary offers "${key}" any more`,
    !(key in (en as Record<string, unknown>)) && !(key in (ar as Record<string, unknown>)),
  )
}
check(
  'and the owner dictionary promises no pending phone sign-in',
  !('owner.registerPhonePending' in (ownerEn as Record<string, unknown>)) &&
    !('owner.registerPhonePending' in (ownerAr as Record<string, unknown>)),
)
check(
  'the sign-in footnote describes an email address and a password',
  /email address and password/i.test(ownerEn['owner.passwordOnly']) &&
    !/phone/i.test(ownerEn['owner.passwordOnly']),
  ownerEn['owner.passwordOnly'],
)
check(
  'no NASEK sign-in depends on an SMS provider',
  !/external\.phone\s*!==\s*true[\s\S]{0,80}SKIP/.test(read('scripts/verify-backend.mjs')) &&
    /no sign-in depends on an SMS provider/.test(read('scripts/verify-backend.mjs')),
  'verify:backend asserts external.phone is off rather than skipping past it',
)

head('and the number it is not a credential for is still collected and still private')

check(
  'registration requires a contact phone',
  /if \(!isValidPhone\(form\.phone\)\)/.test(read('src/owner/RegisterPage.tsx')),
)
check(
  'and labels it as contact information rather than a sign-in',
  /not used to sign in/i.test(ownerEn['owner.registerPhoneNote']),
  ownerEn['owner.registerPhoneNote'],
)
check(
  "the owner's profile still requires a valid number",
  /isValidPhone\(draft\.phone\)/.test(read('src/owner/panels/CompanyProfilePanel.tsx')),
)
check(
  'an administrator can still correct it',
  /p_phone: text\(edit\.phone\)/.test(read('src/services/data/adminProvider.ts')),
)
check(
  'the WhatsApp invoice is still addressed with a number fetched per booking',
  /booking_provider_contact/.test(read('src/services/data/catalogue.ts')),
)
check(
  'and that RPC still decides ownership inside its own query',
  /booking_provider_contact/.test(readSql('20260912000100_logo_write_guard_and_booking_contact.sql')),
)
check(
  'providers_public still withholds the number',
  /\| 'phone'/.test(read('src/services/supabase/schema.ts')),
  'the public view omits the column by construction, not by a select list',
)

check(
  `a password shorter than ${MIN_PASSWORD_LENGTH} is refused`,
  passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1)) === 'short',
)
check(
  'two that disagree are refused',
  passwordProblem('correct-horse', 'correct-hors') === 'mismatch',
)
check('and a matching pair is accepted', passwordProblem('correct-horse', 'correct-horse') === null)

const REGISTER = read('src/owner/RegisterPage.tsx')
check('the registration form confirms the password', /passwordProblem\(password, confirm\)/.test(REGISTER))
check(
  'the show-password eye shares the input\'s LTR direction, so it cannot sit on the text in Arabic',
  /<div className="relative" dir="ltr">\s*<Input[\s\S]{0,200}type=\{reveal \? 'text' : 'password'\}[\s\S]{0,200}className="pe-10"/.test(REGISTER),
)
check(
  'and so does the sign-in form\'s',
  /<div className="relative" dir="ltr">\s*<Input[\s\S]{0,300}type=\{reveal \? 'text' : 'password'\}[\s\S]{0,300}className="pe-10"/.test(
    read('src/components/auth/PasswordSignIn.tsx'),
  ),
)
check('and requires a permit', /if \(!licence\) next\.licence/.test(REGISTER))
check('and requires a phone number', /if \(!isValidPhone\(form\.phone\)\)/.test(REGISTER))
check(
  'registration offers the number to nobody as a credential',
  !/attachPhone|updateUser\(\{ phone/.test(REGISTER),
  'the number goes to the company record and stops there',
)

head('the approval gate, and who is let through it')

const OWNER_APP = read('src/owner/OwnerApp.tsx')
check(
  'a suspended or removed account never reaches the portal',
  /session\.blocked/.test(OWNER_APP),
)
check(
  'a company awaiting verification gets the waiting screen, not the dashboard',
  /<PendingPage \/>/.test(OWNER_APP) && /status === 'verified'/.test(OWNER_APP),
)
check('a refused company gets the refusal screen', /<RejectedPage \/>/.test(OWNER_APP))
check('a suspended company gets the suspension screen', /<SuspendedPage/.test(OWNER_APP))
check(
  'only a verified company reaches the dashboard',
  /status === 'verified' \?[\s\S]{0,900}<DashboardPage \/>/.test(OWNER_APP),
)
check(
  'and the sign-in screen refuses a suspended or removed account by name',
  /auth\.blockedSuspended/.test(read('src/owner/LoginPage.tsx')) &&
    /auth\.blockedRemoved/.test(read('src/owner/LoginPage.tsx')),
)

head('and the other two doors are untouched')

check(
  'the pilgrim signs in with a one-time code to an email address, and only that',
  /channels=\{\['email'\]\}/.test(read('src/pages/AuthPages.tsx')),
)
check(
  'the administration still asks for its access code',
  /accessCode|access-code/i.test(read('src/admin/LoginPage.tsx')),
)
check(
  'and asks for no password and no phone number of its own',
  !/PasswordSignIn|type="tel"/.test(read('src/admin/LoginPage.tsx')),
)
check(
  'the password form is used by the owner portal and by nothing else',
  /PasswordSignIn/.test(read('src/owner/LoginPage.tsx')) &&
    !/PasswordSignIn/.test(read('src/admin/LoginPage.tsx')) &&
    !/PasswordSignIn/.test(read('src/pages/AuthPages.tsx')),
)

head('and self-registration does not weaken the approval gate')

check(
  'a registered company is still pending until an administrator verifies it',
  /'pending'/.test(readSql('20260904000200_owner_registration.sql')),
)
check(
  'and cannot publish a trip before then',
  /provider_can_publish/.test(readSql('20260911000100_direct_publish_and_provider_logo.sql')),
)
check(
  'an administrator arriving at the owner portal is still shown the door',
  /role === 'admin'/.test(read('src/owner/OwnerApp.tsx')),
)

// ============================ 7. the palette, and the wall around it

head('the customer palette is the approved one')

/*
 * Two files now, and the split is the whole point.
 *
 * `src/index.css` is the design system all three applications import.
 * `src/customer.css` imports it and then repaints it, and is imported by the
 * public site's entry alone. The palette living in the second file is what
 * keeps it out of the other two bundles — see the header of that file.
 */
const SHARED_CSS = read('src/index.css')
const CUSTOMER_CSS = read('src/customer.css')

for (const [token, value] of [
  ['--color-nasek-100', '#e8f2ec'],
  ['--color-nasek-200', '#d6e3da'],
  ['--color-nasek-700', '#0f5132'],
  ['--color-nasek-800', '#0a3d26'],
  ['--color-nasek-900', '#08301e'],
  ['--color-ivory-50', '#fbfaf7'],
  ['--color-ivory-300', '#d6e3da'],
  ['--color-ink-900', '#14201a'],
]) {
  check(`${token} is ${value} for the customer`, CUSTOMER_CSS.includes(`${token}: ${value};`))
}
check(
  'gold is left exactly as it was, in the shared file',
  SHARED_CSS.includes('--color-gold-400: #c9a961;') &&
    !CUSTOMER_CSS.includes('--color-gold-400'),
  'the accent the palette asks for is the value the system already had',
)
check(
  'the girih ornament follows the customer primary',
  CUSTOMER_CSS.includes('%230F5132'),
)
check(
  'every customer rule is scoped to the customer',
  CUSTOMER_CSS.split('\n')
    .filter((line) => line.trim().endsWith('{') && !line.trim().startsWith('*'))
    .every((line) => line.includes("html[data-app='customer']")),
  'an unscoped rule in this file would repaint whatever imported it',
)

head('and it cannot reach the owner portal or the administration')

/*
 * The shared file, compared with what it was before this palette existed.
 *
 * This is the strongest form the check can take: not "the owner colours look
 * unchanged" but "the file the owner portal compiles is the same file it was".
 * Anything that recoloured the portal would have to change it.
 */
check(
  'the shared stylesheet holds no customer green',
  !/0f5132|08301e|0a3d26|e8f2ec|fbfaf7|14201a/i.test(SHARED_CSS),
)
check(
  'and still holds the values the portal and the dashboard had',
  SHARED_CSS.includes('--color-nasek-700: #244a3f;') &&
    SHARED_CSS.includes('--color-ivory-50: #ffffff;') &&
    SHARED_CSS.includes('--color-ink-900: #121615;'),
)
check(
  'the customer stylesheet is imported by the customer entry',
  /import '\.\/customer\.css'/.test(read('src/main.tsx')),
)
for (const rel of ['src/owner/main.tsx', 'src/admin/main.tsx']) {
  check(`${rel} imports the shared system, not the customer palette`, {
    ok: /import '@\/index\.css'/.test(read(rel)) && !/customer\.css/.test(read(rel)),
  }.ok)
}
check(
  'only the customer entry claims the palette in its HTML',
  /<html[^>]*data-app="customer"/.test(read('index.html')) &&
    !/data-app/.test(read('owner.html')) &&
    !/data-app/.test(read('admin.html')),
)

/*
 * And the built output, which is the only thing a visitor ever sees.
 *
 * Skipped rather than failed when `dist/` is absent, because `npm run verify`
 * runs before `npm run build` in a fresh checkout and a red test that means
 * "you have not built yet" trains people to ignore it. The production smoke
 * test makes the same assertions against the deployed CSS, where they cannot
 * be skipped.
 */
const BUILT: [string, string][] = [
  ['customer', 'dist/assets'],
  ['owner', 'dist-owner/assets'],
  ['admin', 'dist-admin/assets'],
]
const stylesheet = (dir: string): string | null => {
  const full = path.join(root, dir)
  if (!fs.existsSync(full)) return null
  const name = fs.readdirSync(full).find((f) => f.endsWith('.css'))
  return name ? fs.readFileSync(path.join(full, name), 'utf8') : null
}

const built = Object.fromEntries(BUILT.map(([name, dir]) => [name, stylesheet(dir)]))
if (!built.customer || !built.owner || !built.admin) {
  console.log('SKIP  the built stylesheets are not present — run `npm run build` first')
} else {
  check(
    'the built customer stylesheet carries the palette',
    built.customer.includes('--color-nasek-700:#0f5132'),
  )
  for (const app of ['owner', 'admin'] as const) {
    check(
      `the built ${app} stylesheet contains not one byte of it`,
      !/0f5132|08301e|0a3d26|e8f2ec|fbfaf7|14201a|data-app=customer/i.test(built[app] as string),
      'not merely inert — absent',
    )
    check(
      `and still resolves nasek-700 to #244a3f`,
      (built[app] as string).includes('--color-nasek-700:#244a3f'),
    )
  }
}

// ============================================ 9. the screens, actually rendered

/*
 * Rendered, not read.
 *
 * The last time a feature in this repository was signed off on a source-level
 * check it was the logo upload, and it was broken in production the whole time:
 * the markup said the control existed, and the control was inside a branch that
 * never ran. So the two new forms are mounted, and the assertions are made
 * against the HTML a person would actually be looking at.
 */

head('the registration and editing screens, as they render')

/** The owner portal's own provider, dictionary and all. See `owner/main.tsx`. */
const shell = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <I18nProvider extra={{ en: ownerEn, ar: ownerAr }}>
      <AppStoreProvider>{node}</AppStoreProvider>
    </I18nProvider>,
  )

/*
 * The sign-in form itself, rendered.
 *
 * "Phone login is removed" is a claim about a screen, and the screen is the
 * place to check it. Every source-level check above would still pass if the
 * markup carried a second field nobody had wired up.
 */
const loginHtml = shell(<OwnerLoginPage onSignedIn={() => {}} />)
check('the owner sign-in page renders', loginHtml.length > 500, `${loginHtml.length} chars`)
check('it has exactly one email field', (loginHtml.match(/type="email"/g) ?? []).length === 1)
check('and exactly one password field', (loginHtml.match(/type="password"/g) ?? []).length === 1)
check(
  'and no telephone field at all',
  !/type="tel"/.test(loginHtml),
  'a provider signs in with an address; the number is contact information',
)
check(
  'the identifier is labelled as an email address, not "email or phone"',
  loginHtml.includes(en['common.email']) && !/or phone/i.test(loginHtml),
)
check(
  'there is a way to register a company from it',
  loginHtml.includes(ownerEn['owner.registerLink']),
)

const signUpHtml = shell(<OwnerSignUpPage onBackToSignIn={() => {}} />)
check('the sign-in step renders', signUpHtml.length > 500, `${signUpHtml.length} chars`)
check('it asks for an email address', /type="email"/.test(signUpHtml))
check(
  'it asks for a password and a confirmation — two password fields, not one',
  (signUpHtml.match(/type="password"/g) ?? []).length === 2,
  `${(signUpHtml.match(/type="password"/g) ?? []).length} found`,
)
check('and says it is step 1 of 2', signUpHtml.includes(ownerEn['owner.registerStep1']))
check(
  'it asks for nothing about the company, which could not be saved yet',
  !signUpHtml.includes(ownerEn['auth.companyName'] ?? 'Company name'),
)

const companyHtml = shell(<CompanyRegistrationPage onDone={() => {}} />)
check('the company step renders', companyHtml.length > 1000, `${companyHtml.length} chars`)
check('and says it is step 2 of 2', companyHtml.includes(ownerEn['owner.registerStep2']))
for (const label of ['owner.governorate', 'common.wilayah', 'common.phone', 'owner.permitNumber']) {
  check(
    `it asks for ${label}`,
    companyHtml.includes((ownerEn as Record<string, string>)[label] ?? en[label as 'common.phone']),
    label,
  )
}
/*
 * The asterisk `Field` draws, counted rather than looked for once.
 *
 * Six fields on this form are required — company name, governorate, wilayah,
 * phone, permit number and the permit itself — and the two that matter for this
 * release are the location pair. Counting is the check that would notice one of
 * them quietly losing its marker.
 */
check(
  'the required marker is drawn at least six times on the company form',
  (companyHtml.match(/aria-hidden="true">\*/g) ?? []).length >= 6,
  `${(companyHtml.match(/aria-hidden="true">\*/g) ?? []).length} found`,
)
check(
  'and the governorate label is one of them',
  new RegExp(`${ownerEn['owner.governorate']}[^<]*<span[^>]*>\*`).test(companyHtml),
)
check(
  'it does not ask for an address',
  !/address/i.test(companyHtml.replace(/type="email"/g, '')),
)
check(
  'the permit picker is on the form',
  /type="file"/.test(companyHtml),
  'a registration with no permit is an application an administrator cannot verify',
)
check(
  'and the submit button is a submit button',
  /<button[^>]*type="submit"/.test(companyHtml),
  'the logo upload broke because a control defaulted to submit; the inverse breaks a form',
)

/*
 * The company editor, opened on a real company.
 *
 * `open` is driven by the `provider` prop, so passing one is what proves the
 * dialog's contents exist at all rather than sitting behind a closed branch.
 */
const SAMPLE: Provider = {
  id: 'p-sample',
  name: { ar: 'حملة الاختبار', en: 'Sample Campaign Co' },
  tagline: { ar: '', en: 'A tagline' },
  description: { ar: '', en: 'A description' },
  wilayahId: 'muscat',
  governorate: 'Muscat Governorate',
  verification: 'verified',
  experienceYears: 7,
  rating: 4.5,
  reviewCount: 10,
  phone: '+968 9123 4567',
  email: 'sample@example.om',
  initials: 'S',
  brandColor: '#0f5132',
  plan: 'basic',
  joinedAt: '2025-01-01',
}

const editHtml = adminShell(<EditOwnerDialog provider={SAMPLE} onClose={() => {}} />)
check('the company editor renders when handed a company', editHtml.length > 800, `${editHtml.length} chars`)
check('it is prefilled with that company', editHtml.includes('Sample Campaign Co'))
check('and with its phone number', editHtml.includes('+968 9123 4567'))
/*
 * No control over the badge.
 *
 * Checked against the labels of the four controls that *do* decide it, which
 * live in the row behind this dialog — rather than against the word "verified",
 * which appears in this dialog's own explanatory note saying it does not change
 * the badge.
 */
for (const key of ['admin.approve', 'admin.reject', 'admin.suspend', 'admin.unverify'] as const) {
  /*
   * A *control*, not the word.
   *
   * The dialog's own note says "Approve, refuse and suspend are the buttons in
   * the list", which is the sentence this check exists to make true — and which
   * a search for the bare word would flag. So the search is scoped to buttons.
   */
  check(
    `the company editor offers no "${adminEn[key]}" button`,
    !new RegExp(`<button(?:(?!</button>)[\s\S])*${adminEn[key]}`).test(editHtml),
    'that decision carries a reason and a notification; a form field would carry neither',
  )
}
check('it asks for no address', !/>\s*Address\s*</.test(editHtml))
check(
  'a closed dialog renders nothing of the company',
  !adminShell(<EditOwnerDialog provider={null} onClose={() => {}} />).includes('Sample Campaign Co'),
)

// ======================================== 10. the request a recorded visit makes

head('the request a visit actually sends')

/*
 * Built, then read — never sent.
 *
 * `visitRequest` is the whole of what goes on the wire, returned as a value, so
 * the promise this module makes can be checked field by field. Posting a real
 * one would have proved the same thing and added a row to the production
 * analytics table, inflating a live visitor count by one to satisfy a test.
 *
 * The two arguments standing in for the project's URL and anon key are
 * deliberate as well: this harness builds with no Supabase configured, and
 * asserting through `recordVisit` would only ever have exercised its
 * "no backend, do nothing" branch — which is how a request-shape check quietly
 * stops checking anything.
 */
const VISITOR = '11111111-2222-4333-8444-555555555555'
const campaignVisit = visitRequest(
  'https://project.supabase.co',
  'anon-key',
  VISITOR,
  '/campaigns/9f3c1d20-0000-4000-8000-000000000000?ref=newsletter&utm_source=x',
  '9f3c1d20-0000-4000-8000-000000000000',
)
const pageVisit = visitRequest('https://project.supabase.co', 'anon-key', VISITOR, '/about')
const campaignBody = JSON.parse(campaignVisit.body)

check(
  'the visit is posted to record_visit',
  campaignVisit.url === 'https://project.supabase.co/rest/v1/rpc/record_visit',
  campaignVisit.url,
)
check(
  'the visitor id travels as a header',
  campaignVisit.headers['x-nasek-visitor'] === VISITOR,
)
check('and never in the body', !campaignVisit.body.includes(VISITOR))
check('the campaign id is collapsed out of the path', campaignBody.p_path === '/campaigns/:id')
check(
  'and the tracking parameters go with the query string',
  !campaignVisit.body.includes('newsletter') && !campaignVisit.body.includes('utm_source'),
  'a query string is where a search term lives, and a search term is typed by a person',
)
check(
  'the campaign is identified by its own id, which is not a person',
  campaignBody.p_campaign_id === '9f3c1d20-0000-4000-8000-000000000000',
)
check('a plain page carries no campaign', JSON.parse(pageVisit.body).p_campaign_id === null)
check(
  'the body carries three fields and no more',
  Object.keys(campaignBody).sort().join(',') === 'p_campaign_id,p_kind,p_path',
  Object.keys(campaignBody).join(','),
)
check(
  'the only bearer token is the public key',
  campaignVisit.headers.authorization === 'Bearer anon-key',
  "a signed-in pilgrim's own token would let the server tie a visit to them",
)
check(
  'and no header carries anything else about the person',
  Object.keys(campaignVisit.headers).sort().join(',') ===
    'apikey,authorization,content-type,prefer,x-nasek-visitor',
  Object.keys(campaignVisit.headers).join(','),
)
check(
  'a campaign id offered for a page that is not a campaign is discarded',
  JSON.parse(
    visitRequest('https://p', 'k', VISITOR, '/about', 'deadbeef-0000-4000-8000-000000000000').body,
  ).p_campaign_id === null,
)

check(
  'the visitor id is stable across calls, so one person is counted once',
  visitorId() !== null && visitorId() === visitorId(),
)
check(
  'and it is a UUID rather than anything derived from the person',
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    visitorId() ?? '',
  ),
  visitorId() ?? 'null',
)

// =========================================== 8. and NASEK still charges nothing

head('no fee has crept back in')

for (const [label, dict] of [
  ['customer (en)', en],
  ['customer (ar)', ar],
  ['owner (en)', ownerEn],
  ['owner (ar)', ownerAr],
  ['admin (en)', adminEn],
  ['admin (ar)', adminAr],
] as [string, Record<string, string>][]) {
  const hits = Object.entries(dict)
    .filter(([, value]) =>
      typeof value === 'string' &&
      /mediation fee|\bcommission\b|service fee|platform fee|NASEK fee|رسوم وساطة|عمولة/i.test(
        value,
      ),
    )
    .map(([key]) => key)
  check(`${label} still contains no fee wording`, hits.length === 0, hits.join(' | '))
}

console.log(
  failures === 0
    ? '\nAll portal, analytics and palette checks passed.\n'
    : `\n${failures} check(s) failed.\n`,
)
process.exit(failures === 0 ? 0 : 1)
