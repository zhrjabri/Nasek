import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { isPendingProvider } from '@/types'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useRemoteData } from '@/hooks/useRemoteData'
import { Spinner } from '@/components/ui'
import { AdminShell } from '@/admin/layout/AdminShell'
import { loadAdminSession, type AdminGateReason } from '@/admin/session'
import { onAuthChange } from '@/services/auth/session'
import { completeAuthRedirect, isAuthRedirect } from '@/services/auth/redirect'

import { OverviewTab } from './tabs/OverviewTab'
import { UsersTab } from './tabs/UsersTab'
import { OwnersTab } from './tabs/OwnersTab'
import { CampaignsTab } from './tabs/CampaignsTab'
import { BookingsTab } from './tabs/BookingsTab'
import { ReviewsTab } from './tabs/ReviewsTab'
import { SecurityTab } from './tabs/SecurityTab'

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
function AdminRoutes() {
  const { pathname } = useLocation()
  // Only mounted behind a resolved administrator session, so the snapshot it
  // fetches is the platform-wide one the policies grant that role.
  useRemoteData()
  const {
    sessionUsers,
    suspendedUserIds,
    removedUserIds,
    campaignSuspensions,
  } = useStore()
  const { campaigns, adminCampaigns, providers, isSuspended } = useCatalogue()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  const pendingOwners = providers.filter((p) => isPendingProvider(p.verification)).length
  const suspendedUsers = suspendedUserIds.filter((id) => !removedUserIds.includes(id)).length

  // Keyed by path so the shell needs no knowledge of what a section contains.
  const badges = {
    '/owners': pendingOwners,
    '/campaigns': campaignSuspensions.length,
    '/users': suspendedUsers,
  }

  return (
    <AdminShell badges={badges}>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route
          path="/overview"
          element={
            <OverviewTab
              campaigns={campaigns}
              providers={providers}
              suspendedCampaigns={campaignSuspensions.length}
              suspendedUsers={suspendedUsers}
            />
          }
        />
        <Route
          path="/users"
          element={<UsersTab providers={providers} sessionUsers={sessionUsers} />}
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
