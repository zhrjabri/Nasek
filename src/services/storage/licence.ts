import { supabase } from '@/services/supabase/client'

/**
 * The trade permit, and where it goes.
 *
 * NASEK's whole claim to trustworthiness is that somebody looked at the
 * licence. That makes this file's job narrow and important: get a photograph of
 * a piece of paper from an owner's phone to an administrator's screen, without
 * it becoming readable by anyone else on the way.
 *
 * The prototype kept it as a base64 data URL in a text column. That worked, and
 * it is still the fallback when no backend is configured, but it degrades the
 * image on purpose (to fit a storage quota) and it puts a document into a
 * column whose protection is whatever policy happens to sit on the table. That
 * is precisely how these ended up world-readable.
 *
 * Here the bytes go to a private bucket under a path that begins with the
 * uploader's own account id — see `20260902000300_licence_storage.sql`, where
 * that path prefix is what the policies are written about. Nothing is ever
 * public: an administrator opens a permit through a signed URL that expires.
 */

/** Matches the bucket created in `20260902000300_licence_storage.sql`. */
export const LICENCE_BUCKET = 'provider-licences'

/** What the bucket accepts, mirrored here so the browser can refuse first. */
export const LICENCE_MIME = ['image/jpeg', 'image/png', 'image/webp']
export const LICENCE_MAX_BYTES = 8 * 1024 * 1024

export type LicenceUploadError = 'offline' | 'unauthenticated' | 'type' | 'size' | 'failed'

export interface LicenceUpload {
  /** Object path — never a URL. The bucket is private and URLs to it expire. */
  path: string
  fileName: string
  bytes: number
}

/**
 * A file name Storage will accept and a human can still recognise.
 *
 * Arabic file names are common here and Storage keys are far happier with
 * ASCII, so anything outside a conservative set becomes `-`. The original name
 * is kept separately on the provider row, so nothing a person typed is lost —
 * this is only the key.
 */
function safeName(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9._-]+/g, '-')
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  return `${stem.slice(0, 48) || 'permit'}${ext || '.jpg'}`
}

/**
 * Put a permit in the bucket, under the signed-in account's own folder.
 *
 * The path is built here rather than accepted from the caller, and that is the
 * security property rather than a tidiness one: the storage policies decide
 * both "may you write this" and "may you read it back" from the first path
 * segment, so a path the caller chose would be a path the caller could aim at
 * someone else's folder. It would fail the policy check — but it would fail it
 * at the API, as an opaque error, instead of never being constructible.
 *
 * `upsert: false` so two registrations a second apart cannot collide; the
 * timestamp makes that essentially impossible anyway, and a silent overwrite of
 * somebody's permit is not a failure mode worth leaving open.
 */
export async function uploadLicence(
  file: File,
): Promise<{ ok: true; upload: LicenceUpload } | { ok: false; error: LicenceUploadError }> {
  if (!supabase) return { ok: false, error: 'offline' }

  if (file.type && !LICENCE_MIME.includes(file.type)) return { ok: false, error: 'type' }
  if (file.size > LICENCE_MAX_BYTES) return { ok: false, error: 'size' }

  const { data: auth } = await supabase.auth.getSession()
  const owner = auth.session?.user?.id
  // The upload has to happen *after* sign-in, because the folder is named for
  // the account. The registration flow verifies the address first for exactly
  // this reason.
  if (!owner) return { ok: false, error: 'unauthenticated' }

  const path = `${owner}/${Date.now()}-${safeName(file.name)}`
  const { error } = await supabase.storage.from(LICENCE_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (error) return { ok: false, error: 'failed' }

  return { ok: true, upload: { path, fileName: file.name, bytes: file.size } }
}
