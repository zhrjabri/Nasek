import type { Campaign } from '@/types'
import { useI18n } from '@/i18n'
import { Badge } from '@/components/ui'

/**
 * Where a campaign stands, in one word.
 *
 * Shared by the owner's portal and the administration dashboard rather than
 * written twice, because the two screens must never disagree about what a state
 * is called: an owner reading "Under review" while an administrator reads
 * "Draft" for the same row is how a support conversation starts.
 *
 * Suspension outranks approval here, and that ordering is the whole logic of
 * the component. A trip can be `active` *and* suspended — approved once, taken
 * down since — and of those two facts the takedown is the one that explains why
 * it is not on the site. Showing "Live" over a suspended campaign would be
 * true about the approval and wrong about everything the owner wants to know.
 */
export function CampaignStatusBadge({
  campaign,
  suspended,
}: {
  campaign: Pick<Campaign, 'status' | 'suspended'>
  /**
   * The administration list's own view of a takedown, which comes from
   * `isSuspended` rather than the row when no backend is configured. Left out,
   * the row's column is used — which is what every screen with a database does.
   */
  suspended?: boolean
}) {
  const { t } = useI18n()
  const down = suspended ?? campaign.suspended

  if (down) return <Badge tone="amber">{t('campaignStatus.suspended')}</Badge>

  if (campaign.status === 'active') return <Badge tone="green">{t('campaignStatus.active')}</Badge>
  if (campaign.status === 'rejected') {
    return <Badge tone="red">{t('campaignStatus.rejected')}</Badge>
  }
  return <Badge tone="gold">{t('campaignStatus.pending_approval')}</Badge>
}
