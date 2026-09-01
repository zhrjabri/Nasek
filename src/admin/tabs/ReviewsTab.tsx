import { useMemo, useState } from 'react'
import { EyeOff, MessageSquare, Star, Undo2 } from 'lucide-react'
import type { Campaign } from '@/types'
import { useI18n } from '@/i18n'

import { setReviewHidden } from '@/services/data/catalogue'
import { useStore } from '@/store/AppStore'
import { Badge, Button, Card, EmptyState, Rating, cx } from '@/components/ui'
import { Kpi, Toolbar, useCountLabel } from './shared'

type Filter = 'all' | 'low' | 'hidden'

/**
 * Review moderation.
 *
 * Hiding is the only action, and it is reversible. A review is a traveller's
 * account of their own trip: an admin may need to take one down — abuse, a
 * phone number posted in public, a competitor writing fiction — but should
 * never be able to edit what somebody said, or the ratings underneath every
 * campaign stop meaning anything.
 *
 * The "low ratings" filter exists because that is where complaints live, and
 * a complaint is usually the thing worth reading first.
 */
export function ReviewsTab({ campaigns }: { campaigns: Campaign[] }) {
  const { t, bl, n, date } = useI18n()
  /*
   * Every review on the platform. `reviews_read` returns hidden ones only to
   * their author and to administrators, which is exactly the list this table
   * needs — the screen holding the "show again" button has to be able to see
   * what it would restore.
   */
  const { dispatch, toast, hiddenReviewIds, reviews } = useStore()
  const countLabel = useCountLabel()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const hidden = useMemo(() => new Set(hiddenReviewIds), [hiddenReviewIds])

  const titleOf = useMemo(() => {
    const map = new Map(campaigns.map((c) => [c.id, c]))
    return (id: string) => map.get(id)
  }, [campaigns])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return reviews.filter((r) => {
      const isHidden = hidden.has(r.id)
      if (filter === 'hidden') {
        if (!isHidden) return false
      } else if (isHidden) {
        return false
      } else if (filter === 'low' && r.rating > 2) {
        return false
      }

      if (!needle) return true
      return (
        r.userName.toLowerCase().includes(needle) ||
        bl(r.comment).toLowerCase().includes(needle)
      )
    })
  }, [filter, query, hidden, bl])

  const stats = useMemo(() => {
    const live = reviews.filter((r) => !hidden.has(r.id))
    const average = live.length
      ? live.reduce((s, r) => s + r.rating, 0) / live.length
      : 0
    return {
      total: live.length,
      average,
      low: live.filter((r) => r.rating <= 2).length,
      hidden: hidden.size,
    }
  }, [hidden])

  return (
    <section className="space-y-5">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('admin.reviews')} value={n(stats.total)} icon={<MessageSquare className="size-4" />} />
        <Kpi
          label={t('common.rating')}
          value={stats.total ? n(stats.average, { maximumFractionDigits: 1 }) : '—'}
          icon={<Star className="size-4" />}
        />
        <Kpi
          label={t('admin.reviewsLow')}
          value={n(stats.low)}
          icon={<Star className="size-4" />}
          tone={stats.low > 0 ? 'alert' : undefined}
          hint={stats.low > 0 ? t('admin.reviewsLowHint') : undefined}
        />
        <Kpi label={t('admin.reviewsHidden')} value={n(stats.hidden)} icon={<EyeOff className="size-4" />} />
      </ul>

      <Toolbar<Filter>
        query={query}
        onQuery={setQuery}
        placeholder={t('admin.reviewSearch')}
        filter={filter}
        onFilter={setFilter}
        filterLabel={t('admin.reviewFilter')}
        count={countLabel(visible.length, reviews.length)}
        options={[
          { value: 'all', label: t('admin.userAll') },
          { value: 'low', label: t('admin.reviewsLow') },
          { value: 'hidden', label: t('admin.reviewsHidden') },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-5" />}
          title={reviews.length === 0 ? t('campaign.noReviews') : t('admin.noReviewMatch')}
          body={reviews.length === 0 ? t('admin.noReviewsBody') : t('admin.noUsersBody')}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {visible.map((review) => {
            const isHidden = hidden.has(review.id)
            const campaign = titleOf(review.campaignId)
            return (
              <li key={review.id}>
                <Card className={cx('flex h-full flex-col p-5', isHidden && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-ink-900">{review.userName}</p>
                      {campaign && (
                        <p className="truncate text-2xs text-ink-400">{bl(campaign.title)}</p>
                      )}
                    </div>
                    <Rating value={review.rating} size="sm" />
                  </div>

                  <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-600">
                    {bl(review.comment)}
                  </p>

                  <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-ivory-300 pt-3">
                    <span className="text-2xs text-ink-400">{date(review.date)}</span>
                    <div className="flex items-center gap-2">
                      {isHidden && <Badge tone="red">{t('admin.reviewsHidden')}</Badge>}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          void setReviewHidden(review.id, !isHidden)
                          dispatch({ type: 'setReviewHidden', reviewId: review.id, hidden: !isHidden })
                          toast(
                            isHidden ? t('admin.reviewShownToast') : t('admin.reviewHiddenToast'),
                            isHidden ? 'success' : 'warning',
                          )
                        }}
                      >
                        {isHidden ? <Undo2 className="size-3.5" /> : <EyeOff className="size-3.5" />}
                        {t(isHidden ? 'admin.reviewShow' : 'admin.reviewHide')}
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-2xs leading-relaxed text-ink-400">{t('admin.reviewNote')}</p>
    </section>
  )
}
