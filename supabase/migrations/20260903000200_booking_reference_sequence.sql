-- =============================================================================
-- NASEK — two things wrong with `book_campaign`
--
-- 1. THE REFERENCE WAS DERIVED FROM A ROW COUNT.
--
--        reference := 'NSK-' || lpad(((select count(*) from bookings) + 240501)::text, 6, '0');
--
--    `bookings.reference` is UNIQUE, and that expression is not. The row lock
--    taken a few lines above serialises bookings *of the same trip* and nothing
--    else — which is the whole point of locking one row rather than the table —
--    so two people booking two different campaigns at the same moment both read
--    the same count, both build the same reference, and the second one fails on
--    the unique index. The traveller sees a raw Postgres error at the instant
--    they press pay, having done nothing wrong, and it is least likely to
--    happen in testing and most likely on the busiest day of the year.
--
--    A sequence is the mechanism Postgres provides for exactly this: it hands
--    out a number outside the transaction, so two concurrent callers cannot
--    receive the same one, and it does not consult a table whose contents can
--    change underneath it.
--
--    Numbers are skipped when a booking fails after drawing one. That is
--    correct: a reference is an identifier, not a count of anything, and it has
--    never been safe to read the number of bookings off the last one.
--
-- 2. AN UNAPPROVED COMPANY'S TRIP COULD STILL BE BOOKED.
--
--    `campaigns_read` withholds those trips from the catalogue, so the
--    interface cannot offer one — but this function is SECURITY DEFINER and its
--    own SELECT does not consult that policy. It checked `suspended` and
--    `deleted` and never asked whether the company behind the trip had been
--    approved. Anyone who knew a campaign id could POST to the RPC and hold a
--    confirmed booking with a company NASEK had not verified, which is the one
--    promise the verification queue exists to keep.
--
-- Both are fixed by replacing the function. Everything else about it — the
-- lock, the re-check after it, the travellers written in the same transaction —
-- is unchanged and was already right.
-- =============================================================================

/*
 * Starts past the prototype's last hand-made reference so the NSK-###### shape
 * carries on unbroken.
 */
create sequence if not exists public.booking_reference_seq
  as bigint
  start with 240501
  minvalue 240501;

/*
 * Move it past anything already issued, and never backwards.
 *
 * `greatest` is what makes replaying this file safe: on a database that has
 * taken bookings since, the sequence is already ahead of the row count, and
 * winding it back would hand out references that are already in use.
 */
select setval(
  'public.booking_reference_seq',
  greatest(
    (select last_value from public.booking_reference_seq),
    (select count(*) from public.bookings) + 240501
  ),
  true
);

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
  -- on one row. That is also why the reference below cannot be derived from a
  -- count — see the header.
  select * into trip
  from public.campaigns
  where id = p_campaign_id and suspended = false and deleted = false
  for update;

  if not found then
    raise exception 'That campaign is no longer available'
      using errcode = 'no_data_found';
  end if;

  /*
   * The company has to have been approved.
   *
   * The policy says so for everyone reading the catalogue; this function does
   * not consult the policy, so it has to say so itself. Without this, knowing a
   * campaign id was enough to book a trip run by a company nobody had checked.
   */
  if not public.provider_approved(trip.provider_id) then
    raise exception 'That campaign is not open for booking'
      using errcode = 'no_data_found';
  end if;

  -- Re-checked *after* the lock, which is the entire point. The value read
  -- before it may already be stale.
  if trip.seats_available < wanted then
    raise exception 'Only % seat(s) remain on this trip', trip.seats_available
      using errcode = 'check_violation';
  end if;

  total := round(trip.price * wanted * (1 + fee_rate), 3);

  -- A reference a person can read out over the phone, from a sequence rather
  -- than a row count: two concurrent bookings on different trips can no longer
  -- be handed the same one.
  reference := 'NSK-' || lpad(nextval('public.booking_reference_seq')::text, 6, '0');

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

-- The sequence is advanced only from inside the definer function above, which
-- runs as its owner. No client role needs to touch it.
revoke all on sequence public.booking_reference_seq from public, anon, authenticated;
