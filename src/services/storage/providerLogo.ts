import { supabase } from '@/services/supabase/client'
import { CAMPAIGN_IMAGE_BUCKET, campaignImageUrl } from './campaignImages'

/**
 * The company's logo.
 *
 * One per company, not one per trip: an owner uploads it once on their company
 * profile and every campaign they run draws it.
 *
 * NO NEW BUCKET, AND THAT IS THE POINT
 *
 * This uses `campaign-images`, which already is what a logo needs and nothing
 * it does not: public to read so an anonymous visitor's phone can fetch it off
 * the CDN with no round trip for a signed URL, limited by the bucket itself to
 * PNG, JPEG and WebP, and policed so a file may only be written, replaced or
 * deleted inside a folder named for the uploader's own account. A second bucket
 * would be this bucket with a different name and a second set of policies to
 * keep in step. See `20260904000400_campaign_images.sql` for the original
 * argument and `20260911000100` for the decision to reuse it.
 *
 * What distinguishes a logo from a trip photograph is the file name, and what
 * makes it *the* logo is `providers.logo_path` pointing at it.
 *
 * SVG IS NOT ACCEPTED, deliberately. An SVG is a document that can carry script
 * and external references, served here from an origin that also serves the
 * applications; NASEK has no sanitiser and no CSP written for that case, so the
 * safe list is the three raster formats the bucket already allows.
 */

export const PROVIDER_LOGO_BUCKET = CAMPAIGN_IMAGE_BUCKET

export const PROVIDER_LOGO_MIME = ['image/png', 'image/jpeg', 'image/webp']

/**
 * Two megabytes.
 *
 * Below the bucket's own five-megabyte ceiling on purpose. That limit was set
 * for a photograph of a hotel; a logo is a small flat graphic shown at 40-80
 * pixels, and anything approaching two megabytes is a camera photo of a
 * letterhead rather than a logo. The bucket stays the backstop.
 */
export const PROVIDER_LOGO_MAX_BYTES = 2 * 1024 * 1024

export type ProviderLogoError = 'offline' | 'unauthenticated' | 'type' | 'size' | 'failed'

/** The extension to store the object under, chosen from the MIME type. */
const EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * Is this a file NASEK will take?
 *
 * Exported so the form can say why before uploading anything, and so the checks
 * can be asserted without a browser or a network. Both conditions are re-stated
 * server-side — by the bucket's `allowed_mime_types` and `file_size_limit`, and
 * by `set_provider_logo`'s extension check — because a check that only runs in
 * the page is a check an attacker skips.
 */
export function checkProviderLogo(file: {
  type: string
  size: number
}): ProviderLogoError | null {
  if (!PROVIDER_LOGO_MIME.includes(file.type)) return 'type'
  if (file.size > PROVIDER_LOGO_MAX_BYTES) return 'size'
  return null
}

/**
 * Put the logo in the bucket, under the signed-in account's own folder.
 *
 * The path is built here rather than accepted from the caller — the property
 * `uploadCampaignImage` and `uploadLicence` both rely on. The storage policies
 * decide "may you write this" from the first path segment, so a caller-supplied
 * path would be a path that can be aimed at somebody else's folder; built here,
 * it cannot be constructed at all.
 *
 * A timestamp rather than a fixed `logo.png`, and that is a cache decision as
 * much as anything: the bucket is served through a CDN, and overwriting one
 * object name leaves owners and visitors looking at the previous logo until
 * something expires. A new name every time is unambiguous, and the old object
 * is removed by the caller once the new path has been saved.
 */
export async function uploadProviderLogo(
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: ProviderLogoError }> {
  if (!supabase) return { ok: false, error: 'offline' }

  const invalid = checkProviderLogo(file)
  if (invalid) return { ok: false, error: invalid }

  const { data: auth } = await supabase.auth.getSession()
  const owner = auth.session?.user?.id
  if (!owner) return { ok: false, error: 'unauthenticated' }

  const path = `${owner}/logo-${Date.now()}.${EXTENSION[file.type] ?? 'png'}`
  const { error } = await supabase.storage.from(PROVIDER_LOGO_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  })
  if (error) return { ok: false, error: 'failed' }

  return { ok: true, path }
}

/**
 * Delete the object a company has stopped using.
 *
 * Called after the new path is saved, or after the logo is cleared — never
 * before. If it fails, the row is already correct and what is left behind is an
 * unreferenced file in a bucket, which is the right way round: an orphaned
 * object costs storage, an orphaned reference costs a broken image on every
 * campaign card the company runs.
 */
export async function removeProviderLogoObject(path: string | undefined): Promise<void> {
  if (!supabase || !path) return
  await supabase.storage.from(PROVIDER_LOGO_BUCKET).remove([path])
}

/**
 * A path becomes a URL at the moment of rendering, never before.
 *
 * Shared with campaign photographs because it is the same public bucket and the
 * same rule: the row stores a path, which survives the project changing domain,
 * and the URL is derived where it is needed.
 */
export const providerLogoUrl = campaignImageUrl
