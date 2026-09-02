import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { setSaved } from '@/services/data/catalogue'
import { useStore } from '@/store/AppStore'

/**
 * Saving a trip, from the card or from the trip's own page.
 *
 * One hook because it was two copies, and the copies had the same bug: they
 * toggled the store, wrote through to `saved_campaigns`, and ignored the fact
 * that a signed-out visitor's write silently does nothing. The heart filled in,
 * the toast said "saved", and the trip was gone on the next device — or on the
 * next reload, once the snapshot replaced the local guess with what the
 * database actually held. A save that quietly fails is worse than a save that
 * asks you to sign in first.
 *
 * NASEK's rule is that browsing needs no account: the catalogue, the filters,
 * the map, Smart Match and every trip page are open to anyone. Saving is one of
 * the few things that genuinely cannot work without one, because "saved" is a
 * fact about a person. So this is the one place that asks — at the moment the
 * person asked for something that needs it, carrying `next` so they land back
 * on the trip they were looking at rather than on a dashboard.
 *
 * With no backend configured there is nobody to be signed in as and nothing to
 * write to, so the original behaviour is kept exactly: the store toggles, and
 * the save lives in this browser like everything else did.
 */
export function useToggleSaved() {
  const { t } = useI18n()
  const { user, isSaved, dispatch, toast } = useStore()
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(
    (campaignId: string) => {
      if (isSupabaseConfigured && !user) {
        toast(t('campaign.saveNeedsAccount'), 'info')
        const next = encodeURIComponent(location.pathname + location.search)
        navigate(`/signin?next=${next}`)
        return
      }

      const saved = isSaved(campaignId)
      void setSaved(campaignId, !saved)
      dispatch({ type: 'toggleSaved', id: campaignId })
      toast(
        saved ? t('campaign.unsavedToast') : t('campaign.savedToast'),
        saved ? 'info' : 'success',
      )
    },
    [user, isSaved, dispatch, toast, t, navigate, location.pathname, location.search],
  )
}
