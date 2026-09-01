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

  const [providers, campaigns, bookings, reviews, notifications, saved] = await Promise.all([
    // `providers` where readable (an owner or admin sees their private columns),
    // falling back to the public view for everyone else.
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

  let providerRows = (providers.data ?? []) as ProviderRow[]
  if (providers.error) {
    const publicView = await supabase.from('providers_public').select('*')
    providerRows = (publicView.data ?? []) as unknown as ProviderRow[]
  }

  return {
    providers: providerRows.map((r) => toProvider(r as ProviderRow | ProviderPublicRow)),
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

/** Verification. The trigger records who and when in `admin_audit`. */
export async function setProviderVerification(
  id: string,
  verification: VerificationStatus,
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('providers').update({ verification }).eq('id', id)
  return !error
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
