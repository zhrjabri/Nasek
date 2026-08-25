import { Suspense, lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { ToastHost } from '@/components/layout/ToastHost'
import { AssistantWidget } from '@/components/assistant/AssistantWidget'
import { EmptyState, LinkButton, Spinner } from '@/components/ui'

import { HomePage } from '@/pages/HomePage'
import { CampaignsPage } from '@/pages/CampaignsPage'
import { CampaignDetailPage } from '@/pages/CampaignDetailPage'
import { SmartMatchPage } from '@/pages/SmartMatchPage'
import { MapPage } from '@/pages/MapPage'
import { BookingPage } from '@/pages/BookingPage'
import {
  CustomerSignInPage,
  CustomerSignUpPage,
  OwnerSignInPage,
  SignInPage,
  SignUpPage,
} from '@/pages/AuthPages'
import { ProviderSignUpPage } from '@/pages/ProviderSignUpPage'
import { isAdminGatePath } from '@/services/api/adminAccess'
import { DashboardPage } from '@/pages/DashboardPage'
import { GivingPage } from '@/pages/GivingPage'
import { AboutPage } from '@/pages/AboutPage'

/**
 * The two chart-heavy dashboards pull in the whole charting library, which no
 * pilgrim browsing campaigns ever needs. Splitting them keeps the public
 * bundle — the one that decides first-paint on a phone — roughly a third
 * smaller.
 */
const ProviderDashboardPage = lazy(() =>
  import('@/pages/ProviderDashboardPage').then((m) => ({ default: m.ProviderDashboardPage })),
)
const AdminDashboardPage = lazy(() => import('@/pages/admin'))
/*
 * The gate is split out, and every chunk is named by hash alone (see
 * vite.config.ts) — a file called AdminAccessPage-x7.js would announce itself
 * in the deployed directory listing no matter how well the route was hidden.
 */
const AdminAccessPage = lazy(() => import('@/pages/AdminAccessPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Spinner className="size-7 text-nasek-600" />
    </div>
  )
}

/** Restore scroll on navigation — a router default that surprises people. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])
  return null
}

/**
 * Gate a route behind a signed-in account of a given role.
 *
 * `unlisted` marks a route that should not admit to existing. Sending an
 * unauthenticated visitor to the sign-in page, or telling a signed-in one
 * that they hold the wrong sort of account, both confirm that the route is
 * real; an unlisted route answers "not found" to everyone who is not already
 * the admin, which is what the route looks like from outside anyway. Used for
 * administration.
 */
function Protected({
  role,
  unlisted,
  children,
}: {
  role?: 'customer' | 'provider' | 'admin'
  unlisted?: boolean
  children: React.ReactNode
}) {
  const { user } = useStore()
  const { t } = useI18n()
  const location = useLocation()

  if (!user) {
    // There is no address to send them to: the gate's address is a secret
    // this bundle does not hold. An admin whose session has lapsed types it
    // again; anyone else sees what the route really looks like from outside.
    if (unlisted) return <NotFoundPage />
    return (
      <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    )
  }
  if (role && user.role !== role) {
    if (unlisted) return <NotFoundPage />
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState
          title={t('state.wrongRole')}
          body={t('state.wrongRoleBody')}
          action={<LinkButton to="/signin">{t('nav.signIn')}</LinkButton>}
        />
      </main>
    )
  }
  return <>{children}</>
}

function NotFoundPage() {
  const { t } = useI18n()
  return (
    <main className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <EmptyState
        title={t('state.notFoundTitle')}
        body={t('state.notFoundBody')}
        action={<LinkButton to="/">{t('state.notFoundCta')}</LinkButton>}
      />
    </main>
  )
}

/**
 * Every address the app does not recognise arrives here — including, once,
 * the administration gate.
 *
 * The gate has no route of its own because a route needs its path written
 * down, and that path would then be readable in the built JavaScript by
 * anyone who cared to look. Instead the typed address is hashed and compared,
 * so what ships is a hash and nothing else.
 *
 * The check is asynchronous, and the wait is spent on a blank frame rather
 * than on "not found". Showing the miss first and correcting it a moment
 * later would flash a wrong answer at the one person entitled to the right
 * one, and would tell everybody else that this address is treated specially.
 */
function UnknownRoute() {
  const { pathname } = useLocation()
  const [verdict, setVerdict] = useState<'checking' | 'gate' | 'missing'>('checking')

  useEffect(() => {
    let live = true
    setVerdict('checking')
    void isAdminGatePath(pathname).then((isGate) => {
      if (live) setVerdict(isGate ? 'gate' : 'missing')
    })
    return () => {
      live = false
    }
  }, [pathname])

  if (verdict === 'checking') return <div className="min-h-[60dvh]" />
  if (verdict === 'missing') return <NotFoundPage />
  return (
    <Suspense fallback={<RouteFallback />}>
      <AdminAccessPage />
    </Suspense>
  )
}

export function App() {
  const { t } = useI18n()

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-100 focus:rounded-[3px] focus:bg-nasek-900 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-ivory-50"
      >
        {t('common.skipToContent')}
      </a>

      <ScrollToTop />
      <Navbar />

      <div id="main" className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
          <Route path="/smart-match" element={<SmartMatchPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/giving" element={<GivingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/signin/customer" element={<CustomerSignInPage />} />
          <Route path="/signin/owner" element={<OwnerSignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/signup/customer" element={<CustomerSignUpPage />} />
          <Route path="/signup/provider" element={<ProviderSignUpPage />} />
          <Route path="/booking/:id" element={<BookingPage />} />
          <Route
            path="/dashboard"
            element={
              <Protected role="customer">
                <DashboardPage />
              </Protected>
            }
          />
          <Route
            path="/provider"
            element={
              <Protected role="provider">
                <Suspense fallback={<RouteFallback />}>
                  <ProviderDashboardPage />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <Protected role="admin" unlisted>
                <Suspense fallback={<RouteFallback />}>
                  <AdminDashboardPage />
                </Suspense>
              </Protected>
            }
          />
          <Route path="*" element={<UnknownRoute />} />
        </Routes>
      </div>

      <Footer />
      <AssistantWidget />
      <ToastHost />
    </div>
  )
}
