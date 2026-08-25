/*
 * Verification harness for the owner-registration flow.
 *
 * Exercises the parts that run without a DOM: the registration API and the
 * store reducer. The licence upload itself needs a browser (canvas), so it is
 * simulated with a stand-in data URL.
 */
import { authApi } from '@/services/api/auth'
import { emptyState, reducer } from '@/store/AppStore'
import type { Campaign } from '@/types'

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

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
