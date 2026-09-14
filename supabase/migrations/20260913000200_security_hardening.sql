-- =============================================================================
-- 20260913000200_security_hardening.sql
--
-- Six holes found in a full audit of the live schema, and the second way into
-- the administration dashboard. Every one of them was a place where the rule
-- the product states was enforced by the interface and not by the database, so
-- anyone calling the REST API directly could do what no screen offers.
--
--   S1  a signed-in customer could INSERT a booking (or travellers) directly,
--       confirmed, at any price, on any trip — skipping `book_campaign`
--   S2  an owner saving a trip could overwrite `seats_available`, undoing a
--       confirmation made while the form was open
--   S3  a campaign's `rating` and `review_count` never moved when a review was
--       written, because the moderation guard reverted the recompute
--   S4  a review was accepted on a pending, unpaid booking, and could be moved
--       to another campaign or company after it was written
--   S5  an owner could replace or delete the permit file an administrator had
--       already approved, outside the review of profile changes
--   S6  `booking_provider_contact` handed out the company's phone number for a
--       cancelled booking
--   A1  a session that signed in with a password was an administrator — a
--       second door into the dashboard that skips the access code
--
-- Nothing here changes a business rule. It makes the database enforce the ones
-- the product already states. Re-runnable: every statement is a revoke, a
-- drop-if-exists, or a create-or-replace.
--
-- Verified before shipping by `npm run verify:database`, which applies every
-- migration to a real Postgres (PGlite) and acts as a customer, an owner and an
-- administrator — including the attempts each section refuses.
-- =============================================================================


-- =============================================================================
-- S1. Bookings are created by `book_campaign`, and by nothing else
-- =============================================================================

/*
 * 20260910000100 revoked UPDATE on `bookings` and left INSERT granted, on the
 * reasoning that no application path used it. The grant is what decides, not
 * the application: with INSERT granted and `bookings_insert_own` checking only
 * `user_id = auth.uid()`, a customer could POST a row with `status='confirmed'`,
 * any `total_price` and any `campaign_id` — unapproved, suspended, past, or
 * sold out. That row then counted as a paid booking in the owner's ledger,
 * opened the review gate, and satisfied `booking_provider_contact`.
 *
 * `book_campaign` is SECURITY DEFINER, so it inserts as the function's owner
 * and needs neither the grant nor the policy. `travellers` has had no writer
 * at all since 20260910000100. SELECT stays: customers, owners and
 * administrators still read what their policies allow.
 */
revoke insert, update, delete on public.bookings   from anon, authenticated;
revoke insert, update, delete on public.travellers from anon, authenticated;

drop policy if exists bookings_insert_own   on public.bookings;
drop policy if exists travellers_insert_own on public.travellers;


-- =============================================================================
-- S2 + S3. The four counters on a campaign belong to the workflows that count
-- =============================================================================

/**
 * `seats_available`, `bookings_count`, `rating` and `review_count` are written
 * only by SECURITY DEFINER functions — `set_booking_status` and `cancel_booking`
 * move the seats, `book_campaign` and `cancel_booking` move the booking count,
 * `refresh_review_aggregates` recomputes the rating — and never by a request
 * straight from a client.
 *
 * Deliberately NOT security definer, because the role is the signal. Inside a
 * definer function every statement runs as the function's owner, so this
 * trigger sees `current_user = 'postgres'` there, and `authenticated` or `anon`
 * only when the write came directly through the REST API. That cannot be set by
 * the caller — unlike a session flag — so there is nothing to forge.
 *
 * On a direct write:
 *
 *   INSERT  a new trip starts with every seat available, no bookings and no
 *           rating, whatever the request said.
 *   UPDATE  `seats_available` moves by exactly the change in `seats_total`: an
 *           owner adding ten seats adds ten available, and a stale copy of
 *           `seats_available` from an open form is simply ignored. A total below
 *           the seats already confirmed is refused rather than silently
 *           clamped, because clamping would un-sell a seat someone has paid for.
 *           The other three counters keep their stored values.
 *
 * Administrators included. An administrator changes seats the same way an
 * owner does — through a confirmation or a cancellation — so the ledger and
 * the seat count cannot disagree.
 */
create or replace function public.guard_campaign_counters()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.seats_available := new.seats_total;
    new.bookings_count  := 0;
    new.rating          := 0;
    new.review_count    := 0;
    return new;
  end if;

  new.seats_available := old.seats_available + (new.seats_total - old.seats_total);
  if new.seats_available < 0 then
    raise exception 'Total seats cannot be fewer than the % already confirmed',
      old.seats_total - old.seats_available
      using errcode = 'check_violation';
  end if;

  new.bookings_count := old.bookings_count;
  new.rating         := old.rating;
  new.review_count   := old.review_count;
  return new;
end;
$fn$;

drop trigger if exists campaigns_guard_counters on public.campaigns;
create trigger campaigns_guard_counters
  before insert or update on public.campaigns
  for each row execute function public.guard_campaign_counters();

/*
 * S3. The moderation guard, restated from 20260911000100 with one change: it no
 * longer reverts `rating` and `review_count`.
 *
 * It is SECURITY DEFINER and checks `is_admin()`, and the recompute runs inside
 * a trigger on `reviews` under whoever wrote the review — so it reverted the
 * very total `refresh_review_aggregates` was storing, and a trip's stars never
 * moved. 20260903000300 had a `nasek.aggregating` exemption for this; the
 * rewrite in 20260904000300 dropped it and nothing restored it.
 *
 * The protection is not lost, it moved: `guard_campaign_counters` above keeps
 * both columns for every direct write, owner or administrator, and lets the
 * recompute through because it runs as the function owner. Every other line is
 * the 20260911000100 function, unchanged.
 */
create or replace function public.guard_campaign_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- An administrator writes these columns directly; `set_campaign_status` is
  -- the route the dashboard uses, and it is also an admin.
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    /*
     * The company gate, stated where it cannot be skipped.
     *
     * The portal checks this too and shows the owner a readable explanation,
     * but the portal is not the only thing that can POST to `campaigns`. The
     * message is deliberately the same sentence the interface shows.
     */
    if not public.provider_can_publish(new.provider_id) then
      raise exception 'Your company must be approved by Admin before you can publish trips'
        using errcode = 'check_violation';
    end if;

    new.suspended        := false;
    new.featured         := false;
    new.rating           := 0;
    new.review_count     := 0;
    -- Live on save. No queue, no pending_approval.
    new.status           := 'active';
    new.rejection_reason := null;
    new.reviewed_by      := null;
    new.reviewed_at      := now();
    new.submitted_at     := now();
    return new;
  end if;

  new.suspended    := old.suspended;
  new.featured     := old.featured;
  -- `rating` and `review_count` are guarded by campaigns_guard_counters, which
  -- lets refresh_review_aggregates through. Reverting them here did not.

  /*
   * Still never the owner's to move.
   *
   * An administrator can deactivate a trip with `set_campaign_status`; without
   * these five lines the owner could simply save the row back to 'active' and
   * undo it. Removing the *queue* does not mean removing moderation.
   */
  new.status           := old.status;
  new.rejection_reason := old.rejection_reason;
  new.reviewed_by      := old.reviewed_by;
  new.reviewed_at      := old.reviewed_at;
  new.submitted_at     := old.submitted_at;

  return new;
end;
$fn$;

drop trigger if exists campaigns_guard_moderation on public.campaigns;
create trigger campaigns_guard_moderation
  before insert or update on public.campaigns
  for each row execute function public.guard_campaign_moderation();


-- =============================================================================
-- S4. A review is from somebody who travelled, and it stays where it was left
-- =============================================================================

/**
 * Restated from 20260907000100.
 *
 * `status <> 'cancelled'` let a pending request qualify: book, never pay, wait
 * for the trip to come back, review it. Now only a booking the owner confirmed
 * as paid (or that has since completed) counts. The trip must still have
 * returned.
 *
 * Also written by the database rather than trusted from the request, because
 * the INSERT policy checks only `user_id`:
 *
 *   * `provider_id` comes from the campaign. It was the client's to send, so a
 *     review of one company's trip could be counted in another company's
 *     rating.
 *   * The reply columns start empty. Replies are the campaign owner's, and an
 *     author could otherwise publish one in the owner's name.
 *   * `created_at` is now.
 */
create or replace function public.guard_review_requires_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select c.provider_id into new.provider_id
    from public.campaigns c
   where c.id = new.campaign_id;

  if public.is_admin() then
    return new;
  end if;

  new.reply_ar   := null;
  new.reply_en   := null;
  new.replied_at := null;
  new.created_at := now();

  if not exists (
    select 1
    from public.bookings b
    join public.campaigns c on c.id = b.campaign_id
    where b.user_id = new.user_id
      and b.campaign_id = new.campaign_id
      and b.status in ('confirmed', 'completed')
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

/**
 * Restated from 20260907000100.
 *
 * The booking check runs on INSERT only, and the author's branch reverted the
 * reply and `hidden` but not `campaign_id` or `provider_id` — so a review
 * written about one trip could be moved onto any other, carrying its rating
 * with it. Which trip, which company, whose review and when are now fixed for
 * everybody, administrators included, before any other branch runs. The owner
 * and administrator branches are otherwise unchanged.
 */
create or replace function public.guard_review_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.user_id     := old.user_id;
  new.campaign_id := old.campaign_id;
  new.provider_id := old.provider_id;
  new.created_at  := old.created_at;

  if public.is_admin() then
    return new;
  end if;

  -- The author: everything except the reply and the moderation flag.
  if old.user_id = auth.uid() then
    new.reply_ar   := old.reply_ar;
    new.reply_en   := old.reply_en;
    new.replied_at := old.replied_at;
    new.hidden     := old.hidden;
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
    new.rating      := old.rating;
    new.comment_ar  := old.comment_ar;
    new.comment_en  := old.comment_en;
    new.hidden      := old.hidden;
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


-- =============================================================================
-- S5. An approved permit is not the owner's to overwrite
-- =============================================================================

/*
 * 20260902000300 let an owner UPDATE and DELETE any object in their own folder
 * of `provider-licences`, which includes the file `providers.licence_path`
 * points at — the one an administrator looked at and approved. Replacing its
 * bytes changed the approved permit without a new review; deleting it left the
 * approval pointing at nothing.
 *
 * The application never does either. `uploadLicence` writes a new object under
 * a new name with `upsert: false`, and a changed permit reaches the company
 * through `resubmit_provider` or the `provider_profile_changes` queue, where an
 * administrator decides. So the owner keeps INSERT (a new file) and SELECT
 * (their own files), loses UPDATE and DELETE, and an administrator keeps all
 * four — deleting is now the administrator's alone.
 */
drop policy if exists "licences: owner replaces own file" on storage.objects;
drop policy if exists "licences: owner deletes own file"  on storage.objects;

drop policy if exists "licences: admin deletes any file" on storage.objects;
create policy "licences: admin deletes any file" on storage.objects
  for delete to authenticated
  using (bucket_id = 'provider-licences' and public.is_admin());


-- =============================================================================
-- S6. No company phone number for a cancelled booking
-- =============================================================================

/*
 * Restated from 20260912000100 with one added condition: the booking is not
 * cancelled. A pending request still gets the number — that is the WhatsApp
 * step where the customer asks the owner for payment details — and so do
 * confirmed and completed bookings. A cancelled one answers exactly like a
 * booking that is not the caller's, so this cannot be used to learn whether a
 * booking id exists or what state it is in.
 */
create or replace function public.booking_provider_contact(p_booking_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller uuid := auth.uid();
  phone  text;
begin
  if caller is null then
    raise exception 'You must be signed in'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * One statement, and the ownership test is inside it rather than after it.
   *
   * Reading the booking first and checking `user_id` afterwards would answer
   * "no such booking" and "not yours" differently, which turns this into a way
   * to test whether a booking id exists. Joined and filtered together, both
   * cases return the same nothing.
   */
  select pr.phone into phone
    from public.bookings b
    join public.campaigns c on c.id = b.campaign_id
    join public.providers pr on pr.id = c.provider_id
   where b.id = p_booking_id
     and b.user_id = caller
     and b.status <> 'cancelled';

  if not found then
    raise exception 'No such booking'
      using errcode = 'no_data_found';
  end if;

  return nullif(btrim(coalesce(phone, '')), '');
end;
$fn$;

revoke all on function public.booking_provider_contact(uuid) from public, anon;
grant execute on function public.booking_provider_contact(uuid) to authenticated;


-- =============================================================================
-- A1. The administration dashboard has one door
-- =============================================================================

/**
 * Restated from 20260901000200 with one added condition: the session did not
 * sign in with a password.
 *
 * The dashboard is opened with the administration access code: `admin-access`
 * mints a single-use magic-link token and the browser redeems it with
 * `verifyOtp`, which records the sign-in method as a one-time code. The
 * Security tab used to let an administrator set a password as well, and a
 * password on the account is a second way in that skips the access code
 * entirely — straight through Supabase's own password grant. The tab no longer
 * offers it, and this makes a password that was already set worth nothing: a
 * session whose `amr` records a password sign-in is not an administrator,
 * whatever `profiles.role` says.
 *
 * Nothing else changes. A session with no `amr` claim (the service role, a
 * test) is judged by the profile alone, as before, and a suspended or removed
 * administrator is still refused.
 */
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      -- A suspended or removed administrator is not an administrator. Without
      -- this, revoking access would mean deleting the account outright.
      and p.suspended = false
      and p.removed = false
  )
  and not exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr'
        else '[]'::jsonb
      end
    ) as method(entry)
    where method.entry ->> 'method' = 'password'
  );
$$;


-- =============================================================================
-- Did it take? One row, every column true.
-- =============================================================================

/*
 * Read-only, and last on purpose: the SQL Editor shows the result of the final
 * statement, so this row is what a successful run leaves on screen. Each column
 * reads the catalog — grants, policies, triggers and the function definitions
 * as Postgres now holds them — rather than trusting that the statements above
 * ran. Any `false` names the section that did not apply.
 */
select
  not has_table_privilege('authenticated', 'public.bookings', 'insert')       as s1_booking_insert_revoked,
  not has_table_privilege('authenticated', 'public.travellers', 'insert')     as s1_traveller_insert_revoked,
  not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and policyname in ('bookings_insert_own', 'travellers_insert_own')
  )                                                                            as s1_insert_policies_dropped,
  exists (
    select 1 from pg_trigger
     where tgname = 'campaigns_guard_counters'
       and tgrelid = 'public.campaigns'::regclass
  )                                                                            as s2_s3_counters_guarded,
  position('new.rating       := old.rating' in
    pg_get_functiondef('public.guard_campaign_moderation()'::regprocedure)) = 0 as s3_recompute_not_reverted,
  position('b.status in (''confirmed'', ''completed'')' in
    pg_get_functiondef('public.guard_review_requires_booking()'::regprocedure)) > 0 as s4_paid_bookings_only,
  -- Fixed for everyone means fixed before the administrator's early return; the
  -- older function already had this line, but only inside the owner's branch.
  (
    select position('new.campaign_id := old.campaign_id' in f.d)
           between 1 and position('if public.is_admin()' in f.d)
      from (select pg_get_functiondef('public.guard_review_columns()'::regprocedure) as d) f
  )                                                                            as s4_review_stays_put,
  not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and policyname in ('licences: owner replaces own file', 'licences: owner deletes own file')
  )                                                                            as s5_permit_not_overwritable,
  position('b.status <> ''cancelled''' in
    pg_get_functiondef('public.booking_provider_contact(uuid)'::regprocedure)) > 0 as s6_no_contact_when_cancelled,
  position('''password''' in
    pg_get_functiondef('public.is_admin()'::regprocedure)) > 0                  as a1_password_session_not_admin;
