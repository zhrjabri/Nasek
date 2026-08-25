import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, ExternalLink, Star, Ticket, Trash2, Undo2 } from 'lucide-react'
import type { Campaign, Provider } from '@/types'
import { useI18n } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { useStore } from '@/store/AppStore'
import { Badge, Button, EmptyState, Modal, Rating, cx } from '@/components/ui'
import { BodyRow, DetailRow, HeadRow, IconAction, Kpi, TableShell, Th, Toolbar, useCountLabel } from './shared'

type Filter = 'all' | 'hajj' | 'umrah' | 'featured' | 'suspended'

/**
 * Campaign management.
 *
 * The trips are the product, so this is where the admin has the most to
 * decide. Four controls, in rising order of severity:
 *
 *   - Feature, which promotes a trip onto the home page.
 *   - Suspend, which takes it off the public site but leaves it intact and
 *     restorable — the right answer to "this looks wrong, stop showing it
 *     while we ask the owner".
 *   - Delete, which is permanent and therefore confirmed first.
 *
 * Suspension is kept separate from an owner deleting their own trip so that
 * republishing cannot quietly undo a moderation decision.
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
  const { t, lang, bl, money, n, dateRange } = useI18n()
  const { dispatch, toast } = useStore()
  const countLabel = useCountLabel()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [detail, setDetail] = useState<Campaign | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Campaign | null>(null)

  const ownerOf = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p]))
    return (id: string) => map.get(id)
  }, [providers])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return campaigns.filter((c) => {
      const down = isSuspended(c.id)
      if (filter === 'suspended') {
        if (!down) return false
      } else if (filter === 'featured') {
        if (!c.featured) return false
      } else if (filter !== 'all' && c.type !== filter) {
        return false
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
      total: campaigns.length,
      live: campaigns.filter((c) => !isSuspended(c.id)).length,
      featured: campaigns.filter((c) => c.featured).length,
      suspended: campaigns.filter((c) => isSuspended(c.id)).length,
    }),
    [campaigns, isSuspended],
  )

  const toggleFeatured = (c: Campaign) => {
    dispatch({ type: 'setCampaignFeatured', campaignId: c.id, featured: !c.featured })
    toast(
      c.featured
        ? t('admin.unfeaturedToast', { name: bl(c.title) })
        : t('admin.featuredToast', { name: bl(c.title) }),
      c.featured ? 'info' : 'success',
    )
  }

  const toggleSuspended = (c: Campaign) => {
    const down = isSuspended(c.id)
    dispatch({ type: 'setCampaignSuspended', campaignId: c.id, suspended: !down })
    toast(
      down
        ? t('admin.campaignRestoredToast', { name: bl(c.title) })
        : t('admin.campaignSuspendedToast', { name: bl(c.title) }),
      down ? 'success' : 'warning',
    )
  }

  const remove = (c: Campaign) => {
    dispatch({ type: 'deleteCampaign', id: c.id })
    setConfirmDelete(null)
    setDetail(null)
    toast(t('admin.campaignDeletedToast', { name: bl(c.title) }), 'warning')
  }

  return (
    <section className="space-y-5">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('admin.campTotal')} value={n(stats.total)} icon={<Ticket className="size-4" />} />
        <Kpi label={t('admin.campLive')} value={n(stats.live)} icon={<Ticket className="size-4" />} />
        <Kpi label={t('admin.campFeatured')} value={n(stats.featured)} icon={<Star className="size-4" />} />
        <Kpi
          label={t('admin.campSuspended')}
          value={n(stats.suspended)}
          icon={<Ban className="size-4" />}
          tone={stats.suspended > 0 ? 'alert' : undefined}
        />
      </ul>

      <Toolbar<Filter>
        query={query}
        onQuery={setQuery}
        placeholder={t('admin.campSearch')}
        filter={filter}
        onFilter={setFilter}
        filterLabel={t('admin.campFilter')}
        count={countLabel(visible.length, campaigns.length)}
        options={[
          { value: 'all', label: t('admin.userAll') },
          { value: 'hajj', label: t('common.hajj') },
          { value: 'umrah', label: t('common.umrah') },
          { value: 'featured', label: t('admin.campFeatured') },
          { value: 'suspended', label: t('admin.campSuspended') },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-5" />}
          title={campaigns.length === 0 ? t('admin.noCampaigns') : t('admin.noCampaignMatch')}
          body={campaigns.length === 0 ? t('admin.noCampaignsBody') : t('admin.noUsersBody')}
        />
      ) : (
        <TableShell>
          <table className="w-full min-w-4xl text-[13.5px]">
            <thead>
              <HeadRow>
                <Th>{t('admin.campaigns')}</Th>
                <Th>{t('campaign.byProvider')}</Th>
                <Th>{t('filters.type')}</Th>
                <Th>{t('common.price')}</Th>
                <Th>{t('compare.row.seats')}</Th>
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
                      <span className="block truncate text-[11.5px] text-ink-400">
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
                        <Badge tone={down ? 'red' : 'green'}>
                          {t(down ? 'admin.campSuspended' : 'admin.campLive')}
                        </Badge>
                        {c.featured && !down && (
                          <Badge tone="gold">{t('admin.campFeatured')}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <IconAction
                          icon={
                            <Star
                              className={cx('size-3.5', c.featured && 'fill-gold-500 text-gold-600')}
                            />
                          }
                          label={t(c.featured ? 'admin.campUnfeature' : 'admin.campFeature')}
                          onClick={() => toggleFeatured(c)}
                        />
                        <Button size="sm" variant="secondary" onClick={() => toggleSuspended(c)}>
                          {down ? <Undo2 className="size-3.5" /> : <Ban className="size-3.5" />}
                          {t(down ? 'admin.campRestore' : 'admin.campSuspend')}
                        </Button>
                        <IconAction
                          icon={<Trash2 className="size-3.5" />}
                          label={t('admin.campDelete')}
                          onClick={() => setConfirmDelete(c)}
                          danger
                        />
                      </div>
                    </td>
                  </BodyRow>
                )
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      <p className="text-[11.5px] leading-relaxed text-ink-400">{t('admin.campNote')}</p>

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
              <Badge tone={isSuspended(detail.id) ? 'red' : 'green'}>
                {t(isSuspended(detail.id) ? 'admin.campSuspended' : 'admin.campLive')}
              </Badge>
              {detail.featured && <Badge tone="gold">{t('admin.campFeatured')}</Badge>}
            </div>

            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <DetailRow label={t('campaign.byProvider')} value={bl(ownerOf(detail.providerId)?.name) || '—'} />
              <DetailRow label={t('common.wilayah')} value={wilayahName(detail.wilayahId, lang)} />
              <DetailRow label={t('common.price')} value={money(detail.price)} />
              <DetailRow
                label={t('compare.row.seats')}
                value={`${n(detail.seatsAvailable)} / ${n(detail.seatsTotal)}`}
              />
              <DetailRow
                label={t('filters.date')}
                value={dateRange(detail.departureDate, detail.returnDate)}
              />
              <DetailRow label={t('common.rating')} value={<Rating value={detail.rating} count={detail.reviewCount} size="sm" />} />
              <DetailRow label={t('campaign.makkah')} value={bl(detail.hotelMakkah) || '—'} />
              <DetailRow label={t('campaign.madinah')} value={bl(detail.hotelMadinah) || '—'} />
              <DetailRow label={t('campaign.aboutTrip')} value={bl(detail.description) || '—'} wide />
            </dl>

            <div className="flex flex-wrap gap-2 border-t border-ivory-300 pt-4">
              <Link
                to={`/campaigns/${detail.id}`}
                className="inline-flex items-center gap-1.5 rounded-[3px] border border-ivory-300 px-3 py-2 text-[13px] font-semibold text-ink-700 transition-colors hover:border-nasek-400 hover:text-nasek-800"
              >
                <ExternalLink className="size-3.5" />
                {t('admin.campOpenPublic')}
              </Link>
              <Button size="sm" variant="secondary" onClick={() => toggleFeatured(detail)}>
                <Star className={cx('size-3.5', detail.featured && 'fill-gold-500 text-gold-600')} />
                {t(detail.featured ? 'admin.campUnfeature' : 'admin.campFeature')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => toggleSuspended(detail)}>
                {isSuspended(detail.id) ? <Undo2 className="size-3.5" /> : <Ban className="size-3.5" />}
                {t(isSuspended(detail.id) ? 'admin.campRestore' : 'admin.campSuspend')}
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
            <p className="text-[14px] leading-relaxed text-ink-700">
              {t('admin.campDeleteBody', { name: bl(confirmDelete.title) })}
            </p>
            <p className="rounded-[3px] border border-amber-300 bg-amber-50 p-3.5 text-[12.5px] leading-relaxed text-amber-900">
              {t('admin.campDeleteHint')}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => remove(confirmDelete)}>
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
