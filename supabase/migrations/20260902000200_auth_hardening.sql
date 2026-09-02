-- =============================================================================
-- NASEK — authorisation, corrected
--
-- The policies in 20260901000200 got the hard parts right: the role lives in a
-- row the browser cannot write, administration is granted only from the SQL
-- editor, and every table denies by default. What follows fixes four things
-- that were wrong underneath that, and adds the states the provider workflow
-- had been managing without.
--
-- The four defects, in the order they matter:
--
--   1. THE PERMIT SCANS WERE PUBLIC.
--      `providers_read` was `using (true)` and `select` on the table was
--      granted to `anon`. The `providers_public` view exists precisely so that
--      the licence image, the private phone number and the owner's account id
--      are not published — but a view withholds nothing when the table under it
--      is readable directly. Anyone with the anon key (which is everyone: it is
--      compiled into the bundle) could request
--      `/rest/v1/providers?select=licence_image` and read every trade permit
--      NASEK holds. That is the single worst thing in the schema, and
--      `verify:backend` reported it as passing because its assertion accepted
--      HTTP 200 as one of three allowed outcomes.
--
--   2. AN OWNER COULD VERIFY THEMSELVES — BY INSERTING.
--      `guard_provider_verification` is a BEFORE UPDATE trigger, and
--      `providers_insert_own` let any signed-in account insert a row with
--      `owner_id = auth.uid()`. Nothing looked at `verification` on the way in,
--      so a single POST with `verification: 'verified'` bought the "Verified by
--      NASEK" badge that the whole platform's trust rests on. The same hole
--      granted `plan: 'premium'`.
--
--   3. AN UNAPPROVED COMPANY'S TRIPS WERE ALREADY PUBLIC.
--      Nothing connected `campaigns_read` to the owner's verification state, so
--      a company could register, skip the queue entirely and publish trips to
--      the catalogue the moment its account existed. Verification was a badge
--      on a card rather than a gate.
--
--   4. A PROFILE'S EMAIL WAS ITS OWNER'S TO CHANGE.
--      `guard_profile_privileges` reverted role, suspension and provider link,
--      but not `email` — and `promote_to_admin` looks an account up *by email*.
--      Squatting on a colleague's address also broke their sign-up outright,
--      because `handle_new_user` would then hit the unique index and create no
--      profile at all.
--
-- Everything here is written to be re-runnable, like the migrations before it.
--
-- Defects (1), (2) and (3) are ALSO corrected in place in
-- 20260901000200_rls_policies.sql, and that duplication is deliberate. The
-- setup instructions tell you to re-run that file whenever a table shows
-- `rowsecurity = false`, and a replay of the broken version would have silently
-- reopened the permits, the self-verification insert and the unapproved
-- catalogue — undoing this file without any error to notice. A promise that
-- migrations are replayable is worth nothing if replaying one reverts a later
-- fix. This file remains the account of what was wrong and why; that one is
-- simply no longer a way back to it.
-- =============================================================================


-- =============================================================================
-- 1. Provider workflow columns
-- =============================================================================

alter table public.providers add column if not exists rejection_reason text;
alter table public.providers add column if not exists submitted_at timestamptz;

/*
 * Where the permit actually lives, once Storage holds it.
 *
 * `licence_image` was a data URL in a text column — the prototype's answer, and
 * the reason a "downscale it in the browser first" step exists in
 * lib/imageFile.ts. It is kept for rows already carrying one and for the
 * no-backend fallback, but new registrations write an object path here and the
 * bytes go to a private bucket that only the owner and an administrator can
 * open, through a signed URL that expires.
 */
alter table public.providers add column if not exists licence_path text;

comment on column public.providers.rejection_reason is
  'Why an administrator refused this application. Shown to the owner verbatim, so it must be written to be read by them.';
comment on column public.providers.licence_path is
  'Object path in the private provider-licences bucket. Never a URL: URLs to that bucket expire.';

update public.providers set submitted_at = created_at where submitted_at is null;


-- =============================================================================
-- 2. Helpers
-- =============================================================================

/**
 * Is this company approved to appear in the catalogue?
 *
 * Split out of the policy rather than inlined for the same reason `is_admin`
 * was: `campaigns` is read by anonymous visitors on every page load, and a
 * named, `stable` function is planned once per statement instead of per row.
 *
 * SECURITY DEFINER because it reads `providers`, whose own policy is now closed
 * to everyone but the owner and an administrator — an anonymous visitor must be
 * able to learn "this trip's company is approved" without being able to read
 * the company row that says so.
 */
create or replace function public.provider_approved(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.providers pr
    where pr.id = target and pr.verification = 'verified'
  );
$$;

revoke all on function public.provider_approved(uuid) from public;
-- Granted to `anon` for the same reason `owns_provider` had to be: Postgres
-- evaluates a policy's whole expression without promising to short-circuit, so
-- an anonymous visitor needs EXECUTE on it merely to be told "no". Granting it
-- reveals nothing beyond the badge already shown on every campaign card.
grant execute on function public.provider_approved(uuid) to anon, authenticated;



-- =============================================================================
-- 3. Profiles — close the last editable column that mattered
-- =============================================================================

/**
 * Now also reverts `email` and `id`.
 *
 * `email` because `promote_to_admin` resolves an account by it, and because
 * `handle_new_user` writes it from `auth.users` — the address a person proved
 * they control. A profile row is a description of an auth identity, not a place
 * to assert a different one.
 *
 * Still reverts rather than raises, for the reason the original gave: a REST
 * update that sends the whole row back should quietly keep the columns it was
 * never allowed to touch, not fail with an error the person cannot act on.
 */
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  new.id          := old.id;
  new.role        := old.role;
  new.email       := old.email;
  new.suspended   := old.suspended;
  new.removed     := old.removed;
  new.provider_id := old.provider_id;
  new.created_at  := old.created_at;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

/**
 * Profile creation, now aware that a person may arrive from Google.
 *
 * An OAuth sign-in carries a display name and a picture in `raw_user_meta_data`
 * under whichever key the provider chose — `full_name` for Google, `name` for
 * several others — and none of it is present on an email one-time code, where
 * the account is created before NASEK knows anything but the address. Reading
 * all three keys means a Google user reaches their dashboard already greeted by
 * name, and an email user still gets the local part of their address, exactly
 * as before.
 *
 * The role is still hard-coded to 'customer'. That has not moved and must not:
 * it is what makes "sign up as an administrator" not a thing that exists.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'user_name'), ''),
      ''
    ),
    new.email,
    new.phone,
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- 4. Providers — the permit stops being public, and stops being self-granted
-- =============================================================================

/**
 * Who may read a company row: its owner, and an administrator.
 *
 * Everyone else reads `providers_public` instead, which is the same rows minus
 * the permit, the private phone number, the private address and the owner's
 * account id. This is the fix for defect (1): the view was already correct, and
 * was simply being bypassed.
 */
drop policy if exists providers_read on public.providers;
create policy providers_read on public.providers
  for select using (owner_id = auth.uid() or public.is_admin());

/**
 * Registration goes through `register_provider` and nowhere else.
 *
 * The old `providers_insert_own` policy is dropped rather than tightened. A
 * policy can say "the row you insert must name you as owner"; it cannot say
 * "and its verification must be pending, and its plan must be basic, and you
 * must not already have one" — those are the rules `register_provider` exists
 * to hold, and they are worth nothing while a direct INSERT sits beside it.
 */
drop policy if exists providers_insert_own on public.providers;

drop policy if exists providers_update_own on public.providers;
create policy providers_update_own on public.providers
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists providers_delete_admin on public.providers;
create policy providers_delete_admin on public.providers
  for delete to authenticated using (public.is_admin());

/**
 * The public face of a campaign owner.
 *
 * Now a *definer* view, and that inversion is the whole point. As
 * `security_invoker = true` it re-ran the caller's policies on the table
 * underneath, so closing that table would have emptied the view and taken the
 * public catalogue with it. As a definer view it reads the table as its owner
 * and hands back only the columns written here — which is what a view was
 * always the right tool for: not deciding *which rows*, but deciding *which
 * columns leave the database at all*.
 *
 * Nothing sensitive is in the list. Name, rating, plan and the verification
 * badge are on every campaign card already.
 *
 * EXPECT SUPABASE'S DATABASE LINTER TO FLAG THIS, AND DO NOT "FIX" IT.
 *
 * The advisor raises `security_definer_view` on any view that is not
 * `security_invoker`, because the usual case is somebody bypassing RLS without
 * meaning to. This one means to, and the flag is the mechanism rather than an
 * oversight: flipping it back would re-apply `providers_read` underneath, the
 * view would return nothing to a signed-out visitor, and the public catalogue
 * would lose every campaign owner's name — the exact failure
 * 20260901000600 was written to document, arriving by a different route.
 */
drop view if exists public.providers_public;
create view public.providers_public
with (security_invoker = false) as
  select id, name_ar, name_en, tagline_ar, tagline_en, description_ar, description_en,
         wilayah_id, verification, experience_years, rating, review_count,
         initials, brand_color, plan, joined_at
  from public.providers;

grant select on public.providers_public to anon, authenticated;

/**
 * What an owner may not decide about their own company.
 *
 * Fires on INSERT as well as UPDATE now — defect (2) was entirely about the
 * insert path being unguarded — and covers `plan` alongside verification,
 * because the subscription tier is a commercial fact about a paying
 * relationship, not a field on a form.
 *
 * `rejection_reason` is an administrator's words to the owner. An owner
 * clearing it would erase the only explanation of why their application was
 * refused, from the only screen that shows it.
 */
create or replace function public.guard_provider_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- ------------------------------------------------------------------ insert
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

  -- ------------------------------------------------------------------ update
  if public.is_admin() then
    if new.verification is distinct from old.verification then
      new.verified_by := auth.uid();
      new.verified_at := now();
      -- An approval erases the refusal it supersedes; there is nothing left to
      -- explain, and leaving the old reason on the row would keep showing the
      -- owner a rejection notice on an approved account.
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

  /*
   * Resubmission after a refusal.
   *
   * The owner is allowed one transition of their own, and only this one: a
   * rejected application that is edited goes back into the queue. Without it,
   * a refusal would be terminal — the owner could fix exactly what they were
   * asked to fix and have no way to say so, and an administrator would have to
   * reset the status by hand before the corrected application could be seen.
   *
   * Note what it is not: it cannot reach 'verified', it cannot leave
   * 'suspended', and it clears the old reason rather than writing a new one.
   */
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
  new.rating      := old.rating;
  new.review_count := old.review_count;
  return new;
end;
$$;

-- Replaces the update-only guard of the same purpose.
drop trigger if exists providers_guard_verification on public.providers;
drop trigger if exists providers_guard_privileges on public.providers;
create trigger providers_guard_privileges
  before insert or update on public.providers
  for each row execute function public.guard_provider_privileges();

-- The update-only predecessor, removed rather than left lying around. A trigger
-- function nothing fires is not harmless: the next person to read the schema
-- has to work out which of the two is live, and the answer is not in the
-- function body.
drop function if exists public.guard_provider_verification();


-- =============================================================================
-- 5. Campaigns — an unapproved company has no public catalogue
-- =============================================================================

/**
 * Defect (3).
 *
 * A trip is public when it is not taken down, not deleted, *and* its company
 * has been approved. The owner still sees every one of their own trips —
 * writing them before approval is the sensible order, and a dashboard that hid
 * an owner's own drafts would be unusable — and an administrator still sees
 * everything, because the screen with the restore button has to.
 *
 * This is what makes "your trips go live when we verify you" true rather than a
 * sentence on a registration form.
 */
drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns
  for select using (
    (suspended = false and deleted = false and public.provider_approved(provider_id))
    or public.owns_provider(provider_id)
    or public.is_admin()
  );

/**
 * Moderation and reputation are not the owner's to set.
 *
 * `featured` is placement NASEK sells and gives; `rating` and `review_count`
 * are what travellers said. All three were writable by the owner of the row on
 * insert, and `featured` is the one that matters — it is the home page.
 *
 * `seats_available` and `bookings_count` are deliberately NOT guarded here.
 * `book_campaign` runs SECURITY DEFINER but keeps the caller's `auth.uid()`, so
 * a guard on those columns would revert the very decrement the booking
 * transaction exists to make, and oversell every trip.
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

  new.suspended    := old.suspended;
  new.featured     := old.featured;
  new.rating       := old.rating;
  new.review_count := old.review_count;
  return new;
end;
$$;

drop trigger if exists campaigns_guard_moderation on public.campaigns;
create trigger campaigns_guard_moderation
  before insert or update on public.campaigns
  for each row execute function public.guard_campaign_moderation();


-- =============================================================================
-- 6. Registration, resubmission, and an administrator's decision
-- =============================================================================

/*
 * `register_provider` gains the Storage path and drops nothing.
 *
 * Dropped and recreated rather than replaced: adding a parameter produces an
 * *overload* under `create or replace`, and PostgREST resolves an RPC by the
 * exact set of named arguments it receives — so the old signature would keep
 * answering, and keep writing rows with no licence path, for as long as anyone
 * called it that way.
 */
drop function if exists public.register_provider(
  text, text, text, text, int, text, text, text, text, text, text
);

create or replace function public.register_provider(
  p_name_ar           text,
  p_name_en           text,
  p_tagline           text default '',
  p_wilayah_id        text default null,
  p_experience_years  int default 0,
  p_phone             text default null,
  p_email             text default null,
  p_initials          text default '?',
  p_brand_color       text default '#1c5e4c',
  p_licence_image     text default null,
  p_licence_file_name text default null,
  p_licence_path      text default null
)
returns public.providers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  created public.providers;
begin
  if caller is null then
    raise exception 'You must be signed in to register a campaign'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from public.providers where owner_id = caller) then
    raise exception 'This account already has a registered campaign'
      using errcode = 'unique_violation';
  end if;

  -- An administrator registering a company would be promoted out of the role by
  -- the update below, locking them out of the dashboard they are standing in.
  if public.is_admin() then
    raise exception 'An administrator account cannot also register a campaign'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.providers (
    owner_id, name_ar, name_en, tagline_ar, tagline_en,
    description_ar, description_en, wilayah_id, verification,
    experience_years, phone, email, initials, brand_color, plan,
    licence_image, licence_file_name, licence_path, submitted_at
  )
  values (
    caller, p_name_ar, p_name_en, p_tagline, p_tagline,
    p_tagline, p_tagline, p_wilayah_id,
    'pending',
    greatest(coalesce(p_experience_years, 0), 0),
    p_phone, p_email, p_initials, coalesce(p_brand_color, '#1c5e4c'), 'basic',
    p_licence_image, p_licence_file_name, p_licence_path, now()
  )
  returning * into created;

  update public.profiles
     set role = 'provider', provider_id = created.id
   where id = caller;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (caller, 'register', 'provider', created.id::text,
          jsonb_build_object('name', p_name_en, 'wilayah', p_wilayah_id));

  return created;
end;
$$;

revoke all on function public.register_provider(
  text, text, text, text, int, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.register_provider(
  text, text, text, text, int, text, text, text, text, text, text, text
) to authenticated;

/**
 * A refused application, corrected and sent back.
 *
 * Exists as a function rather than a plain UPDATE for one reason: the owner has
 * to be told *why* it was refused before they can fix it, and then the whole
 * corrected submission has to land in one statement so the queue never holds a
 * half-edited application. The trigger above is what actually moves the status;
 * this is the shape the interface can call.
 */
create or replace function public.resubmit_provider(
  p_name_ar           text,
  p_name_en           text,
  p_tagline           text default '',
  p_wilayah_id        text default null,
  p_experience_years  int default 0,
  p_phone             text default null,
  p_email             text default null,
  p_licence_image     text default null,
  p_licence_file_name text default null,
  p_licence_path      text default null
)
returns public.providers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller  uuid := auth.uid();
  target  public.providers;
begin
  if caller is null then
    raise exception 'You must be signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into target from public.providers where owner_id = caller for update;
  if not found then
    raise exception 'This account has no registered campaign'
      using errcode = 'no_data_found';
  end if;

  if target.verification <> 'rejected' then
    raise exception 'Only a refused application can be resubmitted'
      using errcode = 'check_violation';
  end if;

  update public.providers
     set name_ar           = p_name_ar,
         name_en           = p_name_en,
         tagline_ar        = p_tagline,
         tagline_en        = p_tagline,
         wilayah_id        = coalesce(p_wilayah_id, wilayah_id),
         experience_years  = greatest(coalesce(p_experience_years, 0), 0),
         phone             = coalesce(p_phone, phone),
         email             = coalesce(p_email, email),
         licence_image     = coalesce(p_licence_image, licence_image),
         licence_file_name = coalesce(p_licence_file_name, licence_file_name),
         licence_path      = coalesce(p_licence_path, licence_path),
         verification      = 'pending',
         rejection_reason  = null,
         submitted_at      = now()
   where id = target.id
   returning * into target;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (caller, 'resubmit', 'provider', target.id::text,
          jsonb_build_object('name', p_name_en));

  return target;
end;
$$;

revoke all on function public.resubmit_provider(
  text, text, text, text, int, text, text, text, text, text
) from public, anon;
grant execute on function public.resubmit_provider(
  text, text, text, text, int, text, text, text, text, text
) to authenticated;

/**
 * Approve, refuse, suspend or requeue a company.
 *
 * The dashboard could write `verification` through the update policy — it did —
 * but a refusal now carries a reason, and a reason written by a separate
 * statement is a reason that can go missing between two requests. One function,
 * one row, one audit entry.
 *
 * The administrator check is explicit rather than left to the policy, because
 * SECURITY DEFINER means the policy is not consulted. That is the standing
 * trade in this schema: a definer function must state in code what a policy
 * would otherwise have stated for it.
 */
create or replace function public.set_provider_status(
  p_provider_id uuid,
  p_status      public.verification_status,
  p_reason      text default null
)
returns public.providers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated public.providers;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;

  if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'A refusal needs a reason the owner can act on'
      using errcode = 'check_violation';
  end if;

  update public.providers
     set verification     = p_status,
         rejection_reason = case
           when p_status in ('rejected', 'suspended') then nullif(trim(p_reason), '')
           else null
         end
   where id = p_provider_id
   returning * into updated;

  if not found then
    raise exception 'No such campaign owner' using errcode = 'no_data_found';
  end if;

  return updated;
end;
$$;

revoke all on function public.set_provider_status(uuid, public.verification_status, text)
  from public, anon;
grant execute on function public.set_provider_status(uuid, public.verification_status, text)
  to authenticated;


-- =============================================================================
-- 7. Grants
--
-- The change that closes defect (1) is one line: `anon` loses SELECT on
-- `providers`. Everything a signed-out visitor needs is in `providers_public`,
-- and everything it does not need is now unreachable rather than merely absent
-- from a view nobody was obliged to use.
-- =============================================================================

revoke select on public.providers from anon;
revoke insert on public.providers from anon, authenticated;

grant select on public.providers to authenticated;   -- policy-scoped to own/admin
grant update, delete on public.providers to authenticated;
