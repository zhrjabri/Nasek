/*
 * Verification harness for the owner-registration flow.
 *
 * Exercises the parts that run without a DOM: the registration API and the
 * store reducer. The licence upload itself needs a browser (canvas), so it is
 * simulated with a stand-in data URL.
 */
import { authApi } from '@/services/api/auth'
import { verifyAdminPassphrase } from '@/admin/access'
import {
  createCredential,
  findCredential,
  lockRemainingMs,
  verifyPassword,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
} from '@/services/api/credentials'
import { buildDirectory } from '@/data/users'
import { emptyState, reducer } from '@/store/AppStore'
import type { Booking, Campaign } from '@/types'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

const FAKE_LICENCE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

const main = async () => {
  // ---------------------------------------------------------- registration
  const { user, provider } = await authApi.registerProvider({
    name: 'Test Owner',
    email: 'owner@example.com',
    phone: '+968 9111 2222',
    wilayahId: 'nizwa',
    companyName: 'Test Campaign Co',
    tagline: 'A test tagline',
    experienceYears: 7,
    licenceImage: FAKE_LICENCE,
    licenceFileName: 'permit.jpg',
  })

  check('registration returns a provider role', user.role === 'provider', user.role)
  check('user is linked to the company', user.providerId === provider.id, `${user.providerId} / ${provider.id}`)
  check('company starts pending verification', provider.verification === 'pending', provider.verification)
  check('licence is carried onto the company', provider.licenceImage === FAKE_LICENCE)
  check('licence file name is kept', provider.licenceFileName === 'permit.jpg', provider.licenceFileName)
  check('experience years survive', provider.experienceYears === 7, String(provider.experienceYears))
  check('new company has no rating yet', provider.rating === 0 && provider.reviewCount === 0)
  check('initials derived from the name', provider.initials === 'T', provider.initials)

  // --------------------------------------------------------------- reducer
  let state = reducer(emptyState, { type: 'addProvider', provider })
  check('addProvider stores the company', state.sessionProviders.length === 1)

  state = reducer(state, { type: 'signIn', user })
  check('signIn keeps the company', state.sessionProviders.length === 1)
  check('signIn sets the user', state.user?.id === user.id)

  const trip = { id: 'c-test', providerId: provider.id, price: 100 } as unknown as Campaign
  state = reducer(state, { type: 'upsertCampaign', campaign: trip })
  check('owner can publish a trip', state.providerCampaigns.length === 1)

  // The regression this whole flow depends on: switching to the admin
  // account must not wipe the company waiting to be verified.
  state = reducer(state, { type: 'signOut' })
  check('signOut clears the person', state.user === null)
  check('signOut KEEPS the registered company', state.sessionProviders.length === 1,
    `${state.sessionProviders.length} left`)
  check('signOut KEEPS published trips', state.providerCampaigns.length === 1,
    `${state.providerCampaigns.length} left`)

  state = reducer(state, { type: 'setVerification', providerId: provider.id, status: 'verified' })
  check('admin decision recorded', state.verificationOverrides[provider.id] === 'verified')

  state = reducer(state, { type: 'signOut' })
  check('verification survives another sign-out', state.verificationOverrides[provider.id] === 'verified')

  // ------------------------------------------------- legacy stored state
  // A visitor from before a slice existed has it missing from localStorage;
  // hydrating that raw would leave it undefined and throw on first render.
  const legacy = { user: null, savedIds: [], bookings: [], notifications: [] }
  const hydrated = reducer(emptyState, { type: 'hydrate', state: legacy as never })
  check(
    'hydrate fills in slices missing from old storage',
    Array.isArray(hydrated.sessionProviders) && Array.isArray(hydrated.providerCampaigns),
    `sessionProviders=${JSON.stringify(hydrated.sessionProviders)}`,
  )
  check('hydrate keeps what was stored', hydrated.user === null)

  // --------------------------------------------------- account directory
  // The seeded catalogue is deliberately empty, so the booking history the
  // directory reconstructs customers from is written here rather than
  // imported.
  const historic = (userId: string, price: number, day: string, cancelled = false): Booking => ({
    id: `vb-${userId}-${day}`,
    reference: `NSK-${day}`,
    userId,
    campaignId: 'c-verify',
    travellers: [],
    travellersCount: 1,
    contactName: 'Historic Pilgrim',
    contactPhone: '+968 9333 4444',
    contactEmail: 'pilgrim@example.com',
    totalPrice: price,
    status: cancelled ? 'cancelled' : 'completed',
    bookingDate: day,
    notes: 'nizwa',
  })

  const history = [
    historic('u500', 400, '2026-03-01'),
    historic('u500', 250, '2026-01-05'),
    historic('u500', 900, '2026-02-02', true),
    historic('u900', 700, '2026-04-09'),
  ]

  const registered = await authApi.signUp({
    name: 'Registered Customer',
    email: 'customer@example.com',
    phone: '+968 9555 6666',
    wilayahId: 'sohar',
    role: 'customer',
  })

  const directory = buildDirectory([provider], history, [registered])

  const owner = directory.find((u) => u.providerId === provider.id)
  check('owner appears in the directory', !!owner, owner?.name)
  check('owner carries the company contact details', owner?.email === 'owner@example.com')

  const signedUp = directory.find((u) => u.id === registered.id)
  check('a customer who registered is listed before booking anything', !!signedUp)
  check('registered customer starts with no trips', signedUp?.bookings === 0)

  const booker = directory.find((u) => u.id === 'u500')
  check('customers are reconstructed from booking history', !!booker)
  check('one row per person, not one per booking', booker?.bookings === 3, `${booker?.bookings} trips`)
  check('cancelled trips do not count towards spend', booker?.spend === 650, String(booker?.spend))
  check('join date is the earliest booking', booker?.joinedAt === '2026-01-05', booker?.joinedAt)
  check(
    'every account appears once',
    new Set(directory.map((u) => u.id)).size === directory.length,
    `${directory.length} rows`,
  )
  check(
    'an owner is not listed twice when their own login is registered too',
    buildDirectory([provider], [], [user]).filter((u) => u.providerId === provider.id).length === 1,
  )

  state = reducer(state, { type: 'setUserSuspended', userId: 'u500', suspended: true })
  check('suspension recorded', state.suspendedUserIds.includes('u500'))
  state = reducer(state, { type: 'setUserSuspended', userId: 'u500', suspended: true })
  check('suspending twice does not duplicate', state.suspendedUserIds.length === 1)
  state = reducer(state, { type: 'setUserSuspended', userId: 'u500', suspended: false })
  check('reactivation clears it', state.suspendedUserIds.length === 0)

  state = reducer(state, { type: 'setUserSuspended', userId: 'u500', suspended: true })
  state = reducer(state, { type: 'removeUser', userId: 'u500' })
  check('removal recorded', state.removedUserIds.includes('u500'))
  check('removal clears the suspension', state.suspendedUserIds.length === 0)

  state = reducer(state, { type: 'registerUser', user: registered })
  check('registration is recorded for the directory', state.sessionUsers.length === 1)
  state = reducer(state, { type: 'registerUser', user: registered })
  check('registering the same person twice does not duplicate', state.sessionUsers.length === 1)

  state = reducer(state, { type: 'signOut' })
  check('account decisions survive sign-out', state.removedUserIds.includes('u500'))
  check('registered accounts survive sign-out', state.sessionUsers.length === 1)

  state = reducer(state, { type: 'restoreUser', userId: 'u500' })
  check('restore undoes removal', state.removedUserIds.length === 0)
  check(
    'removing an account leaves the bookings behind it alone',
    buildDirectory([provider], history, []).some((u) => u.id === 'u500'),
  )

  // ------------------------------------------------------- credentials
  const cred = await createCredential({
    userId: registered.id,
    role: 'customer',
    email: '  Customer@Example.COM ',
    phone: '+968 9555 6666',
    password: 'correct horse battery',
  })

  check('the password is not stored anywhere in the credential',
    !JSON.stringify(cred).includes('correct horse battery'))
  check('a salt is generated', cred.salt.length === 32, `${cred.salt.length} hex chars`)
  check('the hash is not the password', cred.hash !== 'correct horse battery')
  check('the right password verifies', (await verifyPassword(cred, 'correct horse battery')) === true)
  check('a wrong password is refused', (await verifyPassword(cred, 'correct horse batteru')) === false)
  check('an empty password is refused', (await verifyPassword(cred, '')) === false)

  const twin = await createCredential({
    userId: 'u-other',
    role: 'customer',
    email: 'other@example.com',
    phone: '+968 9000 0000',
    password: 'correct horse battery',
  })
  check('the same password hashes differently for two accounts', twin.hash !== cred.hash)

  check('email lookup ignores case and spaces',
    !!findCredential([cred], 'CUSTOMER@example.com ', 'customer'))
  check('phone lookup ignores formatting',
    !!findCredential([cred], '95556666', 'customer'))
  check('phone lookup accepts the country code',
    !!findCredential([cred], '+968 9555 6666', 'customer'))
  check('an owner credential is not found by a customer sign-in',
    !findCredential([{ ...cred, role: 'provider' }], 'customer@example.com', 'customer'))
  check('an unknown identifier finds nothing',
    !findCredential([cred], 'nobody@example.com', 'customer'))

  // ---------------------------------------------------------- lockout
  let locked = emptyState
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
    locked = reducer(locked, { type: 'signInFailed', key: 'a@b.com', now: 1_000 })
  }
  check('short of the limit, the account still answers',
    lockRemainingMs(locked.lockouts['a@b.com'], 1_000) === 0,
    `${locked.lockouts['a@b.com'].fails} fails`)

  locked = reducer(locked, { type: 'signInFailed', key: 'a@b.com', now: 1_000 })
  check('the limit locks the account', lockRemainingMs(locked.lockouts['a@b.com'], 1_000) > 0)
  check('the lock expires on its own',
    lockRemainingMs(locked.lockouts['a@b.com'], 1_000 + LOCKOUT_MS + 1) === 0)
  check('one account locking does not lock another',
    lockRemainingMs(locked.lockouts['someone@else.com'], 1_000) === 0)

  const persisted = reducer(emptyState, { type: 'hydrate', state: locked })
  check('a lock survives a reload',
    lockRemainingMs(persisted.lockouts['a@b.com'], 1_000) > 0)

  locked = reducer(locked, { type: 'signInSucceeded', key: 'a@b.com' })
  check('a successful sign-in clears the failures', !locked.lockouts['a@b.com'])

  const stored = reducer(emptyState, { type: 'addCredential', credential: cred })
  check('the credential is stored', stored.credentials.length === 1)
  const replaced = reducer(stored, { type: 'addCredential', credential: cred })
  check('re-registering replaces rather than duplicates', replaced.credentials.length === 1)
  check('credentials survive sign-out',
    reducer(stored, { type: 'signOut' }).credentials.length === 1)

  // ------------------------------------------------------- admin gate
  // The real passphrase is deliberately absent from this repository, so what
  // can be checked here is the half that matters for safety: that the gate
  // turns away everything else. Confirming the phrase you chose still works
  // is a matter of using it once.
  check('admin gate rejects an empty passphrase', (await verifyAdminPassphrase('')) === false)
  check('admin gate rejects whitespace', (await verifyAdminPassphrase('   ')) === false)
  check('admin gate rejects a guess', (await verifyAdminPassphrase('admin')) === false)
  check('admin gate rejects the role name', (await verifyAdminPassphrase('nasek')) === false)
  // The phrase this replaced was short and predictable, and its hash is in
  // the repository's history for anyone to read. It must not still open the
  // door.
  check('the retired passphrase no longer opens the gate',
    (await verifyAdminPassphrase('nasek-admin-2026')) === false)

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
