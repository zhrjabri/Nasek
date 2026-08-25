import { useState } from 'react'
import {
  Building2,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
  Ticket,
  UserCog,
  Users,
} from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { cx } from '@/components/ui'
import { OverviewTab } from './OverviewTab'
import { UsersTab } from './UsersTab'
import { OwnersTab } from './OwnersTab'
import { CampaignsTab } from './CampaignsTab'
import { BookingsTab } from './BookingsTab'
import { ReviewsTab } from './ReviewsTab'

type Tab = 'overview' | 'users' | 'owners' | 'campaigns' | 'bookings' | 'reviews'

/**
 * Tab order follows what the admin manages, from people to money:
 * the summary, then accounts, the companies behind them, the trips they sell,
 * the bookings those produce, and what travellers said afterwards.
 */
const TABS: { id: Tab; key: MessageKey; icon: typeof LayoutGrid }[] = [
  { id: 'overview', key: 'admin.overview', icon: LayoutGrid },
  { id: 'users', key: 'admin.users', icon: UserCog },
  { id: 'owners', key: 'admin.providers', icon: Building2 },
  { id: 'campaigns', key: 'admin.campaigns', icon: Ticket },
  { id: 'bookings', key: 'admin.bookings', icon: Users },
  { id: 'reviews', key: 'admin.reviews', icon: MessageSquare },
]

/**
 * The administration dashboard.
 *
 * Each tab is its own file: they share a toolbar and table shell but almost
 * no logic, and keeping them apart means a change to campaign moderation
 * cannot break the booking ledger. This file owns only the frame — which tab
 * is showing, and the data every tab reads.
 */
function Dashboard() {
  const { t, n } = useI18n()
  const {
    sessionUsers,
    suspendedUserIds,
    removedUserIds,
    campaignSuspensions,
  } = useStore()
  const { campaigns, adminCampaigns, providers, isSuspended } = useCatalogue()
  const [tab, setTab] = useState<Tab>('overview')

  /** Counts that put a badge on a tab, so waiting work is visible from any of them. */
  const pendingOwners = providers.filter((p) => p.verification !== 'verified').length
  const suspendedUsers = suspendedUserIds.filter((id) => !removedUserIds.includes(id)).length
  const badges: Partial<Record<Tab, number>> = {
    owners: pendingOwners,
    campaigns: campaignSuspensions.length,
    users: suspendedUsers,
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-wrap items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-[3px] bg-nasek-900 text-gold-400">
          <ShieldCheck className="size-6" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gold-600">
            {t('common.appName')}
          </p>
          <h1 className="display text-[26px] text-ink-900 sm:text-[32px]">{t('admin.title')}</h1>
        </div>
      </header>

      <nav className="scrollbar-none mb-7 flex gap-1 overflow-x-auto border-b border-ivory-300">
        {TABS.map((item) => {
          const badge = badges[item.id] ?? 0
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              className={cx(
                'relative flex shrink-0 items-center gap-2 px-4 py-3 text-[14px] font-semibold transition-colors',
                tab === item.id ? 'text-nasek-900' : 'text-ink-400 hover:text-ink-700',
              )}
            >
              <item.icon className="size-4" />
              {t(item.key)}
              {badge > 0 && (
                <span className="nums rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {n(badge)}
                </span>
              )}
              {tab === item.id && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gold-500" />
              )}
            </button>
          )
        })}
      </nav>

      {tab === 'overview' && (
        <OverviewTab
          campaigns={campaigns}
          providers={providers}
          suspendedCampaigns={campaignSuspensions.length}
          suspendedUsers={suspendedUsers}
          onGoTo={setTab}
        />
      )}
      {tab === 'users' && <UsersTab providers={providers} sessionUsers={sessionUsers} />}
      {tab === 'owners' && <OwnersTab providers={providers} />}
      {tab === 'campaigns' && (
        // The admin list, not the public one: a suspended trip has to stay
        // visible on the screen that holds the button to bring it back.
        <CampaignsTab
          campaigns={adminCampaigns}
          providers={providers}
          isSuspended={isSuspended}
        />
      )}
      {tab === 'bookings' && <BookingsTab campaigns={adminCampaigns} />}
      {tab === 'reviews' && <ReviewsTab campaigns={adminCampaigns} />}
    </main>
  )
}

/** Default export for the same reason as the gate — see AdminAccessPage.tsx. */
export default Dashboard
