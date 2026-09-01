import type { Review } from '@/types'

/**
 * Customer reviews.
 *
 * Empty, and now only the offline fallback's starting point: every screen reads
 * reviews from the store, which `useRemoteData` fills from Postgres. The
 * `reviewsForCampaign` / `reviewsForProvider` helpers that used to live here
 * went with their last callers.
 */
export const REVIEWS: Review[] = []
