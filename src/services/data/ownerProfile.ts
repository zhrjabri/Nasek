import { supabase } from '@/services/supabase/client'
import type { ProviderProfileChangeRow } from '@/services/supabase/schema'

/**
 * A campaign owner editing their own company.
 *
 * The whole of the interesting logic is in `submit_provider_profile` in
 * `20260906000100`, and it has to be: an owner's profile is half marketing and
 * half evidence, and only the database can be trusted to know which is which.
 *
 *   Marketing — tagline, description, wilayah, governorate, address, phone,
 *   contact email, years of trading. Saved immediately.
 *
 *   Evidence — the legal name, the commercial registration, the permit number,
 *   its expiry, and the permit document itself. An approved company cannot
 *   write these at all: `guard_provider_privileges` reverts them. They are
 *   recorded as a proposed change and wait for an administrator, so the
 *   "Verified by NASEK" badge keeps describing information somebody checked.
 *
 * One call, because the owner pressed one button. Splitting it would put the
 * seam in the interface, where a failure between two requests leaves a company
 * half-updated and nobody sure which half.
 */

export interface OwnerProfileInput {
  // ------------------------------------------------------ saved immediately
  tagline: string
  description: string
  wilayahId: string
  governorate: string
  phone: string
  /** The company's contact address, not the owner's sign-in credential. */
  email: string
  experienceYears: number

  // ------------------------------------------- reviewed, once approved
  /** The legal name, as it appears on the permit. */
  name: string
  commercialRegistration: string
  permitNumber: string
  /** ISO date, or empty for a permit that does not expire. */
  permitExpiry: string
  /** Set only when a replacement permit was uploaded with this submission. */
  licencePath?: string
  licenceFileName?: string
  licenceMime?: string
}

export type OwnerProfileResult =
  | { ok: true; reviewRequired: boolean }
  | { ok: false; error: string }

/**
 * Save a company profile.
 *
 * `reviewRequired` is the only thing the caller needs back, and it decides what
 * the screen says next: "saved" when nothing sensitive moved, "with NASEK for
 * review" when something did. Getting that wrong in the other direction — a
 * cheerful "saved" over a change that will not take effect for two days — is
 * the failure this return value exists to prevent.
 *
 * The database's own message is passed through on failure. "This account has no
 * registered campaign" is a specific, actionable thing; flattening it into
 * "could not save" throws away the only useful part.
 */
export async function submitOwnerProfile(
  input: OwnerProfileInput,
): Promise<OwnerProfileResult> {
  // No backend: the store is the whole platform, so the caller applies the
  // change locally and nothing here has an opinion. Reporting failure would be
  // wrong rather than cautious — there is nothing that could have disagreed.
  if (!supabase) return { ok: true, reviewRequired: false }

  const { data, error } = await supabase.rpc('submit_provider_profile', {
    p_tagline: input.tagline,
    p_description: input.description,
    p_wilayah_id: input.wilayahId,
    p_governorate: input.governorate,
    p_phone: input.phone,
    p_email: input.email,
    p_experience_years: input.experienceYears,
    p_name: input.name,
    p_commercial_registration: input.commercialRegistration || null,
    p_permit_number: input.permitNumber || null,
    // Postgres will not coerce '' to `date`, and a permit with no expiry is a
    // real thing rather than an omission.
    p_permit_expiry: input.permitExpiry || null,
    p_licence_path: input.licencePath ?? null,
    p_licence_file_name: input.licenceFileName ?? null,
    p_licence_mime: input.licenceMime ?? null,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, reviewRequired: data?.review_required === true }
}

/**
 * The change this company is currently waiting on, if any.
 *
 * Read through `provider_changes_read`, which returns an owner their own rows
 * and an administrator everybody's — so this same call serves the portal's
 * "under review" banner and, unfiltered, the administration queue.
 *
 * `pending` only. A decided change is history; showing an owner a two-week-old
 * approval alongside their current details would read as though it were still
 * outstanding.
 */
export async function fetchPendingChange(
  providerId: string,
): Promise<ProviderProfileChangeRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('provider_profile_changes')
    .select('*')
    .eq('provider_id', providerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return error || !data ? null : (data as ProviderProfileChangeRow)
}

/**
 * Every company waiting on a decision. Administration only, by policy.
 *
 * An error yields an empty list rather than a rejection: this feeds a queue on
 * a dashboard, and a failed read should leave that queue empty rather than
 * break the screen it sits on.
 */
export async function fetchPendingProviderChanges(): Promise<ProviderProfileChangeRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('provider_profile_changes')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  return error ? [] : ((data ?? []) as ProviderProfileChangeRow[])
}

/**
 * An administrator's decision on a proposed change.
 *
 * An RPC rather than an update, for the reason every decision in this schema is
 * one: the status, the reason, the new values applied to the company, the audit
 * entry, the owner's notification and the queued email all have to land in one
 * transaction. Approving in one request and applying in another leaves a
 * company approved for details it does not hold.
 */
export async function reviewProviderChange(
  changeId: string,
  approve: boolean,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: true }
  const { error } = await supabase.rpc('review_provider_changes', {
    p_change_id: changeId,
    p_approve: approve,
    p_reason: reason ?? null,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}
