import { Suspense, lazy, useEffect } from 'react'
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
import { SignInPage, SignUpPage } from '@/pages/AuthPages'
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
const AdminDashboardPage = lazy(() =>
  import('@/pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
)

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

/** Gate a route behind a signed-in account of a given role. */
function Protected({
  role,
  children,
}: {
  role?: 'customer' | 'provider' | 'admin'
  children: React.ReactNode
}) {
  const { user } = useStore()
  const { t } = useI18n()
  const location = useLocation()

  if (!user) {
    return (
      <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    )
  }
  if (role && user.role !== role) {
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
          <Route path="/signup" element={<SignUpPage />} />
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
              <Protected role="admin">
                <Suspense fallback={<RouteFallback />}>
                  <AdminDashboardPage />
                </Suspense>
              </Protected>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>

      <Footer />
      <AssistantWidget />
      <ToastHost />
    </div>
  )
}
