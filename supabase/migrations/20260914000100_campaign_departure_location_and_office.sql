-- =============================================================================
-- 20260914000100_campaign_departure_location_and_office.sql
--
-- Two things a pilgrim needs to know before they book, and one retirement.
--
--   1. `departure_location`  where the trip leaves from, in the owner's words
--                            ("مواقف جامع السلطان قابوس الأكبر – البوابة الجنوبية").
--                            Required for every new trip.
--   2. `office_number`       the company's office number, if it has one. Free
--                            text: "12", "Office 204", "مكتب 5 - الدور الثاني".
--   3. `excluded_services`   no longer written or read by any screen. KEPT, with
--                            its data, because dropping a column that holds
--                            owners' text to tidy a form is not a trade worth
--                            making.
--
-- `included_services` is unchanged in shape. It already holds free text, one
-- entry per service; the owner's form now writes one entry per line of a single
-- text area instead of one per input box. Only its comment changes.
--
-- Additive and re-runnable: `add column if not exists`, drop-if-exists before
-- every constraint and trigger, `create or replace` for the function. No row is
-- rewritten and nothing is dropped.
--
-- WHY THE "REQUIRED" RULE IS A TRIGGER AND NOT A CHECK CONSTRAINT
--
-- Every trip already on NASEK has no departure location. A
-- `check (btrim(departure_location) <> '')` — even added NOT VALID — is
-- evaluated on every UPDATE of every row, so the first time an owner confirmed
-- a booking on an existing trip (`set_booking_status` moves `seats_available`)
-- or a review recomputed its rating, the write would fail. That would break
-- live trips, which is the one thing this change must not do.
--
-- The trigger enforces the rule where it is true: a new trip must have one, and
-- a trip that has one cannot have it cleared. An older trip with none can still
-- be updated by anything until its owner fills it in — which the form now
-- requires them to do before it will save.
-- =============================================================================


-- ----------------------------------------------------------------- 1. columns

alter table public.campaigns
  add column if not exists departure_location text not null default '';

alter table public.campaigns
  add column if not exists office_number text not null default '';

-- Generous, but finite: a paragraph of directions, and a short reference.
alter table public.campaigns drop constraint if exists campaigns_departure_location_length;
alter table public.campaigns
  add constraint campaigns_departure_location_length
  check (char_length(departure_location) <= 1000);

alter table public.campaigns drop constraint if exists campaigns_office_number_length;
alter table public.campaigns
  add constraint campaigns_office_number_length
  check (char_length(office_number) <= 100);

comment on column public.campaigns.departure_location is
  'Where the trip departs from, as the owner describes it. Free text, trimmed. Required on insert and cannot be cleared once set (campaigns_departure_rules); older trips may still be blank.';

comment on column public.campaigns.office_number is
  'The company office number for this trip, if any. Free text — may contain letters, floor or room references. Blank means not provided and is not displayed.';

comment on column public.campaigns.included_services is
  'What the price includes, typed by the owner: one entry per line of the form''s text area. Displayed as written.';

comment on column public.campaigns.excluded_services is
  'RETIRED 20260914000100: no screen writes or reads it. Kept with its data rather than dropped.';


-- --------------------------------------------------- 2. the departure rules

create or replace function public.guard_campaign_departure()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  /*
   * Stored as typed, minus the whitespace at either end. A value that is only
   * whitespace becomes '' here, and is then judged as blank below.
   *
   * Not `btrim()`: that strips spaces only, so a location of nothing but line
   * breaks and tabs — exactly what an empty text area can hold — would pass.
   */
  new.departure_location :=
    regexp_replace(coalesce(new.departure_location, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  new.office_number :=
    regexp_replace(coalesce(new.office_number, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');

  if new.departure_location = '' then
    if tg_op = 'INSERT' then
      raise exception 'A departure location is required'
        using errcode = 'check_violation';
    end if;
    -- An existing trip that had one may not lose it. One that never had one
    -- (every trip created before this migration) is left alone.
    if old.departure_location <> '' then
      raise exception 'A departure location is required'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists campaigns_departure_rules on public.campaigns;
create trigger campaigns_departure_rules
  before insert or update on public.campaigns
  for each row execute function public.guard_campaign_departure();


-- =============================================================================
-- Did it take? One row, every column true.
-- =============================================================================

select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'campaigns' and column_name = 'departure_location'
  )                                                                          as departure_location_added,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'campaigns' and column_name = 'office_number'
  )                                                                          as office_number_added,
  exists (
    select 1 from pg_trigger
     where tgname = 'campaigns_departure_rules'
       and tgrelid = 'public.campaigns'::regclass
  )                                                                          as departure_rules_trigger,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'campaigns' and column_name = 'excluded_services'
  )                                                                          as excluded_services_kept;
