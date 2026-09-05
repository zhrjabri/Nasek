import { useMemo } from 'react'
import type { Campaign, CampaignStatus, Provider, VerificationStatus } from '@/types'
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

/** Exactly what `deriveCatalogue` needs — the store slices, and nothing else. */
export interface CatalogueInput {
  remoteReady: boolean
  remoteCampaigns: Campaign[]
  remoteProviders: Provider[]
  sessionProviders: Provider[]
  providerCampaigns: Campaign[]
  hiddenCampaignIds: string[]
  campaignSuspensions: string[]
  featureOverrides: Record<string, boolean>
  verificationOverrides: Record<string, VerificationStatus>
  campaignStatusOverrides: Record<string, CampaignStatus>
}

export interface Catalogue {
  campaigns: Campaign[]
  adminCampaigns: Campaign[]
  providers: Provider[]
  getCampaign: (id: string) => Campaign | undefined
  getProvider: (id: string) => Provider | undefined
  campaignsOf: (providerId: string) => Campaign[]
  isSuspended: (id: string) => boolean
}

/**
 * The whole decision, as a pure function.
 *
 * Split out of the hook so it can be asserted directly rather than mirrored.
 * `npm run verify:wiring` walks both branches — with a database and without —
 * and the alternative was a hand-written copy of these rules inside a harness,
 * which is a copy that drifts silently and then certifies the drift.
 *
 * There are two branches throughout and they are not variations on each other.
 * Against a database, moderation is a column on the row: decided by an
 * administrator, visible to everyone, and true no matter which browser is
 * asking. Without one, it is a decision this session took and remembers. The
 * two are never combined — laying a local override on top of a server row would
 * let one browser's stale opinion outrank the platform's, and leaving a
 * restored trip's id behind in a local list would keep drawing it as suspended
 * after the platform had restored it.
 */
export function deriveCatalogue(input: CatalogueInput): Catalogue {
  const {
    remoteReady,
    remoteCampaigns,
    remoteProviders,
    sessionProviders,
    providerCampaigns,
    hiddenCampaignIds,
    campaignSuspensions,
    featureOverrides,
    verificationOverrides,
    campaignStatusOverrides,
  } = input

  /*
   * Everything that exists, minus what has been withdrawn.
   *
   * With a database, `deleted` is the only thing filtered here. A withdrawn
   * trip still reaches an administrator — `campaigns_read` sends it, because
   * the row has to survive for the bookings that reference it — but there is no
   * screen on which a withdrawn trip belongs, and leaving it in put it back in
   * the owner's own list the moment the snapshot reloaded. Takedowns stay: this
   * is the list the restore button is drawn from.
   */
  const adminCampaigns: Campaign[] = remoteReady
    ? remoteCampaigns.filter((c) => !c.deleted)
    : (() => {
        const hidden = new Set(hiddenCampaignIds)
        const sessionIds = new Set(providerCampaigns.map((c) => c.id))
        return [
          ...providerCampaigns,
          ...CAMPAIGNS.filter((c) => !hidden.has(c.id) && !sessionIds.has(c.id)),
        ].map((c) => {
          // An admin decision wins over the campaign's own flag; absent one, the
          // campaign keeps whatever it was published with. The same rule now
          // applies to approval, which is why both overrides are read here and
          // neither is read on the remote branch.
          const featured = c.id in featureOverrides ? featureOverrides[c.id] : c.featured
          const status = campaignStatusOverrides[c.id] ?? c.status
          return featured === c.featured && status === c.status ? c : { ...c, featured, status }
        })
      })()

  const locallySuspended = new Set(campaignSuspensions)

  /*
   * The public list.
   *
   * `c.suspended` is the column, and reading it here is the correction. The
   * policy withholds another company's suspended trip from a stranger, but it
   * deliberately still sends an owner their own and an administrator everyone's
   * — so on the public site those two people, and only those two, were shown
   * trips that had been taken down.
   *
   * `status === 'active'` is the same argument applied to approval, and it has
   * to be made here as well as in Postgres for exactly the same reason.
   * `campaigns_read` cannot filter it away: it serves three audiences from one
   * predicate, and an owner has to receive their own pending and refused trips
   * or their dashboard could not show them. So the policy decides who may see a
   * row at all, and this decides which of those rows belong on a public page —
   * without it, an owner browsing the catalogue would find their own unapproved
   * trip listed, and an administrator would find everybody's.
   */
  const campaigns = remoteReady
    ? adminCampaigns.filter((c) => !c.suspended && c.status === 'active')
    : adminCampaigns.filter((c) => !locallySuspended.has(c.id) && c.status === 'active')

  const providers: Provider[] = remoteReady
    ? remoteProviders
    : [...sessionProviders, ...PROVIDERS].map((p) =>
        verificationOverrides[p.id] ? { ...p, verification: verificationOverrides[p.id] } : p,
      )

  const byId = new Map(adminCampaigns.map((c) => [c.id, c]))

  return {
    campaigns,
    adminCampaigns,
    providers,
    getCampaign: (id) => campaigns.find((c) => c.id === id),
    getProvider: (id) => providers.find((p) => p.id === id),
    /**
     * Campaigns belonging to one owner — the provider dashboard's whole world.
     *
     * Drawn from `adminCampaigns` rather than the public list, for the reason
     * that list exists: an owner has to be able to see that a trip was taken
     * down. Filtering it out left them with a trip that had silently vanished
     * from their own dashboard and no way to find out why.
     */
    campaignsOf: (providerId) => adminCampaigns.filter((c) => c.providerId === providerId),
    /**
     * True when the admin has taken a trip down.
     *
     * The row's own column once a snapshot has landed; this session's list only
     * when there is no database to have recorded the decision.
     */
    isSuspended: (id) =>
      remoteReady ? (byId.get(id)?.suspended ?? false) : locallySuspended.has(id),
  }
}

export function useCatalogue(): Catalogue {
  const {
    sessionProviders,
    providerCampaigns,
    hiddenCampaignIds,
    verificationOverrides,
    campaignSuspensions,
    featureOverrides,
    campaignStatusOverrides,
    remoteReady,
    remoteProviders,
    remoteCampaigns,
  } = useStore()

  return useMemo(
    () =>
      deriveCatalogue({
        remoteReady,
        remoteCampaigns,
        remoteProviders,
        sessionProviders,
        providerCampaigns,
        hiddenCampaignIds,
        campaignSuspensions,
        featureOverrides,
        verificationOverrides,
        campaignStatusOverrides,
      }),
    [
      remoteReady,
      remoteCampaigns,
      remoteProviders,
      sessionProviders,
      providerCampaigns,
      hiddenCampaignIds,
      campaignSuspensions,
      featureOverrides,
      verificationOverrides,
      campaignStatusOverrides,
    ],
  )
}
