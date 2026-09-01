import { useCallback, useMemo } from 'react'
import type { Campaign, Provider } from '@/types'
import { CAMPAIGNS } from '@/data/campaigns'
import { PROVIDERS } from '@/data/providers'
import { useStore } from '@/store/AppStore'

/**
 * The catalogue as the session currently sees it: the seed data plus anything
 * a campaign owner added or an owner who registered this session, minus
 * anything they deleted, with the admin's decisions on top.
 *
 * Every page reads campaigns and providers through this hook, so an owner
 * publishing a trip or an admin verifying a company is immediately visible
 * across the whole app — that end-to-end effect is the point of the prototype.
 *
 * Two campaign lists come back, and the difference matters:
 *
 *   - `campaigns` is what the public sees. A trip the admin has taken down is
 *     absent from it, which is what taking something down means.
 *   - `adminCampaigns` is everything, takedowns included, because the one
 *     screen that must still show a suspended trip is the screen with the
 *     button to restore it.
 *
 * Reading the wrong one on a public page would quietly undo moderation, so
 * the admin list is named to be hard to reach for by accident.
 */
export function useCatalogue() {
  const {
    sessionProviders,
    providerCampaigns,
    hiddenCampaignIds,
    verificationOverrides,
    campaignSuspensions,
    featureOverrides,
    remoteReady,
    remoteProviders,
    remoteCampaigns,
  } = useStore()

  /**
   * Everything that exists, with the admin's featured decisions applied.
   *
   * With a database configured, the server's answer is used whole: `featured`
   * and `suspended` are real columns there, decided by an administrator and
   * visible to everyone, so the local override maps are not consulted at all.
   * Laying them on top would let one browser's stale opinion outrank the
   * platform's — the exact bug this move was meant to end.
   *
   * Without a database, the original behaviour is unchanged: seed data plus
   * whatever this session published, with local overrides applied.
   */
  const adminCampaigns = useMemo<Campaign[]>(() => {
    if (remoteReady) return remoteCampaigns

    const hidden = new Set(hiddenCampaignIds)
    const sessionIds = new Set(providerCampaigns.map((c) => c.id))
    return [
      ...providerCampaigns,
      ...CAMPAIGNS.filter((c) => !hidden.has(c.id) && !sessionIds.has(c.id)),
    ].map((c) =>
      // An admin decision wins over the campaign's own flag; absent one, the
      // campaign keeps whatever it was published with.
      c.id in featureOverrides ? { ...c, featured: featureOverrides[c.id] } : c,
    )
  }, [remoteReady, remoteCampaigns, providerCampaigns, hiddenCampaignIds, featureOverrides])

  const suspended = useMemo(() => new Set(campaignSuspensions), [campaignSuspensions])

  /*
   * The public list.
   *
   * Against a database, a suspended trip never reaches the client at all — the
   * `campaigns_read` policy withholds it from everyone but its owner and an
   * administrator. So the only filtering left to do here is for the owner's own
   * view, and `adminCampaigns` is already the right list for the screens that
   * need to see a takedown in order to undo it.
   */
  const campaigns = useMemo<Campaign[]>(
    () => (remoteReady ? adminCampaigns : adminCampaigns.filter((c) => !suspended.has(c.id))),
    [remoteReady, adminCampaigns, suspended],
  )

  const providers = useMemo<Provider[]>(() => {
    if (remoteReady) return remoteProviders
    return [...sessionProviders, ...PROVIDERS].map((p) =>
      verificationOverrides[p.id] ? { ...p, verification: verificationOverrides[p.id] } : p,
    )
  }, [remoteReady, remoteProviders, sessionProviders, verificationOverrides])

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

  /** True when the admin has taken a trip down. */
  const isSuspended = useCallback((id: string) => suspended.has(id), [suspended])

  return {
    campaigns,
    adminCampaigns,
    providers,
    getCampaign,
    getProvider,
    campaignsOf,
    isSuspended,
  }
}
