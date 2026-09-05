import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useRemoteData } from '@/hooks/useRemoteData'
import { loadSessionSettled, onAuthChange, signOutRemote } from '@/services/auth/session'
import { completeAuthRedirect, isAuthRedirect } from '@/services/auth/redirect'
import { Spinner } from '@/components/ui'
import { OwnerShell } from './layout/OwnerShell'
import { OwnerLoginPage } from './LoginPage'
import { SetPasswordPage } from './SetPasswordPage'
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
  /** Signed out, or signed in as somebody who is not a campaign owner. */
  | { phase: 'out' }
  /** Arrived from an invitation or a reset link; owes a password. */
  | { phase: 'password' }
  | { phase: 'in' }

export function OwnerApp() {
  const { t } = useI18n()
  const { dispatch } = useStore()
  const [gate, setGate] = useState<Gate>({ phase: 'checking' })

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
    let cameFromLink = false
    if (isAuthRedirect()) {
      cameFromLink = true
      const outcome = await completeAuthRedirect()
      if (outcome.kind === 'error') {
        setGate({ phase: 'out' })
        return
      }
    }

    const session = await loadSessionSettled()

    if (!session.user || session.blocked) {
      setGate({ phase: 'out' })
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
    if (session.user.role !== 'provider') {
      await signOutRemote()
      dispatch({ type: 'signOut' })
      setGate({ phase: 'out' })
      return
    }

    dispatch({ type: 'registerUser', user: session.user })
    dispatch({ type: 'signIn', user: session.user })
    setGate({ phase: cameFromLink ? 'password' : 'in' })
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

  if (gate.phase === 'out') return <OwnerLoginPage onSignedIn={check} />

  if (gate.phase === 'password') {
    return <SetPasswordPage onDone={async () => setGate({ phase: 'in' })} />
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
        /* Held while the dashboard chunk arrives. Sized so the shell, which is
           already painted around it, does not jump when it lands. */
        <Suspense
          fallback={
            <div className="flex min-h-[60dvh] items-center justify-center">
              <Spinner className="size-7 text-nasek-600" />
            </div>
          }
        >
          <DashboardPage />
        </Suspense>
      ) : (
        <PendingPage />
      )}
    </OwnerShell>
  )
}
