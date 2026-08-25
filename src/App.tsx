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
import { CustomerSignUpPage, SignInPage, SignUpPage } from '@/pages/AuthPages'
import { ProviderSignUpPage } from '@/pages/ProviderSignUpPage'
import { ADMIN_ACCESS_PATH } from '@/services/api/adminAccess'
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
/** The gate is split too, so the public bundle carries no trace of it. */
const AdminAccessPage = lazy(() =>
  import('@/pages/AdminAccessPage').then((m) => ({ default: m.AdminAccessPage })),
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

/**
 * Gate a route behind a signed-in account of a given role.
 *
 * `unlisted` marks a route that should not admit to existing: instead of
 * sending an unauthenticated visitor to the public sign-in page and telling a
 * signed-in one that they have the wrong sort of account — both of which
 * announce that the route is real — it sends them to the passphrase gate and
 * shows a plain "not found". Used for administration.
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
    if (unlisted) return <Navigate to={ADMIN_ACCESS_PATH} replace />
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
          <Route path="/signup/customer" element={<CustomerSignUpPage />} />
          <Route path="/signup/provider" element={<ProviderSignUpPage />} />
          <Route
            path={ADMIN_ACCESS_PATH}
            element={
              <Suspense fallback={<RouteFallback />}>
                <AdminAccessPage />
              </Suspense>
            }
          />
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
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>

      <Footer />
      <AssistantWidget />
      <ToastHost />
    </div>
  )
}
