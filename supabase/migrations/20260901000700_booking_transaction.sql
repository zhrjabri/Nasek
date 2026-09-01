-- =============================================================================
-- NASEK — booking, as a single transaction
--
-- docs/DATA-MODEL.md has described this race since before there was a database:
--
--   "`seats_available` must never be decremented from the client. Booking has
--    to be a single transaction that locks the campaign row, re-checks
--    availability, decrements, and inserts — otherwise two people book the last
--    seat at once."
--
-- Read-then-write from the browser cannot avoid it. Two people open the last
-- seat, both read `seats_available = 1`, both decide it is fine, both write.
-- The trip is oversold and nothing in the system knows. `SELECT … FOR UPDATE`
-- below makes the second transaction wait for the first to commit and then see
-- the decremented value, so exactly one of them succeeds and the other is told
-- why.
--
-- Travellers are inserted here too, in the same transaction, because a booking
-- without its passengers is not a half-finished booking — it is a corrupt one.
-- =============================================================================

/**
 * Reserve seats on a campaign.
 *
 * Returns the created booking. Raises rather than returning null on failure:
 * "there were not enough seats" and "that campaign is gone" need different
 * messages in the interface, and an exception carries which one it was.
 *
 * SECURITY DEFINER so it can lock and decrement `campaigns`, which no ordinary
 * caller may update — a traveller must be able to consume a seat without being
 * able to edit the trip. It always books for `auth.uid()` and never for an id
 * supplied by the caller, so this cannot be used to make a booking in someone
 * else's name.
 */
create or replace function public.book_campaign(
  p_campaign_id    uuid,
  p_travellers     jsonb,
  p_contact_name   text,
  p_contact_phone  text,
  p_contact_email  text,
  p_notes          text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller     uuid := auth.uid();
  trip       public.campaigns;
  wanted     int  := coalesce(jsonb_array_length(p_travellers), 0);
  fee_rate   numeric := 0.02;   -- NASEK's mediation fee, per the business plan
  total      numeric(10,3);
  created    public.bookings;
  reference  text;
  traveller  jsonb;
begin
  if caller is null then
    raise exception 'You must be signed in to book'
      using errcode = 'insufficient_privilege';
  end if;
  if wanted < 1 then
    raise exception 'A booking needs at least one traveller'
      using errcode = 'check_violation';
  end if;

  -- The lock. Everything after this is serialised against other bookings of the
  -- same trip; bookings of *different* trips are unaffected, because the lock is
  -- on one row.
  select * into trip
  from public.campaigns
  where id = p_campaign_id and suspended = false and deleted = false
  for update;

  if not found then
    raise exception 'That campaign is no longer available'
      using errcode = 'no_data_found';
  end if;

  -- Re-checked *after* the lock, which is the entire point. The value read
  -- before it may already be stale.
  if trip.seats_available < wanted then
    raise exception 'Only % seat(s) remain on this trip', trip.seats_available
      using errcode = 'check_violation';
  end if;

  total := round(trip.price * wanted * (1 + fee_rate), 3);

  -- A reference a person can read out over the phone. The sequence is derived
  -- from the row count so it keeps the NSK-###### shape the prototype used.
  reference := 'NSK-' || lpad(((select count(*) from public.bookings) + 240501)::text, 6, '0');

  insert into public.bookings (
    reference, user_id, campaign_id, travellers_count,
    contact_name, contact_phone, contact_email, total_price, status, notes
  )
  values (
    reference, caller, p_campaign_id, wanted,
    p_contact_name, p_contact_phone, p_contact_email, total, 'confirmed', p_notes
  )
  returning * into created;

  for traveller in select * from jsonb_array_elements(p_travellers)
  loop
    insert into public.travellers (
      booking_id, name, nationality, gender, civil_id, passport_no,
      residence_no, sponsor_name
    )
    values (
      created.id,
      coalesce(traveller ->> 'name', ''),
      coalesce(traveller ->> 'nationality', ''),
      nullif(traveller ->> 'gender', ''),
      nullif(traveller ->> 'civilId', ''),
      nullif(traveller ->> 'passportNo', ''),
      nullif(traveller ->> 'residenceNo', ''),
      nullif(traveller ->> 'sponsorName', '')
    );
  end loop;

  update public.campaigns
     set seats_available = seats_available - wanted,
         bookings_count  = bookings_count + 1
   where id = p_campaign_id;

  return created;
end;
$$;

revoke all on function public.book_campaign(uuid, jsonb, text, text, text, text)
  from public, anon;
grant execute on function public.book_campaign(uuid, jsonb, text, text, text, text)
  to authenticated;

/**
 * Cancel a booking and return its seats.
 *
 * Also SECURITY DEFINER, and for the mirror-image reason: giving a seat back
 * means updating the campaign, which the traveller may not do directly. The
 * ownership check is explicit because the definer context bypasses the policy
 * that would otherwise have enforced it.
 */
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller  uuid := auth.uid();
  target  public.bookings;
begin
  select * into target from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'No such booking' using errcode = 'no_data_found';
  end if;

  if target.user_id <> caller
     and not public.owns_campaign(target.campaign_id)
     and not public.is_admin() then
    raise exception 'That booking is not yours to cancel'
      using errcode = 'insufficient_privilege';
  end if;

  -- Cancelling twice must not hand back the seats twice.
  if target.status = 'cancelled' then
    return target;
  end if;

  update public.bookings set status = 'cancelled'
   where id = p_booking_id
   returning * into target;

  update public.campaigns
     set seats_available = least(seats_available + target.travellers_count, seats_total),
         bookings_count  = greatest(bookings_count - 1, 0)
   where id = target.campaign_id;

  return target;
end;
$$;

revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;
