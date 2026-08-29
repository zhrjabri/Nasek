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
import { verifyAdminPassphrase } from '@/services/api/adminAccess'
import { applyFilters, applySort, campaignsApi, defaultFilters } from '@/services/api/campaigns'
import { bookingsApi, priceBreakdown } from '@/services/api/bookings'
import { getAI } from '@/services/ai'
import { buildDirectory } from '@/data/users'
import { emptyState, reducer, type PersistedState } from '@/store/AppStore'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const head = (s: string) => console.log(`\n--- ${s} ---`)

/** Mirrors useCatalogue, so a journey can be followed without React. */
function catalogue(state: PersistedState, seedProviders: Provider[] = []) {
  const hidden = new Set(state.hiddenCampaignIds)
  const suspended = new Set(state.campaignSuspensions)
  const all = state.providerCampaigns
    .filter((c) => !hidden.has(c.id))
    .map((c) => (c.id in state.featureOverrides ? { ...c, featured: state.featureOverrides[c.id] } : c))
  const providers = [...state.sessionProviders, ...seedProviders].map((p) =>
    state.verificationOverrides[p.id] ? { ...p, verification: state.verificationOverrides[p.id] } : p,
  )
  return { adminCampaigns: all, campaigns: all.filter((c) => !suspended.has(c.id)), providers }
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
  } as Campaign
  state = reducer(state, { type: 'upsertCampaign', campaign: trip })

  let world = catalogue(state)
  check('the trip is on the site', world.campaigns.length === 1)
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

  head('the assistant and smart match see it')
  const asked = await getAI().ask('I want a hajj trip', [], 'en', world.campaigns)
  check('the assistant suggests it', (asked.campaignIds?.length ?? 0) > 0)
  const matched = await getAI().smartMatch(
    { type: 'hajj', wilayahId: 'nizwa', budget: 4000, season: 'any', travelMethod: 'any', services: [], travellers: 2 },
    'en', world.campaigns, world.providers,
  )
  check('smart match scores it', matched.length === 1, `${matched[0]?.score ?? 0}%`)

  // ============================================ 3. a customer registers
  head('a customer registers and signs in')
  const customer = await authApi.signUp({
    name: 'Aisha Al-Harthy', email: 'aisha@example.com',
    phone: '+968 9123 4567', wilayahId: 'muscat', role: 'customer',
  })
  const cred = await createCredential({
    userId: customer.id, role: 'customer',
    email: 'aisha@example.com', phone: '+968 9123 4567', password: 'pilgrim-pass-1',
  })
  state = reducer(state, { type: 'addCredential', credential: cred })
  state = reducer(state, { type: 'registerUser', user: customer })

  const found = findCredential(state.credentials, '91234567', 'customer')
  check('signing in by phone finds the account', !!found)
  check('the right password is accepted', await verifyPassword(found!, 'pilgrim-pass-1'))
  check('a wrong password is refused', !(await verifyPassword(found!, 'pilgrim-pass-2')))
  state = reducer(state, { type: 'signIn', user: customer })

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
  check('credentials survive', restored.credentials.length === 2)
  check('no password is anywhere in what is stored',
    !JSON.stringify(saved).includes('pilgrim-pass-1') &&
      !JSON.stringify(saved).includes('owner-pass-2026'))

  const out = reducer(restored, { type: 'signOut' })
  check('signing out clears the person', out.user === null)
  check('but not the platform', catalogue(out).campaigns.length === 1 && out.credentials.length === 2)

  console.log(failures === 0
    ? '\nEVERY JOURNEY COMPLETED'
    : `\n${failures} STEP(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
