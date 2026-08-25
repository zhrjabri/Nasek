import { useCallback, useMemo } from 'react'
import type { Campaign, Provider } from '@/types'
import { CAMPAIGNS } from '@/data/campaigns'
import { PROVIDERS } from '@/data/providers'
import { useStore } from '@/store/AppStore'

/**
 * The catalogue as the session currently sees it: the seed data plus anything
 * a campaign owner added, minus anything they deleted, with the admin's
 * verification decisions applied on top.
 *
 * Every page reads campaigns and providers through this hook, so an owner
 * publishing a trip or an admin verifying a company is immediately visible
 * across the whole app — that end-to-end effect is the point of the prototype.
 */
export function useCatalogue() {
  const { providerCampaigns, hiddenCampaignIds, verificationOverrides } = useStore()

  const campaigns = useMemo<Campaign[]>(() => {
    const hidden = new Set(hiddenCampaignIds)
    const sessionIds = new Set(providerCampaigns.map((c) => c.id))
    return [
      ...providerCampaigns,
      ...CAMPAIGNS.filter((c) => !hidden.has(c.id) && !sessionIds.has(c.id)),
    ]
  }, [providerCampaigns, hiddenCampaignIds])

  const providers = useMemo<Provider[]>(
    () =>
      PROVIDERS.map((p) =>
        verificationOverrides[p.id]
          ? { ...p, verification: verificationOverrides[p.id] }
          : p,
      ),
    [verificationOverrides],
  )

  const getCampaign = useCallback(
    (id: string) => campaigns.find((c) => c.id === id),
    [campaigns],
  )

  const getProvider = useCallback(
    (id: string) => providers.find((p) => p.id === id),
    [providers],
  )

  /** Campaigns belonging to one owner — the provider dashboard's whole world. */
  const campaignsOf = useCallback(
    (providerId: string) => campaigns.filter((c) => c.providerId === providerId),
    [campaigns],
  )

  return { campaigns, providers, getCampaign, getProvider, campaignsOf }
}
