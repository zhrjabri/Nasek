import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Ban,
  Check,
  Clock,
  ExternalLink,
  Eye,
  Star,
  Plus,
  Ticket,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react'
import type { Campaign, CampaignStatus, Provider } from '@/types'
import { useI18n } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { serviceLabel } from '@/data/services'
import {
  removeCampaign,
  saveCampaign,
  setCampaignModeration,
  setCampaignStatus,
} from '@/services/data/catalogue'
import { CampaignForm } from '@/components/campaign/CampaignForm'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { campaignImageUrl } from '@/services/storage/campaignImages'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { useStore } from '@/store/AppStore'
import { CampaignStatusBadge } from '@/components/campaign/CampaignStatusBadge'
import { Badge, Button, EmptyState, Field, Modal, Rating, Textarea, cx } from '@/components/ui'
import { BodyRow, DetailRow, HeadRow, IconAction, Kpi, TableShell, Th, Toolbar, useCountLabel } from './shared'

type Filter = 'pending' | 'active' | 'rejected' | 'suspended' | 'featured' | 'all'

/**
 * Campaign management, and the approval queue that is now the point of it.
 *
 * This screen used to be moderation only: feature, suspend, delete — all three
 * of them things you do to a trip that is *already* on the public site. There
 * was no approval step at all, because there was no approval: an owner saved a
 * form and the catalogue had a new campaign in it.
 *
 * So the shape of the screen changes. The first thing it opens on is the queue
 * — trips waiting for a decision, which is work — and the moderation controls
 * are what remain for trips that have already had one.
 *
 * Two decisions, four controls, in rising order of severity:
 *
 *   - Approve, which publishes the trip and tells the owner.
 *   - Refuse, which does not, and requires a reason the owner can act on.
 *   - Feature, which promotes an approved trip onto the home page.
 *   - Suspend, which takes a live trip off the public site but leaves it intact
 *     and restorable — the right answer to "this looks wrong, stop showing it
 *     while we ask the owner".
 *   - Delete, which is permanent and therefore confirmed first.
 *
 * Approval and suspension are genuinely different states and both are drawn,
 * because they answer different questions. A pending trip has never been
 * public; a suspended one was, and something happened. Collapsing them into
 * "not live" would lose the only distinction the owner cares about.
 */
export function CampaignsTab({
  campaigns,
  providers,
  isSuspended,
}: {
  campaigns: Campaign[]
  providers: Provider[]
  isSuspended: (id: string) => boolean
}) {
  const { t, lang, bl, money, n, date, dateRange } = useI18n()
  const { dispatch, toast } = useStore()
  const { reload } = useSnapshotLoader()
  const countLabel = useCountLabel()

  const [query, setQuery] = useState('')
  /*
   * Opens on the queue, not on everything.
   *
   * The list of every campaign NASEK has ever carried is a reference; the list
   * of campaigns waiting on a decision is a job. A screen that opens on the
   * reference makes the job something you have to go and look for, which is how
   * a queue stops being read.
   */
  const [filter, setFilter] = useState<Filter>('pending')
  /** The trip being created by NASEK itself, rather than by its owner. */
  const [creating, setCreating] = useState(false)
  const [detail, setDetail] = useState<Campaign | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Campaign | null>(null)
  /** The refusal in progress, and the reason being written for it. */
  const [refusing, setRefusing] = useState<Campaign | null>(null)
  const [reason, setReason] = useState('')
  const [deciding, setDeciding] = useState(false)

  const ownerOf = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p]))
    return (id: string) => map.get(id)
  }, [providers])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return campaigns.filter((c) => {
      const down = isSuspended(c.id)
      /*
       * `suspended` is checked before the status filters and excluded from
       * them, which is the one piece of logic here worth stating.
       *
       * A suspended trip is still `active` as far as its approval goes —
       * somebody approved it, then took it down — so it would appear under
       * "Live" and make that count a lie. The takedown is the more specific
       * fact, so it wins the row.
       */
      if (filter === 'suspended') {
        if (!down) return false
      } else if (filter === 'featured') {
        if (!c.featured) return false
      } else if (filter === 'pending') {
        if (c.status !== 'pending_approval') return false
      } else if (filter === 'rejected') {
        if (c.status !== 'rejected') return false
      } else if (filter === 'active') {
        if (c.status !== 'active' || down) return false
      }

      if (!needle) return true
      const owner = ownerOf(c.providerId)
      return (
        bl(c.title).toLowerCase().includes(needle) ||
        (owner ? bl(owner.name).toLowerCase().includes(needle) : false)
      )
    })
  }, [campaigns, filter, query, isSuspended, ownerOf, bl])

  const stats = useMemo(
    () => ({
      pending: campaigns.filter((c) => c.status === 'pending_approval').length,
      live: campaigns.filter((c) => c.status === 'active' && !isSuspended(c.id)).length,
      rejected: campaigns.filter((c) => c.status === 'rejected').length,
      suspended: campaigns.filter((c) => isSuspended(c.id)).length,
    }),
    [campaigns, isSuspended],
  )

  /**
   * Write, check, reflect.
   *
   * All three of these dropped the promise and toasted regardless, so a refused
   * moderation looked exactly like an applied one. And the dispatch that
   * followed wrote to an override map `useCatalogue` stops consulting the
   * moment a snapshot has landed — so even a successful decision was not drawn
   * until something else happened to reload the page.
   */
  const moderate = async (
    c: Campaign,
    patch: { featured?: boolean; suspended?: boolean },
    done: () => void,
  ) => {
    if (!(await setCampaignModeration(c.id, patch))) {
      toast(t('admin.campaignModerationFailed'), 'warning')
      return
    }
    done()
    await reload()
  }

  const toggleFeatured = (c: Campaign) =>
    void moderate(c, { featured: !c.featured }, () => {
      dispatch({ type: 'setCampaignFeatured', campaignId: c.id, featured: !c.featured })
      toast(
        c.featured
          ? t('admin.unfeaturedToast', { name: bl(c.title) })
          : t('admin.featuredToast', { name: bl(c.title) }),
        c.featured ? 'info' : 'success',
      )
    })

  const toggleSuspended = (c: Campaign) => {
    const down = isSuspended(c.id)
    void moderate(c, { suspended: !down }, () => {
      dispatch({ type: 'setCampaignSuspended', campaignId: c.id, suspended: !down })
      toast(
        down
          ? t('admin.campaignRestoredToast', { name: bl(c.title) })
          : t('admin.campaignSuspendedToast', { name: bl(c.title) }),
        down ? 'success' : 'warning',
      )
    })
  }

  /**
   * Withdraw a trip.
   *
   * This wrote nothing at all. It dispatched `deleteCampaign` — which only adds
   * an id to a local list the catalogue ignores against a database — and
   * announced the deletion. The trip stayed in the catalogue, on the public
   * site, bookable, and reappeared in this very table on the next load.
   */
  const remove = async (c: Campaign) => {
    if (!(await removeCampaign(c.id))) {
      toast(t('admin.campaignModerationFailed'), 'warning')
      return
    }
    dispatch({ type: 'deleteCampaign', id: c.id })
    setConfirmDelete(null)
    setDetail(null)
    toast(t('admin.campaignDeletedToast', { name: bl(c.title) }), 'warning')
    await reload()
  }

  /**
   * Approve or refuse, then reflect what the database actually did.
   *
   * `set_campaign_status` is the only route: it writes the status, the reason,
   * the audit entry, the owner's notification and the queued email in one
   * transaction, and refuses outright if the reason is missing or the company
   * behind the trip is not approved. Its message is passed through rather than
   * flattened, because "this campaign belongs to a company that is not approved"
   * is a specific mistake with a specific fix and the administrator is the only
   * person who can make it.
   */
  const decide = async (c: Campaign, status: CampaignStatus, why?: string) => {
    setDeciding(true)
    const outcome = await setCampaignStatus(c.id, status, why)
    setDeciding(false)

    if (!outcome.ok) {
      toast(t('admin.campaignStatusFailed', { detail: outcome.error }), 'warning')
      return
    }

    // The store, for the no-backend prototype where this map is the platform.
    // Against a database it is written and never read — `deriveCatalogue` takes
    // the column the moment a snapshot lands.
    dispatch({ type: 'setCampaignStatus', campaignId: c.id, status, reason: why })
    toast(
      status === 'active'
        ? t('admin.campaignApproved', { name: bl(c.title) })
        : t('admin.campaignRejected', { name: bl(c.title) }),
      status === 'active' ? 'success' : 'warning',
    )
    setDetail(null)
    setRefusing(null)
    setReason('')
    await reload()
  }

  return (
    <section className="space-y-5">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* The queue first, and flagged when it is not empty. This is the only
            figure on the screen that represents outstanding work. */}
        <Kpi
          label={t('admin.campaignQueue')}
          value={n(stats.pending)}
          icon={<Clock className="size-4" />}
          tone={stats.pending > 0 ? 'alert' : undefined}
        />
        <Kpi label={t('admin.campLive')} value={n(stats.live)} icon={<Ticket className="size-4" />} />
        <Kpi
          label={t('admin.filterRejected')}
          value={n(stats.rejected)}
          icon={<XCircle className="size-4" />}
        />
        <Kpi
          label={t('admin.campSuspended')}
          value={n(stats.suspended)}
          icon={<Ban className="size-4" />}
          tone={stats.suspended > 0 ? 'alert' : undefined}
        />
      </ul>

      {filter === 'pending' && stats.pending > 0 && (
        <p className="rounded-[3px] border border-gold-300 bg-gold-50 px-4 py-3 text-sm leading-relaxed text-gold-900">
          {t('admin.campaignQueueBody')}
        </p>
      )}

      <Toolbar<Filter>
        query={query}
        onQuery={setQuery}
        placeholder={t('admin.campSearch')}
        filter={filter}
        onFilter={setFilter}
        filterLabel={t('admin.campFilter')}
        count={countLabel(visible.length, campaigns.length)}
        options={[
          // Ordered as the lifecycle runs, so the list reads as a pipeline
          // rather than as an alphabetised set of flags.
          { value: 'pending', label: t('admin.filterPending') },
          { value: 'active', label: t('admin.filterActive') },
          { value: 'rejected', label: t('admin.filterRejected') },
          { value: 'suspended', label: t('admin.filterSuspended') },
          { value: 'featured', label: t('admin.campFeatured') },
          { value: 'all', label: t('admin.filterAll') },
        ]}
      />

      {/*
        NASEK adding a trip on a company's behalf.

        Owners publish their own trips and that stays the ordinary route; this
        is for the ones taken over the phone, or entered while an owner is
        still being set up. The provider is chosen in the form rather than
        implied, and the choice is checked in Postgres — `campaigns_insert_own`
        admits `owns_provider(provider_id) or is_admin()`, so an edited bundle
        cannot write a trip for a company it does not administer.
      */}
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" />
          {t('admin.addTrip')}
        </Button>
      </div>

      {/* Its own boundary, inside the dashboard's: a form that throws costs an
          administrator the form and leaves the queue and the list behind it. */}
      {creating && (
        <ErrorBoundary where="the administrator campaign form">
          <CampaignForm
            campaign={null}
            providerId=""
            providers={providers}
            onClose={() => setCreating(false)}
            onSave={async (campaign) => {
              const stored = await saveCampaign(campaign)
              if (!stored) {
                toast(t('admin.addTripFailed'), 'warning')
                return
              }
              /*
               * Approved explicitly, through the same RPC the queue's approve
               * button uses — not by writing `status` on the insert.
               *
               * The row lands `pending_approval` because that is the column's
               * default, and `set_campaign_status` is the one path that moves it.
               * It re-checks `is_admin()` inside Postgres and writes the audit
               * entry, so a trip NASEK entered is approved by exactly the
               * mechanism, and with exactly the trail, of one it approved for
               * somebody else. Sending `status: 'active'` on the insert would
               * have worked for an administrator and left no record of who
               * decided.
               */
              const decided = await setCampaignStatus(stored.id, 'active')
              if (!decided.ok) {
                // The trip exists and is in the queue; only the approval failed.
                toast(t('admin.addTripPending'), 'warning')
              } else {
                toast(t('admin.addTripDone'))
              }
              setCreating(false)
              await reload()
            }}
          />
        </ErrorBoundary>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-5" />}
          title={campaigns.length === 0 ? t('admin.noCampaigns') : t('admin.noCampaignMatch')}
          body={campaigns.length === 0 ? t('admin.noCampaignsBody') : t('admin.noUsersBody')}
        />
      ) : (
        <TableShell>
          <table className="w-full min-w-4xl text-sm">
            <thead>
              <HeadRow>
                <Th>{t('admin.campaigns')}</Th>
                <Th>{t('campaign.byProvider')}</Th>
                <Th>{t('filters.type')}</Th>
                <Th>{t('common.price')}</Th>
                <Th>{t('campaign.seatsLabel')}</Th>
                <Th>{t('common.status')}</Th>
                <Th end>{t('admin.userActions')}</Th>
              </HeadRow>
            </thead>
            <tbody>
              {visible.map((c) => {
                const down = isSuspended(c.id)
                const owner = ownerOf(c.providerId)
                return (
                  <BodyRow key={c.id} dim={down}>
                    <td className="max-w-72 p-3.5">
                      <button
                        type="button"
                        onClick={() => setDetail(c)}
                        className="block max-w-full truncate text-start font-semibold text-ink-800 hover:text-nasek-800"
                      >
                        {bl(c.title)}
                      </button>
                      <span className="block truncate text-2xs text-ink-400">
                        {wilayahName(c.wilayahId, lang)} · {dateRange(c.departureDate, c.returnDate)}
                      </span>
                    </td>
                    <td className="max-w-40 p-3.5">
                      {owner ? (
                        <span className="block truncate text-ink-600">{bl(owner.name)}</span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <Badge tone={c.type === 'hajj' ? 'gold' : 'green'}>
                        {t(c.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
                      </Badge>
                    </td>
                    <td className="nums p-3.5 font-semibold text-ink-800">{money(c.price)}</td>
                    <td className="nums p-3.5 text-ink-600">
                      {n(c.seatsAvailable)} / {n(c.seatsTotal)}
                    </td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CampaignStatusBadge campaign={c} suspended={down} />
                        {c.featured && !down && c.status === 'active' && (
                          <Badge tone="gold">{t('admin.campFeatured')}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {/*
                          A campaign awaiting a decision gets the decision, and
                          nothing else.

                          Feature and suspend are meaningless on a trip that has
                          never been published — you cannot promote onto the home
                          page something that is not on the site — and offering
                          them here would be five controls where two are needed
                          on the screen whose whole job is clearing a queue.

                          "Review" opens the detail dialog rather than approving
                          from the row. Approving a trip you have not read is the
                          one thing this queue must not make easy.
                        */}
                        {c.status === 'pending_approval' ? (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setDetail(c)}>
                              <Eye className="size-3.5" />
                              {t('admin.reviewDetail')}
                            </Button>
                            <Button
                              size="sm"
                              disabled={deciding}
                              onClick={() => void decide(c, 'active')}
                            >
                              <Check className="size-3.5" />
                              {t('admin.campaignApprove')}
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={deciding}
                              onClick={() => {
                                setRefusing(c)
                                setReason('')
                              }}
                            >
                              <XCircle className="size-3.5" />
                              {t('admin.campaignReject')}
                            </Button>
                          </>
                        ) : (
                          <>
                            {/* A refused trip can be put back in the queue —
                                usually because the owner rang and explained, and
                                waiting for them to re-save the form would be
                                theatre. */}
                            {c.status === 'rejected' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={deciding}
                                onClick={() => void decide(c, 'pending_approval')}
                              >
                                <Undo2 className="size-3.5" />
                                {t('admin.campaignBackToQueue')}
                              </Button>
                            )}
                            {c.status === 'active' && (
                              <>
                                <IconAction
                                  icon={
                                    <Star
                                      className={cx(
                                        'size-3.5',
                                        c.featured && 'fill-gold-500 text-gold-600',
                                      )}
                                    />
                                  }
                                  label={t(
                                    c.featured ? 'admin.campUnfeature' : 'admin.campFeature',
                                  )}
                                  onClick={() => toggleFeatured(c)}
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => toggleSuspended(c)}
                                >
                                  {down ? <Undo2 className="size-3.5" /> : <Ban className="size-3.5" />}
                                  {t(down ? 'admin.campRestore' : 'admin.campSuspend')}
                                </Button>
                              </>
                            )}
                            <IconAction
                              icon={<Trash2 className="size-3.5" />}
                              label={t('admin.campDelete')}
                              onClick={() => setConfirmDelete(c)}
                              danger
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </BodyRow>
                )
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      <p className="text-2xs leading-relaxed text-ink-400">{t('admin.campNote')}</p>

      {/* ------------------------------------------------------- detail */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? bl(detail.title) : t('admin.campaigns')}
        wide
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={detail.type === 'hajj' ? 'gold' : 'green'}>
                {t(detail.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
              </Badge>
              <CampaignStatusBadge campaign={detail} suspended={isSuspended(detail.id)} />
              {detail.featured && <Badge tone="gold">{t('admin.campFeatured')}</Badge>}
            </div>

            {/*
              The company, and whether it is approved.

              First, above everything about the trip, because it is the question
              that can make the rest of the review pointless: a campaign whose
              company is still in the verification queue cannot be published at
              all — `set_campaign_status` refuses it — and finding that out
              after reading a whole itinerary is a waste of the reviewer's time.
            */}
            {(() => {
              const owner = ownerOf(detail.providerId)
              if (owner && owner.verification !== 'verified') {
                return (
                  <p className="rounded-[3px] border border-amber-300 bg-amber-50 p-3.5 text-sm leading-relaxed text-amber-900">
                    {t('admin.campaignOwnerUnverified')}
                  </p>
                )
              }
              return null
            })()}

            {/* The photographs. Part of what is being approved — a listing's
                pictures are as much a claim about the trip as its price — so
                the review dialog has to show them rather than a count. */}
            {detail.images.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {detail.images.map((path) => (
                  <li key={path}>
                    <img
                      src={campaignImageUrl(path)}
                      alt=""
                      className="aspect-[4/3] w-full rounded-[3px] border border-ivory-300 object-cover"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs italic text-ink-400">{t('admin.campaignNoImages')}</p>
            )}

            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <DetailRow label={t('campaign.byProvider')} value={bl(ownerOf(detail.providerId)?.name) || '—'} />
              <DetailRow label={t('common.wilayah')} value={wilayahName(detail.wilayahId, lang)} />
              <DetailRow label={t('common.price')} value={money(detail.price)} />
              <DetailRow
                label={t('campaign.seatsLabel')}
                value={`${n(detail.seatsAvailable)} / ${n(detail.seatsTotal)}`}
              />
              <DetailRow
                label={t('filters.date')}
                value={dateRange(detail.departureDate, detail.returnDate)}
              />
              <DetailRow
                label={t('admin.campaignDeadline')}
                value={detail.registrationDeadline ? date(detail.registrationDeadline) : '—'}
              />
              <DetailRow label={t('common.rating')} value={<Rating value={detail.rating} count={detail.reviewCount} size="sm" />} />
              <DetailRow
                label={t('admin.campaignSubmitted')}
                value={detail.submittedAt ? date(detail.submittedAt) : '—'}
              />
              <DetailRow label={t('campaign.makkah')} value={bl(detail.hotelMakkah) || '—'} />
              <DetailRow label={t('campaign.madinah')} value={bl(detail.hotelMadinah) || '—'} />
              <DetailRow
                label={t('campaign.includes')}
                value={
                  detail.services.map((s) => serviceLabel(s, lang)).join('، ') || '—'
                }
                wide
              />
              <DetailRow
                label={t('admin.campaignExcluded')}
                value={
                  detail.excludedServices.map((s) => serviceLabel(s, lang)).join('، ') || '—'
                }
                wide
              />
              <DetailRow
                label={t('admin.campaignContact')}
                value={
                  [detail.contactName, detail.contactPhone, detail.contactEmail]
                    .filter(Boolean)
                    .join(' · ') || '—'
                }
                wide
              />
              <DetailRow label={t('campaign.aboutTrip')} value={bl(detail.description) || '—'} wide />
              <DetailRow label={t('admin.campaignTerms')} value={bl(detail.terms) || '—'} wide />
            </dl>

            {detail.status === 'rejected' && detail.rejectionReason && (
              <p className="rounded-[3px] border border-red-200 bg-red-50 p-3.5 text-sm leading-relaxed text-red-800">
                <span className="font-bold">{t('campaignStatus.reason')}: </span>
                {detail.rejectionReason}
              </p>
            )}

            <div className="flex flex-wrap gap-2 border-t border-ivory-300 pt-4">
              {detail.status === 'pending_approval' ? (
                <>
                  <Button
                    disabled={deciding}
                    onClick={() => void decide(detail, 'active')}
                  >
                    <Check className="size-3.5" />
                    {t('admin.campaignApprove')}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={deciding}
                    onClick={() => {
                      setRefusing(detail)
                      setReason('')
                    }}
                  >
                    <XCircle className="size-3.5" />
                    {t('admin.campaignReject')}
                  </Button>
                </>
              ) : (
                <>
                  {/* Only a live trip has a public page to open. */}
                  {detail.status === 'active' && (
                    <Link
                      to={`/campaigns/${detail.id}`}
                      className="inline-flex items-center gap-1.5 rounded-[3px] border border-ivory-300 px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-nasek-400 hover:text-nasek-800"
                    >
                      <ExternalLink className="size-3.5" />
                      {t('admin.campOpenPublic')}
                    </Link>
                  )}
                  {detail.status === 'active' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => toggleFeatured(detail)}>
                        <Star
                          className={cx('size-3.5', detail.featured && 'fill-gold-500 text-gold-600')}
                        />
                        {t(detail.featured ? 'admin.campUnfeature' : 'admin.campFeature')}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => toggleSuspended(detail)}>
                        {isSuspended(detail.id) ? (
                          <Undo2 className="size-3.5" />
                        ) : (
                          <Ban className="size-3.5" />
                        )}
                        {t(isSuspended(detail.id) ? 'admin.campRestore' : 'admin.campSuspend')}
                      </Button>
                    </>
                  )}
                  {detail.status === 'rejected' && (
                    <Button
                      variant="secondary"
                      disabled={deciding}
                      onClick={() => void decide(detail, 'pending_approval')}
                    >
                      <Undo2 className="size-3.5" />
                      {t('admin.campaignBackToQueue')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------- refusal */}
      {/*
        A refusal needs a reason, and the reason is written here rather than
        typed into a browser prompt.

        The database enforces it — `set_campaign_status` raises on an empty
        reason — so this dialog is not the control; it is the place the control
        can be satisfied properly. The copy tells the administrator who reads it
        and what it is for, because the owner sees this text word for word and
        corrects their campaign against it.
      */}
      <Modal
        open={!!refusing}
        onClose={() => setRefusing(null)}
        title={t('admin.campaignRejectTitle')}
      >
        {refusing && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-600">
              {t('admin.campaignRejectBody')}
            </p>
            <Field label={t('admin.campaignRejectReason')} required>
              {(p) => (
                <Textarea
                  {...p}
                  rows={4}
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRefusing(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                loading={deciding}
                disabled={!reason.trim()}
                onClick={() => void decide(refusing, 'rejected', reason.trim())}
              >
                {t('admin.campaignRejectConfirm')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Deleting a trip cannot be undone from here, so it asks first. The
          reversible actions above deliberately do not. */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('admin.campDeleteTitle')}
      >
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-base leading-relaxed text-ink-700">
              {t('admin.campDeleteBody', { name: bl(confirmDelete.title) })}
            </p>
            <p className="rounded-[3px] border border-amber-300 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
              {t('admin.campDeleteHint')}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => void remove(confirmDelete)}>
                <Trash2 className="size-3.5" />
                {t('admin.campDelete')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
