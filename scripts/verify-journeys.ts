/*
 * End-to-end journeys.
 *
 * The other harnesses each check one seam. This one walks the paths a real
 * person takes, in order, through the same functions the pages call — an owner
 * registering and publishing, a pilgrim finding and booking that trip, the
 * admin moderating it — and checks that each step is visible to the next.
 *
 * It cannot click anything: rendering, layout and event wiring need a browser.
 * What it does cover is every decision behind the screens.
 */
import type { Booking, Campaign, Provider, User } from '@/types'
import { authApi } from '@/services/api/auth'
import { createCredential, findCredential, verifyPassword } from '@/services/api/credentials'
import { contactDetailsToKeep } from '@/services/auth/profileGaps'
import { verifyAdminPassphrase } from '@/admin/access'
import { applyFilters, applySort, campaignsApi, defaultFilters } from '@/services/api/campaigns'
import { bookingsApi, priceBreakdown } from '@/services/api/bookings'
import { getAI } from '@/services/ai'
import { buildDirectory } from '@/data/users'
import { emptyState, reducer, type PersistedState } from '@/store/AppStore'
import { deriveCatalogue } from '@/hooks/useCatalogue'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const head = (s: string) => console.log(`\n--- ${s} ---`)

/**
 * The catalogue this journey sees, from the same function the pages use.
 *
 * This used to be a hand-written copy of `deriveCatalogue`'s offline branch,
 * and it did exactly what `verify-wiring` warns a copy does: it drifted, and
 * then certified the drift. When campaign approval landed, the real function
 * started withholding unapproved trips from the public list and this one did
 * not — so the journey went on reporting "the trip is on the site" for a
 * campaign no pilgrim could have seen.
 *
 * Delegating costs one adapter and removes the whole class of failure. Note
 * that `seedProviders` maps onto `sessionProviders` rather than a separate
 * slice: this harness has no seed catalogue, so the two are the same list.
 */
function catalogue(state: PersistedState, seedProviders: Provider[] = []) {
  return deriveCatalogue({
    remoteReady: false,
    remoteCampaigns: [],
    remoteProviders: [],
    sessionProviders: [...state.sessionProviders, ...seedProviders],
    providerCampaigns: state.providerCampaigns,
    hiddenCampaignIds: state.hiddenCampaignIds,
    campaignSuspensions: state.campaignSuspensions,
    featureOverrides: state.featureOverrides,
    verificationOverrides: state.verificationOverrides,
    campaignStatusOverrides: state.campaignStatusOverrides,
  })
}

const main = async () => {
  let state: PersistedState = emptyState

  // ============================================ 1. an owner joins and lists
  head('a campaign owner registers')
  const { user: ownerUser, provider } = await authApi.registerProvider({
    name: 'Salim Al-Rawahi',
    email: 'salim@nur.om',
    phone: '+968 9777 8888',
    wilayahId: 'nizwa',
    companyName: 'Nur Al-Haramain',
    tagline: 'Trusted Hajj and Umrah since 2014',
    experienceYears: 12,
    licenceImage: 'data:image/jpeg;base64,AA==',
    licenceFileName: 'permit.jpg',
  })
  const ownerCred = await createCredential({
    userId: ownerUser.id, role: 'provider',
    email: 'salim@nur.om', phone: '+968 9777 8888', password: 'owner-pass-2026',
  })
  state = reducer(state, { type: 'addCredential', credential: ownerCred })
  state = reducer(state, { type: 'addProvider', provider })
  state = reducer(state, { type: 'registerUser', user: ownerUser })
  state = reducer(state, { type: 'signIn', user: ownerUser })

  check('the permit is stored with the company', !!provider.licenceImage)
  check('the company starts awaiting verification', provider.verification === 'pending')

  head('the owner publishes a trip')
  const trip: Campaign = {
    id: 'c-journey', providerId: provider.id, type: 'hajj',
    title: { ar: 'حج المشاعر', en: 'Mashaer Hajj' },
    description: { ar: 'رحلة حج كاملة', en: 'A complete Hajj journey' },
    price: 3800, wilayahId: 'nizwa', travelMethod: 'air',
    departureDate: '2027-05-10', returnDate: '2027-05-30',
    seatsTotal: 45, seatsAvailable: 45, services: ['meals', 'transport'],
    hotelMakkah: { ar: 'فندق مكة', en: 'Makkah Hotel' },
    hotelMadinah: { ar: 'فندق المدينة', en: 'Madinah Hotel' },
    haramDistanceM: 350, rating: 0, reviewCount: 0, featured: false, bookingsCount: 0,
    // Exactly what `CampaignForm` produces on a new trip: in the queue, not on
    // the site. The trigger in Postgres forces the same value server-side, so
    // this is the state a campaign genuinely starts in on both paths.
    status: 'pending_approval', excludedServices: [], images: [],
    terms: { ar: '', en: '' },
  } as Campaign
  state = reducer(state, { type: 'upsertCampaign', campaign: trip })

  let world = catalogue(state)
  check('a newly published trip is NOT on the public site yet',
    world.campaigns.length === 0, `${world.campaigns.length} public`)
  check('but the owner can see it in their own dashboard',
    world.campaignsOf(provider.id).length === 1)
  check('and it is waiting in the administration queue',
    world.adminCampaigns.filter((c) => c.status === 'pending_approval').length === 1)

  /*
   * The approval, which is the step this journey existed without.
   *
   * Everything downstream — a pilgrim finding the trip, filtering to it,
   * booking it — depends on it, and that dependency is the point: before this
   * migration a campaign reached the catalogue by being saved, and now it
   * reaches it by being approved.
   */
  state = reducer(state, { type: 'setCampaignStatus', campaignId: trip.id, status: 'active' })
  world = catalogue(state)
  check('once an administrator approves it, the trip is on the site',
    world.campaigns.length === 1)
  check('priced above the old 3,000 cap and still visible',
    applyFilters(world.campaigns, defaultFilters(), world.providers).length === 1,
    `${trip.price} OMR`)

  // ============================================== 2. a pilgrim finds it
  head('a pilgrim searches')
  const f = defaultFilters()
  check('found by trip name', applyFilters(world.campaigns, { ...f, query: 'Mashaer' }, world.providers).length === 1)
  check('found by company name', applyFilters(world.campaigns, { ...f, query: 'Nur Al-Haramain' }, world.providers).length === 1)
  check('found in Arabic', applyFilters(world.campaigns, { ...f, query: 'المشاعر' }, world.providers).length === 1)
  check('filtering to Umrah correctly excludes it',
    applyFilters(world.campaigns, { ...f, type: 'umrah' }, world.providers).length === 0)
  check('sorting does not lose it', applySort(world.campaigns, 'recommended', world.providers).length === 1)

  head('smart match sees it')
  const matched = await getAI().smartMatch(
    { type: 'hajj', wilayahId: 'nizwa', budget: 4000, season: 'any', travelMethod: 'any', services: [], travellers: 2 },
    'en', world.campaigns, world.providers,
  )
  check('smart match scores it', matched.length === 1, `${matched[0]?.score ?? 0}%`)

  // ============================================ 3. a customer registers
  /*
   * One field, and one screen.
   *
   * A pilgrim types an address, receives a code, and is signed in — there is no
   * name to give, no phone number, no password and no second step. What the
   * account holds at this point is what the whole change is about, so it is
   * asserted rather than assumed: an address, a greeting derived from it, and
   * nothing else.
   */
  head('a customer registers with an email address and nothing else')
  const customer = await authApi.signUp({ email: 'aisha@example.com' })
  state = reducer(state, { type: 'registerUser', user: customer })

  check('the account exists on an address alone', customer.email === 'aisha@example.com')
  check('with a greeting taken from that address', customer.name === 'aisha', customer.name)
  check('which is flagged as not a name they gave', customer.nameIsPlaceholder === true)
  check('no phone number was asked for', customer.phone === '')
  check('and the account is a customer, not something the form chose', customer.role === 'customer')
  check(
    'nothing resembling a password was stored for them',
    !findCredential(state.credentials, 'aisha@example.com', 'customer'),
  )

  /*
   * Signing in again is the same three steps as registering, because they are
   * the same operation: `startOtp` is called with `shouldCreateUser`, so a code
   * verified against a known address opens the existing account and a code
   * verified against an unknown one creates it. There is no "no account found"
   * dead end to recover from — which is why nothing here has to look one up.
   */
  state = reducer(state, { type: 'signIn', user: customer })
  check('the pilgrim is signed in straight from the code', state.user?.id === customer.id)

  // ================================================== 4. booking the trip
  head('the pilgrim books')
  const booking: Booking = await bookingsApi.create({
    user: customer,
    campaign: trip,
    travellersCount: 2,
    travellers: [
      { name: 'Aisha Al-Harthy', nationality: 'OM', gender: 'female', civilId: '1234567', passportNo: 'A1234567' },
      { name: 'Fatma Al-Harthy', nationality: 'OM', gender: 'female', civilId: '7654321', passportNo: 'B7654321' },
    ],
    contactName: 'Aisha Al-Harthy',
    contactPhone: '+968 9123 4567',
    contactEmail: 'aisha@example.com',
  })
  state = reducer(state, { type: 'addBooking', booking })

  check('a booking reference is issued', !!booking.reference, booking.reference)
  check('the booking carries the details the form collected',
    booking.contactName === 'Aisha Al-Harthy' && booking.contactPhone === '+968 9123 4567')

  /*
   * And those details go back to the profile.
   *
   * This is the other half of registering on an address alone: a pilgrim is
   * asked for their name once, at the point it goes on a manifest, and never
   * again. `contactDetailsToKeep` decides what may be kept; the booking page
   * writes it and dispatches the same patch.
   */
  const keep = contactDetailsToKeep(customer, {
    name: 'Aisha Al-Harthy',
    phone: '+968 9123 4567',
    email: 'aisha@example.com',
  })
  check('booking fills in the name registration never asked for', keep?.name === 'Aisha Al-Harthy')
  check('and the phone number', keep?.phone === '+968 9123 4567')
  state = reducer(state, { type: 'updateProfile', patch: keep! })
  check('the profile is no longer minimal', state.user?.name === 'Aisha Al-Harthy')
  check('and no longer flagged as a placeholder', state.user?.nameIsPlaceholder === false)
  check(
    'a second booking has nothing left to teach it',
    contactDetailsToKeep(state.user!, {
      name: 'Someone Else',
      phone: '+968 9999 9999',
      email: 'aisha@example.com',
    }) === null,
  )
  const { subtotal, fee, total } = priceBreakdown(trip, 2)
  check('the total is the trip twice over, plus the platform fee',
    booking.totalPrice === total && total === subtotal + fee,
    `${subtotal} + ${fee} fee = ${booking.totalPrice}`)
  check('it lands in the customer history', state.bookings.length === 1)

  // ================================================ 5. the admin moderates
  head('the admin takes over')
  check('the passphrase gate refuses a guess', !(await verifyAdminPassphrase('admin')))
  const admin = await authApi.signInAs('admin', 'NASEK admin')
  state = reducer(state, { type: 'signIn', user: admin })
  check('the admin session is an admin', state.user?.role === 'admin')

  world = catalogue(state)
  const directory = buildDirectory(world.providers, state.bookings, state.sessionUsers)
  check('both accounts appear in the directory', directory.length === 2, `${directory.length}`)
  check('the customer shows their booking',
    directory.find((u) => u.id === customer.id)?.bookings === 1)

  state = reducer(state, { type: 'setVerification', providerId: provider.id, status: 'verified' })
  world = catalogue(state)
  check('verifying the owner reaches the public catalogue',
    world.providers.find((p) => p.id === provider.id)?.verification === 'verified')

  state = reducer(state, { type: 'setCampaignFeatured', campaignId: trip.id, featured: true })
  world = catalogue(state)
  check('featuring reaches the home page',
    (await campaignsApi.featured(world.campaigns)).length === 1)

  state = reducer(state, { type: 'setCampaignSuspended', campaignId: trip.id, suspended: true })
  world = catalogue(state)
  check('suspending removes it from the public site', world.campaigns.length === 0)
  check('but the admin can still see it to restore', world.adminCampaigns.length === 1)
  state = reducer(state, { type: 'setCampaignSuspended', campaignId: trip.id, suspended: false })

  state = reducer(state, { type: 'setUserSuspended', userId: customer.id, suspended: true })
  check('a suspended customer is recorded', state.suspendedUserIds.includes(customer.id))
  state = reducer(state, { type: 'setUserSuspended', userId: customer.id, suspended: false })

  // ============================================= 6. everything persists
  head('the session ends')
  const saved = JSON.parse(JSON.stringify(state)) as PersistedState
  const restored = reducer(emptyState, { type: 'hydrate', state: saved })
  check('the trip survives a reload', catalogue(restored).campaigns.length === 1)
  check('the accounts survive', restored.sessionUsers.length === 2)
  /*
   * One credential, not two — and the missing one is the point.
   *
   * The campaign owner holds a password because they sign in constantly and
   * cannot afford to wait on an inbox. The pilgrim holds none, because a
   * password for someone who signs in around one trip in their life is pure
   * cost, and the code flow is already the recovery path a password system
   * would need. A second row appearing here would mean customer registration
   * had started minting credentials again.
   */
  check('the one credential survives', restored.credentials.length === 1)
  check(
    'and it belongs to the campaign owner, not the pilgrim',
    restored.credentials.every((c) => c.role === 'provider'),
  )
  check('no password is anywhere in what is stored',
    !JSON.stringify(saved).includes('pilgrim-pass-1') &&
      !JSON.stringify(saved).includes('owner-pass-2026'))

  const out = reducer(restored, { type: 'signOut' })
  check('signing out clears the person', out.user === null)
  check('but not the platform', catalogue(out).campaigns.length === 1 && out.credentials.length === 1)

  console.log(failures === 0
    ? '\nEVERY JOURNEY COMPLETED'
    : `\n${failures} STEP(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
