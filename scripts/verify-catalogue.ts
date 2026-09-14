/*
 * Verification harness for the live catalogue.
 *
 * NASEK ships with no seeded trips: every campaign on the site was published
 * by an owner during a session. Anything that reads `data/campaigns.ts` or
 * `data/providers.ts` therefore sees an empty world, and the failure is silent
 * — no error, just a feature that quietly does nothing. These checks pin down
 * the places that used to.
 */
import type { Campaign, Provider } from '@/types'
import type { SmartMatchInput } from '@/services/ai/types'
import { applyFilters, applySort, defaultFilters } from '@/services/api/campaigns'
import { scoreCampaigns } from '@/services/ai/smartMatch'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

const owner = (id: string, verified: boolean): Provider =>
  ({
    id,
    name: { ar: 'حملة النور', en: 'Al-Noor Campaigns' },
    tagline: { ar: '', en: '' },
    description: { ar: '', en: '' },
    wilayahId: 'muscat',
    verification: verified ? 'verified' : 'pending',
    experienceYears: 10,
    rating: 4.6,
    reviewCount: 20,
    phone: '+968 9111 2222',
    email: 'o@example.com',
    initials: 'A',
    brandColor: '#1c5e4c',
    plan: 'basic',
    joinedAt: '2026-01-01',
  }) as Provider

const trip = (id: string, providerId: string, over: Partial<Campaign> = {}): Campaign =>
  ({
    id,
    providerId,
    type: 'umrah',
    title: { ar: 'رحلة عمرة', en: 'Umrah trip' },
    description: { ar: '', en: '' },
    price: 450,
    wilayahId: 'muscat',
    travelMethod: 'air',
    departureDate: '2027-03-01',
    returnDate: '2027-03-12',
    seatsTotal: 40,
    seatsAvailable: 20,
    services: [],
    hotelMakkah: { ar: '', en: '' },
    hotelMadinah: { ar: '', en: '' },
    haramDistanceM: 400,
    rating: 4.5,
    reviewCount: 10,
    featured: false,
    bookingsCount: 5,
    // Approved. This harness is about search and ranking, where approval plays
    // no part — but a fixture that quietly omits it would be one more place a
    // campaign is constructed as though the state did not exist.
    status: 'active',
    departureLocation: '',
    officeNumber: '',
    images: [],
    terms: { ar: '', en: '' },
    ...over,
  }) as Campaign

const main = async () => {
  const verified = owner('p-verified', true)
  const pending = owner('p-pending', false)
  const providers = [verified, pending]

  const fromVerified = trip('c-verified', verified.id)
  const fromPending = trip('c-pending', pending.id)
  const pool = [fromPending, fromVerified]

  // ------------------------------------------------------ recommended sort
  console.log('\n--- the "recommended" ranking ---')
  const ranked = applySort(pool, 'recommended', providers)
  check('a verified owner outranks an unverified one',
    ranked[0].id === 'c-verified', `${ranked[0].id} first`)
  check('without the owner list nothing crashes, it just cannot tell them apart',
    applySort(pool, 'recommended').length === 2)

  // ------------------------------------------------------------- searching
  console.log('\n--- searching ---')
  const f = defaultFilters()
  check('a trip is findable by its owner in English',
    applyFilters(pool, { ...f, query: 'Al-Noor' }, providers).length === 2)
  check('a trip is findable by its owner in Arabic',
    applyFilters(pool, { ...f, query: 'النور' }, providers).length === 2)

  // ----------------------------------------------------------- smart match
  console.log('\n--- smart match ---')
  const wanted: SmartMatchInput = {
    type: 'umrah',
    wilayahId: 'muscat',
    budget: 600,
    season: 'any',
    travelMethod: 'any',
    services: [],
    travellers: 1,
  }
  const matched = scoreCampaigns(wanted, 'en', pool, providers)
  check('every trip is scored', matched.length === 2, `${matched.length}`)
  const scoreOf = (id: string) => matched.find((m) => m.campaign.id === id)?.score ?? 0
  check('a verified owner scores higher than an identical unverified one',
    scoreOf('c-verified') > scoreOf('c-pending'),
    `verified ${scoreOf('c-verified')} vs pending ${scoreOf('c-pending')}`)

  const blind = scoreCampaigns(wanted, 'en', pool)
  check('without the owner list the two are indistinguishable — the old behaviour',
    (blind.find((m) => m.campaign.id === 'c-verified')?.score ?? 0) ===
      (blind.find((m) => m.campaign.id === 'c-pending')?.score ?? 0))

  console.log(failures === 0 ? '\nALL CATALOGUE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures > 0) process.exitCode = 1
}

void main()
