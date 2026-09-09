import type {
  Booking,
  Campaign,
  CampaignStatus,
  Notification,
  NotificationAudience,
  Provider,
  Review,
  Traveller,
  User,
  VerificationStatus,
} from '@/types'
import { supabase } from '@/services/supabase/client'
import type {
  BookingRow,
  CampaignRow,
  EmailOutboxRow,
  NotificationRow,
  ProfileRow,
  ProviderPublicRow,
  ProviderRow,
  ReviewPublicRow,
  ReviewRow,
  TravellerRow,
} from '@/services/supabase/schema'
import { profileToUser } from '@/services/auth/session'
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
 * Which inbox this build reads.
 *
 * `VITE_NASEK_APP` is baked in by each Vite config rather than read from the
 * environment — it is a property of the build, not of the machine — and the
 * Supabase client already picks its auth storage key from it. The same fact
 * answers this: the customer site shows a pilgrim's notifications, the portal
 * shows a company's, the dashboard shows an administrator's.
 *
 * A constant rather than a parameter because `loadSnapshot` is called from all
 * three applications and none of them should be able to ask for a different
 * audience than the one it is. There is exactly one correct answer per bundle.
 */
const APP_AUDIENCE: NotificationAudience =
  import.meta.env.VITE_NASEK_APP === 'admin'
    ? 'admin'
    : import.meta.env.VITE_NASEK_APP === 'owner'
      ? 'owner'
      : 'customer'

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
  /**
   * Every account the caller may read.
   *
   * One row for an ordinary pilgrim — their own — and the whole directory for
   * an administrator, because `profiles_read_self` says
   * `id = auth.uid() or is_admin()`. That is the difference between an
   * administration screen that manages the platform's accounts and one that
   * manages a list assembled from bookings and guesswork, which is what the
   * dashboard had: `profiles` was never queried at all, so campaign owners
   * appeared under invented ids and every moderation button aimed at one
   * missed.
   */
  profiles: User[]
}

export const EMPTY_SNAPSHOT: RemoteSnapshot = {
  providers: [],
  campaigns: [],
  bookings: [],
  reviews: [],
  notifications: [],
  savedIds: [],
  profiles: [],
}

// ------------------------------------------------------------------- reading

/**
 * Reviews, with their authors' names where the database can supply them.
 *
 * `reviews_public` is the view added by `20260903000100_reviews_public.sql`.
 * Until that migration is applied it does not exist, and PostgREST answers
 * `42P01`/404 rather than an empty set — so the table is read instead and every
 * byline falls back to the neutral label, exactly as it did before the view
 * existed. Once the migration is in, this costs one failed request on the first
 * load and nothing after it.
 */
let reviewsViewMissing = false

async function readReviews() {
  if (!supabase) return { data: null }
  if (reviewsViewMissing) return supabase.from('reviews').select('*')

  const view = await supabase.from('reviews_public').select('*')
  if (!view.error) return view
  // Remembered, so the second request is not paid on every reload for the life
  // of the tab. Reset by a page load, which is when a migration applied in the
  // meantime would be picked up anyway.
  reviewsViewMissing = true
  return supabase.from('reviews').select('*')
}

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

  const [
    publicProviders,
    ownProviders,
    campaigns,
    bookings,
    reviews,
    notifications,
    saved,
    profiles,
  ] = await Promise.all([
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
    /*
     * The view, not the table: it carries the author's display name, which
     * `profiles` will not hand over for anybody but the caller. Row visibility
     * is identical — the view reproduces the `reviews_read` predicate.
     *
     * Falls back to the table when the view is not there, and that fallback is
     * about deployment order rather than taste. Migrations are applied by hand
     * through the SQL editor, so there is a window in which this build is live
     * and `20260903000100_reviews_public.sql` has not been run — and a missing
     * view must cost the site its review *bylines*, not its reviews.
     */
    readReviews(),
    /*
     * This application's own inbox, and nobody else's half of it.
     *
     * `audience` is asked for in the query rather than filtered after it
     * arrives, and the difference is the whole point: an owner signed in to the
     * customer site was being handed their company's approvals — "تم اعتماد
     * حملتك" in a pilgrim's dashboard — because `user_id = auth.uid()` is true
     * of both inboxes and nothing else distinguished them. The rows were
     * genuinely theirs; the screen was the wrong one.
     *
     * `20260909000100` also refuses owner rows to an account that owns no
     * company, and admin rows to anyone who is not an administrator, so a
     * customer cannot reach them by asking PostgREST directly either. That
     * policy is the security boundary. This line is the product one: for the
     * person who legitimately holds both, it decides which of their two inboxes
     * this application is looking at, which is not a question Postgres can
     * answer — the request looks identical from there.
     */
    supabase
      .from('notifications')
      .select('*')
      .eq('audience', APP_AUDIENCE)
      .order('created_at', { ascending: false }),
    supabase.from('saved_campaigns').select('campaign_id'),
    /*
     * The account directory, scoped by policy to exactly what the caller may
     * see. A signed-out visitor gets 401 and an empty slice; a pilgrim gets one
     * row; an administrator gets everyone.
     */
    supabase.from('profiles').select('*'),
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
    reviews: ((reviews.data ?? []) as ReviewPublicRow[]).map(toReview),
    notifications: ((notifications.data ?? []) as NotificationRow[]).map(toNotification),
    savedIds: ((saved.data ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id),
    profiles: ((profiles.data ?? []) as ProfileRow[]).map(profileToUser),
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
 * Approve or refuse a campaign.
 *
 * An RPC rather than an update, for the reason `setProviderVerification` is
 * one: the status, the reason, the audit entry, the owner's notification and
 * the queued email have to land in one transaction. An approval that commits
 * while the notification fails leaves an owner watching a queue they have
 * already left; the reverse tells them about a decision that was rolled back.
 *
 * The database's own message is passed through rather than flattened. "A
 * refusal needs a reason the owner can act on" and "This campaign belongs to a
 * company that is not approved" are two different mistakes, and only the
 * administrator reading them can tell which one they made.
 *
 * With no backend this succeeds and lets the store be the whole truth — the
 * same trade `setProviderVerification` documents. There is no database to have
 * disagreed, and a local dashboard that reported failure on every decision
 * would record none of them.
 */
export async function setCampaignStatus(
  id: string,
  status: CampaignStatus,
  reason?: string,
): Promise<
  { ok: true; campaign?: Campaign } | { ok: false; error: string; code: string }
> {
  if (!supabase) return { ok: true }

  const { data, error } = await supabase.rpc('set_campaign_status', {
    p_campaign_id: id,
    p_status: status,
    p_reason: reason ?? null,
  })

  /*
   * The SQLSTATE travels with the message, and the caller needs both.
   *
   * `set_campaign_status` refuses three things on purpose — a caller who is not
   * an administrator (42501), a refusal with no reason and a trip whose company
   * is not approved (both 23514), and a campaign that does not exist (P0002) —
   * and its messages are written to be read. But they are written in English,
   * because a Postgres function has no idea which language the dashboard is in,
   * and passing one straight into an Arabic sentence is how "اعتماد ونشر"
   * came to look like a button that does nothing.
   *
   * So the code comes back too, and the screen decides what to say. The code is
   * the contract; the message is the fallback for anything not anticipated,
   * which is better shown raw than swallowed.
   */
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'Update failed',
      code: error?.code ?? '',
    }
  }
  return { ok: true, campaign: toCampaign(data as CampaignRow) }
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

/**
 * What NASEK has tried to send, most recent first.
 *
 * Admin-only by policy, and read for one question that had no answer before:
 * did the approval email actually go out. The queue is written inside the
 * decision's transaction and drained by an Edge Function, so "approved" and
 * "the owner was told" are genuinely two facts — and on a project with no mail
 * provider configured the second one is permanently `queued`, which the
 * dashboard should say rather than imply.
 *
 * An error yields an empty list, not a rejection. This is a diagnostic panel;
 * it must not be able to break the screen it sits on.
 */
export async function fetchEmailOutbox(limit = 25): Promise<EmailOutboxRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('email_outbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return error ? [] : ((data ?? []) as EmailOutboxRow[])
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

// --------------------------------------------------------------- reviews

/**
 * Leave a review.
 *
 * The whole subsystem existed and nothing could create a row for it: there was
 * no insert anywhere in the client, and the database gate demanded a booking
 * status nothing ever wrote. Both ends are fixed — see
 * `20260903000300_reviews_chain.sql` — and this is the middle.
 *
 * `provider_id` is sent because the column is `not null` and the policies join
 * through it; it is the campaign's own owner and not something the caller gets
 * to choose, since `reviews_insert_own` pins `user_id` to `auth.uid()` and the
 * trigger checks that this person actually travelled on *this* campaign.
 *
 * The database's own message is passed through. "You can review a trip once you
 * have travelled on it" and "duplicate key" mean different things to the person
 * reading them, and flattening both into "failed" throws that away.
 */
export async function createReview(input: {
  campaignId: string
  providerId: string
  rating: number
  comment: string
}): Promise<{ review: Review } | { error: string }> {
  if (!supabase) return { error: 'offline' }

  const { data: auth } = await supabase.auth.getSession()
  const userId = auth.session?.user?.id
  if (!userId) return { error: 'not signed in' }

  const comment = input.comment.trim()
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      user_id: userId,
      campaign_id: input.campaignId,
      provider_id: input.providerId,
      rating: input.rating,
      // One box, both languages. The prototype does not ask a traveller to
      // write their opinion twice, and storing it under one language only
      // would blank the review for readers of the other.
      comment_ar: comment,
      comment_en: comment,
    })
    .select('*')
    .maybeSingle()

  if (error || !data) return { error: error?.message ?? 'Review failed' }
  return { review: toReview(data as ReviewRow) }
}

/**
 * The campaign owner's public answer to a review.
 *
 * The owner's dashboard has drawn this control since the prototype and kept the
 * text in component state, so a reply survived until the next tab change and
 * was never seen by the traveller it answered. `guard_review_columns` is what
 * makes it safe to let an owner update a row they did not write: they may set
 * these two columns and nothing else.
 *
 * An empty reply clears it, which is how a reply is withdrawn.
 */
export async function replyToReview(id: string, reply: string): Promise<boolean> {
  if (!supabase) return false
  const text = reply.trim()
  const { error } = await supabase
    .from('reviews')
    .update({ reply_ar: text || null, reply_en: text || null })
    .eq('id', id)
  return !error
}

/**
 * Advance bookings whose trip has come back.
 *
 * Idempotent, scoped by the database to the caller's own bookings and the trips
 * they run, and cheap when there is nothing to do. Called when a dashboard
 * opens rather than on a schedule, because there is no scheduler here and a
 * status nobody ever writes is exactly how this subsystem got stuck.
 *
 * Returns how many rows moved, so a caller can skip re-reading when none did.
 */
export async function completePastBookings(): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('complete_past_bookings')
  return error || typeof data !== 'number' ? 0 : data
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
/**
 * The SQLSTATEs `book_campaign` raises on purpose, and only those.
 *
 *   23514  check_violation        — no travellers, closed, not enough seats
 *   P0002  no_data_found          — no such trip, or not approved
 *   42501  insufficient_privilege — not signed in
 *
 * Kept as codes rather than by matching message text, because the text is
 * user-facing copy that will be reworded and the codes are the contract.
 */
const DELIBERATE_BOOKING_REFUSALS = new Set(['23514', 'P0002', '42501'])

export async function createBooking(
  input: BookingRequest,
): Promise<{ booking: Booking } | { error: string; fromServer: boolean }> {
  if (!supabase) return { error: 'offline', fromServer: false }

  const { data, error } = await supabase.rpc('book_campaign', {
    p_campaign_id: input.campaignId,
    p_travellers: input.travellers as unknown as never,
    p_contact_name: input.contactName,
    p_contact_phone: input.contactPhone,
    p_contact_email: input.contactEmail,
    p_notes: input.notes ?? null,
  })

  if (error || !data) {
    /*
     * Only the refusals the function writes on purpose are shown to a customer.
     *
     * `book_campaign` raises with a message meant to be read — "Only 2 seat(s)
     * remain on this trip", "Registration for this campaign has closed" — and
     * surfacing those is the whole point: they are actionable, and a generic
     * failure is not. But `error.message` is whatever Postgres said, and
     * Postgres says things like
     *
     *     relation "public.booking_reference_seq" does not exist
     *
     * which is exactly what the live site is telling customers right now, and
     * which is both meaningless to them and a description of the schema.
     *
     * The three SQLSTATEs below are the ones the function raises deliberately
     * (`check_violation`, `no_data_found`, `insufficient_privilege`). Anything
     * else is a fault on our side and reads as one.
     */
    const deliberate = DELIBERATE_BOOKING_REFUSALS.has(error?.code ?? '')
    return {
      error: deliberate ? error!.message : '',
      /** False when the message is ours to explain rather than the server's. */
      fromServer: deliberate,
    }
  }
  return { booking: toBooking(data as BookingRow, []) }
}

/** Cancel, returning the seats to the trip in the same transaction. */
export async function cancelBooking(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: id })
  return !error
}

// -------------------------------------------------------- giving interest

/**
 * Record an expression of interest in NASEK Giving.
 *
 * The page collected an address, thanked the person and discarded it. The
 * programme genuinely is planned rather than running — the page says so — but
 * "we will tell you when it opens" is a promise that needs somewhere to keep
 * the address, and there wasn't one.
 *
 * A duplicate is success, not an error. Somebody signing up twice has expressed
 * the same intent twice, and reporting failure would be both untrue and a way
 * of finding out whether an address is already on the list.
 */
export async function registerGivingInterest(email: string): Promise<boolean> {
  if (!supabase) return true

  const { data: auth } = await supabase.auth.getSession()
  const { error } = await supabase.from('giving_interest').insert({
    email: email.trim().toLowerCase(),
    // Null for a signed-out visitor, which is the ordinary case: the form is
    // offered to everybody, and the policy allows exactly these two values.
    user_id: auth.session?.user?.id ?? null,
  })

  if (!error) return true
  // 23505 is the unique violation on `email`.
  return error.code === '23505'
}

// -------------------------------------------------------------------- saved

/**
 * Postgres' code for "that row is already there".
 *
 * On this table that is not a failure. `saved_campaigns` is keyed on
 * (user_id, campaign_id) and carries nothing else worth changing, so a second
 * save of the same trip is a request for a state the database is already in.
 */
const UNIQUE_VIOLATION = '23505'

/**
 * Save a trip, or stop saving it.
 *
 * Written as a plain INSERT, and that is the whole of the fix for a bookmark
 * that never worked in production. It used to be `.upsert()`, which PostgREST
 * sends as `INSERT ... ON CONFLICT DO UPDATE` — and Postgres requires the
 * UPDATE privilege for that statement whether or not a conflict actually
 * happens. `20260901000200` grants `authenticated` exactly `select, insert,
 * delete` on this table and deliberately no UPDATE, because a saved row has no
 * mutable column: both of its fields are the key, and `created_at` is the
 * moment it was first saved and should not be rewritten by saving again. So
 * every save, by every account, came back
 *
 *   42501  permission denied for table saved_campaigns
 *
 * as HTTP 403 — which this function turned into `false` and the hook turned
 * into "we could not save that just now". The grant was right; the statement
 * was wrong.
 *
 * A duplicate is therefore handled here rather than delegated to `ON CONFLICT`:
 * the insert races another tab, or a second press, and loses. The row exists
 * and the caller wanted it to exist, so that is a success. Removing works the
 * same way in reverse — deleting a row that is not there is not an error in
 * Postgres, so unsaving twice is quietly fine.
 */
export async function setSaved(
  campaignId: string,
  saved: boolean,
  /*
   * The client to write through, which in the application is always the one
   * this module imported.
   *
   * It is a parameter only so that `verify:favourites` can point the real
   * query builder at a stand-in PostgREST and read the request that comes out
   * of it. That is worth a seam: the bug this function was rewritten for was
   * not in its logic but in the *statement* the builder produced, and a test
   * that stubs the builder is a test that would have passed on the broken
   * version. Nothing in `src/` passes this argument.
   */
  client: typeof supabase = supabase,
): Promise<boolean> {
  if (!client) return false
  const { data: auth } = await client.auth.getSession()
  const userId = auth.session?.user?.id
  if (!userId) return false

  if (!saved) {
    const { error } = await client
      .from('saved_campaigns')
      .delete()
      .eq('user_id', userId)
      .eq('campaign_id', campaignId)
    return !error
  }

  const { error } = await client
    .from('saved_campaigns')
    .insert({ user_id: userId, campaign_id: campaignId })
  return !error || error.code === UNIQUE_VIOLATION
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
  /*
   * Scoped to this application's audience, like the read that populated it.
   *
   * Without the `audience` clause this marks every unread row the person holds,
   * across both inboxes — so a campaign owner pressing "mark all read" on the
   * customer site would silently clear their company's approvals in the Owner
   * Portal, notifications they had never been shown and could no longer find.
   * A control should not reach further than the list it sits above.
   */
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('audience', APP_AUDIENCE)
    .eq('read', false)
  return !error
}
