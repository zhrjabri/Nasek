-- =============================================================================
-- NASEK — reviews, connected end to end
--
-- Everything around reviews existed and none of it could ever hold a review.
-- Three breaks in one chain:
--
--   1. NOTHING EVER MARKED A BOOKING COMPLETED.
--      `book_campaign` writes 'confirmed'; `cancel_booking` writes 'cancelled'.
--      No cron, no trigger, no administrative action ever wrote 'completed'.
--      The status existed in the enum, was filterable in two dashboards, and
--      was unreachable.
--
--   2. THE REVIEW GATE REQUIRED EXACTLY THAT STATUS.
--      `guard_review_requires_booking` demanded `status = 'completed'`, so the
--      gate was shut against everybody, permanently, by a condition nothing
--      could satisfy.
--
--   3. NOTHING AGGREGATED REVIEWS INTO A RATING.
--      `campaigns.rating`, `campaigns.review_count` and their provider
--      equivalents were columns an owner may not write (correctly — they are
--      what travellers said, not what a seller claims) and that nothing else
--      wrote either. So every rating on the platform was 0.
--
--      That is visible far beyond the review list: the stars on every campaign
--      card, sorting by rating, and the "minimum rating" filter — which,
--      comparing against a column that is always 0, emptied the listing for any
--      threshold above zero.
--
-- This file closes all three, and adds the one thing the owner's dashboard was
-- already drawing without anywhere to put it: a public reply to a review.
-- =============================================================================


-- =============================================================================
-- 1. Travelled, therefore completed
-- =============================================================================

/**
 * Advance bookings whose trip has come back.
 *
 * Idempotent and safe to call as often as anyone likes: it only ever moves
 * 'confirmed' to 'completed', only for a trip whose return date has passed, and
 * a second call finds nothing left to do.
 *
 * Scoped to the caller rather than global. An administrator tidies the whole
 * ledger; a traveller advances their own bookings; an owner advances the ones
 * on their own trips. That is what makes it safe to grant to `authenticated` —
 * the alternative, a function any signed-in account can point at every row in
 * the table, is a table-wide write behind an anonymous-ish credential.
 *
 * Returns how many rows moved, so a caller can decide whether anything is worth
 * re-reading.
 */
create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller  uuid := auth.uid();
  moved   integer;
begin
  if caller is null then
    raise exception 'You must be signed in' using errcode = 'insufficient_privilege';
  end if;

  with due as (
    select b.id
    from public.bookings b
    join public.campaigns c on c.id = b.campaign_id
    where b.status = 'confirmed'
      and c.return_date < current_date
      and (
        b.user_id = caller
        or public.owns_campaign(b.campaign_id)
        or public.is_admin()
      )
  )
  update public.bookings b
     set status = 'completed'
    from due
   where b.id = due.id;

  get diagnostics moved = row_count;
  return moved;
end;
$$;

revoke all on function public.complete_past_bookings() from public, anon;
grant execute on function public.complete_past_bookings() to authenticated;


-- =============================================================================
-- 2. Who may write a review
-- =============================================================================

/**
 * A review requires a trip this person actually took.
 *
 * The condition is now the real-world one — you booked it, you did not cancel,
 * and the trip has returned — rather than a stored flag that nothing set. That
 * matters beyond fixing the deadlock: it means a review cannot be blocked by a
 * maintenance job not having run, and it stays true whether or not
 * `complete_past_bookings` has been called.
 *
 * `status <> 'cancelled'` rather than `= 'completed'` for exactly that reason.
 * A confirmed booking on a trip that returned last week is a person who
 * travelled, and their review should not wait on bookkeeping.
 */
create or replace function public.guard_review_requires_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if not exists (
    select 1
    from public.bookings b
    join public.campaigns c on c.id = b.campaign_id
    where b.user_id = new.user_id
      and b.campaign_id = new.campaign_id
      and b.status <> 'cancelled'
      and c.return_date < current_date
  ) then
    raise exception 'You can review a trip once you have travelled on it'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_require_booking on public.reviews;
create trigger reviews_require_booking
  before insert on public.reviews
  for each row execute function public.guard_review_requires_booking();


-- =============================================================================
-- 3. An owner's reply
-- =============================================================================

alter table public.reviews add column if not exists reply_ar text;
alter table public.reviews add column if not exists reply_en text;
alter table public.reviews add column if not exists replied_at timestamptz;

comment on column public.reviews.reply_ar is
  'The campaign owner''s public answer. Written by the owner of the campaign under review and by nobody else; see guard_review_columns.';

/**
 * Who may change what on a review.
 *
 * Three parties can now touch one row and each may touch a different part of
 * it, which is more than a policy can express — a WITH CHECK clause sees the
 * proposed row and not the one it replaces, so "you may reply but not rewrite
 * the rating" is not something it can say.
 *
 *   * The author owns the rating and the comment, and may not write the reply.
 *   * The campaign owner owns the reply, and may not touch the rating, the
 *     comment or the moderation flag — an owner editing the review itself is
 *     the one thing that would make the whole feature worthless.
 *   * An administrator owns `hidden`, and is left alone here.
 *
 * Reverts rather than raises, like every other guard in this schema: a REST
 * update that sends the whole row back should keep the columns it was never
 * allowed to touch rather than fail with an error the person cannot act on.
 */
create or replace function public.guard_review_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- The author: everything except the reply and the moderation flag.
  if old.user_id = auth.uid() then
    new.reply_ar   := old.reply_ar;
    new.reply_en   := old.reply_en;
    new.replied_at := old.replied_at;
    new.hidden     := old.hidden;
    new.user_id    := old.user_id;
    return new;
  end if;

  -- The campaign owner: the reply, and nothing else at all.
  if public.owns_campaign(old.campaign_id) then
    if new.reply_ar is distinct from old.reply_ar
       or new.reply_en is distinct from old.reply_en then
      new.replied_at := case
        when coalesce(trim(new.reply_en), trim(new.reply_ar), '') = '' then null
        else now()
      end;
    else
      new.replied_at := old.replied_at;
    end if;
    new.user_id     := old.user_id;
    new.campaign_id := old.campaign_id;
    new.provider_id := old.provider_id;
    new.rating      := old.rating;
    new.comment_ar  := old.comment_ar;
    new.comment_en  := old.comment_en;
    new.hidden      := old.hidden;
    new.created_at  := old.created_at;
    return new;
  end if;

  -- Reached by nobody the policy admits; revert wholesale rather than guess.
  return old;
end;
$$;

drop trigger if exists reviews_guard_columns on public.reviews;
create trigger reviews_guard_columns
  before update on public.reviews
  for each row execute function public.guard_review_columns();

/** The campaign owner joins the author and the administrator on this policy. */
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews
  for update to authenticated
  using (user_id = auth.uid() or public.owns_campaign(campaign_id) or public.is_admin())
  with check (user_id = auth.uid() or public.owns_campaign(campaign_id) or public.is_admin());


-- =============================================================================
-- 4. What travellers said, added up
-- =============================================================================

/*
 * The aggregation has to write two columns the moderation guard exists to
 * protect, so it announces itself.
 *
 * `guard_campaign_moderation` reverts `rating` and `review_count` for any
 * caller who is not an administrator — correctly, because those are the two
 * fields a seller would most like to write about themselves. But the recompute
 * below runs inside a trigger on `reviews`, under whoever wrote the review, so
 * the guard would revert the very total it is trying to store.
 *
 * A transaction-local setting is the marker. `set_config(..., true)` scopes it
 * to the current transaction, and it is only ever set inside the SECURITY
 * DEFINER function below — a client cannot set it through PostgREST, and even
 * if one could it would buy nothing: the value it would let through is
 * recomputed from the reviews table by that same function.
 */
create or replace function public.refresh_review_aggregates(
  p_campaign_id uuid,
  p_provider_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('nasek.aggregating', 'on', true);

  update public.campaigns c
     set rating = coalesce(agg.avg_rating, 0),
         review_count = coalesce(agg.n, 0)
    from (
      select round(avg(r.rating)::numeric, 1) as avg_rating, count(*) as n
      from public.reviews r
      where r.campaign_id = p_campaign_id and r.hidden = false
    ) agg
   where c.id = p_campaign_id;

  update public.providers p
     set rating = coalesce(agg.avg_rating, 0),
         review_count = coalesce(agg.n, 0)
    from (
      select round(avg(r.rating)::numeric, 1) as avg_rating, count(*) as n
      from public.reviews r
      join public.campaigns c on c.id = r.campaign_id
      where c.provider_id = p_provider_id and r.hidden = false
    ) agg
   where p.id = p_provider_id;

  perform set_config('nasek.aggregating', 'off', true);
end;
$$;

revoke all on function public.refresh_review_aggregates(uuid, uuid) from public, anon, authenticated;

/** Recompute after any change to a review — including an administrator hiding one. */
create or replace function public.reviews_touch_aggregates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_review_aggregates(old.campaign_id, old.provider_id);
    return old;
  end if;

  perform public.refresh_review_aggregates(new.campaign_id, new.provider_id);
  -- A review moved between campaigns is not something the interface offers, but
  -- the totals it left behind would be wrong if it ever did.
  if tg_op = 'UPDATE' and old.campaign_id is distinct from new.campaign_id then
    perform public.refresh_review_aggregates(old.campaign_id, old.provider_id);
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_aggregate on public.reviews;
create trigger reviews_aggregate
  after insert or update or delete on public.reviews
  for each row execute function public.reviews_touch_aggregates();

/**
 * The moderation guard, now aware of the recompute.
 *
 * Identical to the version in 20260902000200 except for the two lines that let
 * an announced aggregation through. Everything else it protects — `suspended`,
 * `featured`, and both fields on the way in — is unchanged.
 */
create or replace function public.guard_campaign_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.suspended    := false;
    new.featured     := false;
    new.rating       := 0;
    new.review_count := 0;
    return new;
  end if;

  new.suspended := old.suspended;
  new.featured  := old.featured;

  -- The recompute in `refresh_review_aggregates` is the one caller allowed to
  -- move these, and it says so in a transaction-local setting no client can
  -- reach. Everyone else keeps what the reviews added up to.
  if coalesce(current_setting('nasek.aggregating', true), 'off') <> 'on' then
    new.rating       := old.rating;
    new.review_count := old.review_count;
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_guard_moderation on public.campaigns;
create trigger campaigns_guard_moderation
  before insert or update on public.campaigns
  for each row execute function public.guard_campaign_moderation();

/** The same exemption on the provider guard, for the same reason. */
create or replace function public.guard_provider_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_admin() then
      return new;
    end if;
    new.owner_id         := auth.uid();
    new.verification     := 'pending';
    new.plan             := 'basic';
    new.rejection_reason := null;
    new.verified_by      := null;
    new.verified_at      := null;
    new.submitted_at     := coalesce(new.submitted_at, now());
    return new;
  end if;

  if public.is_admin() then
    if new.verification is distinct from old.verification then
      new.verified_by := auth.uid();
      new.verified_at := now();
      if new.verification = 'verified' then
        new.rejection_reason := null;
      end if;
      insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
      values (
        auth.uid(), 'verification', 'provider', new.id::text,
        jsonb_build_object(
          'from', old.verification,
          'to', new.verification,
          'reason', new.rejection_reason
        )
      );
    end if;
    return new;
  end if;

  if old.verification = 'rejected' then
    new.verification     := 'pending';
    new.rejection_reason := null;
    new.submitted_at     := now();
  else
    new.verification     := old.verification;
    new.rejection_reason := old.rejection_reason;
    new.submitted_at     := old.submitted_at;
  end if;

  new.verified_by := old.verified_by;
  new.verified_at := old.verified_at;
  new.owner_id    := old.owner_id;
  new.plan        := old.plan;

  if coalesce(current_setting('nasek.aggregating', true), 'off') <> 'on' then
    new.rating       := old.rating;
    new.review_count := old.review_count;
  end if;
  return new;
end;
$$;

drop trigger if exists providers_guard_privileges on public.providers;
create trigger providers_guard_privileges
  before insert or update on public.providers
  for each row execute function public.guard_provider_privileges();

/*
 * Backfill, so a database with reviews already in it reports them.
 *
 * Runs as the migration's owner, which is an administrator as far as the guards
 * are concerned, so it needs no marker.
 */
do $$
declare
  target record;
begin
  for target in
    select distinct r.campaign_id, r.provider_id from public.reviews r
  loop
    perform public.refresh_review_aggregates(target.campaign_id, target.provider_id);
  end loop;
end $$;


-- =============================================================================
-- 5. The public view gains the reply
-- =============================================================================

drop view if exists public.reviews_public;
create view public.reviews_public
with (security_invoker = false) as
  select
    r.id,
    r.user_id,
    r.campaign_id,
    r.provider_id,
    r.rating,
    r.comment_ar,
    r.comment_en,
    r.hidden,
    r.created_at,
    r.reply_ar,
    r.reply_en,
    r.replied_at,
    nullif(trim(p.name), '') as user_name
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  -- Mirrors `reviews_read`. A definer view does not consult the policy, so the
  -- predicate is written out; getting it wrong in the permissive direction
  -- would publish every review an administrator had taken down.
  where r.hidden = false
     or r.user_id = auth.uid()
     or public.is_admin();

grant select on public.reviews_public to anon, authenticated;
