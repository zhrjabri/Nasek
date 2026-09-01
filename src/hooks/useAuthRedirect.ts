import { useEffect, useState } from 'react'
import type { MessageKey } from '@/i18n'
import { completeAuthRedirect, isAuthRedirect } from '@/services/auth/redirect'
import { loadSessionSettled } from '@/services/auth/session'
import { useStore } from '@/store/AppStore'
import { landingFor } from '@/hooks/useSignIn'

/**
 * Finish a sign-in that started in an email.
 *
 * Mounted once at the root of each application. On an ordinary page load it
 * does nothing at all — `isAuthRedirect()` is a synchronous check of the
 * address bar — so the cost of having it is a string test per load.
 *
 * When it *is* an arrival, the screen has to say so. Establishing the session
 * involves two round trips, and a blank home page for a second after clicking a
 * link in an email is how people conclude the link was broken and click it
 * again, spending the single use it had.
 */

export type RedirectState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'error'; message: MessageKey; detail?: string }

const REASON: Record<string, MessageKey> = {
  expired: 'auth.linkExpired',
  wrong_browser: 'auth.linkWrongBrowser',
  failed: 'auth.linkFailed',
}

export function useAuthRedirect(navigate: (path: string) => void): RedirectState {
  const { dispatch } = useStore()
  // Seeded synchronously so the very first paint already shows the spinner
  // rather than a flash of the home page.
  const [state, setState] = useState<RedirectState>(
    isAuthRedirect() ? { phase: 'working' } : { phase: 'idle' },
  )

  useEffect(() => {
    if (!isAuthRedirect()) return
    let live = true

    void (async () => {
      const outcome = await completeAuthRedirect()
      if (!live) return

      if (outcome.kind === 'error') {
        setState({ phase: 'error', message: REASON[outcome.reason], detail: outcome.detail })
        return
      }
      if (outcome.kind === 'none') {
        setState({ phase: 'idle' })
        return
      }

      // The profile row is created by a database trigger a beat after the auth
      // user, so this waits for it rather than reading once and giving up.
      const session = await loadSessionSettled()
      if (!live) return

      if (session.blocked === 'suspended') {
        setState({ phase: 'error', message: 'auth.blockedSuspended' })
        return
      }
      if (session.blocked === 'removed') {
        setState({ phase: 'error', message: 'auth.blockedRemoved' })
        return
      }
      if (!session.user) {
        setState({ phase: 'error', message: 'auth.sessionFailed' })
        return
      }

      dispatch({ type: 'registerUser', user: session.user })
      dispatch({ type: 'signIn', user: session.user })
      setState({ phase: 'idle' })
      navigate(landingFor(session.user))
    })()

    return () => {
      live = false
    }
    // Runs once per page load: whether this is a redirect is decided by the URL
    // the page opened with, and that does not change underneath us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
