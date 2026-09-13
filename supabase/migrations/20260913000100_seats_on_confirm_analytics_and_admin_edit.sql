-- =============================================================================
-- NASEK — seats follow payment, an admin can edit a company, and the site
-- counts its own visitors
--
-- Four changes. They are in one file because they are one deployment, and each
-- is separated below.
--
--   1. Seats are deducted when a booking is CONFIRMED, not when it is created.
--   2. `bookings.confirmed_at`, so the administration can show when.
--   3. Anonymous first-party visit counting, readable only by an administrator.
--   4. `admin_update_provider`, an audited path for editing a company, and
--      governorate + wilayah become required.
--
-- No row is deleted. No fee is introduced. No policy is loosened.
-- =============================================================================


-- ==========================================================================
-- 1. SEATS FOLLOW PAYMENT
-- ==========================================================================
--
-- Until now `book_campaign` decremented `seats_available` as it inserted the
-- booking. That made sense when a booking *was* the sale. It is wrong now: a
-- booking is a request, payment happens off the platform over WhatsApp, and a
-- request that is never paid for held a seat nobody could buy until somebody
-- noticed and cancelled it. Twenty seats and seven unpaid enquiries showed a
-- trip as nearly full.
--
-- So the seat moves with the money:
--
--   created (pending)   nothing is held
--   confirmed           the exact passenger count is deducted, atomically
--   cancelled           returned, but only if it had been deducted
--
-- WHAT MAKES IT SAFE
--
-- `set_booking_status` takes `for update` on the campaign row before it reads
-- the seat count, so two owners confirming at the same moment are serialised
-- and the second sees what the first left. The check and the decrement are one
-- statement inside one transaction; there is no window between them.
--
-- Deducting twice is prevented by the state machine rather than by a flag: the
-- only transition that deducts is `pending -> confirmed`, and a booking that is
-- already confirmed returns early. `cancel_booking` restores only from
-- 'confirmed' or 'completed' — cancelling a pending request returns nothing,
-- because nothing was taken.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
-- `bookings_count` still counts requests, incremented on creation and
-- decremented on cancellation. It drives "most popular trips", which is a
-- question about demand rather than about settled sales, and moving it would
-- change what that list means.

/**
 * Create a booking request. Holds no seat.
 *
 * Restated in full because `create or replace` cannot patch a body. Everything
 * is the 20260910000100 version except the two changes named inline: the
 * decrement is gone, and the seat check is now a courtesy rather than a
 * reservation.
 */
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

  if males < 0 or females < 0 then
    raise exception 'Passenger counts cannot be negative'
      using errcode = 'check_violation';
  end if;

  wanted := males + females;

  if wanted < 1 then
    raise exception 'A booking needs at least one passenger'
      using errcode = 'check_violation';
  end if;

  if length(regexp_replace(phone, '\D', '', 'g')) < 8 then
    raise exception 'A contact phone number is required to book'
      using errcode = 'check_violation';
  end if;

  /*
   * Still locked, and still re-read after the lock.
   *
   * Nothing is deducted here any more, but the row is still taken `for update`
   * so that the reference sequence and the seat sanity check below see a
   * consistent trip rather than one being confirmed underneath them.
   */
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

  if not public.provider_approved(trip.provider_id) then
    raise exception 'That campaign is not open for booking'
      using errcode = 'no_data_found';
  end if;

  if trip.registration_deadline is not null
     and trip.registration_deadline < current_date then
    raise exception 'Registration for this campaign has closed'
      using errcode = 'check_violation';
  end if;

  /*
   * A courtesy, not a reservation. THIS IS THE CHANGED MEANING.
   *
   * A request cannot ask for more seats than the trip has left *unconfirmed*
   * right now, because sending an invoice for seats that visibly do not exist
   * wastes everyone's time. But passing this check reserves nothing: two
   * customers may both hold pending requests for the last three seats, and
   * whichever the owner confirms first gets them. The other is refused at
   * confirmation with a message the owner can act on.
   */
  if trip.seats_available < wanted then
    raise exception 'Only % seat(s) remain on this trip', trip.seats_available
      using errcode = 'check_violation';
  end if;

  unit  := trip.price;
  total := round(unit * wanted, 3);

  reference := 'NSK-' || lpad(nextval('public.booking_reference_seq')::text, 6, '0');

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
   * `bookings_count` only. The seat decrement that stood here is gone — see the
   * header. A pending request holds nothing.
   */
  update public.campaigns
     set bookings_count = bookings_count + 1
   where id = p_campaign_id;

  return created;
end;
$fn$;

revoke all on function public.book_campaign(uuid, int, int, text, text, text, text)
  from public, anon;
grant execute on function public.book_campaign(uuid, int, int, text, text, text, text)
  to authenticated;


-- ------------------------- 1b. the seats the old rule is still holding

/*
 * Reconciling the bookings that already exist.
 *
 * Every booking taken before this file was applied had its seats deducted at
 * creation, whatever its status. Under the new rule a pending request holds
 * nothing — so those seats are being held by requests that may never be paid
 * for, and worse, confirming one of them would deduct its seats a *second*
 * time. Two live campaigns are in exactly this state.
 *
 * So pending bookings give their seats back, once. Confirmed and completed
 * bookings keep theirs: their deduction is correct under the new rule too, and
 * touching them would oversell. Cancelled bookings already returned theirs.
 *
 * ONE SHOT, AND REPLAYABLE
 *
 * This is the one statement in the file that is not naturally idempotent —
 * running it twice would hand back the same seats twice. It is guarded by a
 * marker in `admin_audit`: if the reconciliation has run, the block returns
 * immediately. Re-running the whole migration is therefore still safe, which
 * is the property every other statement here has for free.
 *
 * `least(..., seats_total)` is the backstop, so even a wrong sum cannot take a
 * trip above its own capacity.
 */
do $$
declare
  already boolean;
begin
  select exists (
    select 1 from public.admin_audit where action = 'seats_released_for_pending'
  ) into already;

  if already then
    return;
  end if;

  with released as (
    select b.campaign_id, sum(b.travellers_count)::int as seats
      from public.bookings b
     where b.status = 'pending'
     group by b.campaign_id
  )
  update public.campaigns c
     set seats_available = least(c.seats_available + r.seats, c.seats_total)
    from released r
   where c.id = r.campaign_id;

  -- One row per booking whose seats were handed back, so the change is legible
  -- afterwards rather than being a number that moved for no recorded reason.
  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  select null, 'seats_released_for_pending', 'campaign', b.campaign_id::text,
         jsonb_build_object('booking', b.reference, 'seats', b.travellers_count)
    from public.bookings b
   where b.status = 'pending';

  -- And the marker itself, written even when there was nothing to release, so
  -- a replay is a no-op either way.
  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (null, 'seats_released_for_pending', 'migration', '20260913000100',
          jsonb_build_object('note', 'pending bookings no longer hold seats'));
end $$;


-- --------------------------------------------- 2. when it was confirmed

alter table public.bookings add column if not exists confirmed_at timestamptz;

comment on column public.bookings.confirmed_at is
  'When the campaign owner recorded that they had been paid. NULL for a booking '
  'that has never been confirmed. Not back-filled: bookings confirmed before '
  'this column existed have no recorded moment, and inventing one would be a '
  'claim about when money changed hands.';


/**
 * The campaign owner records that they have been paid — and the seat moves.
 *
 * This is now the only place `seats_available` goes down, and the whole of the
 * inventory guarantee lives in the ordering of the statements below:
 *
 *   1. lock the booking, so two confirmations of the *same* booking serialise;
 *   2. check who is asking;
 *   3. return early if it is already confirmed — the idempotency guarantee, and
 *      the reason a second press cannot deduct twice;
 *   4. lock the campaign, so two confirmations of *different* bookings on the
 *      same trip serialise;
 *   5. re-read the seat count under that lock and refuse if it is short;
 *   6. deduct and write the status together.
 *
 * Steps 4 and 5 are what stop two owners overselling: the second confirmation
 * blocks until the first commits, then reads the decremented count and either
 * fits or is refused. The `seats_available >= 0` check constraint on the table
 * is the backstop if this reasoning is ever wrong.
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
  trip   public.campaigns;
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
   * The traveller is absent from this list on purpose. A customer cancels
   * through `cancel_booking`; confirming a payment is the owner's judgement
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

  -- Idempotent, and this is what makes a second press safe: no seat is taken.
  if target.status = 'confirmed' then
    return target;
  end if;

  if target.status <> 'pending' then
    raise exception 'Only a booking awaiting payment can be confirmed'
      using errcode = 'check_violation';
  end if;

  /*
   * The campaign row, locked. Everything from here to the commit is serialised
   * against any other confirmation on this trip.
   */
  select * into trip
  from public.campaigns
  where id = target.campaign_id
  for update;

  if not found then
    raise exception 'That campaign no longer exists' using errcode = 'no_data_found';
  end if;

  /*
   * Read after the lock, never before. The count the owner's screen drew some
   * seconds ago may already have been spent by a colleague confirming another
   * booking on the same trip.
   */
  if trip.seats_available < target.travellers_count then
    raise exception 'Only % seat(s) remain, and this booking needs %',
      trip.seats_available, target.travellers_count
      using errcode = 'check_violation';
  end if;

  update public.campaigns
     set seats_available = seats_available - target.travellers_count
   where id = target.campaign_id;

  update public.bookings
     set status = 'confirmed',
         confirmed_at = now()
   where id = p_booking_id
   returning * into target;

  return target;
end;
$fn$;

revoke all on function public.set_booking_status(uuid, public.booking_status)
  from public, anon;
grant execute on function public.set_booking_status(uuid, public.booking_status)
  to authenticated;


/**
 * Cancel — and return the seat only if one was taken.
 *
 * The change from 20260901000700 is the condition on the restore. That version
 * gave seats back for any booking that was not already cancelled, which was
 * correct when every booking held seats from creation. Now a pending request
 * holds none, so restoring on its cancellation would *invent* a seat and let
 * the trip oversell by one for every enquiry that came to nothing.
 *
 * `least(..., seats_total)` is kept as the backstop it always was.
 */
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller uuid := auth.uid();
  target public.bookings;
  held   boolean;
begin
  if caller is null then
    raise exception 'You must be signed in' using errcode = 'insufficient_privilege';
  end if;

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

  /*
   * Did this booking actually hold a seat? Only 'confirmed' and 'completed'
   * ever do. Read before the status is overwritten.
   */
  held := target.status in ('confirmed', 'completed');

  update public.bookings set status = 'cancelled'
   where id = p_booking_id
   returning * into target;

  if held then
    update public.campaigns
       set seats_available = least(seats_available + target.travellers_count, seats_total),
           bookings_count  = greatest(bookings_count - 1, 0)
     where id = target.campaign_id;
  else
    update public.campaigns
       set bookings_count = greatest(bookings_count - 1, 0)
     where id = target.campaign_id;
  end if;

  return target;
end;
$fn$;

revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;


-- ==========================================================================
-- 3. ANONYMOUS VISIT COUNTING
-- ==========================================================================
--
-- The administration asks a reasonable question — how many people visit the
-- customer site — and NASEK had no way to answer it that was not a guess.
--
-- WHAT IS RECORDED, AND WHAT IS DELIBERATELY NOT
--
-- Recorded: a path, a coarse page kind, an opaque visitor id, and a timestamp.
--
-- Not recorded, at all: no IP address, no user agent, no `auth.uid()`, no email,
-- no phone, no name, no referrer, no query string. A booking, a sign-in and an
-- OTP leave no trace here. There is nothing in this table that identifies a
-- person, and nothing that can be joined to `profiles` or `bookings`.
--
-- HOW "UNIQUE VISITOR" IS DEFINED
--
-- `visitor_id` is a random UUID the browser generates for itself on first visit
-- and keeps in its own `localStorage`. It is not derived from anything about the
-- person or the device — it is a coin flip, first-party, and never sent
-- anywhere but here.
--
-- A unique visitor is therefore one distinct `visitor_id`. That is an honest
-- approximation and not a headcount: clearing site data, a private window, or a
-- second browser each produce a new id and count again; two people sharing a
-- phone count once. The administration screen says so rather than implying a
-- census.
--
-- ABUSE
--
-- `anon` can insert, because the visitors being counted are anonymous. That
-- means the counts can be inflated by anyone willing to POST in a loop. It is a
-- vanity metric, not a billing input, and the alternative — an authenticated
-- write — would count only signed-in people and answer a different question.
-- The row is narrow and the table is unreadable to anyone but an administrator.

create table if not exists public.site_visits (
  id          bigint generated always as identity primary key,
  /** Path only, no query string, capped. `/campaigns/<uuid>` becomes `/campaigns/:id`. */
  path        text not null check (length(path) between 1 and 200),
  /** A coarse bucket so the dashboard can group without parsing paths. */
  kind        text not null default 'page'
              check (kind in ('page', 'campaign', 'smart_match')),
  /** The campaign a `campaign` view was of. Never joined to a person. */
  campaign_id uuid references public.campaigns (id) on delete set null,
  /** Random, first-party, browser-generated. See the header. */
  visitor_id  uuid not null,
  created_at  timestamptz not null default now()
);

create index if not exists site_visits_created_idx on public.site_visits (created_at desc);
create index if not exists site_visits_visitor_idx on public.site_visits (visitor_id);

alter table public.site_visits enable row level security;

/*
 * Write-only for the world, readable by nobody through the table.
 *
 * There is no SELECT policy at all — not for `anon`, not for `authenticated`,
 * not for an administrator. The only way to read this data is the aggregate
 * function below, which returns counts and never rows. A visitor cannot read
 * back what other visitors did, and an administrator cannot accidentally build
 * a screen that lists individual visits.
 */
drop policy if exists site_visits_insert on public.site_visits;
create policy site_visits_insert on public.site_visits
  for insert to anon, authenticated
  with check (true);

revoke all on public.site_visits from anon, authenticated;
grant insert on public.site_visits to anon, authenticated;

/**
 * Record one page view.
 *
 * A function rather than a bare insert so the shape is fixed: the client cannot
 * add a column, and `created_at` is the server's clock rather than a value a
 * browser chose. Returns nothing — analytics must never be something a page
 * waits on.
 */
create or replace function public.record_visit(
  p_path        text,
  p_kind        text default 'page',
  p_campaign_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  visitor uuid;
begin
  /*
   * The visitor id comes from a request header, not an argument.
   *
   * PostgREST exposes the request's headers to the function; taking it from
   * `x-nasek-visitor` rather than the body keeps it out of anything that logs
   * request bodies, and makes it obvious at the call site that this is not
   * account data.
   */
  begin
    visitor := nullif(
      current_setting('request.headers', true)::json ->> 'x-nasek-visitor', ''
    )::uuid;
  exception when others then
    visitor := null;
  end;

  if visitor is null then
    return;   -- no id, no row. Never invent one.
  end if;

  insert into public.site_visits (path, kind, campaign_id, visitor_id)
  values (
    left(coalesce(nullif(btrim(p_path), ''), '/'), 200),
    case when p_kind in ('page', 'campaign', 'smart_match') then p_kind else 'page' end,
    p_campaign_id,
    visitor
  );
end;
$fn$;

revoke all on function public.record_visit(text, text, uuid) from public;
grant execute on function public.record_visit(text, text, uuid) to anon, authenticated;

/**
 * The numbers, for an administrator, as counts and never as rows.
 *
 * One function so there is one place that decides what an administrator may
 * learn from this table. It returns six totals and two small leaderboards, and
 * no `visitor_id` ever leaves the database.
 */
create or replace function public.site_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may read site analytics'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'visits_total',        (select count(*) from public.site_visits),
    'visitors_total',      (select count(distinct visitor_id) from public.site_visits),
    'visits_today',        (select count(*) from public.site_visits
                             where created_at >= date_trunc('day', now())),
    'visitors_today',      (select count(distinct visitor_id) from public.site_visits
                             where created_at >= date_trunc('day', now())),
    'visits_week',         (select count(*) from public.site_visits
                             where created_at >= now() - interval '7 days'),
    'visits_month',        (select count(*) from public.site_visits
                             where created_at >= now() - interval '30 days'),
    'campaign_views',      (select count(*) from public.site_visits where kind = 'campaign'),
    'smart_match_visits',  (select count(*) from public.site_visits where kind = 'smart_match'),
    'top_pages',           coalesce((
                             select jsonb_agg(row_to_json(t))
                             from (
                               select path, count(*) as views
                               from public.site_visits
                               where kind = 'page'
                               group by path
                               order by count(*) desc
                               limit 10
                             ) t), '[]'::jsonb),
    'top_campaigns',       coalesce((
                             select jsonb_agg(row_to_json(t))
                             from (
                               select v.campaign_id, c.title_ar, c.title_en, count(*) as views
                               from public.site_visits v
                               join public.campaigns c on c.id = v.campaign_id
                               where v.kind = 'campaign'
                               group by v.campaign_id, c.title_ar, c.title_en
                               order by count(*) desc
                               limit 10
                             ) t), '[]'::jsonb)
  ) into result;

  return result;
end;
$fn$;

revoke all on function public.site_analytics() from public, anon;
grant execute on function public.site_analytics() to authenticated;


-- ==========================================================================
-- 4. THE COMPANY RECORD: AN AUDITED ADMIN EDIT, AND TWO REQUIRED FIELDS
-- ==========================================================================

-- ------------------------------------- governorate and wilayah are required

/*
 * Safe because the data is already clean.
 *
 * Both companies on the platform carry a governorate and a wilayah — checked
 * against the live project before this file was written. `set not null` on a
 * table with a null would abort the whole migration and change nothing, which
 * is the right failure: it would mean the assumption had gone stale and a
 * back-fill decision was needed from a person, not from this file. Nothing here
 * invents a value for an existing company.
 */
alter table public.providers alter column governorate set not null;
alter table public.providers alter column wilayah_id  set not null;

/*
 * And not blank, which `not null` alone does not say. A company that submitted
 * an empty string would satisfy the column and fail the form.
 */
do $$ begin
  alter table public.providers add constraint providers_governorate_present
    check (btrim(governorate) <> '');
exception when duplicate_object then null; end $$;

/*
 * `address` is NOT dropped.
 *
 * It leaves the active profile workflow — no form collects it, no RPC accepts
 * it, nothing displays it — but the column and its contents stay. Two companies
 * have an address on file that somebody typed for a reason, and deleting real
 * data to tidy a form is a loss, not a migration. If it is ever genuinely
 * unwanted, that is a separate decision with its own file.
 */
comment on column public.providers.address is
  'RETIRED from the profile workflow by 20260913000100. No form collects it and '
  'no RPC writes it; existing values are kept deliberately. Do not reintroduce '
  'it without a product decision — governorate and wilayah are the location of '
  'record.';

-- ------------------------------------------- an audited admin edit path

/**
 * An administrator edits a company.
 *
 * An administrator could already UPDATE `providers` directly — the policy
 * allows it and `guard_provider_privileges` returns early for them — so this
 * adds no permission that did not exist. What it adds is a *record*: the guard
 * audits verification changes and nothing else, so an administrator correcting
 * a company's name or phone left no trail at all.
 *
 * It writes only the fields an administrator should be correcting on somebody
 * else's behalf. Deliberately absent:
 *
 *   verification   `set_provider_status` owns it, and audits it
 *   logo_path      `set_provider_logo` owns it, and checks the path
 *   plan, rating, review_count, owner_id, joined_at   not an administrator's
 *                  to invent
 *
 * `null` means "leave alone" for every argument, so a caller sends only what it
 * is changing. Governorate and wilayah can be corrected but not cleared, which
 * is the constraint above stated in the one place that could otherwise violate
 * it.
 */
create or replace function public.admin_update_provider(
  p_provider_id             uuid,
  p_name                    text default null,
  p_tagline                 text default null,
  p_description             text default null,
  p_governorate             text default null,
  p_wilayah_id              text default null,
  p_phone                   text default null,
  p_email                   text default null,
  p_experience_years        int  default null,
  p_commercial_registration text default null,
  p_permit_number           text default null,
  p_permit_expiry           date default null
)
returns public.providers
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  before  public.providers;
  updated public.providers;
  changes jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may edit a company'
      using errcode = 'insufficient_privilege';
  end if;

  select * into before from public.providers where id = p_provider_id for update;
  if not found then
    raise exception 'No such company' using errcode = 'no_data_found';
  end if;

  if p_governorate is not null and btrim(p_governorate) = '' then
    raise exception 'A governorate is required' using errcode = 'check_violation';
  end if;
  if p_wilayah_id is not null and btrim(p_wilayah_id) = '' then
    raise exception 'A wilayah is required' using errcode = 'check_violation';
  end if;

  /*
   * The diff, built before the write so the audit records what actually moved
   * rather than everything the caller happened to send.
   */
  if p_name is not null and btrim(p_name) <> '' and p_name is distinct from before.name_ar then
    changes := changes || jsonb_build_object('name', btrim(p_name));
  end if;
  if p_governorate is not null and p_governorate is distinct from before.governorate then
    changes := changes || jsonb_build_object('governorate', p_governorate);
  end if;
  if p_wilayah_id is not null and p_wilayah_id is distinct from before.wilayah_id then
    changes := changes || jsonb_build_object('wilayah_id', p_wilayah_id);
  end if;
  if p_phone is not null and p_phone is distinct from before.phone then
    changes := changes || jsonb_build_object('phone', p_phone);
  end if;
  if p_email is not null and p_email is distinct from before.email then
    changes := changes || jsonb_build_object('email', p_email);
  end if;
  if p_commercial_registration is not null
     and p_commercial_registration is distinct from before.commercial_registration then
    changes := changes || jsonb_build_object('commercial_registration', p_commercial_registration);
  end if;
  if p_permit_number is not null and p_permit_number is distinct from before.permit_number then
    changes := changes || jsonb_build_object('permit_number', p_permit_number);
  end if;
  if p_permit_expiry is not null and p_permit_expiry is distinct from before.permit_expiry then
    changes := changes || jsonb_build_object('permit_expiry', p_permit_expiry);
  end if;

  /*
   * `verified_write` is on because an administrator editing the verification
   * evidence is precisely the case that flag exists for — the same window
   * `review_provider_changes` opens when it approves an owner's submission.
   */
  perform set_config('nasek.verified_write', 'on', true);

  update public.providers
     set name_ar                 = coalesce(nullif(btrim(p_name), ''), name_ar),
         name_en                 = coalesce(nullif(btrim(p_name), ''), name_en),
         tagline_ar              = coalesce(p_tagline, tagline_ar),
         tagline_en              = coalesce(p_tagline, tagline_en),
         description_ar          = coalesce(p_description, description_ar),
         description_en          = coalesce(p_description, description_en),
         governorate             = coalesce(nullif(btrim(p_governorate), ''), governorate),
         wilayah_id              = coalesce(nullif(btrim(p_wilayah_id), ''), wilayah_id),
         phone                   = coalesce(p_phone, phone),
         email                   = coalesce(p_email, email),
         experience_years        = coalesce(p_experience_years, experience_years),
         commercial_registration = coalesce(p_commercial_registration, commercial_registration),
         permit_number           = coalesce(p_permit_number, permit_number),
         permit_expiry           = coalesce(p_permit_expiry, permit_expiry)
   where id = p_provider_id
   returning * into updated;

  perform set_config('nasek.verified_write', 'off', true);

  if changes <> '{}'::jsonb then
    insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'provider_edit', 'provider', p_provider_id::text, changes);
  end if;

  return updated;
end;
$fn$;

revoke all on function public.admin_update_provider(
  uuid, text, text, text, text, text, text, text, int, text, text, date
) from public, anon;
grant execute on function public.admin_update_provider(
  uuid, text, text, text, text, text, text, text, int, text, text, date
) to authenticated;


-- ==========================================================================
-- 5. what this file did not touch
-- ==========================================================================

/*
 * Stated because the next question is whether anything widened.
 *
 *   * `providers_public` is not recreated: still no phone, email, address,
 *     commercial registration, permit or licence.
 *   * `bookings_read`, `campaigns_read` and every provider policy are unchanged.
 *   * `guard_provider_privileges` and `guard_campaign_moderation` are unchanged,
 *     so `logo_path` stays protected and a trip's status stays the platform's.
 *   * `booking_provider_contact` is unchanged.
 *   * No fee, rate or commission is introduced anywhere.
 *   * `address` keeps its data. No row is deleted or back-filled.
 */
