import type {
  Booking,
  Campaign,
  Notification,
  Provider,
  Review,
  Traveller,
  VerificationStatus,
} from '@/types'
import { supabase } from '@/services/supabase/client'
import type {
  BookingRow,
  CampaignRow,
  NotificationRow,
  ProviderPublicRow,
  ProviderRow,
  ReviewRow,
  TravellerRow,
} from '@/services/supabase/schema'
import { LICENCE_BUCKET } from '@/services/storage/licence'
import {
  fromCampaign,
  toBooking,
  toCampaign,
  toNotification,
  toProvider,
  toReview,
} from './mappers'

/**
 * The catalogue, in the database.
 *
 * Until this file existed, NASEK had a Postgres schema nobody read from. Trips
 * an owner published, bookings pilgrims made and decisions administrators took
 * all lived in `localStorage`, which meant every one of them was invisible to
 * everybody else: a trip published on one laptop did not exist on another, and
 * a verification badge was a fact about one browser. The schema, the policies
 * and the indexes were all correct and all unused.
 *
 * Two rules hold throughout:
 *
 *   * Every function returns null (or an empty array) when no backend is
 *     configured, so callers can fall back to local state without branching on
 *     configuration themselves.
 *   * Nothing here filters for permission. Row-level security decides what
 *     comes back — a `select *` on `bookings` returns a traveller's own
 *     bookings, an owner's trips' bookings, or everything, depending entirely
 *     on who is asking. Re-filtering in the client would only add a second,
 *     weaker opinion.
 */

export interface RemoteSnapshot {
  providers: Provider[]
  campaigns: Campaign[]
  bookings: Booking[]
  reviews: Review[]
  notifications: Notification[]
  savedIds: string[]
}

export const EMPTY_SNAPSHOT: RemoteSnapshot = {
  providers: [],
  campaigns: [],
  bookings: [],
  reviews: [],
  notifications: [],
  savedIds: [],
}

// ------------------------------------------------------------------- reading

/**
 * Everything the signed-in (or anonymous) visitor is allowed to see, in one go.
 *
 * Fetched together and in parallel rather than per-page, because the store this
 * fills is what every screen already reads: `useCatalogue`, the dashboards and
 * the admin tables all consume the same slices, and loading them per route
 * would mean six spinners where the prototype had none.
 *
 * A failing query yields an empty slice rather than rejecting the whole load. A
 * pilgrim who is signed out cannot read `bookings` at all, and that must leave
 * them a working catalogue rather than a blank site.
 */
export async function fetchSnapshot(): Promise<RemoteSnapshot | null> {
  if (!supabase) return null

  const [publicProviders, ownProviders, campaigns, bookings, reviews, notifications, saved] =
    await Promise.all([
    /*
     * The catalogue's view of a campaign owner: name, badge, rating, plan.
     *
     * Read from the view *always*, not as a fallback. It used to read the table
     * and drop to the view only when the table errored, which had two problems
     * and one of them was serious. The serious one: the table was readable by
     * everyone, permit scans included, so the fallback never fired and never
     * needed to. Now that the table is closed to all but the owner and an
     * administrator, an ordinary signed-in pilgrim would get neither an error
     * nor any rows — a silent empty catalogue, which is worse than the 401 a
     * signed-out visitor would have got.
     */
    supabase.from('providers_public').select('*'),
    /*
     * ...and the private columns, for the one or two rows the caller may see.
     *
     * An owner needs their own permit and contact details; an administrator
     * needs everyone's, to run the verification queue. Row-level security
     * decides which of those this returns — nothing here filters, and nothing
     * here needs to know which kind of caller it is.
     */
    supabase.from('providers').select('*'),
    supabase.from('campaigns').select('*').order('departure_date', { ascending: true }),
    /*
     * Travellers are fetched as their own query rather than embedded.
     *
     * PostgREST can embed them — `select('*, travellers(*)')` — but only if the
     * foreign key is declared in the hand-written schema types, and getting
     * that wrong produces a type error that describes the relation rather than
     * the mistake. A second query costs one round trip and is scoped by exactly
     * the same policy, since `travellers` is readable only through a booking
     * the caller may already read.
     */
    supabase.from('bookings').select('*'),
    supabase.from('reviews').select('*'),
    supabase.from('notifications').select('*').order('created_at', { ascending: false }),
    supabase.from('saved_campaigns').select('campaign_id'),
  ])

  const bookingRows = (bookings.data ?? []) as BookingRow[]
  const travellerRows = bookingRows.length
    ? (((await supabase.from('travellers').select('*')).data ?? []) as TravellerRow[])
    : []
  const travellersByBooking = new Map<string, TravellerRow[]>()
  for (const row of travellerRows) {
    const list = travellersByBooking.get(row.booking_id)
    if (list) list.push(row)
    else travellersByBooking.set(row.booking_id, [row])
  }

  /*
   * The public row is the base; a private row, where the caller is entitled to
   * one, is laid over it.
   *
   * Merged by id rather than concatenated, or an owner would appear twice in
   * every listing — once from each query. The private row wins because it is a
   * superset: same columns, plus the permit and the contact details.
   *
   * A caller with no private rows (a signed-out visitor gets 401, a pilgrim
   * gets an empty set) simply keeps the base, which is the whole catalogue.
   */
  const providerRows = new Map<string, ProviderRow | ProviderPublicRow>()
  for (const row of (publicProviders.data ?? []) as ProviderPublicRow[]) {
    providerRows.set(row.id, row)
  }
  for (const row of (ownProviders.data ?? []) as ProviderRow[]) {
    providerRows.set(row.id, row)
  }

  return {
    providers: [...providerRows.values()].map(toProvider),
    campaigns: ((campaigns.data ?? []) as CampaignRow[]).map(toCampaign),
    bookings: bookingRows.map((r) => toBooking(r, travellersByBooking.get(r.id) ?? [])),
    reviews: ((reviews.data ?? []) as ReviewRow[]).map(toReview),
    notifications: ((notifications.data ?? []) as NotificationRow[]).map(toNotification),
    savedIds: ((saved.data ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id),
  }
}

// ------------------------------------------------------------------ campaigns

/** Publish or update a trip. Returns the row as the database stored it. */
export async function saveCampaign(campaign: Campaign): Promise<Campaign | null> {
  if (!supabase) return null
  const payload = fromCampaign(campaign)

  // A campaign the owner is editing already has a database id; one they have
  // just filled in has a locally generated one that Postgres has never seen.
  const isPersisted = /^[0-9a-f-]{36}$/i.test(campaign.id)

  const { data, error } = isPersisted
    ? await supabase.from('campaigns').update(payload).eq('id', campaign.id).select('*').maybeSingle()
    : await supabase.from('campaigns').insert(payload).select('*').maybeSingle()

  if (error || !data) return null
  return toCampaign(data as CampaignRow)
}

/**
 * Withdraw a trip.
 *
 * A flag rather than a DELETE, because bookings reference it: erasing the row
 * would either fail on the foreign key or orphan travellers who have paid. The
 * public catalogue filters `deleted` out, so the effect is the same to everyone
 * except the people whose booking still has to mean something.
 */
export async function removeCampaign(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('campaigns').update({ deleted: true }).eq('id', id)
  return !error
}

// ----------------------------------------------------------------- moderation

/** An administrator's decision on a trip. Reverted by trigger for anyone else. */
export async function setCampaignModeration(
  id: string,
  patch: { suspended?: boolean; featured?: boolean },
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('campaigns').update(patch).eq('id', id)
  return !error
}

/**
 * An administrator's decision on a campaign owner.
 *
 * One RPC rather than an update, because a refusal now carries a reason and the
 * two have to land together. Writing the status in one request and the reason
 * in another leaves a window — however short — in which an owner is told they
 * were refused and shown no explanation, and a failure between the two makes
 * that state permanent.
 *
 * The reason is passed through to the caller on failure rather than replaced
 * with something generic: "A refusal needs a reason the owner can act on" is
 * the database refusing a specific mistake, and it is the sentence the
 * administrator needs to see.
 */
export async function setProviderVerification(
  id: string,
  verification: VerificationStatus,
  reason?: string,
): Promise<{ ok: true; provider?: Provider } | { ok: false; error: string }> {
  /*
   * No backend: succeed, and let the store be the whole truth.
   *
   * Reporting failure here would be wrong rather than cautious. With no
   * database there is nothing that could have disagreed, and the local
   * dashboard — the one a fresh clone opens with no setup — would show
   * "offline" on every decision and record none of them. `provider` is absent
   * because there is no row to return, which is exactly what the caller should
   * see.
   */
  if (!supabase) return { ok: true }

  const { data, error } = await supabase.rpc('set_provider_status', {
    p_provider_id: id,
    p_status: verification,
    p_reason: reason ?? null,
  })

  if (error || !data) return { ok: false, error: error?.message ?? 'Update failed' }
  return { ok: true, provider: toProvider(data as ProviderRow) }
}

/**
 * A link to a permit that works for a few minutes and then does not.
 *
 * The bucket is private, so there is no permanent URL to store or to leak; each
 * view mints its own. Ten minutes is longer than reading a scanned licence
 * takes and short enough that a URL copied out of a browser's network panel is
 * worthless by the time anyone tries it.
 *
 * Returns null rather than throwing when the object is gone or the caller is
 * not entitled to it — the dialog then shows "no permit on file", which is the
 * honest thing to show for both.
 */
export async function licenceUrl(path: string): Promise<string | null> {
  if (!supabase || !path) return null
  const { data, error } = await supabase.storage
    .from(LICENCE_BUCKET)
    .createSignedUrl(path, 600)
  return error || !data ? null : data.signedUrl
}

/** Suspend, restore or remove an account. Admin-only, enforced by policy. */
export async function setProfileModeration(
  userId: string,
  patch: { suspended?: boolean; removed?: boolean },
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  return !error
}

/** Take a review down, or put it back. */
export async function setReviewHidden(id: string, hidden: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('reviews').update({ hidden }).eq('id', id)
  return !error
}

// ------------------------------------------------------------------- bookings

export interface BookingRequest {
  campaignId: string
  travellers: Traveller[]
  contactName: string
  contactPhone: string
  contactEmail: string
  notes?: string
}

/**
 * Reserve seats.
 *
 * One RPC rather than an insert, because the seat count has to be locked,
 * re-checked and decremented in the same transaction as the insert — see
 * `20260901000700_booking_transaction.sql`. Doing it from here in three
 * statements is exactly the race that migration exists to prevent.
 *
 * The error message is passed through: "Only 2 seat(s) remain on this trip" is
 * something a person can act on, and inventing a generic message here would
 * throw that away.
 */
export async function createBooking(
  input: BookingRequest,
): Promise<{ booking: Booking } | { error: string }> {
  if (!supabase) return { error: 'offline' }

  const { data, error } = await supabase.rpc('book_campaign', {
    p_campaign_id: input.campaignId,
    p_travellers: input.travellers as unknown as never,
    p_contact_name: input.contactName,
    p_contact_phone: input.contactPhone,
    p_contact_email: input.contactEmail,
    p_notes: input.notes ?? null,
  })

  if (error || !data) return { error: error?.message ?? 'Booking failed' }
  return { booking: toBooking(data as BookingRow, []) }
}

/** Cancel, returning the seats to the trip in the same transaction. */
export async function cancelBooking(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: id })
  return !error
}

// -------------------------------------------------------------------- saved

export async function setSaved(campaignId: string, saved: boolean): Promise<boolean> {
  if (!supabase) return false
  const { data: auth } = await supabase.auth.getSession()
  const userId = auth.session?.user?.id
  if (!userId) return false

  const { error } = saved
    ? await supabase
        .from('saved_campaigns')
        .upsert({ user_id: userId, campaign_id: campaignId })
    : await supabase
        .from('saved_campaigns')
        .delete()
        .eq('user_id', userId)
        .eq('campaign_id', campaignId)
  return !error
}

// ------------------------------------------------------------- notifications

export async function markNotificationRead(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
  return !error
}

export async function markAllNotificationsRead(): Promise<boolean> {
  if (!supabase) return false
  const { data: auth } = await supabase.auth.getSession()
  const userId = auth.session?.user?.id
  if (!userId) return false
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
  return !error
}
