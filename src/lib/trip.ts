import type { Campaign } from '@/types'

/**
 * Trip length in days, counting the travel days at both ends.
 *
 * Lives here rather than beside `CampaignCard` because a module that exports
 * both components and plain functions cannot be hot-reloaded by React Fast
 * Refresh — every edit to the card would force a full page reload.
 */
export function tripDays(campaign: Campaign): number {
  const ms =
    new Date(campaign.returnDate).getTime() - new Date(campaign.departureDate).getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}
