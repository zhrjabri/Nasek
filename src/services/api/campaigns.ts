import type { Campaign, SearchFilters, SortKey } from '@/types'
import { CAMPAIGNS, PRICE_CEILING, PRICE_FLOOR } from '@/data/campaigns'
import { providerById } from '@/data/providers'
import { request } from './client'

export const defaultFilters = (): SearchFilters => ({
  query: '',
  type: 'all',
  wilayahIds: [],
  priceMin: PRICE_FLOOR,
  priceMax: PRICE_CEILING,
  travelMethod: 'all',
  dateFrom: null,
  dateTo: null,
  minRating: 0,
  minSeats: 0,
  services: [],
  travellers: 1,
})

/** True when the filter set is untouched — used to decide whether to show "clear all". */
export function countActiveFilters(f: SearchFilters): number {
  const d = defaultFilters()
  let n = 0
  if (f.type !== d.type) n++
  if (f.wilayahIds.length) n++
  if (f.priceMin !== d.priceMin || f.priceMax !== d.priceMax) n++
  if (f.travelMethod !== d.travelMethod) n++
  if (f.dateFrom || f.dateTo) n++
  if (f.minRating > 0) n++
  if (f.minSeats > 0) n++
  if (f.services.length) n++
  return n
}

/** Free-text match across title, description, provider name and wilayah. */
function matchesQuery(campaign: Campaign, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  const provider = providerById(campaign.providerId)
  const haystack = [
    campaign.title.ar,
    campaign.title.en,
    campaign.description.ar,
    campaign.description.en,
    provider?.name.ar,
    provider?.name.en,
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

export function applyFilters(campaigns: Campaign[], f: SearchFilters): Campaign[] {
  return campaigns.filter((c) => {
    if (f.type !== 'all' && c.type !== f.type) return false
    if (f.wilayahIds.length && !f.wilayahIds.includes(c.wilayahId)) return false
    if (c.price < f.priceMin || c.price > f.priceMax) return false
    if (f.travelMethod !== 'all' && c.travelMethod !== f.travelMethod) return false
    if (f.dateFrom && c.departureDate < f.dateFrom) return false
    if (f.dateTo && c.departureDate > f.dateTo) return false
    if (f.minRating && c.rating < f.minRating) return false
    if (f.minSeats && c.seatsAvailable < f.minSeats) return false
    if (f.services.length && !f.services.every((s) => c.services.includes(s))) return false
    if (!matchesQuery(c, f.query)) return false
    return true
  })
}

/**
 * "Recommended" is the platform's own ranking, and it is worth being explicit
 * about what it rewards: verified owners, strong ratings, seats that are
 * genuinely available, and featured placement. It deliberately does not
 * reward paying for promotion alone.
 */
function recommendedScore(c: Campaign): number {
  const provider = providerById(c.providerId)
  const verified = provider?.verification === 'verified' ? 12 : 0
  const featured = c.featured ? 8 : 0
  const rating = (c.rating - 4) * 20
  const availability = Math.min(10, (c.seatsAvailable / c.seatsTotal) * 14)
  const popularity = Math.min(10, c.bookingsCount / 32)
  return verified + featured + rating + availability + popularity
}

export function applySort(campaigns: Campaign[], sort: SortKey): Campaign[] {
  const out = campaigns.slice()
  switch (sort) {
    case 'price_asc':
      return out.sort((a, b) => a.price - b.price)
    case 'price_desc':
      return out.sort((a, b) => b.price - a.price)
    case 'rating':
      return out.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
    case 'popular':
      return out.sort((a, b) => b.bookingsCount - a.bookingsCount)
    case 'seats':
      return out.sort((a, b) => b.seatsAvailable - a.seatsAvailable)
    case 'recommended':
    default:
      return out.sort((a, b) => recommendedScore(b) - recommendedScore(a))
  }
}

export const campaignsApi = {
  /** All campaigns, including any the demo provider added this session. */
  list: (extra: Campaign[] = []) =>
    request(() => [...extra, ...CAMPAIGNS]),

  search: (filters: SearchFilters, sort: SortKey, extra: Campaign[] = []) =>
    request(() => applySort(applyFilters([...extra, ...CAMPAIGNS], filters), sort)),

  get: (id: string, extra: Campaign[] = []) =>
    request(() => [...extra, ...CAMPAIGNS].find((c) => c.id === id) ?? null),

  featured: (extra: Campaign[] = []) =>
    request(() =>
      [...extra, ...CAMPAIGNS].filter((c) => c.featured && c.seatsAvailable > 0).slice(0, 6),
    ),

  popular: (extra: Campaign[] = []) =>
    request(() =>
      [...extra, ...CAMPAIGNS].slice().sort((a, b) => b.bookingsCount - a.bookingsCount).slice(0, 4),
    ),

  /** Same type, similar price band, different trip. */
  similar: (campaign: Campaign, extra: Campaign[] = []) =>
    request(() =>
      [...extra, ...CAMPAIGNS]
        .filter((c) => c.id !== campaign.id && c.type === campaign.type)
        .sort(
          (a, b) =>
            Math.abs(a.price - campaign.price) - Math.abs(b.price - campaign.price),
        )
        .slice(0, 3),
    ),
}
