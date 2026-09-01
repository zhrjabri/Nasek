import type { Provider, User } from '@/types'
import { supabase } from '@/services/supabase/client'
import type { ProviderRow } from '@/services/supabase/schema'
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

/** Postgres row → the bilingual domain shape the rest of the app reads. */
function rowToProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: { ar: row.name_ar, en: row.name_en },
    tagline: { ar: row.tagline_ar, en: row.tagline_en },
    description: { ar: row.description_ar, en: row.description_en },
    wilayahId: row.wilayah_id ?? 'muscat',
    verification: row.verification,
    experienceYears: row.experience_years,
    rating: row.rating,
    reviewCount: row.review_count,
    phone: row.phone ?? '',
    email: row.email ?? '',
    initials: row.initials,
    brandColor: row.brand_color,
    plan: row.plan,
    joinedAt: row.joined_at,
    licenceImage: row.licence_image ?? undefined,
    licenceFileName: row.licence_file_name ?? undefined,
  }
}

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
    p_wilayah_id: input.wilayahId,
    p_experience_years: input.experienceYears,
    p_phone: input.phone,
    p_email: input.email,
    p_initials: input.companyName.trim().charAt(0) || '?',
    p_licence_image: input.licenceImage,
    p_licence_file_name: input.licenceFileName,
  })

  if (error || !data) {
    throw new Error(error?.message ?? 'Registration failed')
  }

  // The profile is re-read rather than patched locally: the function changed
  // `role` and `provider_id` server-side, and the copy in this browser is now
  // out of date about what this account is.
  const session = await loadSessionSettled()
  if (!session.user) throw new Error('Registered, but the session could not be read back')

  return { user: session.user, provider: rowToProvider(data as ProviderRow) }
}
