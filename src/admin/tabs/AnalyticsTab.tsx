import { useEffect, useState } from 'react'
import { BarChart3, Eye, MousePointerClick, Ticket, Users } from 'lucide-react'
import { useI18n } from '@/i18n'
import { fetchSiteAnalytics } from '@/services/data/adminProvider'
import type { SiteAnalytics } from '@/services/supabase/schema'
import { Card, EmptyState, Spinner } from '@/components/ui'
import { BodyRow, HeadRow, Kpi, TableShell, Th } from './shared'

/**
 * How many people came to the public site, and what they opened.
 *
 * Every figure on this screen is a count returned by `site_analytics()`, and
 * every one of them is real. There is no sample data, no estimate and no
 * "typical" figure standing in for a missing one — three states, and they are
 * kept distinct on purpose:
 *
 *   loading      — a spinner. Not zeros.
 *   unreachable  — a notice saying the server did not answer. Not zeros.
 *   zero visits  — an empty state saying nothing has been recorded.
 *
 * Collapsing the first two into "0" is the failure this is written to avoid: a
 * nought on a dashboard is a fact somebody will act on, and "the request
 * failed" is not the same fact as "nobody visited".
 *
 * What is *not* here is as deliberate. No individual visits, no sessions, no
 * paths a named person took, no way to ask what one visitor did — because
 * `site_visits` has no SELECT policy for anybody, including an administrator,
 * and this function is the only door. The most granular thing on the page is
 * "this trip page was opened 40 times", which is about a trip.
 */
export function AnalyticsTab() {
  const { t, n, bl } = useI18n()
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [data, setData] = useState<SiteAnalytics | null>(null)

  useEffect(() => {
    let live = true
    void fetchSiteAnalytics().then((result) => {
      if (!live) return
      setData(result)
      setState(result ? 'ready' : 'failed')
    })
    return () => {
      live = false
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (state === 'failed' || !data) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-5" />}
        title={t('admin.analyticsUnavailable')}
        body={t('admin.analyticsUnavailableBody')}
      />
    )
  }

  const empty = data.visits_total === 0

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-ink-900">{t('admin.analyticsTitle')}</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-500">
          {t('admin.analyticsBody')}
        </p>
      </div>

      {empty ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title={t('admin.analyticsEmpty')}
          body={t('admin.analyticsEmptyBody')}
        />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label={t('admin.analyticsVisitorsTotal')}
              value={n(data.visitors_total)}
              icon={<Users className="size-4" />}
              highlight
            />
            <Kpi
              label={t('admin.analyticsVisitsTotal')}
              value={n(data.visits_total)}
              icon={<Eye className="size-4" />}
            />
            <Kpi
              label={t('admin.analyticsVisitorsToday')}
              value={n(data.visitors_today)}
              icon={<Users className="size-4" />}
            />
            <Kpi
              label={t('admin.analyticsVisitsToday')}
              value={n(data.visits_today)}
              icon={<Eye className="size-4" />}
            />
            <Kpi
              label={t('admin.analyticsVisitsWeek')}
              value={n(data.visits_week)}
              icon={<BarChart3 className="size-4" />}
            />
            <Kpi
              label={t('admin.analyticsVisitsMonth')}
              value={n(data.visits_month)}
              icon={<BarChart3 className="size-4" />}
            />
            <Kpi
              label={t('admin.analyticsCampaignViews')}
              value={n(data.campaign_views)}
              icon={<Ticket className="size-4" />}
            />
            <Kpi
              label={t('admin.analyticsSmartMatch')}
              value={n(data.smart_match_visits)}
              icon={<MousePointerClick className="size-4" />}
            />
          </ul>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-md font-bold text-ink-900">{t('admin.analyticsTopPages')}</h3>
              <div className="mt-3">
                <TableShell>
                  <table className="w-full text-sm">
                    <thead>
                      <HeadRow>
                        <Th>{t('admin.analyticsPage')}</Th>
                        <Th end>{t('admin.analyticsViews')}</Th>
                      </HeadRow>
                    </thead>
                    <tbody>
                      {data.top_pages.map((row) => (
                        <BodyRow key={row.path}>
                          <td className="nums p-3.5 text-ink-700" dir="ltr">
                            {row.path}
                          </td>
                          <td className="nums p-3.5 text-end font-semibold text-ink-800">
                            {n(row.views)}
                          </td>
                        </BodyRow>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-md font-bold text-ink-900">
                {t('admin.analyticsTopCampaigns')}
              </h3>
              <div className="mt-3">
                <TableShell>
                  <table className="w-full text-sm">
                    <thead>
                      <HeadRow>
                        <Th>{t('prov.customerTrip')}</Th>
                        <Th end>{t('admin.analyticsViews')}</Th>
                      </HeadRow>
                    </thead>
                    <tbody>
                      {data.top_campaigns.map((row) => (
                        <BodyRow key={row.campaign_id}>
                          <td className="max-w-64 p-3.5">
                            <span className="block truncate text-ink-700">
                              {bl({ ar: row.title_ar, en: row.title_en })}
                            </span>
                          </td>
                          <td className="nums p-3.5 text-end font-semibold text-ink-800">
                            {n(row.views)}
                          </td>
                        </BodyRow>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              </div>
            </Card>
          </div>
        </>
      )}

      <p className="text-2xs leading-relaxed text-ink-400">{t('admin.analyticsPrivacy')}</p>
    </section>
  )
}
