import { supabase } from '@/services/supabase/client'
import type { ProviderRow, SiteAnalytics } from '@/services/supabase/schema'

/**
 * The two things an administrator can do that nobody else can: edit any
 * company, and read the visitor figures.
 *
 * Both go through a `security definer` function rather than a table, and for
 * different reasons. `admin_update_provider` adds no authority — an
 * administrator could already UPDATE `providers` directly, because the policy
 * allows it — what it adds is a written record of who changed which field from
 * what to what, in `admin_audit`. `site_analytics` is the opposite: it is the
 * *only* way to read `site_visits`, which has no SELECT policy for anybody, so
 * an administrator can learn how many people visited and never who.
 */

/**
 * Every field an administrator may correct on a company.
 *
 * All optional, and the optionality is the contract: `admin_update_provider`
 * reads null as "leave this alone", so a form that only touched the phone
 * number sends only the phone number and the audit entry names one field
 * instead of twelve unchanged ones.
 *
 * There is no `address`. The column still exists and still holds what two
 * companies typed into it, but it left the profile workflow in
 * `20260913000100` and nothing writes it — governorate and wilayah are the
 * location of record, and both are required.
 *
 * There is no `verification` either. Approving, refusing and suspending a
 * company is `set_provider_status`, which attaches a reason and notifies the
 * owner; letting an edit form flip the badge would be a way to verify a
 * company without any of that happening.
 */
export interface AdminProviderEdit {
  name?: string
  tagline?: string
  description?: string
  governorate?: string
  wilayahId?: string
  phone?: string
  email?: string
  experienceYears?: number
  commercialRegistration?: string
  permitNumber?: string
  /** ISO date, or empty for a permit that does not expire. */
  permitExpiry?: string
}

export type AdminProviderResult =
  | { ok: true; provider: ProviderRow }
  | { ok: false; error: string }

/** `''` means "clear it"; `undefined` means "do not touch it". */
const text = (v: string | undefined) => (v === undefined ? null : v)

export async function adminUpdateProvider(
  providerId: string,
  edit: AdminProviderEdit,
): Promise<AdminProviderResult> {
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' }
  }

  const { data, error } = await supabase.rpc('admin_update_provider', {
    p_provider_id: providerId,
    p_name: text(edit.name),
    p_tagline: text(edit.tagline),
    p_description: text(edit.description),
    p_governorate: text(edit.governorate),
    p_wilayah_id: text(edit.wilayahId),
    p_phone: text(edit.phone),
    p_email: text(edit.email),
    p_experience_years: edit.experienceYears ?? null,
    p_commercial_registration: text(edit.commercialRegistration),
    p_permit_number: text(edit.permitNumber),
    // Postgres will not coerce '' to `date`, and a permit with no expiry is a
    // real thing rather than an omission.
    p_permit_expiry: edit.permitExpiry ? edit.permitExpiry : null,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, provider: data as unknown as ProviderRow }
}

/**
 * The visitor figures.
 *
 * Returns null rather than zeros when there is no backend or the read fails,
 * and the caller draws "no data yet" rather than a dashboard of noughts. A
 * screen reporting `0 visitors` because a request 404'd is worse than one
 * saying it does not know: the first is a number somebody might act on.
 */
export async function fetchSiteAnalytics(): Promise<SiteAnalytics | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('site_analytics')
  if (error || !data) return null
  return data as unknown as SiteAnalytics
}
