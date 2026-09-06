-- =============================================================================
-- NASEK — what a campaign owner is actually asked for
--
-- The Add Trip form asked for things nobody could answer well and omitted
-- things every trip has more than one of. An owner writing in Arabic was made
-- to invent an English title and an English description; a trip with four
-- included services had six tick-boxes and no way to name the other two; a trip
-- with two people on the phone had room for one.
--
-- Three changes, all additive. No column is dropped and no row is rewritten,
-- because campaigns already carry data in the columns this supersedes and that
-- data is still what the customer site reads.
--
--   1. `included_services`  free text, alongside the six canonical services
--                           rather than instead of them.
--   2. `contact_persons`    an array of {name, phone}, replacing one triple of
--                           contact_name/phone/email.
--   3. `title_en` gains a default, so an insert may omit it.
--
-- WHY `included_services` DOES NOT REPLACE `services`
--
-- `services` looks like a display list and is not. Its six values drive the
-- Campaigns page's filter facets and the Smart Match scoring in
-- `services/ai/`, both of which match on the key. Free text cannot be filtered
-- on — "يشمل الإفطار" and "وجبة الإفطار" are the same service and no equality
-- test says so — so replacing the six would have quietly removed a working
-- feature to add a different one. The six stay, and anything they do not cover
-- goes in the new column.
--
-- WHY `contact_persons` IS JSONB AND NOT A TABLE
--
-- A contact belongs to exactly one campaign, is never queried on its own, is
-- never joined to, and is read only when the campaign it sits on is read. A
-- table would add a policy, a foreign key, a cascade and a second round trip to
-- express something with no independent existence. The existing
-- `contact_name/phone/email` columns are kept and still read, so no historical
-- campaign loses its contact.
-- =============================================================================


-- ------------------------------------------------------- 1. included services

alter table public.campaigns
  add column if not exists included_services text[] not null default '{}';

comment on column public.campaigns.included_services is
  'Free-text services the owner typed, in Arabic. Additional to `services`, which holds the six filterable keys and is what the catalogue facets and Smart Match read.';


-- ------------------------------------------------------- 2. contact persons

alter table public.campaigns
  add column if not exists contact_persons jsonb not null default '[]'::jsonb;

/*
 * Shape enforced here rather than trusted from the client.
 *
 * `contact_persons` arrives through PostgREST as whatever the browser sent, and
 * a jsonb column will accept a number, a string or an object just as happily as
 * the array this is meant to be. The check is what makes the column's type mean
 * something: an array, every element an object, every object carrying a
 * non-empty name.
 *
 * WHY A FUNCTION AND NOT THE EXPRESSION ITSELF
 *
 * The first version of this wrote the test inline:
 *
 *     check (jsonb_typeof(contact_persons) = 'array' and not exists (
 *       select 1 from jsonb_array_elements(contact_persons) ...))
 *
 * which Postgres refuses outright — `0A000: cannot use subquery in check
 * constraint`. A CHECK expression may call a function but may not contain a
 * SELECT, and iterating a jsonb array needs one. Moving the iteration inside a
 * function puts the SELECT somewhere it is allowed to be, and leaves the
 * constraint a plain function call.
 *
 * `immutable` because a CHECK may not depend on anything that can change
 * underneath it, and this depends on nothing but its argument. `parallel safe`
 * and `strict` follow from the same fact.
 *
 * plpgsql rather than SQL, for one specific reason: `jsonb_array_elements`
 * raises on a scalar, so the array test has to run *before* the iteration and
 * has to be guaranteed to. SQL's `and` does not promise evaluation order —
 * the planner may reorder it — while plpgsql's `if`/`return` does. A `'oops'`
 * sent to this column must come back false, not blow up with "cannot extract
 * elements from a scalar".
 */
create or replace function public.is_valid_campaign_contact_persons(persons jsonb)
returns boolean
language plpgsql
immutable
strict
parallel safe
as $fn$
declare
  person jsonb;
begin
  if jsonb_typeof(persons) <> 'array' then
    return false;
  end if;

  for person in select * from jsonb_array_elements(persons) loop
    if jsonb_typeof(person) <> 'object' then
      return false;
    end if;
    -- A name is what makes a contact a contact. The phone is deliberately not
    -- checked: a person with no number is incomplete rather than malformed, the
    -- form asks for both, and a constraint that refused the row would turn a
    -- blank field into a Postgres error string in front of an owner.
    if coalesce(btrim(person ->> 'name'), '') = '' then
      return false;
    end if;
  end loop;

  return true;
end;
$fn$;

comment on function public.is_valid_campaign_contact_persons(jsonb) is
  'True when the argument is a JSON array of objects, each with a non-empty trimmed name. Exists so campaigns_contact_persons_shape can be a function call: a CHECK constraint may not contain a subquery, and walking a jsonb array requires one.';

/*
 * Dropped first rather than wrapped in an exception handler.
 *
 * `add constraint` has no `if not exists`, so the usual shape is a `do` block
 * swallowing `duplicate_object`. That is idempotent but it is also inert: a
 * re-run leaves whatever definition is already there, so a corrected constraint
 * would silently not be applied — which is exactly the situation this file is
 * in. Dropping and adding is idempotent *and* converges on the definition
 * written here.
 *
 * `not valid` skips the scan of existing rows. Every row holds the default `[]`
 * — the column is added a few lines above — so there is nothing for a scan to
 * find, and skipping it keeps this from taking a lock proportional to the
 * catalogue. It does not weaken anything: `not valid` exempts existing rows
 * only, and every insert and update is checked from here on.
 */
alter table public.campaigns
  drop constraint if exists campaigns_contact_persons_shape;

alter table public.campaigns
  add constraint campaigns_contact_persons_shape
  check (public.is_valid_campaign_contact_persons(contact_persons))
  not valid;

comment on column public.campaigns.contact_persons is
  'Responsible persons: [{name, phone}]. Replaces contact_name/contact_phone/contact_email, which are kept and still read so older campaigns do not lose their contact. No email — it was asked for and never used.';


-- --------------------------------------------------- 3. the English title

/*
 * A default, so an insert may leave it out.
 *
 * `title_en` is `not null` with no default, which made an English title
 * mandatory at the database level however the form was worded. It stays
 * `not null` — every campaign still has the column, and the customer site in
 * English still reads it — but an insert that omits it now gets `''` rather
 * than an error.
 *
 * In practice the application does not omit it: it writes the Arabic title into
 * both columns, so an English-speaking pilgrim sees the trip's real name rather
 * than a blank. This default is the floor under that, not the plan.
 */
alter table public.campaigns alter column title_en set default '';


-- ------------------------------------------- 4. the moderation guard, extended

/*
 * Identical to the version in 20260904000300 but for two lines in `material`.
 *
 * Restated in full rather than patched, because there is no way to add a
 * condition to a plpgsql body in place — and restated *from that file* rather
 * than from memory, which is the mistake that lost the review-aggregate
 * exemption out of `guard_provider_privileges` and needed 20260906000100 to
 * put back.
 *
 * Both new columns count as material, and that is the conservative reading
 * rather than the obvious one. `included_services` plainly is: it is a claim
 * about what the pilgrim gets, and an owner who could add "فندق ٥ نجوم" to a
 * live trip without review would have found the way round the queue.
 * `contact_persons` is more arguable — who answers the phone is closer to
 * operational than to the offer — but `contact_name`, `contact_phone` and
 * `contact_email` have been material since 20260904000300, and having the
 * replacement be less guarded than the thing it replaces is the kind of quiet
 * loosening this comment exists to prevent.
 */
create or replace function public.guard_campaign_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  material boolean;
begin
  -- An administrator writes these columns directly; `set_campaign_status` is
  -- the route the dashboard actually uses, and it is also an admin.
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.suspended        := false;
    new.featured         := false;
    new.rating           := 0;
    new.review_count     := 0;
    new.status           := 'pending_approval';
    new.rejection_reason := null;
    new.reviewed_by      := null;
    new.reviewed_at      := null;
    new.submitted_at     := now();
    return new;
  end if;

  new.suspended    := old.suspended;
  new.featured     := old.featured;
  new.rating       := old.rating;
  new.review_count := old.review_count;

  -- Never the owner's to move, in either direction. An owner cannot approve
  -- their own trip, and cannot quietly withdraw one from review either.
  new.status           := old.status;
  new.rejection_reason := old.rejection_reason;
  new.reviewed_by      := old.reviewed_by;
  new.reviewed_at      := old.reviewed_at;
  new.submitted_at     := old.submitted_at;

  material :=
       new.type                  is distinct from old.type
    or new.title_ar              is distinct from old.title_ar
    or new.title_en              is distinct from old.title_en
    or new.description_ar        is distinct from old.description_ar
    or new.description_en        is distinct from old.description_en
    or new.price                 is distinct from old.price
    or new.wilayah_id            is distinct from old.wilayah_id
    or new.travel_method         is distinct from old.travel_method
    or new.departure_date        is distinct from old.departure_date
    or new.return_date           is distinct from old.return_date
    or new.registration_deadline is distinct from old.registration_deadline
    or new.services              is distinct from old.services
    or new.excluded_services     is distinct from old.excluded_services
    or new.included_services     is distinct from old.included_services
    or new.hotel_makkah_ar       is distinct from old.hotel_makkah_ar
    or new.hotel_makkah_en       is distinct from old.hotel_makkah_en
    or new.hotel_madinah_ar      is distinct from old.hotel_madinah_ar
    or new.hotel_madinah_en      is distinct from old.hotel_madinah_en
    or new.haram_distance_m      is distinct from old.haram_distance_m
    or new.images                is distinct from old.images
    or new.contact_name          is distinct from old.contact_name
    or new.contact_phone         is distinct from old.contact_phone
    or new.contact_email         is distinct from old.contact_email
    or new.contact_persons       is distinct from old.contact_persons
    or new.terms_ar              is distinct from old.terms_ar
    or new.terms_en              is distinct from old.terms_en;

  if material then
    /*
     * Back into the queue — from `active` and from `rejected` alike.
     *
     * The `rejected` half is how an owner answers a refusal. It is the same
     * mechanism `resubmit_provider` gives a refused company: correct what was
     * objected to, and the correction is what rejoins the queue. Without it a
     * refused campaign would be a dead row with an edit button that did
     * nothing visible.
     *
     * `pending_approval` is left alone, because it is already there and
     * resetting `submitted_at` on every keystroke-level save would keep pushing
     * a patient owner to the back of a queue ordered by submission time.
     */
    if old.status in ('active', 'rejected') then
      new.status           := 'pending_approval';
      new.rejection_reason := null;
      new.reviewed_by      := null;
      new.reviewed_at      := null;
      new.submitted_at     := now();
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists campaigns_guard_moderation on public.campaigns;
create trigger campaigns_guard_moderation
  before insert or update on public.campaigns
  for each row execute function public.guard_campaign_moderation();
