import { supabase, supabaseUrl } from '@/services/supabase/client'

/**
 * Photographs of a trip.
 *
 * The counterpart of `storage/licence.ts`, and deliberately the opposite of it
 * in the one respect that matters. A permit is evidence: private bucket, signed
 * URLs that expire, two people entitled to look. A campaign photograph is
 * advertising: its whole job is to be fetched by an anonymous visitor on a
 * phone, on a page that has to paint quickly, and to keep working when that
 * page is shared. See `20260904000400_campaign_images.sql` for the full
 * argument; the short version is that a signed URL costs a round trip per
 * image, defeats CDN caching and expires while the page is still open.
 *
 * So this bucket is public to read and locked on every other verb: an upload
 * may only land under the uploader's own account id, and only they or an
 * administrator may replace or delete it.
 *
 * What is stored on the campaign row is the object *path*, never a URL. A path
 * survives the project moving domain and is what the storage policies are
 * written about; `campaignImageUrl` turns one into a URL at the moment of
 * rendering.
 */

/** Matches the bucket created in `20260904000400_campaign_images.sql`. */
export const CAMPAIGN_IMAGE_BUCKET = 'campaign-images'

export const CAMPAIGN_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
export const CAMPAIGN_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/**
 * How many a single campaign may carry.
 *
 * A ceiling rather than a guideline: the whole array is written back on every
 * save, it is read by every visitor who opens the trip, and a listing with
 * thirty photographs is a listing nobody scrolls to the bottom of.
 */
export const CAMPAIGN_IMAGE_LIMIT = 8

export type CampaignImageError = 'offline' | 'unauthenticated' | 'type' | 'size' | 'failed'

/** ASCII-safe key. Arabic file names are common and Storage keys are not. */
function safeName(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9._-]+/g, '-')
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  return `${stem.slice(0, 40) || 'photo'}${ext || '.jpg'}`
}

/**
 * Put one photograph in the bucket, under the signed-in account's own folder.
 *
 * The path is built here rather than accepted from the caller — the same
 * security property `uploadLicence` relies on. The storage policies decide both
 * "may you write this" and "may you delete it" from the first path segment, so
 * a caller-supplied path would be a path aimed at somebody else's folder. It
 * would fail the check, but it would fail at the API as an opaque error rather
 * than never being constructible.
 */
export async function uploadCampaignImage(
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: CampaignImageError }> {
  if (!supabase) return { ok: false, error: 'offline' }

  if (file.type && !CAMPAIGN_IMAGE_MIME.includes(file.type)) return { ok: false, error: 'type' }
  if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) return { ok: false, error: 'size' }

  const { data: auth } = await supabase.auth.getSession()
  const owner = auth.session?.user?.id
  if (!owner) return { ok: false, error: 'unauthenticated' }

  const path = `${owner}/${Date.now()}-${safeName(file.name)}`
  const { error } = await supabase.storage.from(CAMPAIGN_IMAGE_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (error) return { ok: false, error: 'failed' }

  return { ok: true, path }
}

/**
 * A stored path, as a URL a browser can fetch.
 *
 * Built by hand rather than through `getPublicUrl` so that it is a pure
 * function of the path and the configured project URL. That matters in exactly
 * one place and it is worth the two lines: the harnesses behind `npm run
 * verify` run with no Supabase client at all, and a helper that returns null
 * whenever one is absent would make every image assertion untestable.
 *
 * A value that is already a URL — or a data URL, which is what the no-backend
 * fallback produces — is returned untouched, so a component can call this on
 * whatever the campaign happens to be carrying without branching first.
 */
export function campaignImageUrl(path: string): string {
  if (!path) return ''
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  if (!supabaseUrl) return ''
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${CAMPAIGN_IMAGE_BUCKET}/${path}`
}

/**
 * Remove a photograph the owner has taken off a campaign.
 *
 * Best effort, and the caller does not wait on it. The row is the record of
 * which images a campaign has; an object left behind in the bucket is wasted
 * bytes, while a failed delete that blocked the save would be a campaign the
 * owner could not edit. Wrong in the cheap direction.
 */
export async function removeCampaignImage(path: string): Promise<boolean> {
  if (!supabase || !path || /^(https?:|data:|blob:)/i.test(path)) return false
  const { error } = await supabase.storage.from(CAMPAIGN_IMAGE_BUCKET).remove([path])
  return !error
}
