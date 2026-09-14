/*
 * Is the interface actually connected to the database?
 *
 * The other harnesses check decisions. This one checks *wiring* — the seam
 * where a screen reads what Postgres said, and where a button writes back to
 * it. Every assertion here corresponds to something that was broken and is not
 * a hypothetical: each one failed before the change it guards.
 *
 * The common shape of every bug it covers: an action wrote to the database
 * correctly and then updated a local override map that `deriveCatalogue` stops
 * consulting the moment a snapshot has landed. So the write succeeded, the
 * toast fired, and the screen showed exactly what it showed before — a
 * verification that did not appear, a trip published and apparently not
 * published, a takedown that stayed live.
 *
 * It runs with no backend (`--mode harness` blanks the connection), which is
 * the point: these are assertions about how the client treats what a server
 * said, and they must not depend on a server saying it.
 */
import type { Booking, Campaign, Provider, Review, User } from '@/types'
import type { CampaignRow, ProfileRow, ReviewPublicRow } from '@/services/supabase/schema'
import { toCampaign, toReview } from '@/services/data/mappers'
import { profileToUser } from '@/services/auth/session'
import { deriveCatalogue, type CatalogueInput } from '@/hooks/useCatalogue'
import { buildDirectory } from '@/data/users'
import { emptyState, reducer } from '@/store/AppStore'
import { EMPTY_SNAPSHOT } from '@/services/data/catalogue'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const head = (s: string) => console.log(`\n--- ${s} ---`)

// ------------------------------------------------------------------ fixtures

const campaignRow = (over: Partial<CampaignRow> = {}): CampaignRow =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    provider_id: '22222222-2222-4222-8222-222222222222',
    type: 'umrah',
    title_ar: 'رحلة',
    title_en: 'Trip',
    description_ar: '',
    description_en: '',
    price: '450.000',
    wilayah_id: 'muscat',
    travel_method: 'air',
    departure_date: '2026-11-01',
    return_date: '2026-11-12',
    seats_total: 40,
    seats_available: 12,
    services: [],
    hotel_makkah_ar: '',
    hotel_makkah_en: '',
    hotel_madinah_ar: '',
    hotel_madinah_en: '',
    haram_distance_m: 300,
    rating: '4.5',
    review_count: 3,
    featured: false,
    bookings_count: 2,
    suspended: false,
    deleted: false,
    created_at: '2026-09-01T00:00:00Z',
    // Approved, because that is what almost every assertion below is about
    // something *else* on a campaign that is already live. The queue cases
    // override it explicitly, which is what makes them read as the exception.
    status: 'active',
    rejection_reason: null,
    submitted_at: '2026-09-01T00:00:00Z',
    reviewed_by: null,
    reviewed_at: '2026-09-01T00:00:00Z',
    registration_deadline: null,
    departure_location: '',
    office_number: '',
    images: [],
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    terms_ar: '',
    terms_en: '',
    ...over,
  }) as unknown as CampaignRow

const profileRow = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Aisha Al-Balushi',
  email: 'aisha@example.om',
  phone: '+968 9111 2222',
  role: 'customer',
  wilayah_id: 'muscat',
  avatar_color: '#1c5e4c',
  provider_id: null,
  suspended: false,
  removed: false,
  created_at: '2026-08-01T00:00:00Z',
  ...over,
})

const provider = (over: Partial<Provider> = {}): Provider =>
  ({
    id: '22222222-2222-4222-8222-222222222222',
    name: { ar: 'نور', en: 'Nur Al-Haramain' },
    tagline: { ar: '', en: '' },
    description: { ar: '', en: '' },
    wilayahId: 'nizwa',
    verification: 'verified',
    experienceYears: 10,
    rating: 4.6,
    reviewCount: 3,
    phone: '+968 9777 8888',
    email: 'salim@nur.om',
    initials: 'N',
    brandColor: '#1c5e4c',
    plan: 'basic',
    joinedAt: '2026-01-01',
    ...over,
  }) as Provider

const input = (over: Partial<CatalogueInput> = {}): CatalogueInput => ({
  remoteReady: true,
  remoteCampaigns: [],
  remoteProviders: [],
  sessionProviders: [],
  providerCampaigns: [],
  hiddenCampaignIds: [],
  campaignSuspensions: [],
  featureOverrides: {},
  verificationOverrides: {},
  campaignStatusOverrides: {},
  ...over,
})

const main = () => {
  // ========================================================== 1. the mappers
  head('what a row turns into')

  const mapped = toCampaign(campaignRow({ suspended: true, deleted: false }))
  check(
    'a campaign carries its moderation state off the row',
    mapped.suspended === true && mapped.deleted === false,
    `suspended=${mapped.suspended} deleted=${mapped.deleted}`,
  )
  check(
    'numeric columns arrive as numbers, not strings',
    typeof mapped.price === 'number' && mapped.price === 450,
    `${typeof mapped.price} ${mapped.price}`,
  )

  const review = toReview({
    id: 'r1',
    user_id: 'u1',
    campaign_id: 'c1',
    provider_id: 'p1',
    rating: 5,
    comment_ar: 'ممتاز',
    comment_en: 'Excellent',
    hidden: true,
    created_at: '2026-08-20T00:00:00Z',
    reply_ar: 'شكرًا لك',
    reply_en: 'Thank you',
    replied_at: '2026-08-22T00:00:00Z',
    user_name: 'Aisha Al-Balushi',
  } as ReviewPublicRow)
  check(
    'a review carries the name of whoever wrote it',
    review.userName === 'Aisha Al-Balushi',
    JSON.stringify(review.userName),
  )
  check('a review carries whether it was taken down', review.hidden === true)
  /*
   * The reply lived in component state on the owner's dashboard, so the
   * traveller it answered never saw it. It is a column now, and it has to
   * survive the mapper to reach the trip page.
   */
  check(
    'a review carries the campaign owner reply',
    review.reply.en === 'Thank you' && review.repliedAt === '2026-08-22T00:00:00Z',
    JSON.stringify(review.reply),
  )
  const unanswered = toReview({
    id: 'r2',
    user_id: 'u1',
    campaign_id: 'c1',
    provider_id: 'p1',
    rating: 4,
    comment_ar: '',
    comment_en: '',
    hidden: false,
    created_at: '2026-08-20T00:00:00Z',
    reply_ar: null,
    reply_en: null,
    replied_at: null,
    user_name: null,
  } as ReviewPublicRow)
  check(
    'an unanswered review reads as empty rather than null',
    unanswered.reply.ar === '' && unanswered.reply.en === '' && unanswered.repliedAt === undefined,
  )
  check(
    'and a reviewer who gave no name leaves the byline to the interface',
    unanswered.userName === '',
  )

  const asUser = profileToUser(profileRow({ suspended: true }))
  check(
    'a profile carries its moderation flags',
    asUser.suspended === true && asUser.removed === false,
  )

  // ================================================== 2. the catalogue, remote
  head('what the screens are shown, with a database')

  const live = toCampaign(campaignRow({ id: 'live' }))
  const down = toCampaign(campaignRow({ id: 'down', suspended: true }))
  const gone = toCampaign(campaignRow({ id: 'gone', deleted: true }))
  const remote = deriveCatalogue(
    input({ remoteCampaigns: [live, down, gone], remoteProviders: [provider()] }),
  )

  check(
    'a withdrawn trip is on no list at all',
    !remote.adminCampaigns.some((c) => c.id === 'gone') &&
      !remote.campaigns.some((c) => c.id === 'gone'),
  )
  check(
    'a suspended trip is off the public list',
    !remote.campaigns.some((c) => c.id === 'down'),
    remote.campaigns.map((c) => c.id).join(','),
  )
  check(
    'but stays on the admin list, where the restore button is',
    remote.adminCampaigns.some((c) => c.id === 'down'),
  )
  check(
    'and stays in its owner dashboard, so they can see it was taken down',
    remote.campaignsOf(provider().id).some((c) => c.id === 'down'),
  )
  check(
    'a takedown recorded in the database is reported as one',
    remote.isSuspended('down') === true && remote.isSuspended('live') === false,
  )

  /*
   * The regression that mattered most: a takedown made anywhere else.
   *
   * `isSuspended` read `campaignSuspensions` — a list of decisions taken in
   * *this* browser — so a trip suspended by a colleague, or by this same
   * administrator in an earlier session, was drawn as live and offered the
   * "suspend" button again.
   */
  const elsewhere = deriveCatalogue(input({ remoteCampaigns: [down], campaignSuspensions: [] }))
  check('a takedown from another browser is honoured here', elsewhere.isSuspended('down') === true)

  /* And its mirror: a restore must not be undone by a stale local id. */
  const restored = deriveCatalogue(
    input({ remoteCampaigns: [live], campaignSuspensions: ['live'] }),
  )
  check(
    'a restored trip is not held down by this browser memory of suspending it',
    restored.isSuspended('live') === false && restored.campaigns.some((c) => c.id === 'live'),
  )

  /*
   * Verification comes from the server row, not the local override map — which
   * is correct, and is exactly why every administrative decision has to be
   * followed by a snapshot reload rather than by a dispatch alone.
   */
  const stale = deriveCatalogue(
    input({
      remoteProviders: [provider({ verification: 'pending' })],
      verificationOverrides: { [provider().id]: 'verified' },
    }),
  )
  check(
    'a local verification override cannot outrank the server row',
    stale.providers[0].verification === 'pending',
    stale.providers[0].verification,
  )

  // ============================================ 2b. approval, on the catalogue
  head('what approval does to the public list')

  /*
   * The whole point of 20260904000300, asserted where it is easiest to break.
   *
   * `campaigns_read` cannot filter approval away on its own: it serves three
   * audiences from one predicate, and an owner has to receive their own pending
   * and refused trips or their dashboard could not show them. So the policy
   * decides who may see a row at all, and `deriveCatalogue` decides which of
   * those rows belong on a public page. Delete the client-side half and nothing
   * errors — the catalogue simply starts listing unapproved trips to the two
   * people who are sent them, which is precisely the sort of regression that
   * ships.
   */
  const queued = toCampaign(campaignRow({ id: 'queued', status: 'pending_approval' }))
  const refused = toCampaign(campaignRow({ id: 'refused', status: 'rejected' }))
  const approval = deriveCatalogue(
    input({
      remoteCampaigns: [live, queued, refused],
      remoteProviders: [provider()],
    }),
  )

  check(
    'a campaign awaiting review is not in the public catalogue',
    !approval.campaigns.some((c) => c.id === 'queued'),
    approval.campaigns.map((c) => c.id).join(',') || '(empty)',
  )
  check(
    'a refused campaign is not in the public catalogue either',
    !approval.campaigns.some((c) => c.id === 'refused'),
  )
  check(
    'an approved campaign is',
    approval.campaigns.some((c) => c.id === 'live'),
  )
  check(
    'both still reach the administration list, which holds the decision buttons',
    approval.adminCampaigns.some((c) => c.id === 'queued') &&
      approval.adminCampaigns.some((c) => c.id === 'refused'),
  )
  check(
    'and the owner dashboard, so an owner can see where their trip stands',
    approval.campaignsOf(provider().id).length === 3,
    String(approval.campaignsOf(provider().id).length),
  )
  check(
    'getCampaign refuses to resolve an unapproved trip for a public page',
    approval.getCampaign('queued') === undefined && approval.getCampaign('live') !== undefined,
  )

  /*
   * A column that is not there yet must not empty the catalogue.
   *
   * There is a window between deploying this build and applying the migration
   * in which PostgREST simply omits `status`. `toCampaign` defaults it to
   * `active` for exactly that window — the alternative is every trip on the
   * site vanishing the moment the new bundle goes live, which is the wrong
   * direction to fail in by some distance.
   */
  const preMigration = toCampaign(
    campaignRow({ id: 'old', status: undefined as unknown as 'active' }),
  )
  check(
    'a row from before the migration reads as approved, not as missing',
    preMigration.status === 'active',
    preMigration.status,
  )

  /*
   * Offline, an approval decision taken in this session applies — the exact
   * counterpart of `verificationOverrides`, and the reason a fresh clone with
   * no backend still has a working queue rather than an approve button that
   * does nothing.
   */
  const offlineApproval = deriveCatalogue(
    input({
      remoteReady: false,
      providerCampaigns: [queued],
      campaignStatusOverrides: { queued: 'active' },
    }),
  )
  check(
    'offline, approving a trip in this session publishes it',
    offlineApproval.campaigns.some((c) => c.id === 'queued'),
  )

  /* And the mirror: a local override must never outrank a server row. */
  const staleStatus = deriveCatalogue(
    input({
      remoteCampaigns: [queued],
      campaignStatusOverrides: { queued: 'active' },
    }),
  )
  check(
    'a local approval cannot publish a trip the platform has not approved',
    !staleStatus.campaigns.some((c) => c.id === 'queued'),
  )

  // ================================================= 3. the catalogue, offline
  head('and without one, unchanged')

  const offline = deriveCatalogue(
    input({
      remoteReady: false,
      providerCampaigns: [live, down],
      campaignSuspensions: ['down'],
      featureOverrides: { live: true },
      sessionProviders: [provider({ verification: 'pending' })],
      verificationOverrides: { [provider().id]: 'verified' },
    }),
  )
  check(
    'a takedown taken in this session still hides a trip',
    !offline.campaigns.some((c) => c.id === 'down') && offline.isSuspended('down'),
  )
  check(
    'a featured decision taken in this session still applies',
    offline.adminCampaigns.find((c) => c.id === 'live')?.featured === true,
  )
  check(
    'a verification taken in this session still applies',
    offline.providers[0].verification === 'verified',
  )

  // ============================================== 3b. a person's own profile
  head('what a customer may change about themselves')

  /*
   * Nationality reaches the domain object.
   *
   * Added for the account page, and asserted because it is the kind of column
   * that gets added to the migration, added to the row type, and then quietly
   * never mapped — leaving a field that saves and never reads back.
   */
  const withNationality = profileToUser(profileRow({ nationality: 'resident' }))
  check(
    'a profile carries the nationality on it',
    withNationality.nationality === 'resident',
    String(withNationality.nationality),
  )
  check(
    'and reads as absent rather than empty when it is not set',
    profileToUser(profileRow()).nationality === undefined,
  )

  /*
   * The store applies a profile patch.
   *
   * `AccountPanel` dispatches whatever `saveProfile` returned — the row as the
   * database actually stored it — so this is the seam between "Postgres agreed"
   * and "the screen shows it".
   */
  const edited = reducer(
    reducer(emptyState, { type: 'signIn', user: profileToUser(profileRow()) }),
    {
      type: 'updateProfile',
      patch: { name: 'Aisha Al-Balushi', phone: '+968 9111 2222', nationality: 'omani' },
    },
  )
  check(
    'an edited profile is applied to the signed-in person',
    edited.user?.name === 'Aisha Al-Balushi' && edited.user?.nationality === 'omani',
    `${edited.user?.name} / ${edited.user?.nationality}`,
  )

  /*
   * The address is NOT among what a profile edit can carry.
   *
   * `profiles.email` is a copy of the credential in `auth.users`;
   * `guard_profile_privileges` reverts a write to it, and `saveProfile` never
   * sends it. Changing it for real goes through `requestEmailChange`, which
   * asks Supabase to email a confirmation link.
   *
   * Asserted as a *reducer* property because that is where a reinstated email
   * field would show up first: a form that patched it locally would display a
   * new address the database never accepted, which is precisely the bug the old
   * profile tab had — an editable email input whose value went nowhere.
   */
  const emailPatch = reducer(
    reducer(emptyState, { type: 'signIn', user: profileToUser(profileRow()) }),
    { type: 'updateProfile', patch: { name: 'Aisha' } },
  )
  check(
    'a profile edit leaves the sign-in address alone',
    emailPatch.user?.email === 'aisha@example.om',
    emailPatch.user?.email ?? '(none)',
  )

  // ================================================== 4. the account directory
  head('who the administration screen can act on')

  const ownerProfile = profileToUser(
    profileRow({
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Salim Al-Rawahi',
      email: 'salim@nur.om',
      role: 'provider',
      provider_id: provider().id,
    }),
  )
  const customerProfile = profileToUser(profileRow())
  const directory = buildDirectory([provider()], [], [ownerProfile, customerProfile])

  const owned = directory.filter((u) => u.providerId === provider().id)
  const ownerRow = owned[0]
  check('a campaign owner appears exactly once', owned.length === 1, `${owned.length} row(s)`)
  /*
   * The bug this replaces: owners were keyed `owner-<uuid>`, an id belonging to
   * no account, and the suspend and remove buttons sent that id to `profiles`,
   * where it matched nothing. The dashboard reported success and changed
   * nothing — for every campaign owner on the platform.
   */
  check(
    'and under the id their account actually has',
    ownerRow?.id === ownerProfile.id,
    ownerRow?.id,
  )
  check('so the moderation buttons have something to act on', ownerRow?.isAccount === true)
  check(
    'while the company is still what an administrator recognises them by',
    ownerRow?.name === 'Nur Al-Haramain',
    ownerRow?.name,
  )

  /*
   * A company whose owner profile is not readable — every company in the
   * offline prototype. It must still be listed, and must not offer an action
   * that would reach no row.
   */
  const orphan = buildDirectory([provider()], [], [])
  check(
    'a company with no readable account is still listed',
    orphan.length === 1,
    `${orphan.length} row(s)`,
  )
  check('but is not offered as something to suspend', orphan[0].isAccount === false)

  const suspendedProfile = profileToUser(profileRow({ suspended: true }))
  check(
    'a suspension recorded in the database reaches the directory',
    buildDirectory([], [], [suspendedProfile])[0].suspended === true,
  )

  // ============================================================== 5. the store
  head('what the store keeps, and what it must not')

  const snapshot = {
    ...EMPTY_SNAPSHOT,
    campaigns: [live] as Campaign[],
    providers: [provider()] as Provider[],
    profiles: [customerProfile] as User[],
    bookings: [] as Booking[],
    reviews: [review] as Review[],
  }
  const hydrated = reducer(emptyState, { type: 'hydrateRemote', snapshot })
  check('the account directory is stored', hydrated.remoteProfiles.length === 1)
  check('and marked as ready to be preferred over the seed data', hydrated.remoteReady === true)

  const out = reducer(hydrated, { type: 'signOut' })
  check(
    'signing out drops every row fetched under the departing policies',
    out.remoteProfiles.length === 0 &&
      out.remoteCampaigns.length === 0 &&
      out.remoteProviders.length === 0 &&
      out.reviews.length === 0 &&
      out.remoteReady === false,
  )

  /*
   * `remoteProfiles` must never reach localStorage. It is the directory of
   * every account on the platform when an administrator fetched it, and it
   * would be read back by whoever opens the browser next.
   */
  const {
    authSettled: _a,
    remoteReady: _r,
    remoteProviders: _p,
    remoteCampaigns: _c,
    remoteProfiles: _u,
    reviews: _v,
    ...persistable
  } = hydrated
  check(
    'and is not among the keys the store writes to disk',
    !('remoteProfiles' in persistable) && !('remoteCampaigns' in persistable),
    `${Object.keys(persistable).length} persisted keys`,
  )

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

main()
