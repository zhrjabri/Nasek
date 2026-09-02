import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { useSessionSync } from '@/hooks/useSessionSync'
import { useAuthRedirect } from '@/hooks/useAuthRedirect'
import { useRemoteData } from '@/hooks/useRemoteData'
import { useCatalogue } from '@/hooks/useCatalogue'
import { landingFor, providerLanding } from '@/hooks/useSignIn'
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
import {
  ProviderPendingPage,
  ProviderReviewPage,
  ProviderSuspendedPage,
} from '@/pages/ProviderStatusPages'
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
 * There used to be a second mode here — `unlisted` — which answered "not
 * found" rather than "wrong account", so that the administration route would
 * not admit to existing. It is gone because the route is gone: administration
 * is a separate application on a separate host, and the only thing this file
 * now guards is which of a pilgrim's own pages they are looking at.
 *
 * Worth being precise about what this does and does not do. It decides what to
 * render. It does not decide what data anyone may read — that is settled by
 * row-level security in Postgres, before a row is returned, and would still be
 * settled there if every line of this function were deleted. Typing
 * `/provider` as a pilgrim gets you a message; it never got you anyone's
 * bookings, because the bookings were never sent.
 *
 * An administrator is admitted to `/dashboard` alongside customers, and that is
 * a fix rather than a loophole. Administration lives on another host entirely;
 * on *this* site an administrator is a person with an account like anyone
 * else's, and `landingFor` has always sent them here. Refusing them produced
 * the one genuinely absurd outcome the old guard could manage — signed in
 * successfully, redirected to `/dashboard`, and told the dashboard was for a
 * different kind of account.
 */
function Protected({
  role,
  children,
}: {
  role?: 'customer' | 'provider'
  children: React.ReactNode
}) {
  const { user, authSettled } = useStore()
  const { t } = useI18n()
  const location = useLocation()

  /*
   * Wait for the server's answer before acting on the stored one.
   *
   * Without this, a restored session would render the dashboard, the
   * reconciliation would land a moment later, and a signed-out or suspended
   * visitor would be thrown to the sign-in page having just been shown a page
   * that looked like theirs. Holding a blank frame for one round trip is a
   * better lie than a page that has to be taken back.
   */
  if (!authSettled) return <div className="min-h-[60dvh]" />

  if (!user) {
    return (
      <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    )
  }

  const allowed = !role || user.role === role || (role === 'customer' && user.role === 'admin')
  if (!allowed) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState
          title={t('state.wrongRole')}
          body={t('state.wrongRoleBody')}
          action={<LinkButton to={landingFor(user)}>{t('state.wrongRoleCta')}</LinkButton>}
        />
      </main>
    )
  }
  return <>{children}</>
}

/**
 * The three doors behind `/provider`, and which one is open.
 *
 * A campaign owner's account exists from the moment they register, but their
 * *company* moves through review — pending, approved, refused, suspended — and
 * each of those is a genuinely different screen rather than a different message
 * on the same one. Splitting them into addresses (`/provider`,
 * `/provider/pending`, `/provider/review`) is what lets the owner's own
 * navigation, a bookmark and a link in an email all land somewhere that makes
 * sense.
 *
 * This decides only which of those to *show*. What an unapproved company can
 * actually do is decided in Postgres: `campaigns_read` withholds their trips
 * from the public catalogue, so an owner who bypasses this component entirely
 * still cannot publish. The screen and the policy agree, and the policy is the
 * one that holds.
 */
function ProviderGate({
  expect,
  children,
}: {
  /** Which state this route is *for*. Any other state redirects to its own. */
  expect: 'approved' | 'pending' | 'rejected'
  children: React.ReactNode
}) {
  const { user } = useStore()
  const { getProvider } = useCatalogue()

  const provider = user?.providerId ? getProvider(user.providerId) : undefined

  /*
   * An owner whose company row has not arrived yet is treated as approved and
   * shown the dashboard.
   *
   * The alternative — assume the worst and show "awaiting verification" — is
   * wrong far more often: the snapshot lands a beat after the session on every
   * single page load, so every approved owner would see a queue-shaped screen
   * flash before their own dashboard. There is nothing to protect by guessing,
   * because the dashboard an unapproved owner would briefly see is empty by
   * policy — `campaigns_read` withholds their trips from the public catalogue
   * whatever this component draws.
   */
  const destination = provider ? providerLanding(provider.verification) : '/provider'

  // No destination means suspended: the one state with no route, because there
  // is nowhere for a suspended owner to go and pretending otherwise would send
  // them round a redirect loop.
  if (!destination) return <ProviderSuspendedPage provider={provider} />
  if (destination === EXPECTED_ROUTE[expect]) return <>{children}</>
  return <Navigate to={destination} replace />
}

/** Which address each of this component's three modes owns. */
const EXPECTED_ROUTE: Record<'approved' | 'pending' | 'rejected', string> = {
  approved: '/provider',
  pending: '/provider/pending',
  rejected: '/provider/review',
}

/**
 * What someone sees between clicking a link in an email and being signed in.
 *
 * Two round trips happen here — exchanging the code, then reading the profile
 * back — and a blank home page for that second is how people conclude the link
 * did not work and click it again, spending the single use it had.
 */
function AuthRedirectScreen({ error }: { error?: string }) {
  const { t } = useI18n()
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      {error ? (
        <>
          <EmptyState title={t('auth.linkRetry')} body={error} />
          <LinkButton to="/signin" className="mt-6">
            {t('nav.signIn')}
          </LinkButton>
        </>
      ) : (
        <>
          <Spinner className="size-8 text-nasek-600" />
          <p className="mt-4 text-base font-medium text-ink-600">{t('auth.completingSignIn')}</p>
        </>
      )}
    </main>
  )
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
  const navigate = useNavigate()
  // Mounted at the root as well as inside `Protected`, so a stale session is
  // cleared on any page — the navigation bar should not offer an account menu
  // for someone who is no longer signed in.
  useSessionSync()
  // Finishes a sign-in that began in an email. Does nothing on an ordinary
  // page load, which is almost all of them.
  const redirect = useAuthRedirect(navigate)
  // Fills the store from Postgres, and refills it whenever the session
  // changes — the policies return a different catalogue to a signed-out
  // visitor than to an owner.
  useRemoteData()

  if (redirect.phase === 'working') return <AuthRedirectScreen />
  if (redirect.phase === 'error') {
    return <AuthRedirectScreen error={t(redirect.message)} />
  }

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
                <ProviderGate expect="approved">
                  <Suspense fallback={<RouteFallback />}>
                    <ProviderDashboardPage />
                  </Suspense>
                </ProviderGate>
              </Protected>
            }
          />
          {/* Registered, in the queue, nothing to do but wait — and a screen
              that says exactly that beats a dashboard with every control
              disabled and no explanation of why. */}
          <Route
            path="/provider/pending"
            element={
              <Protected role="provider">
                <ProviderGate expect="pending">
                  <ProviderPendingPage />
                </ProviderGate>
              </Protected>
            }
          />
          {/* Refused. Shows the reason and the form to correct it, because a
              refusal an owner cannot act on is just a dead end with wording. */}
          <Route
            path="/provider/review"
            element={
              <Protected role="provider">
                <ProviderGate expect="rejected">
                  <ProviderReviewPage />
                </ProviderGate>
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
