import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { isPendingCampaign, isPendingProvider } from '@/types'
import { useI18n } from '@/i18n'
import { buildDirectory } from '@/data/users'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useRemoteData } from '@/hooks/useRemoteData'
import { Spinner } from '@/components/ui'
import { AdminShell } from '@/admin/layout/AdminShell'
import { loadAdminSession, type AdminGateReason } from '@/admin/session'
import { onAuthChange } from '@/services/auth/session'
import { completeAuthRedirect, isAuthRedirect } from '@/services/auth/redirect'

import { UsersTab } from './tabs/UsersTab'
import { OwnersTab } from './tabs/OwnersTab'
import { CampaignsTab } from './tabs/CampaignsTab'
import { BookingsTab } from './tabs/BookingsTab'
import { ReviewsTab } from './tabs/ReviewsTab'
import { SecurityTab } from './tabs/SecurityTab'

/*
 * The overview is split out because it is the only screen here that draws
 * charts, and the charting library is most of this bundle — 1,084 kB before
 * this, for a dashboard whose other six screens are tables.
 *
 * It is also the landing route, so this does not delay the first useful paint
 * by much: the shell, the sign-in gate and the queue counts all arrive first,
 * and an administrator who navigates straight to Campaigns or Bookings never
 * downloads the charts at all. The public site made the same trade for the
 * provider dashboard, for the same reason.
 */
const OverviewTab = lazy(() =>
  import('./tabs/OverviewTab').then((m) => ({ default: m.OverviewTab })),
)

/*
 * The sign-in screen is split out and lazily loaded for the same reason the
 * public site never contained this file at all: what does not ship cannot be
 * read. Here it buys much less — anyone loading this host is meant to be
 * looking for it — but it keeps the first paint of an already-signed-in
 * administrator free of a form they will never see.
 */
const AdminLoginPage = lazy(() => import('@/admin/LoginPage'))

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-nasek-950">
      <Spinner className="size-8 text-gold-400" />
      <p className="text-sm font-medium text-ivory-50/50">{label}</p>
    </div>
  )
}

/**
 * The administration application.
 *
 * A separate React root, a separate HTML entry, a separate Vite build and a
 * separate deployment target from the public site. They share `src/types.ts`,
 * the design system, the i18n dictionaries and the Supabase client, because
 * those are genuinely one thing — a campaign is the same campaign on both
 * sides. What they do not share is a bundle: nothing in this directory is
 * reachable from the public site's entry point, so the JavaScript a pilgrim
 * downloads contains no administration screens, no table of accounts, and no
 * evidence that either exists.
 *
 * That is the "never see it" half of the requirement. The "cannot reach it"
 * half is not here at all — it is in `supabase/migrations/*_rls_policies.sql`,
 * because a guard written in the client is a guard the client can edit.
 */
export function AdminApp() {
  const { t } = useI18n()
  const { dispatch } = useStore()
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking')
  const [reason, setReason] = useState<AdminGateReason | null>(null)

  const check = useCallback(async () => {
    /*
     * If this page load is an arrival from an emailed link, finish that first.
     *
     * The dashboard cannot reuse the public site's redirect hook: that one ends
     * by sending people to a pilgrim's dashboard, which does not exist here.
     * What matters is the order — establish *who* you are from the link, then
     * ask Postgres whether that person administers NASEK. Reversing it would
     * check an anonymous session and refuse a legitimate administrator.
     */
    if (isAuthRedirect()) {
      const outcome = await completeAuthRedirect()
      if (outcome.kind === 'error') {
        setReason(outcome.reason === 'expired' ? 'anonymous' : 'unavailable')
        setState('out')
        return
      }
    }

    const session = await loadAdminSession()
    if (session.reason) {
      setReason(session.reason)
      setState('out')
      return
    }
    // A Supabase-backed session carries a real profile; the local fallback has
    // none, and the store keeps whatever it already held.
    if (session.user) dispatch({ type: 'signIn', user: session.user })
    setReason(null)
    setState('in')
  }, [dispatch])

  useEffect(() => {
    void check()
  }, [check])

  /*
   * Re-check when the session changes anywhere — another tab signing out, a
   * refresh token that could not be renewed, an administrator whose role was
   * revoked while the dashboard sat open. Without this the interface would keep
   * drawing a dashboard whose every query had started coming back empty.
   */
  useEffect(() => onAuthChange(() => void check()), [check])

  if (state === 'checking') return <FullPageSpinner label={t('admin.checking')} />

  if (state === 'out') {
    return (
      <Suspense fallback={<FullPageSpinner label={t('admin.checking')} />}>
        <AdminLoginPage onAuthenticated={check} initialDenial={reason} />
      </Suspense>
    )
  }

  return <AdminRoutes />
}

/** The dashboard proper. Only ever rendered behind a resolved admin session. */
/** Held while the charting bundle arrives. Sized so the shell does not jump. */
function TabFallback() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Spinner className="size-7 text-nasek-600" />
    </div>
  )
}

function AdminRoutes() {
  const { pathname } = useLocation()
  // Only mounted behind a resolved administrator session, so the snapshot it
  // fetches is the platform-wide one the policies grant that role.
  useRemoteData()
  const {
    sessionUsers,
    suspendedUserIds,
    removedUserIds,
    remoteProfiles,
    remoteReady,
    bookings,
  } = useStore()
  const { campaigns, adminCampaigns, providers, isSuspended } = useCatalogue()

  /*
   * The account list, from the platform where there is one.
   *
   * `sessionUsers` is only ever "accounts registered in this browser", which as
   * a directory of a live platform is close to empty — and it was the only
   * source this screen had. `remoteProfiles` is `profiles` as the policies
   * handed it over, which for an administrator is everyone.
   */
  const accounts = remoteReady ? remoteProfiles : sessionUsers

  /*
   * Built once, here, because three things need it: the users screen, the
   * sidebar's suspended count and the overview's queue. Counting suspensions
   * out of `suspendedUserIds` — a list of decisions taken *in this browser* —
   * meant the badge read zero on a dashboard opened anywhere else.
   */
  const directory = useMemo(
    () => buildDirectory(providers, bookings, accounts),
    [providers, bookings, accounts],
  )

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  const pendingOwners = providers.filter((p) => isPendingProvider(p.verification)).length

  /** The row's own column where the database has one, this session's list otherwise. */
  const isBarred = (id: string, flag: boolean | undefined, local: string[]) =>
    flag ?? local.includes(id)

  const suspendedUsers = directory.filter(
    (u) =>
      isBarred(u.id, u.suspended, suspendedUserIds) &&
      !isBarred(u.id, u.removed, removedUserIds),
  ).length

  // Read off the campaigns themselves rather than out of `campaignSuspensions`,
  // for the same reason: a takedown is a column on the row, not a memory of
  // having clicked something.
  const suspendedCampaigns = adminCampaigns.filter((c) => isSuspended(c.id)).length

  /*
   * The campaign badge counts the queue, not the takedowns.
   *
   * It used to show suspensions, which was the only campaign state worth
   * flagging when there was no approval step — a suspended trip is a decision
   * already taken, and the badge was really saying "something is off the site".
   * Now that trips wait for approval, the number an administrator needs on the
   * sidebar is the number of decisions outstanding: a badge that counts work
   * done is decoration next to one that counts work owed.
   */
  const pendingCampaigns = adminCampaigns.filter((c) => isPendingCampaign(c.status)).length

  // Keyed by path so the shell needs no knowledge of what a section contains.
  const badges = {
    '/owners': pendingOwners,
    '/campaigns': pendingCampaigns,
    '/users': suspendedUsers,
  }

  return (
    <AdminShell badges={badges}>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route
          path="/overview"
          element={
            <Suspense fallback={<TabFallback />}>
              <OverviewTab
                campaigns={campaigns}
                providers={providers}
                suspendedCampaigns={suspendedCampaigns}
                suspendedUsers={suspendedUsers}
              />
            </Suspense>
          }
        />
        <Route
          path="/users"
          element={<UsersTab directory={directory} />}
        />
        <Route path="/owners" element={<OwnersTab providers={providers} />} />
        <Route
          path="/campaigns"
          element={
            /* The admin list, not the public one: a suspended trip has to stay
               visible on the screen that holds the button to bring it back. */
            <CampaignsTab
              campaigns={adminCampaigns}
              providers={providers}
              isSuspended={isSuspended}
            />
          }
        />
        <Route path="/bookings" element={<BookingsTab campaigns={adminCampaigns} />} />
        <Route path="/reviews" element={<ReviewsTab campaigns={adminCampaigns} />} />
        <Route path="/security" element={<SecurityTab />} />
        {/* An unknown address inside the dashboard is a mistyped bookmark, not
            an intrusion — there is nothing to conceal from someone already
            through the gate, so it lands on the overview. */}
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </AdminShell>
  )
}
