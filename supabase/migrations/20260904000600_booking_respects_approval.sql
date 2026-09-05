-- =============================================================================
-- NASEK — a campaign that is not published cannot be booked
--
-- `campaigns_read` withholds an unapproved trip from the catalogue, and
-- `deriveCatalogue` keeps it off every public page. Neither of those reaches
-- `book_campaign`, and that is the hole this file closes.
--
-- The reason is structural rather than an oversight in the policy. Row-level
-- security governs what a *query* returns; `book_campaign` is SECURITY DEFINER,
-- so it runs as its owner and the policies on `campaigns` are not consulted
-- inside it at all. Everything that must hold at booking time has to be stated
-- in the function's own body — 20260903000200 already learned this once and
-- added the `provider_approved` check for exactly that reason.
--
-- The consequence, concretely: a caller holding a campaign id — an owner who
-- can see their own pending trip and read its id straight out of their own
-- dashboard — could POST to `book_campaign` and take a seat on a campaign no
-- administrator had approved. The booking would be real, the seat count would
-- move, and the trip would still be invisible to everybody else.
--
-- Two conditions are added, and each mirrors something the interface already
-- promises:
--
--   status = 'active'      nothing unapproved or refused is bookable
--   registration_deadline  nor is a trip whose registration has closed
--
-- WHAT THIS FILE DELIBERATELY PRESERVES
--
-- The whole function is restated, because `create or replace` cannot patch a
-- body. That makes it easy to reintroduce a bug that a later migration fixed,
-- so the two worth naming out loud are kept exactly as 20260903000200 left
-- them: the reference comes from `booking_reference_seq` and *not* from a row
-- count, which is what stopped two concurrent bookings being handed the same
-- one; and `provider_approved` is still checked separately from the row lookup,
-- because a campaign can be approved while its company has since been
-- suspended.
-- =============================================================================

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
as $fn$
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
  -- count — see 20260903000200.
  --
  -- `status = 'active'` joins the predicate rather than being checked after it,
  -- so an unapproved trip is indistinguishable from one that does not exist.
  -- There is nothing to learn from the difference and no reason to offer it.
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

  /*
   * The company has to have been approved.
   *
   * The policy says so for everyone reading the catalogue; this function does
   * not consult the policy, so it has to say so itself. Without this, knowing a
   * campaign id was enough to book a trip run by a company nobody had checked.
   *
   * Separate from the lookup above and not folded into it, because the two
   * states are independent: a campaign approved last month belongs to a company
   * that may have been suspended since, and approval per trip does not clear a
   * suspension per company.
   */
  if not public.provider_approved(trip.provider_id) then
    raise exception 'That campaign is not open for booking'
      using errcode = 'no_data_found';
  end if;

  /*
   * Registration closed.
   *
   * A distinct message, unlike the two above, because this one is a fact about
   * timing that the person can understand and act on — the trip exists, they
   * are simply too late — rather than something they should not be able to see
   * at all.
   *
   * `current_date` is the database's date, which is a deliberate difference
   * from the client: `BookingPage` compares against the browser's clock, and a
   * browser can be wrong or lying. The last word on whether a deadline has
   * passed should not be a value the caller controls.
   */
  if trip.registration_deadline is not null
     and trip.registration_deadline < current_date then
    raise exception 'Registration for this campaign has closed'
      using errcode = 'check_violation';
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

  /*
   * The owner is told a seat went.
   *
   * Small, and the one part of this file that is not closing a hole. This
   * release gives an owner a notifications panel; a booking is the thing they
   * most want in it, and approval news alone would make that panel look like a
   * feed of administrative decisions rather than of their own business.
   */
  perform public.notify_user(
    (select pr.owner_id from public.providers pr where pr.id = trip.provider_id),
    'booking',
    'حجز جديد',
    'New booking',
    'حجز جديد على «' || trip.title_ar || '» — ' || wanted::text || ' مقعد.',
    'A new booking on "' || trip.title_en || '" for ' || wanted::text || ' traveller(s).'
  );

  return created;
end;
$fn$;

revoke all on function public.book_campaign(uuid, jsonb, text, text, text, text)
  from public, anon;
grant execute on function public.book_campaign(uuid, jsonb, text, text, text, text)
  to authenticated;
