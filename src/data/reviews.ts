import type { Review } from '@/types'

/** Customer reviews. Empty — the sample reviews were removed with the
    campaigns they described. */
export const REVIEWS: Review[] = []

export const reviewsForCampaign = (campaignId: string) =>
  REVIEWS.filter((r) => r.campaignId === campaignId)

export const reviewsForProvider = (providerId: string) =>
  REVIEWS.filter((r) => r.providerId === providerId)
