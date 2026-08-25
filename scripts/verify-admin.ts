/*
 * Verification harness for the administration dashboard.
 *
 * The dashboard's controls are only worth having if they reach the public
 * site, so these checks follow each decision out of the reducer and into what
 * a pilgrim would see. The tabs themselves need a DOM and are not covered
 * here; the decisions behind them are.
 */
import type { Campaign, Provider } from '@/types'
import { applyFilters, defaultFilters } from '@/services/api/campaigns'
import { emptyState, reducer } from '@/store/AppStore'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

const trip = (id: string, featured = false): Campaign =>
  ({
    id,
    providerId: 'p1',
    type: 'umrah',
    title: { ar: id, en: id },
    description: { ar: '', en: '' },
    price: 400,
    wilayahId: 'muscat',
    travelMethod: 'air',
    departureDate: '2027-03-01',
    returnDate: '2027-03-12',
    seatsTotal: 40,
    seatsAvailable: 12,
    services: [],
    hotelMakkah: { ar: '', en: '' },
    hotelMadinah: { ar: '', en: '' },
    haramDistanceM: 300,
    rating: 4.5,
    reviewCount: 10,
    featured,
    bookingsCount: 5,
  }) as Campaign

/**
 * Mirrors the two lists `useCatalogue` derives, so a decision can be followed
 * all the way to what the public sees without needing React.
 */
function catalogue(state: ReturnType<typeof reducer>) {
  const hidden = new Set(state.hiddenCampaignIds)
  const adminCampaigns = state.providerCampaigns
    .filter((c) => !hidden.has(c.id))
    .map((c) => (c.id in state.featureOverrides ? { ...c, featured: state.featureOverrides[c.id] } : c))
  const suspended = new Set(state.campaignSuspensions)
  return {
    adminCampaigns,
    publicCampaigns: adminCampaigns.filter((c) => !suspended.has(c.id)),
  }
}

const main = () => {
  let state = reducer(emptyState, { type: 'upsertCampaign', campaign: trip('c1') })
  state = reducer(state, { type: 'upsertCampaign', campaign: trip('c2', true) })

  // --------------------------------------------------------- suspension
  console.log('\n--- suspending a campaign ---')
  check('both trips start public', catalogue(state).publicCampaigns.length === 2)

  state = reducer(state, { type: 'setCampaignSuspended', campaignId: 'c1', suspended: true })
  const afterSuspend = catalogue(state)
  check('a suspended trip leaves the public catalogue',
    !afterSuspend.publicCampaigns.some((c) => c.id === 'c1'),
    `${afterSuspend.publicCampaigns.length} public`)
  check('but stays on the admin list, where the restore button is',
    afterSuspend.adminCampaigns.some((c) => c.id === 'c1'))

  state = reducer(state, { type: 'setCampaignSuspended', campaignId: 'c1', suspended: true })
  check('suspending twice does not duplicate', state.campaignSuspensions.length === 1)

  state = reducer(state, { type: 'signOut' })
  check('a suspension outlives the admin session', state.campaignSuspensions.includes('c1'))
  check('and still hides the trip after signing out',
    !catalogue(state).publicCampaigns.some((c) => c.id === 'c1'))

  state = reducer(state, { type: 'setCampaignSuspended', campaignId: 'c1', suspended: false })
  check('restoring puts it back', catalogue(state).publicCampaigns.length === 2)

  // ----------------------------------------------------------- featuring
  console.log('\n--- featuring ---')
  state = reducer(state, { type: 'setCampaignFeatured', campaignId: 'c1', featured: true })
  check('featuring is applied to the campaign',
    catalogue(state).publicCampaigns.find((c) => c.id === 'c1')?.featured === true)

  state = reducer(state, { type: 'setCampaignFeatured', campaignId: 'c2', featured: false })
  check('the admin can also UNfeature a trip published as featured',
    catalogue(state).publicCampaigns.find((c) => c.id === 'c2')?.featured === false)

  state = reducer(state, { type: 'signOut' })
  check('featured decisions outlive the session',
    catalogue(state).publicCampaigns.find((c) => c.id === 'c1')?.featured === true)

  // An owner republishing must not quietly undo a moderation decision.
  console.log('\n--- an owner cannot undo moderation ---')
  state = reducer(state, { type: 'setCampaignSuspended', campaignId: 'c1', suspended: true })
  state = reducer(state, { type: 'upsertCampaign', campaign: trip('c1') })
  check('republishing a suspended trip leaves it suspended',
    !catalogue(state).publicCampaigns.some((c) => c.id === 'c1'))

  // ------------------------------------------------------------- reviews
  console.log('\n--- review moderation ---')
  let reviews = reducer(emptyState, { type: 'setReviewHidden', reviewId: 'r1', hidden: true })
  check('hiding a review is recorded', reviews.hiddenReviewIds.includes('r1'))
  reviews = reducer(reviews, { type: 'setReviewHidden', reviewId: 'r1', hidden: true })
  check('hiding twice does not duplicate', reviews.hiddenReviewIds.length === 1)
  reviews = reducer(reviews, { type: 'signOut' })
  check('hidden reviews survive sign-out', reviews.hiddenReviewIds.includes('r1'))
  reviews = reducer(reviews, { type: 'setReviewHidden', reviewId: 'r1', hidden: false })
  check('showing it again clears the record', reviews.hiddenReviewIds.length === 0)

  // ------------------------------------------------------- verification
  console.log('\n--- owner verification ---')
  const owner = { id: 'p1', verification: 'pending' } as Provider
  let verified = reducer(emptyState, { type: 'setVerification', providerId: owner.id, status: 'verified' })
  check('verifying is recorded', verified.verificationOverrides.p1 === 'verified')
  verified = reducer(verified, { type: 'setVerification', providerId: owner.id, status: 'pending' })
  check('an admin can withdraw verification', verified.verificationOverrides.p1 === 'pending')

  // ------------------------------------- a published trip must be findable
  // Every trip on NASEK is one an owner published, so anything that quietly
  // drops one is the difference between having a catalogue and not.
  const company = { id: 'p1', name: { ar: 'شركة', en: 'Test Co' } } as Provider
  const published = [trip('c1'), { ...trip('c2'), price: 4200 }]
  const f = defaultFilters()

  check('a published trip survives untouched filters',
    applyFilters(published, f, [company]).length === 2,
    `${applyFilters(published, f, [company]).length} of 2`)
  check('a trip dearer than the price slider is not silently dropped',
    applyFilters(published, f, [company]).some((c) => c.price === 4200))
  check('a price the pilgrim actually set still filters',
    applyFilters(published, { ...f, priceMax: 1000 }, [company]).length === 1)
  check('a trip is findable by its own title',
    applyFilters(published, { ...f, query: 'c1' }, [company]).length === 1)
  check('a trip is findable by the company that runs it',
    applyFilters(published, { ...f, query: 'Test Co' }, [company]).length === 2)

  // ------------------------------------------------------------- legacy
  // Stored state written before these slices existed must not crash a
  // returning admin.
  const legacy = { user: null, savedIds: [], bookings: [], notifications: [] }
  const hydrated = reducer(emptyState, { type: 'hydrate', state: legacy as never })
  check('old stored state gains the new slices',
    Array.isArray(hydrated.campaignSuspensions) &&
      Array.isArray(hydrated.hiddenReviewIds) &&
      typeof hydrated.featureOverrides === 'object')

  console.log(failures === 0 ? '\nALL ADMIN CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

main()
