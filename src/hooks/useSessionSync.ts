import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { loadSession, onAuthChange } from '@/services/auth/session'
import { useStore } from '@/store/AppStore'

/**
 * Keep the store's idea of who is signed in matched to the server's.
 *
 * The prototype's session was whatever `localStorage` said it was, which made
 * it authoritative by accident: nothing ever contradicted it. With a backend
 * there is a second, better answer, and this is the reconciliation between them.
 *
 * Three cases it has to get right, all of which are the same case from the
 * browser's point of view and very different from the person's:
 *
 *   * A session that outlived its tab. Restored, so a returning pilgrim is
 *     still signed in — that already worked and must keep working.
 *   * A session that expired, or was signed out in another tab. The stored user
 *     is stale and has to go, or the interface keeps drawing a dashboard whose
 *     every query now returns nothing.
 *   * An account suspended or removed while it was open. The token is still
 *     valid — revoking one mid-flight is not something Supabase does — so the
 *     only thing that ends the session is this check noticing the profile says
 *     so. Enforcing it here, on every load and every auth event, is what stops
 *     a barred account from simply leaving the tab open.
 *
 * When no backend is configured this does nothing at all, and the store keeps
 * the behaviour it has always had.
 */
export function useSessionSync() {
  const { dispatch } = useStore()
  // The first reconciliation is asynchronous, and until it lands the stored
  // user might be about to be revoked. Pages that gate on `user` would flash
  // their signed-in state and then bounce, so callers wait for this.
  const [settled, setSettled] = useState(!isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let live = true

    const reconcile = async () => {
      const session = await loadSession()
      if (!live) return
      if (session.user) dispatch({ type: 'signIn', user: session.user })
      else dispatch({ type: 'signOut' })
      setSettled(true)
    }

    void reconcile()
    const unsubscribe = onAuthChange(() => void reconcile())
    return () => {
      live = false
      unsubscribe()
    }
  }, [dispatch])

  return settled
}
