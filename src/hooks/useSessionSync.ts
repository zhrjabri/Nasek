import { useEffect } from 'react'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { loadSessionSettled, onAuthChange } from '@/services/auth/session'
import { useStore } from '@/store/AppStore'

/**
 * Keep the store's idea of who is signed in matched to the server's.
 *
 * Mounted **once**, at the root of each application. It used to be mounted
 * twice — at the root and again inside `Protected` — which meant two
 * independent listeners reconciling the same session against each other, and
 * two chances for the loser of that race to overwrite the winner.
 *
 * Two rules, both learned from a sign-in that completed and then undid itself:
 *
 *   * Retry before believing an empty answer. `loadSessionSettled` waits for
 *     the profile row, which a database trigger creates a moment after the auth
 *     user. Reading once and giving up meant a brand-new account looked
 *     signed-out at the exact instant it was created.
 *
 *   * Only sign someone out when there is genuinely no session. An unreadable
 *     profile — a slow trigger, a dropped request — is not the same as an
 *     absent session, and treating it as one threw away the session that
 *     `verifyOtp` had just established. That is what made a successful sign-in
 *     end up back on the public site.
 *
 * When no backend is configured this does nothing, and the store keeps the
 * behaviour it has always had.
 */
export function useSessionSync() {
  const { dispatch } = useStore()

  useEffect(() => {
    if (!isSupabaseConfigured) {
      dispatch({ type: 'setAuthSettled', settled: true })
      return
    }
    let live = true

    const reconcile = async () => {
      const session = await loadSessionSettled()
      if (!live) return

      if (session.user) {
        dispatch({ type: 'signIn', user: session.user })
      } else if (!session.hasSession || session.blocked) {
        // Genuinely signed out, or barred by an administrator. Both mean the
        // stored user must go.
        dispatch({ type: 'signOut' })
      }
      // Otherwise: a session exists but its profile is not readable yet. Leave
      // the store alone and let the next auth event or reload settle it.

      dispatch({ type: 'setAuthSettled', settled: true })
    }

    void reconcile()
    const unsubscribe = onAuthChange(() => void reconcile())
    return () => {
      live = false
      unsubscribe()
    }
  }, [dispatch])
}
