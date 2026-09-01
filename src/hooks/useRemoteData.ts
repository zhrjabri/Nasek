import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { fetchSnapshot } from '@/services/data/catalogue'
import { onAuthChange } from '@/services/auth/session'
import { useStore } from '@/store/AppStore'

/**
 * Load the catalogue from the database into the store.
 *
 * Mounted once per application. Everything else in NASEK keeps reading the
 * store exactly as it did when the store was all there was — `useCatalogue`,
 * both dashboards and every admin table are untouched — which is the point:
 * moving the source of truth to Postgres should not have meant rewriting the
 * screens that display it.
 *
 * It reloads on every authentication change, and that is not merely tidiness.
 * Row-level security answers a different question for an anonymous visitor, a
 * traveller, a campaign owner and an administrator, so the same query returns
 * genuinely different data depending on who is asking. Signing in has to
 * re-ask, or an owner would sit looking at the anonymous catalogue and wonder
 * where their bookings went.
 */
export function useRemoteData() {
  const { dispatch } = useStore()
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    isSupabaseConfigured ? 'loading' : 'idle',
  )

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return
    setState('loading')
    try {
      const snapshot = await fetchSnapshot()
      if (!snapshot) {
        setState('idle')
        return
      }
      dispatch({ type: 'hydrateRemote', snapshot })
      setState('ready')
    } catch {
      /*
       * A failed load leaves the store as it was rather than emptying it.
       *
       * `remoteReady` stays false, so `useCatalogue` keeps serving whatever it
       * was serving — which for a signed-out visitor on a flaky connection is a
       * cached catalogue rather than a blank site with no explanation.
       */
      setState('error')
    }
  }, [dispatch])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => onAuthChange(() => void load()), [load])

  return { state, reload: load }
}
