-- =============================================================================
-- NASEK — no campaign is published until somebody has read it
--
-- Until this migration, campaign approval did not exist. `campaigns_read`
-- published a trip the moment an approved company saved it:
--
--     suspended = false and deleted = false and provider_approved(provider_id)
--
-- So verification stopped at the company. An approved owner could put a price,
-- a hotel and a departure date in front of the public with nothing between the
-- form and the catalogue — and the only administrative control was `suspended`,
-- which is a takedown *after* the fact and by then the wrong instrument.
--
-- What this file adds is the missing state, and everything that has to agree
-- with it:
--
--   pending_approval   submitted, invisible to customers, in the admin queue
--   active             approved; the trip is in the public catalogue
--   rejected           refused with a reason the owner can read and act on
--
-- Two properties are worth stating plainly, because they are what make this a
-- control rather than a label:
--
--   * The status is not the owner's to write. `guard_campaign_moderation`
--     reverts it on every path — insert and update alike — so an owner who
--     POSTs `status: 'active'` gets a pending campaign and no error, exactly as
--     they get `verification: 'verified'` reverted on the company.
--   * Materially editing a live trip returns it to the queue. Without that, a
--     campaign approved at OMR 450 could become a campaign at OMR 1,450 with
--     no second look, and approval would mean nothing after the first save.
--
-- This file also adds the campaign fields the registration brief called for and
-- the form never had: a registration deadline, an excluded-services list, the
-- photographs, contact details and terms.
-- =============================================================================

-- ----------------------------------------------------------------- 1. the enum

/*
 * A brand new type, so it is safe to use in this same transaction.
 *
 * The rule that bit 20260902000100 — "unsafe use of new value of enum type" —
 * applies to values added to an *existing* enum with ALTER TYPE ADD VALUE.
 * CREATE TYPE has no such restriction, which is why this needs no file of its
 * own and the columns below can reference it immediately.
 */
do $$ begin
  create type public.campaign_status as enum ('pending_approval', 'active', 'rejected');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------- 2. the columns

alter table public.campaigns
  add column if not exists status public.campaign_status not null default 'pending_approval';
alter table public.campaigns add column if not exists rejection_reason text;
alter table public.campaigns add column if not exists submitted_at timestamptz;
alter table public.campaigns add column if not exists reviewed_by uuid
  references public.profiles (id) on delete set null;
alter table public.campaigns add column if not exists reviewed_at timestamptz;

-- The rest of what a campaign has to say for itself. All nullable or defaulted,
-- because rows predate this file and a live catalogue must not blank itself
-- over a column added on a Thursday.
alter table public.campaigns add column if not exists registration_deadline date;
alter table public.campaigns add column if not exists excluded_services text[] not null default '{}';
-- Object paths in the `campaign-images` bucket — never URLs. See
-- 20260904000400_campaign_images.sql for why a path is the durable thing to
-- store and a URL is not.
alter table public.campaigns add column if not exists images text[] not null default '{}';
alter table public.campaigns add column if not exists contact_name text;
alter table public.campaigns add column if not exists contact_phone text;
alter table public.campaigns add column if not exists contact_email citext;
alter table public.campaigns add column if not exists terms_ar text not null default '';
alter table public.campaigns add column if not exists terms_en text not null default '';

/*
 * The deadline cannot be after the departure, which is the only thing about it
 * a constraint can usefully say. NOT VALID so that rows written before this
 * migration are left alone rather than blocking it — a trip already sold with
 * an odd deadline is a support conversation, not a reason the migration fails.
 */
do $$ begin
  alter table public.campaigns
    add constraint campaigns_deadline_before_departure
    check (registration_deadline is null or registration_deadline <= departure_date)
    not valid;
exception when duplicate_object then null; end $$;

create index if not exists campaigns_status_idx on public.campaigns (status);

-- ------------------------------------------------------------- 3. the backfill

/*
 * Everything that already existed is `active`.
 *
 * The column defaults to `pending_approval`, which is right for a campaign
 * created from now on and catastrophic for the ones already in the catalogue:
 * applying this file would empty the public site and drop every trip a pilgrim
 * had bookmarked into a review queue that nobody asked for.
 *
 * The condition is what keeps this safe to replay. It only ever touches rows
 * that have never been reviewed — `reviewed_at is null and submitted_at is
 * null` is true exactly once, on the pass that introduces the column — so
 * re-running this file cannot resurrect a campaign an administrator has since
 * refused.
 */
update public.campaigns
   set status       = 'active',
       submitted_at = coalesce(submitted_at, created_at),
       reviewed_at  = coalesce(reviewed_at, created_at)
 where status = 'pending_approval'
   and reviewed_at is null
   and submitted_at is null;

-- ------------------------------------------------------------- 4. the guard

/**
 * Who may write what on a campaign, and what an edit costs.
 *
 * This replaces `guard_campaign_moderation` rather than sitting beside it —
 * same name, same trigger — because two guards disagreeing about the same
 * column is worse than either of them alone.
 *
 * Three jobs, in order of how much they matter:
 *
 *   1. `status`, `rejection_reason`, `reviewed_by` and `reviewed_at` are the
 *      platform's. An owner's attempt to set them is reverted silently, the way
 *      the older guard already treated `featured` and `suspended`. Reverting
 *      rather than raising is deliberate and unchanged: a REST update that
 *      sends the whole row back should succeed and quietly keep the columns it
 *      was never allowed to touch.
 *
 *   2. A new campaign is always `pending_approval`, whoever inserts it and
 *      whatever they claim.
 *
 *   3. A material edit to a campaign that is already live sends it back to the
 *      queue. "Material" is the offer — what a pilgrim decided on: the price,
 *      the dates, the deadline, the hotels, the services included and excluded,
 *      the photographs, the terms, the contact. It is *not* `seats_available`,
 *      which every booking changes, and not `seats_total`, which is the owner's
 *      operational capacity rather than a claim about the trip. Sending a
 *      campaign back to review because somebody added five seats would teach
 *      owners to route around the queue, and the queue is the product.
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
    or new.hotel_makkah_ar       is distinct from old.hotel_makkah_ar
    or new.hotel_makkah_en       is distinct from old.hotel_makkah_en
    or new.hotel_madinah_ar      is distinct from old.hotel_madinah_ar
    or new.hotel_madinah_en      is distinct from old.hotel_madinah_en
    or new.haram_distance_m      is distinct from old.haram_distance_m
    or new.images                is distinct from old.images
    or new.contact_name          is distinct from old.contact_name
    or new.contact_phone         is distinct from old.contact_phone
    or new.contact_email         is distinct from old.contact_email
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

-- ------------------------------------------------------------ 5. the decision

/**
 * Approve or refuse a campaign.
 *
 * A function rather than an update for the reason `set_provider_status` is one:
 * the decision, the reason, the audit entry and the message to the owner have
 * to land together or not at all. An approval that commits while the
 * notification fails leaves an owner watching a queue they have already left.
 *
 * The administrator check is explicit because SECURITY DEFINER means the policy
 * is not consulted — the standing trade in this schema, stated wherever it
 * applies.
 */
create or replace function public.set_campaign_status(
  p_campaign_id uuid,
  p_status      public.campaign_status,
  p_reason      text default null
)
returns public.campaigns
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  updated public.campaigns;
  before  public.campaign_status;
  owner   uuid;
  company public.providers;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;

  if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'A refusal needs a reason the owner can act on'
      using errcode = 'check_violation';
  end if;

  select c.status into before from public.campaigns c where c.id = p_campaign_id;
  if before is null then
    raise exception 'No such campaign' using errcode = 'no_data_found';
  end if;

  /*
   * A campaign cannot be approved past its own company.
   *
   * `campaigns_read` already withholds the trips of a company that is not
   * verified, so approving one here would produce a campaign marked `active`
   * that no pilgrim can see — an administrator would tick it off the queue and
   * the owner would be told it was live. Refusing outright, with the reason,
   * is the honest answer.
   */
  if p_status = 'active' then
    select p.* into company
      from public.providers p
      join public.campaigns c on c.provider_id = p.id
     where c.id = p_campaign_id;

    if company.verification <> 'verified' then
      raise exception 'This campaign belongs to a company that is not approved'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.campaigns
     set status           = p_status,
         rejection_reason = case
           when p_status = 'rejected' then nullif(trim(p_reason), '')
           else null
         end,
         reviewed_by      = auth.uid(),
         reviewed_at      = now()
   where id = p_campaign_id
   returning * into updated;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (
    auth.uid(), 'campaign_status', 'campaign', updated.id::text,
    jsonb_build_object('from', before, 'to', p_status, 'reason', nullif(trim(p_reason), ''))
  );

  if before is not distinct from p_status then
    return updated;
  end if;

  select pr.owner_id into owner
    from public.providers pr where pr.id = updated.provider_id;

  if p_status = 'active' then
    perform public.notify_user(
      owner, 'trip',
      'تم اعتماد حملتك',
      'Your campaign is approved',
      'تم اعتماد حملتك وإضافتها إلى منصة ناسك.',
      'Your campaign has been approved and is now listed on NASEK.'
    );
    perform public.queue_email(
      (select pr.email from public.providers pr where pr.id = updated.provider_id),
      'campaign_approved',
      'تم اعتماد حملتك في ناسك',
      'Your NASEK campaign is now live',
      'تم اعتماد حملتك وإضافتها إلى منصة ناسك.',
      'Your campaign has been approved and added to the NASEK platform.',
      jsonb_build_object('campaign_id', updated.id, 'title', updated.title_en)
    );
  elsif p_status = 'rejected' then
    perform public.notify_user(
      owner, 'trip',
      'تم رفض الحملة',
      'Your campaign was refused',
      coalesce(updated.rejection_reason, ''),
      coalesce(updated.rejection_reason, '')
    );
    perform public.queue_email(
      (select pr.email from public.providers pr where pr.id = updated.provider_id),
      'campaign_rejected',
      'بخصوص حملتك في ناسك',
      'About your NASEK campaign',
      'لم يتم اعتماد الحملة. السبب: ' || coalesce(updated.rejection_reason, ''),
      'Your campaign was not approved. Reason: ' || coalesce(updated.rejection_reason, ''),
      jsonb_build_object('campaign_id', updated.id, 'reason', updated.rejection_reason)
    );
  end if;

  return updated;
end;
$fn$;

revoke all on function public.set_campaign_status(uuid, public.campaign_status, text)
  from public, anon;
grant execute on function public.set_campaign_status(uuid, public.campaign_status, text)
  to authenticated;

-- -------------------------------------------------------------- 6. the policy

/**
 * The catalogue, with approval in it.
 *
 * One clause is added — `status = 'active'` — and it is the whole point of this
 * migration. Everything else is unchanged and still load-bearing:
 * `provider_approved` keeps an unverified company's trips out even when an
 * administrator has approved a campaign by mistake, and the owner and admin
 * branches keep sending a pending or refused trip to the two people who have to
 * see it.
 *
 * Note what an owner therefore gets back: their own campaign in every state.
 * That is intentional and it is why `deriveCatalogue` on the client filters the
 * public list by status as well — a policy that has to serve three audiences
 * cannot also be the thing that decides what a public page draws.
 */
drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns
  for select using (
    (
      status = 'active'
      and suspended = false
      and deleted = false
      and public.provider_approved(provider_id)
    )
    or public.owns_provider(provider_id)
    or public.is_admin()
  );
