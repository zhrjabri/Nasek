import type { SearchFilters, ServiceKey, SortKey } from '@/types'
import { defaultFilters } from '@/services/api/campaigns'

/**
 * Filters live in the URL.
 *
 * A pilgrim comparing options will send a link to a family member; a campaign
 * owner will bookmark their own listing view. Keeping the whole search state
 * in the query string makes both work, and makes the back button behave.
 * Only non-default values are written, so shared URLs stay readable.
 */
export function encodeFilters(f: SearchFilters, sort?: SortKey): string {
  const d = defaultFilters()
  const p = new URLSearchParams()

  if (f.query.trim()) p.set('q', f.query.trim())
  if (f.type !== d.type) p.set('type', f.type)
  if (f.wilayahIds.length) p.set('w', f.wilayahIds.join(','))
  if (f.priceMin !== d.priceMin) p.set('min', String(f.priceMin))
  if (f.priceMax !== d.priceMax) p.set('max', String(f.priceMax))
  if (f.travelMethod !== d.travelMethod) p.set('via', f.travelMethod)
  if (f.dateFrom) p.set('from', f.dateFrom)
  if (f.dateTo) p.set('to', f.dateTo)
  if (f.minRating) p.set('rating', String(f.minRating))
  if (f.minSeats) p.set('seats', String(f.minSeats))
  if (f.services.length) p.set('svc', f.services.join(','))
  if (f.travellers !== d.travellers) p.set('pax', String(f.travellers))
  if (sort && sort !== 'recommended') p.set('sort', sort)

  return p.toString()
}

export function decodeFilters(params: URLSearchParams): {
  filters: SearchFilters
  sort: SortKey
} {
  const d = defaultFilters()
  const num = (key: string, fallback: number) => {
    const raw = params.get(key)
    const parsed = raw == null ? NaN : Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const type = params.get('type')
  const via = params.get('via')
  const sortParam = params.get('sort')
  const VALID_SORTS: SortKey[] = ['recommended', 'price_asc', 'price_desc', 'rating', 'popular', 'seats']

  return {
    filters: {
      query: params.get('q') ?? '',
      type: type === 'hajj' || type === 'umrah' ? type : 'all',
      wilayahIds: params.get('w')?.split(',').filter(Boolean) ?? [],
      priceMin: num('min', d.priceMin),
      priceMax: num('max', d.priceMax),
      travelMethod: via === 'air' || via === 'land' ? via : 'all',
      dateFrom: params.get('from'),
      dateTo: params.get('to'),
      minRating: num('rating', 0),
      minSeats: num('seats', 0),
      services: (params.get('svc')?.split(',').filter(Boolean) ?? []) as ServiceKey[],
      travellers: num('pax', 1),
    },
    sort: VALID_SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : 'recommended',
  }
}
