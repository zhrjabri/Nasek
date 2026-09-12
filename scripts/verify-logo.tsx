/*
 * The company logo, and the approval model it must not disturb.
 *
 * Two subjects in one file because they are one change, and because the most
 * important thing to assert about the logo is a *negative* about approval:
 * editing a picture must not send a company back for review, and must not move
 * a single trip.
 *
 * THREE KINDS OF CHECK
 *
 *   1. Pure logic — what the upload accepts and refuses, and where it puts a
 *      file. These run without a browser or a network because they are the
 *      rules, and a rule asserted through a rendered page is a rule asserted by
 *      accident.
 *   2. The migration's own text. `guard_campaign_moderation`,
 *      `provider_can_publish` and `set_provider_logo` are SECURITY DEFINER and
 *      cannot be exercised without a live database and three signed-in roles —
 *      that belongs to `verify:backend` and to a human with the credentials.
 *      What can be checked here is that the SQL this repository would apply
 *      still says what the model depends on it saying. `verify:isolation` and
 *      `verify:booking` read policy SQL the same way and for the same reason.
 *   3. The screens, rendered, for the parts that are about what a person sees:
 *      the logo on a card, the monogram when there is none, and the same mark
 *      on every trip a company runs.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { I18nProvider } from '@/i18n'
import { AppStoreProvider } from '@/store/AppStore'
import { ProviderMark, ProviderMonogram } from '@/components/brand/ProviderMark'
import { CampaignCard } from '@/components/campaign/CampaignCard'
import {
  PROVIDER_LOGO_BUCKET,
  PROVIDER_LOGO_MAX_BYTES,
  PROVIDER_LOGO_MIME,
  checkProviderLogo,
  providerLogoUrl,
} from '@/services/storage/providerLogo'
import { CAMPAIGN_IMAGE_BUCKET } from '@/services/storage/campaignImages'
import { adminEn } from '@/i18n/adminEn'
import { adminAr } from '@/i18n/adminAr'
import { ownerEn } from '@/i18n/ownerEn'
import { ownerAr } from '@/i18n/ownerAr'
import type { Campaign, Provider } from '@/types'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const head = (s: string) => console.log(`\n--- ${s} ---\n`)

const root = path.resolve(import.meta.dirname ?? '.', '..')
const readSql = (name: string) =>
  fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')

const MIGRATION = readSql('20260911000100_direct_publish_and_provider_logo.sql')
const RLS = readSql('20260901000200_rls_policies.sql')
const IMAGES = readSql('20260904000400_campaign_images.sql')
const PROFILE = readSql('20260906000100_profile_editing.sql')

// ============================================ 1. the file rules, on their own

head('what the logo upload accepts')

for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
  check(`${type} is accepted`, checkProviderLogo({ type, size: 100_000 }) === null)
}
for (const type of ['image/svg+xml', 'image/gif', 'application/pdf', 'text/html', '']) {
  check(`${type || '(no type)'} is refused`, checkProviderLogo({ type, size: 100_000 }) === 'type')
}
/*
 * SVG is the one worth naming. It is an image format and also a document that
 * can carry script and external references, served from an origin that also
 * serves the applications. NASEK has no sanitiser written for that case.
 */
check('SVG is refused specifically, not merely absent from a list',
  checkProviderLogo({ type: 'image/svg+xml', size: 1000 }) === 'type')

check('two megabytes is the ceiling', PROVIDER_LOGO_MAX_BYTES === 2 * 1024 * 1024)
check('a file at the ceiling is accepted',
  checkProviderLogo({ type: 'image/png', size: PROVIDER_LOGO_MAX_BYTES }) === null)
check('a file over it is refused',
  checkProviderLogo({ type: 'image/png', size: PROVIDER_LOGO_MAX_BYTES + 1 }) === 'size')
check('and the type is checked before the size, so a huge PDF reads as a type error',
  checkProviderLogo({ type: 'application/pdf', size: 99_000_000 }) === 'type')

check('the allow-list is exactly the three raster formats',
  PROVIDER_LOGO_MIME.join() === 'image/png,image/jpeg,image/webp', PROVIDER_LOGO_MIME.join())

// -------------------------------------------------------------- the bucket

head('where the logo is kept')

/*
 * No new storage infrastructure. `campaign-images` is already public to read,
 * already limited to the three formats above, and already policed so a file may
 * only be written into a folder named for the uploader's own account. A second
 * bucket would be this one with a different name.
 */
check('the logo reuses the campaign-images bucket rather than adding one',
  PROVIDER_LOGO_BUCKET === CAMPAIGN_IMAGE_BUCKET, PROVIDER_LOGO_BUCKET)
check('the migration creates no bucket',
  !/insert into storage\.buckets/i.test(MIGRATION))
check('and adds no storage policy',
  !/on storage\.objects/i.test(MIGRATION))

check('that bucket allows exactly PNG, JPEG and WebP',
  /allowed_mime_types[\s\S]{0,200}image\/jpeg[\s\S]{0,60}image\/png[\s\S]{0,60}image\/webp/.test(IMAGES))
check('and no SVG', !/image\/svg/i.test(IMAGES))
check('an upload may only land in the uploader’s own folder',
  /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/.test(IMAGES))
check('and only they or an administrator may replace it',
  /for update to authenticated[\s\S]{0,400}auth\.uid\(\)::text or public\.is_admin\(\)/.test(IMAGES))
check('or delete it',
  /for delete to authenticated[\s\S]{0,300}auth\.uid\(\)::text or public\.is_admin\(\)/.test(IMAGES))

/*
 * The path-to-URL step, and what this harness can and cannot say about it.
 *
 * `.env.harness` blanks the Supabase URL on purpose — every other suite asserts
 * the offline fallback — so `providerLogoUrl` has no origin to build against
 * and correctly returns nothing. That is itself worth pinning: a build with no
 * backend must produce no half-formed URL, and the mark falls back to the
 * monogram rather than to a broken image.
 *
 * An absolute URL is passed through untouched, which is the seam the render
 * checks below use to exercise the image path without a configured project.
 */
check('with no backend configured, a storage path yields no URL rather than a broken one',
  providerLogoUrl('abc/logo-1.png') === '', providerLogoUrl('abc/logo-1.png'))
check('and an absolute URL is passed through untouched',
  providerLogoUrl('https://cdn.example/logo.png') === 'https://cdn.example/logo.png')

// ================================== 2. the logo cannot be pointed elsewhere

head('a company’s logo is a file that company uploaded')

const setLogo = MIGRATION.slice(
  MIGRATION.indexOf('create or replace function public.set_provider_logo'),
  MIGRATION.indexOf('-- 7. what this migration did'),
)

check('only the owner of the company, or an administrator, may set it',
  /not public\.owns_provider\(p_provider_id\) and not public\.is_admin\(\)/.test(setLogo))
check('the path must sit under the caller’s own storage folder',
  /split_part\(cleaned, '\/', 1\) <> caller::text/.test(setLogo))
check('so one owner cannot point their company at another’s file',
  /A logo must be a file you uploaded/.test(setLogo))
check('and the extension is checked server-side too',
  /cleaned !~ '\\\\\.\(png\|jpg\|jpeg\|webp\)\$'/.test(setLogo) ||
    /png\|jpg\|jpeg\|webp/.test(setLogo))
check('passing nothing clears it rather than erroring',
  /nullif\(btrim\(coalesce\(p_path, ''\)\), ''\)/.test(setLogo))
check('an unauthenticated caller is refused', /caller is null/.test(setLogo))
check('and anon holds no grant on it',
  /revoke all on function public\.set_provider_logo\(uuid, text\) from public, anon/.test(MIGRATION))

// --------------------------------------------- and it is not evidence

head('changing a logo is not a change to what NASEK verified')

/*
 * The check this whole section exists for.
 *
 * `submit_provider_profile` splits an owner's fields: presentation applies at
 * once, and the things NASEK checked the company against — its registered name,
 * commercial registration, permit number and expiry, the permit scan — queue for
 * an administrator when the company is already verified. A logo must be on the
 * first side of that line, or every rebrand would re-open a verification.
 */
for (const sensitive of [
  'commercial_registration',
  'permit_number',
  'permit_expiry',
  'licence_path',
]) {
  check(`${sensitive} is still verification evidence`,
    new RegExp(`jsonb_build_object\\('${sensitive}'`).test(PROFILE))
}
check('logo_path is not queued for review',
  !/jsonb_build_object\('logo_path'/.test(PROFILE) &&
    !/jsonb_build_object\('logo'/.test(PROFILE))
check('the logo has its own function instead of joining that form',
  /create or replace function public\.set_provider_logo/.test(MIGRATION))
check('which touches only providers, so no trip can move',
  !/update public\.campaigns/.test(setLogo))
check('and does not write verification, so no company can self-approve',
  !/verification/.test(setLogo))

// ================================= 3. approval: company yes, trip no

head('the company is still approved by NASEK')

check('provider_can_publish requires a verified company',
  /pr\.verification = 'verified'/.test(MIGRATION))
check('and an owner account that is not suspended',
  /coalesce\(p\.suspended, false\) = false/.test(MIGRATION))
check('nor removed', /coalesce\(p\.removed, false\) = false/.test(MIGRATION))

check('a new company is still written pending, whoever inserts it',
  /new\.verification\s+:= 'pending'/.test(PROFILE))
check('and an owner still cannot write their own verification',
  /new\.verification\s+:= old\.verification/.test(PROFILE))
check('the migration does not touch set_provider_status',
  !/function public\.set_provider_status/.test(MIGRATION))
check('nor the provider guard',
  !/function public\.guard_provider_privileges/.test(MIGRATION))
check('nor the profile-change review',
  !/function public\.review_provider_changes/.test(MIGRATION))

head('an individual trip is not')

const guard = MIGRATION.slice(
  MIGRATION.indexOf('create or replace function public.guard_campaign_moderation'),
  MIGRATION.indexOf('-- ------------------------------------------- 3. the trips already queued'),
)

check('an ineligible company’s insert is refused outright',
  /if not public\.provider_can_publish\(new\.provider_id\) then[\s\S]{0,200}raise exception/.test(guard))
check('with the sentence the interface shows',
  /Your company must be approved by Admin before you can publish trips/.test(guard))
check('an eligible company’s trip is written active',
  /new\.status\s+:= 'active'/.test(guard))
check('and never pending_approval',
  !/new\.status\s+:= 'pending_approval'/.test(guard))

/*
 * The edit path. This is what "an active trip stays active after a valid edit"
 * means in the only place it can be enforced.
 */
const update = guard.slice(guard.indexOf("new.suspended    := old.suspended"))
check('an edit reverts the status rather than moving it',
  /new\.status\s+:= old\.status/.test(update))
check('so a price change cannot send a live trip anywhere',
  !/material/.test(guard), 'the material-edit branch is still present')
check('and an owner still cannot reinstate a trip an administrator took down',
  /new\.rejection_reason := old\.rejection_reason/.test(update) &&
    /new\.reviewed_by      := old\.reviewed_by/.test(update))
check('moderation columns are still reverted on an owner write',
  /new\.suspended    := old\.suspended/.test(update) &&
    /new\.featured     := old\.featured/.test(update))

head('who may insert a trip at all')

check('a trip may only be inserted under a company you own',
  /create policy campaigns_insert_own[\s\S]{0,200}public\.owns_provider\(provider_id\) or public\.is_admin\(\)/
    .test(RLS))
check('and ownership is the company’s owner_id, not a claim in the row',
  /join public\.providers pr on pr\.id = c\.provider_id[\s\S]{0,120}pr\.owner_id = auth\.uid\(\)/.test(RLS))

head('what a pilgrim may see')

check('the read policy still requires the company to be approved',
  /create policy campaigns_read[\s\S]{0,400}public\.provider_approved\(provider_id\)/.test(
    readSql('20260904000300_campaign_approval.sql'),
  ))
check('and this migration does not touch it',
  !/create policy campaigns_read/.test(MIGRATION))

head('the trips that were already queued')

const backfill = MIGRATION.slice(
  MIGRATION.indexOf('update public.campaigns c'),
  MIGRATION.indexOf('-- ----------------------------------------- 4. the administrator'),
)
check('only those of a company that may publish are released',
  /status      = 'active'/.test(backfill) && /public\.provider_can_publish\(c\.provider_id\)/.test(backfill),
  backfill.replace(/\s+/g, ' ').slice(0, 150))
check('the rest stay exactly where they are',
  /c\.status = 'pending_approval'\s*\n\s*and public\.provider_can_publish/.test(MIGRATION))
check('a trip an administrator refused is not resurrected',
  !/status = 'active'[\s\S]{0,200}where[\s\S]{0,120}'rejected'/.test(MIGRATION))
check('and every release is written to the audit trail',
  /'campaign_auto_activated'/.test(MIGRATION))
check('nothing is deleted', !/delete from/i.test(MIGRATION))

head('the administrator keeps the levers that are not approval')

check('set_campaign_status is still admin-only',
  /if not public\.is_admin\(\) then[\s\S]{0,140}Only an administrator may change/.test(MIGRATION))
check('taking a trip down still costs a written reason',
  /A reason is required when taking a trip down/.test(MIGRATION))
check('reinstating a trip of an unverified company is refused',
  /company\.verification <> 'verified'/.test(MIGRATION))
check('and pending_approval is refused, because there is no queue',
  /Individual trips are no longer reviewed/.test(MIGRATION))
check('the owner is told in moderation’s words, not approval’s',
  /تم إيقاف رحلتك/.test(MIGRATION) && /تمت إعادة تفعيل رحلتك/.test(MIGRATION))
/*
 * Comments stripped first.
 *
 * The file quotes the old approval notification in prose, explaining what it
 * replaced and why — which is exactly the kind of comment that should survive.
 * What must not survive is a string the database would actually send, so the
 * check is made against the statements alone.
 */
const statements = MIGRATION.split('\n')
  .filter((line) => !line.trim().startsWith('--') && !line.trim().startsWith('*'))
  .join('\n')
check('and no approval wording survives in anything the database would send',
  !/تم اعتماد حملتك/.test(statements) && !/Your campaign is approved/.test(statements))

// ============================================ 4. what a person actually sees

head('the mark on the screen')

const COMPANY: Provider = {
  id: 'p1',
  name: { ar: 'شركة الاختبار', en: 'Harness Co' },
  tagline: { ar: '', en: '' },
  description: { ar: '', en: '' },
  wilayahId: 'muscat',
  verification: 'verified',
  experienceYears: 3,
  rating: 4.6,
  reviewCount: 4,
  phone: '+968 9123 4567',
  email: 'co@example.com',
  initials: 'HC',
  brandColor: '#1c5e4c',
  plan: 'basic',
  joinedAt: '2026-01-01',
  /*
   * An absolute URL rather than a storage path, because this harness has no
   * Supabase origin to turn a path into a URL with. `providerLogoUrl` passes an
   * absolute URL through, so what is exercised below is the rendering — which
   * is what these checks are about. The path form is covered above.
   */
  logoPath: 'https://cdn.example/logo-1.png',
}

const draw = (node: React.ReactElement, lang: 'ar' | 'en' = 'en') =>
  renderToStaticMarkup(
    <MemoryRouter>
      <I18nProvider extra={{ en: { ...ownerEn, ...adminEn }, ar: { ...ownerAr, ...adminAr } }}>
        <AppStoreProvider>{node}</AppStoreProvider>
      </I18nProvider>
    </MemoryRouter>,
  ) + (lang === 'ar' ? '' : '')

const withLogo = draw(<ProviderMark provider={COMPANY} />)
check('a company with a logo renders an image', withLogo.includes('<img'))
check('pointing at the company’s own file', withLogo.includes('logo-1.png'), withLogo.slice(0, 140))
check('with the company name as alt text, not an empty alt',
  withLogo.includes('alt="Harness Co"'), withLogo.slice(0, 200))
/*
 * Not distorted. `object-contain` inside a fixed square is the whole of the
 * requirement — a wide wordmark and a tall crest both keep their proportions,
 * and neither is cropped.
 */
check('and object-contain, so it is never stretched or cropped',
  withLogo.includes('object-contain'))
check('inside a square box', /size-\d+/.test(withLogo))
check('lazily, because a list of cards should not block on logos',
  withLogo.includes('loading="lazy"'))

const noLogo = draw(<ProviderMark provider={{ ...COMPANY, logoPath: undefined }} />)
check('a company with no logo renders no image at all', !noLogo.includes('<img'))
check('and falls back to its initials', noLogo.includes('HC'))
check('on its own brand colour', noLogo.includes('#1c5e4c'))
check('with no stand-in logo invented for it',
  !/placeholder|sample|default-logo|logo\.svg/i.test(noLogo))

const unknown = draw(<ProviderMark provider={undefined} />)
check('and an unknown company draws a dash rather than throwing', unknown.includes('—'))

check('the monogram is available on its own for callers that want it',
  draw(<ProviderMonogram provider={COMPANY} />).includes('HC'))

// ------------------------------------------ every trip, the same company mark

head('one logo per company, not per trip')

/*
 * The property, and where it actually lives.
 *
 * `CampaignCard` takes a campaign and looks its company up through
 * `useCatalogue` — it is never handed a logo, and there is no per-trip image
 * field for an owner to fill in. So "every trip shows the same mark" is not a
 * thing to assert by rendering two cards; it is true by construction, and what
 * can go wrong is a screen drawing its own monogram inline instead of going
 * through the one component that knows about logos.
 *
 * That is what this checks, and it is the regression the component was created
 * to prevent: four screens each drew `provider.initials` on a coloured square,
 * and adding a logo to three of them while missing the fourth would look
 * exactly like this file passing.
 */
const source = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const SURFACES: [string, string][] = [
  ['the customer campaign card', 'src/components/campaign/CampaignCard.tsx'],
  ['the customer trip detail', 'src/pages/CampaignDetailPage.tsx'],
  ['the administration company table', 'src/admin/tabs/OwnersTab.tsx'],
  ['the owner company profile', 'src/owner/panels/CompanyProfilePanel.tsx'],
]

for (const [label, file] of SURFACES) {
  const text = source(file)
  check(`${label} draws the company through ProviderMark`,
    /<ProviderMark\b/.test(text))
  /*
   * And has no hand-rolled monogram left behind it. The shape being looked for
   * is the one that was there before: a coloured box built from `brandColor`
   * with `initials` inside it.
   */
  check(`${label} no longer draws its own monogram`,
    !/style=\{\{\s*background:\s*[^}]*brandColor[^}]*\}\}/.test(text),
    (text.match(/style=\{\{\s*background:[^}]*\}\}/g) ?? []).join(' | ').slice(0, 120))
}

check('and no screen builds a logo URL of its own',
  SURFACES.every(([, file]) => !/storage\/v1\/object\/public/.test(source(file))))

/*
 * The mark itself is a function of the company alone — it takes no campaign, so
 * it cannot vary between two trips of the same company even in principle.
 */
const markSource = source('src/components/brand/ProviderMark.tsx')
check('ProviderMark takes a company and no campaign',
  /provider: Pick<Provider/.test(markSource) && !/campaign:/.test(markSource),
  // Prose and the shared image helper both mention campaigns; what must not
  // exist is a campaign *prop*, which is what would let one trip differ.
  markSource.includes('campaign:') ? 'a campaign prop is declared' : '')
check('there is one upload path, on the company profile, and none on the trip form',
  /uploadProviderLogo/.test(source('src/owner/panels/CompanyProfilePanel.tsx')) &&
    !/uploadProviderLogo/.test(source('src/components/campaign/CampaignForm.tsx')))

// ------------------------------------------------------- the wording exists

head('the labels the brief asked for')

for (const [dict, key, want] of [
  [ownerAr, 'owner.logoTitle', 'شعار الحملة'],
  [ownerAr, 'owner.logoUpload', 'رفع الشعار'],
  [ownerAr, 'owner.logoChange', 'تغيير الشعار'],
  [ownerAr, 'owner.logoRemove', 'حذف الشعار'],
  [ownerEn, 'owner.logoTitle', 'Campaign Logo'],
  [ownerEn, 'owner.logoUpload', 'Upload Logo'],
  [ownerEn, 'owner.logoChange', 'Change Logo'],
  [ownerEn, 'owner.logoRemove', 'Remove Logo'],
] as [Record<string, string>, string, string][]) {
  check(`${key} is "${want}"`, dict[key] === want, dict[key])
}

check('the invalid-file message is the one specified, in Arabic',
  ownerAr['owner.logoInvalid'] === 'يرجى رفع صورة PNG أو JPG أو WebP بحجم لا يتجاوز 2 ميجابايت.',
  ownerAr['owner.logoInvalid'])
check('and in English',
  ownerEn['owner.logoInvalid'] === 'Please upload a PNG, JPG or WebP image no larger than 2 MB.',
  ownerEn['owner.logoInvalid'])
check('the unapproved-company message is the one specified, in Arabic',
  ownerAr['owner.notApprovedToPublish'] ===
    'يجب اعتماد حساب صاحب الحملة من الإدارة قبل نشر الرحلات.',
  ownerAr['owner.notApprovedToPublish'])
check('and in English',
  ownerEn['owner.notApprovedToPublish'] ===
    'Your company must be approved by Admin before you can publish trips.',
  ownerEn['owner.notApprovedToPublish'])
check('publishing says so plainly, in Arabic',
  ownerAr['prov.publishedActive'].includes('تمت إضافة الرحلة'), ownerAr['prov.publishedActive'])
check('and in English',
  /added and is live/.test(ownerEn['prov.publishedActive']), ownerEn['prov.publishedActive'])

head('the retired wording is gone from the dictionaries')

for (const key of [
  'admin.campaignQueue',
  'admin.campaignQueueBody',
  'admin.campaignApprove',
  'admin.campaignApproved',
  'admin.campaignBackToQueue',
  'admin.filterPending',
  'prov.publishedPending',
]) {
  check(`${key} no longer exists`, !(key in adminEn) && !(key in ownerEn), key)
}
check('and the company approval screen is untouched',
  'admin.ownersPendingTitle' in adminEn && 'admin.reviewPermit' in adminEn &&
    'admin.awaitingVerification' in adminEn)

console.log(
  failures === 0
    ? '\nAll approval-model and logo checks passed.\n'
    : `\n${failures} check(s) failed.\n`,
)
process.exit(failures === 0 ? 0 : 1)
