import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useRemoteData } from '@/hooks/useRemoteData'
import { loadSessionSettled, onAuthChange, signOutRemote } from '@/services/auth/session'
import { completeAuthRedirect, isAuthRedirect } from '@/services/auth/redirect'
import { Spinner } from '@/components/ui'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { OwnerShell } from './layout/OwnerShell'
import { OwnerLoginPage } from './LoginPage'
import { SetPasswordPage } from './SetPasswordPage'
import { CompanyRegistrationPage } from './RegisterPage'
import { PendingPage, RejectedPage, SuspendedPage } from './StatusPages'

/*
 * The dashboard is split out, and the charting library is why.
 *
 * `DashboardPage` imports `recharts` — for the trend on the overview tab and
 * the two bar charts under analytics — and that library is most of this
 * application's weight. Imported at the top of this file it landed in the entry
 * chunk, so the portal shipped 1,094 kB before it could draw anything, and the
 * first thing it draws for a signed-out owner is a password field.
 *
 * That is the wrong order. An owner arriving at the portal is, at that moment,
 * a person who needs a login form; the four screens behind the gate are worth
 * nothing to them until they are through it, and an invited owner following a
 * link on a phone is exactly the case that can least afford a megabyte first.
 *
 * `src/admin/AdminApp.tsx` makes the same split for the same reason, and the
 * public site made it for the old provider dashboard before that.
 */
const DashboardPage = lazy(() =>
  import('./DashboardPage').then((m) => ({ default: m.DashboardPage })),
)

/**
 * The Campaign Owner Portal.
 *
 * A separate React root, a separate HTML entry, a separate Vite build and a
 * separate deployment target from both the public site and the administration
 * dashboard. The three share `src/types.ts`, the design system, the i18n
 * machinery and the Supabase client, because those are genuinely one thing — a
 * campaign is the same campaign whichever screen it is on. What they do not
 * share is a bundle or a single line of navigation.
 *
 * That is the half of the separation this file is responsible for. The other
 * half is not here at all: it is in `supabase/migrations/*_rls_policies.sql`,
 * because a guard written in the client is a guard the client can edit. Nothing
 * below decides what an owner may read — `campaigns_read`, `bookings_read` and
 * `owns_provider` do, before a row is returned, and would still do it if every
 * line of this component were deleted.
 *
 * WHY THERE IS NO ROUTER
 *
 * The portal has one screen behind the gate, and the gate itself has four
 * states. A router would add addresses that mean nothing to anybody: an owner
 * bookmarks the portal, not `/pending`, and the state they land in is a fact
 * about their company rather than about where they clicked. The dashboard's own
 * sections are tabs in a query parameter, which is where they were already.
 */

type Gate =
  | { phase: 'checking' }
  /**
   * Signed out, or signed in as somebody who is not a campaign owner.
   *
   * `linkError` is set when this page load *was* an arrival from an emailed
   * link and that link could not be completed. Without it the portal answered
   * a dead invitation with a bare "Email / Password / Sign in" — which is the
   * one screen an invited owner cannot use, because the whole point of the
   * invitation is that they have no password yet. They were left to conclude
   * the portal was broken, and in a sense it was.
   */
  | { phase: 'out'; linkError?: 'expired' | 'wrong_browser' | 'failed' }
  /** Arrived from an invitation or a reset link; owes a password. */
  | { phase: 'password' }
  /**
   * Signed in, and owns no company yet.
   *
   * The state a self-registering owner is in the moment they follow the
   * confirmation link: a real NASEK account, a confirmed address, and nothing
   * on `providers` with their id against it. The company form is what they came
   * for, so it is what they get.
   *
   * This used to be an immediate sign-out — "you are not a campaign owner, go
   * away" — which was right while an administrator was the only way onto the
   * platform. It is wrong now that a company can register itself, and it would
   * have made the confirmation link a dead end. Nothing is granted by reaching
   * the form: `register_provider` decides the role itself, always leaves the
   * company `pending`, and an administrator still has to verify the permit.
   */
  | { phase: 'register' }
  | { phase: 'in' }

/**
 * "This account came in on an invitation and still owes a password."
 *
 * Kept in `sessionStorage` rather than deduced from the current URL, and that
 * is a correction of a real defect rather than belt-and-braces.
 *
 * The URL is true for exactly one moment. `completeAuthRedirect()` strips the
 * fragment as soon as it has used it — it has to, so a token does not sit in
 * browser history — and `setSession()` fires an auth-state change that runs
 * this whole check a second time. That second run sees a clean URL, concludes
 * the owner did not arrive from a link, and sends them to the dashboard with
 * no password ever set. A plain page refresh does the same thing. Either way
 * the owner ends up unable to sign in again, having never been asked.
 *
 * Session-scoped on purpose: it is a fact about this arrival, not about the
 * account, and the account's real recovery path if the tab is closed is the
 * portal's own "forgotten your password", which issues a fresh link to the
 * same screen.
 */
const OWES_PASSWORD_KEY = 'nasek.owner.owes-password'

/*
 * Mirrored in memory, because Safari in private browsing throws on
 * `sessionStorage` rather than returning null. Storage is what survives a
 * refresh; this is what survives the auth-state change that re-runs the check
 * milliseconds later — and that second one is the case that was actually
 * breaking, so losing it on a private-mode phone would leave the bug in place
 * for exactly the people most likely to open a link on one.
 */
let owesPasswordInMemory = false

const markOwesPassword = () => {
  owesPasswordInMemory = true
  try {
    window.sessionStorage.setItem(OWES_PASSWORD_KEY, '1')
  } catch {
    /* private mode — the in-memory mirror carries this page load */
  }
}

const owesPassword = () => {
  if (owesPasswordInMemory) return true
  try {
    return window.sessionStorage.getItem(OWES_PASSWORD_KEY) === '1'
  } catch {
    return false
  }
}

const clearOwesPassword = () => {
  owesPasswordInMemory = false
  try {
    window.sessionStorage.removeItem(OWES_PASSWORD_KEY)
  } catch {
    /* ignore */
  }
}

export function OwnerApp() {
  const { t } = useI18n()
  const { dispatch } = useStore()
  const [gate, setGate] = useState<Gate>({ phase: 'checking' })
  /** Generation counter, so a superseded check cannot answer for a newer one. */
  const runRef = useRef(0)

  const check = useCallback(async () => {
    /*
     * If this page load is an arrival from an emailed link, finish that first.
     *
     * Order matters: establish *who* you are from the link, then ask whether
     * that person is a campaign owner. Reversing it would check an anonymous
     * session and refuse a legitimate owner on their very first visit.
     *
     * An invitation and a password reset both land here, and both mean the same
     * thing for what happens next — there is a session, and the account either
     * has no password or has one its holder cannot remember. Either way the
     * next screen is the same one.
     */
    /*
     * Only the most recent check may write the gate.
     *
     * `setSession()` inside `completeAuthRedirect()` fires an auth-state change,
     * which runs `check` again while the first run is still in flight. Two runs
     * then raced to answer a question they had different information about —
     * the first knew an invitation had just been redeemed, the second saw a
     * cleaned URL — and whichever finished last won. That is how an invited
     * owner could land on the dashboard, or on the login screen, at random.
     */
    const run = ++runRef.current
    const settle = (next: Gate) => {
      if (runRef.current === run) setGate(next)
    }

    if (isAuthRedirect()) {
      const outcome = await completeAuthRedirect()
      if (outcome.kind === 'error') {
        /*
         * A link that could not be completed. Almost always because it has
         * already been used — single-use tokens are routinely spent by the
         * scanners that mail providers and corporate filters run over inbound
         * links, so the human clicking arrives second.
         *
         * Say so. The owner can then use "forgotten your password", which
         * issues a fresh link to the same screen and needs no administrator.
         */
        settle({ phase: 'out', linkError: outcome.reason })
        return
      }
      /*
       * An invitation or a password reset. Both mean the same thing for what
       * happens next — there is a session, and the account either has no
       * password or has one its holder cannot remember.
       *
       * Recorded now, while the answer is known, rather than re-derived later
       * from a URL that is about to be wiped.
       */
      if (outcome.kind === 'signed-in') markOwesPassword()
    }

    const session = await loadSessionSettled()

    if (!session.user || session.blocked) {
      settle({ phase: 'out' })
      return
    }

    /*
     * The role check, asked of Postgres rather than of this browser.
     *
     * `loadSessionSettled` reads `profiles` through row-level security, so the
     * role on the object below is the database's answer about the signed-in
     * account. A pilgrim or an administrator who has somehow arrived here with
     * a session is signed out rather than left in a portal whose every query
     * would come back empty.
     */
    /*
     * An administrator is still shown the door.
     *
     * The administration dashboard is a separate build with a separate session
     * key, and an administrator with a session here has arrived somewhere they
     * have no business being. Offering them a company registration form would
     * be offering to demote the account that moderates the platform.
     */
    if (session.user.role === 'admin') {
      await signOutRemote()
      dispatch({ type: 'signOut' })
      clearOwesPassword()
      settle({ phase: 'out' })
      return
    }

    /*
     * Anyone else signed in without a company is offered one.
     *
     * `role !== 'provider'` is the same test as before; what changed is the
     * answer. See the `register` phase above.
     */
    if (session.user.role !== 'provider') {
      dispatch({ type: 'registerUser', user: session.user })
      dispatch({ type: 'signIn', user: session.user })
      settle({ phase: owesPassword() ? 'password' : 'register' })
      return
    }

    dispatch({ type: 'registerUser', user: session.user })
    dispatch({ type: 'signIn', user: session.user })
    settle({ phase: owesPassword() ? 'password' : 'in' })
  }, [dispatch])

  useEffect(() => {
    void check()
  }, [check])

  /*
   * Re-check when the session changes anywhere — another tab signing out, a
   * refresh token that could not be renewed, a role revoked while the portal
   * sat open. Without this the interface would keep drawing a dashboard whose
   * every query had started coming back empty.
   */
  useEffect(() => onAuthChange(() => void check()), [check])

  if (gate.phase === 'checking') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ivory-100">
        <Spinner className="size-8 text-nasek-600" />
        <p className="text-sm font-medium text-ink-400">{t('auth.completingSignIn')}</p>
      </div>
    )
  }

  if (gate.phase === 'out') {
    return <OwnerLoginPage onSignedIn={check} linkError={gate.linkError} />
  }

  if (gate.phase === 'register') {
    return (
      <CompanyRegistrationPage
        onDone={async () => {
          /*
           * Re-read rather than assume. `register_provider` has promoted the
           * account to 'provider' and created a `pending` company, and both
           * facts live in Postgres — this asks it, and the answer lands the
           * owner on the "awaiting verification" screen.
           */
          await check()
        }}
      />
    )
  }

  if (gate.phase === 'password') {
    return (
      <SetPasswordPage
        onDone={async () => {
          // The debt is paid; a refresh from here belongs on the dashboard.
          clearOwesPassword()
          setGate({ phase: 'in' })
        }}
      />
    )
  }

  return <OwnerPortal />
}

/**
 * The portal proper. Only ever rendered behind a resolved owner session.
 *
 * Which of the four screens an owner sees is a fact about their *company*, not
 * about their account: registered and waiting, approved, refused, or suspended.
 * The dashboard is one of four, not the default with three exceptions — an
 * owner whose company is in the queue genuinely cannot do anything yet, and a
 * dashboard with every control disabled invites them to try each one and work
 * out why from the silence.
 */
function OwnerPortal() {
  // Only mounted behind a resolved owner session, so the snapshot it fetches is
  // the one the policies grant that role: their own company, their own trips,
  // the bookings on them.
  useRemoteData()
  const { user } = useStore()
  const { getProvider } = useCatalogue()

  const provider = user?.providerId ? getProvider(user.providerId) : undefined

  /*
   * A company row that has not arrived yet is treated as approved.
   *
   * The alternative — assume the worst and draw "awaiting verification" — is
   * wrong far more often: the snapshot lands a beat after the session on every
   * page load, so every approved owner would see a queue-shaped screen flash
   * before their own dashboard. There is nothing to protect by guessing,
   * because the dashboard an unapproved owner would briefly see is empty by
   * policy — `campaigns_read` withholds their trips from the public catalogue
   * whatever this component draws.
   */
  const status = provider?.verification ?? 'verified'

  return (
    <OwnerShell>
      {status === 'suspended' ? (
        <SuspendedPage provider={provider} />
      ) : status === 'rejected' ? (
        <RejectedPage />
      ) : status === 'verified' ? (
        /*
          The boundary sits inside `OwnerShell`, not around it, and that is the
          whole point of putting it here. A throw from the dashboard — or from
          anything it opens — now costs the owner the dashboard and leaves them
          the header, the language switch and the way out. Around the shell it
          would cost them the portal, which is what has already happened twice.

          The Suspense fallback inside is held while the dashboard chunk
          arrives, sized so the shell — already painted around it — does not
          jump when it lands.
        */
        <ErrorBoundary where="the owner dashboard">
          <Suspense
            fallback={
              <div className="flex min-h-[60dvh] items-center justify-center">
                <Spinner className="size-7 text-nasek-600" />
              </div>
            }
          >
            <DashboardPage />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <PendingPage />
      )}
    </OwnerShell>
  )
}
