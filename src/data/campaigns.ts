import type { Campaign } from '@/types'

/**
 * The campaign catalogue. Deliberately empty — the seeded sample trips were
 * removed, so the site starts with nothing listed and fills up from campaigns
 * that owners publish through the provider dashboard.
 */
export const CAMPAIGNS: Campaign[] = []

/**
 * Bounds for the price sliders. With an empty catalogue Math.min/max over no
 * arguments return Infinity and -Infinity, which would leave every range
 * control unusable — and a provider can still publish a trip during the
 * session, so the range has to stay sane rather than collapse to zero.
 */
const SEED_PRICES = CAMPAIGNS.map((c) => c.price)
export const PRICE_FLOOR = SEED_PRICES.length ? Math.min(...SEED_PRICES) : 0
export const PRICE_CEILING = SEED_PRICES.length ? Math.max(...SEED_PRICES) : 3000
