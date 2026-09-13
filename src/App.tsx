import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { useSessionSync } from '@/hooks/useSessionSync'
import { useAuthRedirect } from '@/hooks/useAuthRedirect'
import { useRemoteData } from '@/hooks/useRemoteData'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { ToastHost } from '@/components/layout/ToastHost'
import { EmptyState, LinkButton, RuleLink, Spinner } from '@/components/ui'
import { recordVisit } from '@/services/analytics/visits'

import { HomePage } from '@/pages/HomePage'
import { CampaignsPage } from '@/pages/CampaignsPage'
import { CampaignDetailPage } from '@/pages/CampaignDetailPage'
import { SmartMatchPage } from '@/pages/SmartMatchPage'
import { MapPage } from '@/pages/MapPage'
import { BookingPage } from '@/pages/BookingPage'
import { SignInPage, SignInRedirect } from '@/pages/AuthPages'
import { DashboardPage } from '@/pages/DashboardPage'
import { GivingPage } from '@/pages/GivingPage'
import { AboutPage } from '@/pages/AboutPage'

/**
 * The NASEK customer website.
 *
 * This application is for pilgrims and nobody else, and that is now true of the
 * *bundle* rather than only of the navigation. There are three NASEK
 * applications — this one, the Campaign Owner Portal (`src/owner/`) and the
 * administration dashboard (`src/admin/`) — built by three Vite configs, output
 * to three directories, deployed to three hosts.
 *
 * What that buys, stated plainly: a pilgrim's browser downloads no route, no
 * component and no string belonging to the other two. Not a hidden link, not a
 * lazily-loaded chunk, not a dictionary entry. Someone reading this bundle
 * learns that NASEK lists campaigns and takes bookings, and nothing else.
 * `npm run verify:isolation` walks the import graph *and* greps the built
 * output, because the graph is a claim about the source and the output is the
 * thing that actually ships.
 *
 * The routes below are the whole of it: browse, search, read a campaign, sign
 * in with a one-time code, book, and look at your own bookings.
 */

/**
 * Restore scroll on navigation — a router default that surprises people — and
 * honour a fragment when the link carried one.
 *
 * The fragment half is not a nicety. Links in the footer point at sections of
 * the About page — `/about#privacy`, `#terms`, `#contact` — and every one of
 * them landed at the top of the page with no indication that anything had been
 * asked for. Two things conspired: under a hash router the document's own
 * fragment is `#/about#privacy`, which matches no element, so the browser's
 * native scrolling has nothing to act on; and the effect below then scrolled to
 * the top regardless.
 *
 * `useLocation().hash` is the router's parse of the part after the *second*
 * hash, which is the piece that names the section. Where it names something on
 * the page, that is where to go.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    const target = hash ? document.getElementById(hash.slice(1)) : null
    if (target) {
      target.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' })
      return
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, hash])
  return null
}

/** A bare v4 UUID and nothing else — the id in `/campaigns/<id>`. */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * Count the visit, once per route.
 *
 * Deliberately a sibling of `ScrollToTop` rather than something each page
 * calls: a page that forgets is a page that silently stops being counted, and
 * the difference between "nobody visited the map" and "nobody added the call
 * to the map" is invisible in the numbers.
 *
 * Only the path is sent, and only after it has been reduced to a shape — see
 * `services/analytics/visits.ts` for what is and is not collected. The
 * campaign id is passed on a campaign page because "which trips are people
 * looking at" is the question the owner and the administration actually have;
 * it is validated as a UUID first so that a mistyped URL is counted as a page
 * rather than rejected by the server.
 */
function RecordVisit() {
  const { pathname } = useLocation()
  useEffect(() => {
    const id = pathname.match(/^\/campaigns\/([^/]+)$/)?.[1]
    recordVisit(pathname, id && UUID.test(id) ? id : null)
  }, [pathname])
  return null
}

/**
 * Gate a route behind a signed-in account.
 *
 * There is one such route — `/dashboard`, a pilgrim's own bookings — and no
 * role check on it any more. That is a simplification the three-application
 * split earned rather than a guard being dropped: this bundle has no owner
 * screens and no administration screens to protect, so the only question left
 * is "are you signed in", and every signed-in person on this site is a person
 * with bookings to look at. A campaign owner who books a trip for their own
 * family is a customer while they do it.
 *
 * Worth being precise about what this does and does not do. It decides what to
 * render. It does not decide what data anyone may read — that is settled by
 * row-level security in Postgres, before a row is returned, and would still be
 * settled there if every line of this function were deleted.
 */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, authSettled } = useStore()
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
      <Navigate
        to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
  }
  return <>{children}</>
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
        action={<RuleLink to="/">{t('state.notFoundCta')}</RuleLink>}
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
  // Fills the store from Postgres, and refills it whenever the session changes.
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
      <RecordVisit />
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
          <Route path="/booking/:id" element={<BookingPage />} />
          <Route
            path="/dashboard"
            element={
              <Protected>
                <DashboardPage />
              </Protected>
            }
          />

          {/*
            Addresses this site used to answer on.

            Every one of them was a way to register — as a pilgrim, or as a
            campaign owner. There is no registration on this site any more:
            verifying a code on an unknown address creates the account, so
            "sign in" and "sign up" were always the same operation with two
            names, and campaign owners are created by NASEK rather than by a
            form. They forward to the one door this application has, because a
            bookmark that answers "not found" is indistinguishable from a
            broken site.
          */}
          <Route path="/signin/customer" element={<SignInRedirect />} />
          <Route path="/signin/owner" element={<SignInRedirect />} />
          <Route path="/signup" element={<SignInRedirect />} />
          <Route path="/signup/customer" element={<SignInRedirect />} />
          <Route path="/signup/provider" element={<SignInRedirect />} />
          {/* The owner portal used to live under these. It is a separate
              application on a separate host now, and this site does not know
              its address — so these lead home rather than anywhere. */}
          <Route path="/provider/*" element={<Navigate to="/" replace />} />
          <Route path="/owner/*" element={<Navigate to="/" replace />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>

      <Footer />
      <ToastHost />
    </div>
  )
}
