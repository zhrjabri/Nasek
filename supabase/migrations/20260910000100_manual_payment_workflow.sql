-- =============================================================================
-- NASEK — booking becomes a request, and payment happens off the platform
--
-- NASEK does not take money. It never did — `book_campaign` inserted every
-- booking as 'confirmed' the instant it was written, and the customer flow
-- ended on a screen with a greyed-out card number and a button reading
-- "Simulate payment". So the database's own record said a trip was paid for and
-- confirmed when nothing had been paid and nobody had agreed to anything.
--
-- The workflow this file moves the schema to is the one NASEK actually
-- operates: a customer creates a booking *request*, NASEK issues an invoice
-- number, the customer sends that invoice to the campaign owner over WhatsApp,
-- the owner sends payment details and is paid directly, and the owner then
-- marks the booking confirmed in their own portal. Money never passes through
-- NASEK, and after this file the database never claims it did.
--
-- WHAT IS REUSED RATHER THAN ADDED
--
-- Most of it, because most of it was already right:
--
--   bookings.reference        already `NSK-######`, already unique, already
--                             drawn from `booking_reference_seq` rather than a
--                             row count (20260903000200). That is the invoice
--                             number. No second identifier is introduced.
--   bookings.status           the existing enum already carries the four states
--                             this workflow needs. 'pending' is "awaiting
--                             payment", 'confirmed' is "the owner has been
--                             paid", 'cancelled' covers both cancelled and
--                             refused, 'completed' is the trip having run. No
--                             new enum values, and no new label for a state
--                             that already had one.
--   bookings.total_price      the amount, snapshotted at creation.
--   bookings.travellers_count the passenger total.
--   contact_name/phone/email  the customer, as they were when they booked.
--   booking_date, created_at  when the request was made.
--
-- WHAT IS ADDED, AND WHY EACH ONE HAS NO EQUIVALENT
--
--   male_count, female_count  the split the campaign owner needs in order to
--                             arrange accommodation, and the only thing the new
--                             flow asks the customer for. `travellers.gender`
--                             exists, but it is one row per named traveller
--                             with a civil ID and a passport number, and this
--                             flow deliberately collects none of those — see
--                             below. Counting rows that are not written is not
--                             an equivalent.
--   price_per_person          the per-head price *as it stood when the booking
--                             was made*. `campaigns.price` is live and an owner
--                             may change it; `total_price / travellers_count`
--                             is not a substitute, because it is a division
--                             that has already been rounded once and because it
--                             stops being derivable the moment the fee model
--                             changes again.
--
-- All three are NULLABLE, and that is the point rather than an oversight.
-- Bookings taken before today have no gender split and no recorded per-head
-- price. NULL says exactly that. Back-filling a zero, or dividing the total to
-- manufacture a per-head figure, would be inventing commercial facts about real
-- historical bookings, and every screen that reads these columns is written to
-- show "—" for a row that predates them.
--
-- WHAT THE TOTAL NOW MEANS
--
--   total_price = round(price_per_person * travellers, 3)
--
-- and nothing else. It used to be `price * count * 1.02`: NASEK's 2% mediation
-- fee, added on top and shown to the customer as a line item. That could not
-- survive this change. The invoice the customer now sends is a request for the
-- campaign owner's own payment details, and the owner is paid the whole of what
-- it says — so a fee added into that figure is a fee the customer hands to the
-- owner on NASEK's behalf, with no mechanism anywhere to pass it back.
--
-- The 2% is unchanged as a commercial fact; what changes is who the invoice is
-- between. It is now what the owner owes NASEK on confirmed business, computed
-- as 2% of confirmed booking value, and it is not part of what the traveller
-- pays. `mediationFee()` in the application computes it that way.
--
-- WHAT IS DELIBERATELY NOT DESTROYED
--
-- `public.travellers`, its rows, its policies and its grants are untouched. The
-- new booking flow stops *writing* to it — it no longer asks a customer to type
-- a passport number for each companion before they have even been told how to
-- pay — but every row already there stays readable by exactly the three parties
-- that could read it before. Nothing in any of the three applications displays
-- a traveller row today, so nothing on screen changes; the data is kept because
-- deleting personal records to tidy a schema is not a migration, it is a loss.
-- =============================================================================


-- ---------------------------------------------------------------- 1. columns

alter table public.bookings
  add column if not exists male_count       int,
  add column if not exists female_count     int,
  add column if not exists price_per_person numeric(10,3);

/*
 * The two counts travel together or not at all.
 *
 * A row with a male count and no female count is not a partial record, it is a
 * record that cannot be added up — and the invoice adds them up. Naming the
 * constraints means re-running this file is a no-op rather than a duplicate.
 */
do $$ begin
  alter table public.bookings add constraint bookings_gender_counts_paired
    check ((male_count is null) = (female_count is null));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.bookings add constraint bookings_gender_counts_nonneg
    check (coalesce(male_count, 0) >= 0 and coalesce(female_count, 0) >= 0);
exception when duplicate_object then null; end $$;

/*
 * And when they are present they must account for every passenger.
 *
 * `travellers_count` is what the seat arithmetic uses — it is what was
 * subtracted from `seats_available` and what `cancel_booking` gives back — so a
 * split that disagrees with it would put the invoice and the seat ledger into
 * two different stories about the same booking.
 */
do $$ begin
  alter table public.bookings add constraint bookings_gender_counts_total
    check (male_count is null or male_count + female_count = travellers_count);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.bookings add constraint bookings_price_per_person_nonneg
    check (price_per_person is null or price_per_person >= 0);
exception when duplicate_object then null; end $$;

comment on column public.bookings.male_count is
  'Male passengers, as selected at booking time. NULL for bookings taken before the manual-payment workflow.';
comment on column public.bookings.female_count is
  'Female passengers, as selected at booking time. NULL for bookings taken before the manual-payment workflow.';
comment on column public.bookings.price_per_person is
  'Per-head price snapshotted at booking time. Never follows a later edit to campaigns.price.';


-- ------------------------------------------------------------- 2. booking

/*
 * The old six-argument form goes.
 *
 * `create or replace` cannot change a signature — it would leave the previous
 * function in place as an overload, and PostgREST would happily keep routing to
 * whichever one a caller's argument names happened to match. That is a booking
 * path that writes 'confirmed' and no gender split, still live, still reachable
 * from any browser, after this file claims to have removed it.
 */
drop function if exists public.book_campaign(uuid, jsonb, text, text, text, text);

create or replace function public.book_campaign(
  p_campaign_id    uuid,
  p_male_count     int,
  p_female_count   int,
  p_contact_name   text,
  p_contact_phone  text,
  p_contact_email  text,
  p_notes          text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller     uuid := auth.uid();
  trip       public.campaigns;
  males      int  := coalesce(p_male_count, 0);
  females    int  := coalesce(p_female_count, 0);
  wanted     int;
  phone      text := btrim(coalesce(p_contact_phone, ''));
  unit       numeric(10,3);
  total      numeric(10,3);
  created    public.bookings;
  reference  text;
begin
  if caller is null then
    raise exception 'You must be signed in to book'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * The counts are validated here and not only in the browser, because the
   * browser is not the only thing that can call this. A negative male count
   * with a compensating female count would otherwise pass the total check and
   * buy seats that were never subtracted.
   */
  if males < 0 or females < 0 then
    raise exception 'Passenger counts cannot be negative'
      using errcode = 'check_violation';
  end if;

  wanted := males + females;

  if wanted < 1 then
    raise exception 'A booking needs at least one passenger'
      using errcode = 'check_violation';
  end if;

  /*
   * A booking with no way to reach the customer is not a booking.
   *
   * The campaign owner's entire side of this workflow is "reply to the person
   * who sent the invoice", and the invoice carries this number. The interface
   * refuses to submit without one and sends the customer to their profile
   * instead; this is the same rule stated where it cannot be skipped. Eight
   * digits is the shortest thing that can be an Omani mobile — the shape is
   * checked in the application, which knows about country codes; what matters
   * here is that the column is never a blank or a space.
   */
  if length(regexp_replace(phone, '\D', '', 'g')) < 8 then
    raise exception 'A contact phone number is required to book'
      using errcode = 'check_violation';
  end if;

  -- The lock. Everything after this is serialised against other bookings of the
  -- same trip; bookings of *different* trips are unaffected, because the lock is
  -- on one row. That is also why the reference below cannot be derived from a
  -- count — see 20260903000200.
  select * into trip
  from public.campaigns
  where id = p_campaign_id
    and suspended = false
    and deleted = false
    and status = 'active'
  for update;

  if not found then
    raise exception 'That campaign is no longer available'
      using errcode = 'no_data_found';
  end if;

  -- Approved company, checked separately from the row: a campaign can be
  -- approved while the company behind it has since been suspended.
  if not public.provider_approved(trip.provider_id) then
    raise exception 'That campaign is not open for booking'
      using errcode = 'no_data_found';
  end if;

  if trip.registration_deadline is not null
     and trip.registration_deadline < current_date then
    raise exception 'Registration for this campaign has closed'
      using errcode = 'check_violation';
  end if;

  -- Re-checked *after* the lock, which is the entire point. The value the
  -- browser rendered some seconds ago may already be stale.
  if trip.seats_available < wanted then
    raise exception 'Only % seat(s) remain on this trip', trip.seats_available
      using errcode = 'check_violation';
  end if;

  /*
   * The price is read from the locked campaign row, never from the caller.
   *
   * This function has never accepted a price and must not start: a total posted
   * by a browser is a total chosen by whoever is driving the browser. The value
   * read here is also the value stored, so the invoice keeps saying what the
   * trip cost on the day it was booked however often the owner re-prices it
   * afterwards.
   */
  unit  := trip.price;
  total := round(unit * wanted, 3);

  reference := 'NSK-' || lpad(nextval('public.booking_reference_seq')::text, 6, '0');

  /*
   * 'pending' — awaiting payment.
   *
   * This is the single most important line in the file. It used to say
   * 'confirmed'. Nothing has been paid at the moment this row is written;
   * nobody has agreed to anything; the customer has not yet so much as opened
   * WhatsApp. Only the campaign owner, having actually received money, can move
   * it on, and `set_booking_status` below is the only way they can.
   */
  insert into public.bookings (
    reference, user_id, campaign_id, travellers_count,
    male_count, female_count, price_per_person,
    contact_name, contact_phone, contact_email, total_price, status, notes
  )
  values (
    reference, caller, p_campaign_id, wanted,
    males, females, unit,
    p_contact_name, phone, p_contact_email, total, 'pending', p_notes
  )
  returning * into created;

  /*
   * Seats are held by a pending request.
   *
   * The alternative — hold nothing until payment lands — oversells every
   * popular trip, because the gap between "request" and "paid" is a WhatsApp
   * conversation and can be hours. `cancel_booking` returns them, and it is
   * what an owner uses on a request that was never paid for.
   */
  update public.campaigns
     set seats_available = seats_available - wanted,
         bookings_count  = bookings_count + 1
   where id = p_campaign_id;

  return created;
end;
$fn$;

revoke all on function public.book_campaign(uuid, int, int, text, text, text, text)
  from public, anon;
grant execute on function public.book_campaign(uuid, int, int, text, text, text, text)
  to authenticated;


-- --------------------------------------------------------- 3. confirming it

/*
 * The campaign owner, having been paid, says so.
 *
 * This is the only way a booking becomes 'confirmed', and it is deliberately
 * not something the customer can call. Under the old model that distinction did
 * not exist — `bookings_update` let the traveller who made a booking UPDATE
 * their own row, status column included, so anyone who could open a network tab
 * could mark their own unpaid trip confirmed. That policy is removed below.
 *
 * Only two transitions are allowed, and both are ones a human actually
 * performs:
 *
 *   pending   -> confirmed   the owner received the payment
 *   pending   -> cancelled   the request was refused, or never paid
 *   confirmed -> cancelled   handled by `cancel_booking`, which also returns
 *                            the seats; this function refuses it rather than
 *                            doing half the job
 *
 * 'completed' is not reachable from here. It belongs to
 * `complete_past_bookings`, which moves a confirmed booking on only once the
 * trip's return date has passed, and letting an owner set it by hand would let
 * them mark a trip finished that has not departed.
 */
create or replace function public.set_booking_status(
  p_booking_id uuid,
  p_status     public.booking_status
)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  target public.bookings;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in'
      using errcode = 'insufficient_privilege';
  end if;

  select * into target from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'No such booking' using errcode = 'no_data_found';
  end if;

  /*
   * The traveller is absent from this list on purpose.
   *
   * A customer cancels through `cancel_booking`, which is theirs to call and
   * which returns the seats. Confirming a payment is the owner's judgement
   * about money they have or have not received, and it is not the payer's to
   * assert.
   */
  if not public.owns_campaign(target.campaign_id) and not public.is_admin() then
    raise exception 'That booking is not yours to manage'
      using errcode = 'insufficient_privilege';
  end if;

  if p_status = 'cancelled' then
    raise exception 'Use cancel_booking so the seats are returned'
      using errcode = 'check_violation';
  end if;

  if p_status <> 'confirmed' then
    raise exception 'A booking can only be moved to confirmed from here'
      using errcode = 'check_violation';
  end if;

  if target.status = 'confirmed' then
    return target;   -- idempotent: two taps on one button is not an error
  end if;

  if target.status <> 'pending' then
    raise exception 'Only a booking awaiting payment can be confirmed'
      using errcode = 'check_violation';
  end if;

  update public.bookings set status = 'confirmed'
   where id = p_booking_id
   returning * into target;

  return target;
end;
$fn$;

revoke all on function public.set_booking_status(uuid, public.booking_status)
  from public, anon;
grant execute on function public.set_booking_status(uuid, public.booking_status)
  to authenticated;


-- ------------------------------------------------------------------ 4. RLS

/*
 * No direct UPDATE on bookings, by anybody.
 *
 * `bookings_update` allowed the traveller, the owner and an administrator to
 * write any column of a booking row from the browser. With payment happening
 * off-platform and 'confirmed' now *meaning* "money has changed hands", a
 * customer-writable status column is the difference between a record and a
 * wish. There is no narrower policy worth writing, because every legitimate
 * change to a booking already goes through a SECURITY DEFINER function that
 * checks who is asking and constrains what they may set:
 *
 *   cancel_booking          traveller, owner or admin; returns the seats
 *   set_booking_status      owner or admin; pending -> confirmed only
 *   complete_past_bookings  confirmed -> completed, only after the return date
 *
 * Those run as the function owner and are unaffected by the absence of a
 * policy. Reading is untouched: `bookings_read` still shows a booking to the
 * traveller who made it, the owner whose trip it is, and NASEK.
 *
 * This is a tightening. Nothing in any of the three applications performed a
 * direct update on this table — every write already went through one of the
 * three functions above — so no screen loses a capability it was using.
 */
drop policy if exists bookings_update on public.bookings;

revoke update on public.bookings from authenticated;

/*
 * INSERT stays revoked in effect for the same reason it always was: the policy
 * `bookings_insert_own` remains, but no application path uses it — `book_campaign`
 * is the only way a booking is created, because it is the only thing that can
 * lock the campaign row, re-check the seats and decrement them in the same
 * transaction. The policy is left in place rather than dropped: it is the thing
 * that would refuse a hand-written insert on somebody else's behalf, and
 * removing it would make that refusal depend on the grant alone.
 */
