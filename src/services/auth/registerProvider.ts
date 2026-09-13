import type { Provider, User } from '@/types'
import { supabase } from '@/services/supabase/client'
import type { ProviderRow } from '@/services/supabase/schema'
import { toProvider } from '@/services/data/mappers'
import { authApi, type ProviderSignUpInput } from '@/services/api/auth'
import { loadSessionSettled } from './session'

/**
 * Registering a campaign owner's company.
 *
 * The one operation in NASEK that has to change what an account *is* — a
 * pilgrim becomes an owner — which is precisely the sort of thing the
 * privilege guards in the RLS migration exist to stop. It is allowed here
 * because it goes through `register_provider`, a database function that decides
 * the role itself rather than accepting one: it always promotes the caller,
 * always to 'provider', and always leaves the company `pending` for an
 * administrator to verify against the permit.
 *
 * The local path is the prototype's original behaviour, unchanged, so a clone
 * with no backend still registers owners and still drops them into the
 * verification queue.
 */

export interface RegisterProviderResult {
  user: User
  provider: Provider
}

/*
 * Rows are mapped by `toProvider`, not by a copy of it.
 *
 * There was a second mapper here, and it had drifted: `rating` came straight
 * off the row, where `numeric(2,1)` arrives from PostgREST as the *string*
 * "4.6". The type said `number`, so nothing complained, and a company
 * registered in this session carried a rating that would have concatenated
 * rather than added anywhere it met arithmetic. The shared mapper coerces it.
 */

export async function registerProviderAccount(
  input: ProviderSignUpInput,
): Promise<RegisterProviderResult> {
  if (!supabase) return authApi.registerProvider(input)

  const { data, error } = await supabase.rpc('register_provider', {
    // One entry typed in one language: this prototype does not ask an owner to
    // write their own company name twice.
    p_name_ar: input.companyName,
    p_name_en: input.companyName,
    p_tagline: input.tagline,
    p_description: input.description ?? '',
    p_wilayah_id: input.wilayahId,
    p_governorate: input.governorate ?? null,
    p_experience_years: input.experienceYears,
    p_phone: input.phone,
    p_email: input.email,
    p_initials: input.companyName.trim().charAt(0) || '?',
    p_commercial_registration: input.commercialRegistration ?? null,
    p_permit_number: input.permitNumber ?? null,
    /*
     * An empty date field is null, not ''.
     *
     * Postgres will not coerce the empty string to `date` and answers with a
     * type error, so a permit with no expiry — which is a real thing, some are
     * open-ended — would fail the whole registration on the last step.
     */
    p_permit_expiry: input.permitExpiry || null,
    p_licence_mime: input.licenceMime ?? null,
    /*
     * The permit now travels as a Storage path, and `licence_image` goes only
     * when there is no path to send.
     *
     * Both columns exist because both eras of NASEK do: rows registered before
     * the bucket carry a base64 data URL, and the no-backend fallback has
     * nowhere else to put one. Sending both would store the same document
     * twice, in the one place it is expensive to store and the one place it is
     * safe to.
     */
    p_licence_image: input.licencePath ? null : input.licenceImage,
    p_licence_file_name: input.licenceFileName,
    p_licence_path: input.licencePath ?? null,
  })

  if (error || !data) {
    throw new Error(error?.message ?? 'Registration failed')
  }

  // The profile is re-read rather than patched locally: the function changed
  // `role` and `provider_id` server-side, and the copy in this browser is now
  // out of date about what this account is.
  const session = await loadSessionSettled()
  if (!session.user) throw new Error('Registered, but the session could not be read back')

  return { user: session.user, provider: toProvider(data as ProviderRow) }
}

/**
 * A refused application, corrected and sent back.
 *
 * The whole point of distinguishing `rejected` from `pending`: an owner who was
 * told what was wrong can fix it and rejoin the queue without an administrator
 * resetting anything by hand, and without registering a second company to get
 * around the first.
 *
 * `resubmit_provider` refuses unless the current status is exactly `rejected`,
 * so this cannot be used to pull an approved company back into review or to
 * escape a suspension.
 */
export async function resubmitProviderAccount(
  input: ProviderSignUpInput,
): Promise<Provider> {
  if (!supabase) throw new Error('Resubmission needs a configured backend')

  const { data, error } = await supabase.rpc('resubmit_provider', {
    p_name_ar: input.companyName,
    p_name_en: input.companyName,
    p_tagline: input.tagline,
    p_description: input.description ?? '',
    p_wilayah_id: input.wilayahId,
    p_governorate: input.governorate ?? null,
    p_experience_years: input.experienceYears,
    p_phone: input.phone,
    p_email: input.email,
    p_commercial_registration: input.commercialRegistration ?? null,
    p_permit_number: input.permitNumber ?? null,
    p_permit_expiry: input.permitExpiry || null,
    p_licence_image: input.licencePath ? null : (input.licenceImage || null),
    p_licence_file_name: input.licenceFileName || null,
    p_licence_path: input.licencePath ?? null,
    p_licence_mime: input.licenceMime ?? null,
  })

  if (error || !data) throw new Error(error?.message ?? 'Resubmission failed')
  return toProvider(data as ProviderRow)
}
