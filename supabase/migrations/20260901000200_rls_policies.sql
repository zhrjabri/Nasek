-- =============================================================================
-- NASEK — row-level security
--
-- This file is the answer to the one thing the prototype could not do.
--
-- Before Supabase, every guard in NASEK was a guard the visitor's own browser
-- was asked to enforce: the admin dashboard checked a role held in
-- localStorage, and `src/admin/access.ts` said so plainly in its own comments.
-- Anyone willing to edit their stored state walked straight in. Hiding the
-- route, hashing its address and stripping the chunk name all raised the cost
-- of finding the door; none of them locked it.
--
-- What follows locks it. Every policy below is evaluated by Postgres against a
-- JWT the browser cannot forge, *before* any row is returned. A normal user
-- who types the administration URL, guesses a table name, or calls the REST
-- endpoint directly with their own token gets an empty result set — not a
-- hidden button, an empty result set.
--
-- The rule the whole file rests on: `auth.uid()` is trustworthy because it is
-- derived from a signature; anything the client *says* about itself is not.
-- No policy here reads a value supplied by the caller.
-- =============================================================================

-- ------------------------------------------------------------------ helpers

/**
 * Is the caller an administrator?
 *
 * SECURITY DEFINER for a specific reason: this function reads `profiles`, and
 * `profiles` has a policy that calls this function. Left as an ordinary
 * function that would recurse forever. Running as the owner sidesteps row-level
 * security on that one lookup, which is exactly the escape hatch the recursion
 * needs — and is safe because the function takes no arguments and can only ever
 * report on the caller's own row.
 *
 * `search_path` is pinned. A SECURITY DEFINER function that resolves names
 * through the caller's search_path can be redirected to a table the caller
 * controls, which would turn this into a way to *become* an admin rather than
 * a way to check for one.
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
  );
$$;

/** Does the caller own this campaign owner account? Same recursion note as above. */
create or replace function public.owns_provider(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.providers pr
    where pr.id = target and pr.owner_id = auth.uid()
  );
$$;

/** The provider account behind a campaign, for the owner-scoped policies below. */
create or replace function public.owns_campaign(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.campaigns c
    join public.providers pr on pr.id = c.provider_id
    where c.id = target and pr.owner_id = auth.uid()
  );
$$;

/**
 * Is this company approved to appear in the catalogue?
 *
 * Added by the 2026-09-02 hardening and back-ported into this file, so that
 * re-running it — which the setup instructions tell you to do when a table
 * shows `rowsecurity = false` — cannot quietly reopen the catalogue to
 * unverified companies. Every statement here is replayable; that promise is
 * worth nothing if replaying one undoes a later fix.
 *
 * SECURITY DEFINER because it reads `providers`, which is closed below to
 * everyone but the owner and an administrator. An anonymous visitor has to be
 * able to learn "this trip's company is approved" without being able to read
 * the row that says so.
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

revoke all on function public.is_admin() from public;
revoke all on function public.owns_provider(uuid) from public;
revoke all on function public.owns_campaign(uuid) from public;
revoke all on function public.provider_approved(uuid) from public;
/*
 * All three are granted to `anon` as well as `authenticated`, and that is not
 * an oversight in the other direction.
 *
 * `campaigns_read` calls `owns_provider` while deciding whether to show a trip,
 * and Postgres evaluates a policy's whole expression without promising to
 * short-circuit — so an anonymous visitor needs EXECUTE on it just to be told
 * "no". Granting it reveals nothing: every one of these compares against
 * `auth.uid()`, which is null for an anonymous caller, so they return false
 * every time. Granting only `is_admin` to `anon`, as an earlier version of this
 * file did, made the public catalogue return 401 to everyone who was not signed
 * in.
 */
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.owns_provider(uuid) to authenticated, anon;
grant execute on function public.owns_campaign(uuid) to authenticated, anon;
grant execute on function public.provider_approved(uuid) to authenticated, anon;

-- --------------------------------------------------- profile on sign-up
/**
 * Every authenticated person gets a profile, created here rather than by the
 * client.
 *
 * The role is hard-coded to 'customer'. This is the single most important line
 * in the file: if the application could choose the role at sign-up, then
 * "sign up as an administrator" would be one request away. Administrators are
 * promoted out of band — see 20260901000400_admin_provisioning.sql — and never
 * self-serve.
 *
 * Campaign owners are also 'customer' at this point; registering a company is
 * a separate step that promotes them, and it too is guarded below.
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
    coalesce(new.raw_user_meta_data ->> 'name', ''),
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

-- ------------------------------------------------ privilege-escalation guard
/**
 * Columns a person may not edit on their own profile.
 *
 * RLS alone cannot express this: a WITH CHECK clause sees only the proposed
 * row, never the row it replaces, so "you may update yourself but not change
 * your role" is not something a policy can say. A trigger can, because it sees
 * both OLD and NEW.
 *
 * The guard reverts rather than raises. An ordinary profile update that happens
 * to send the whole row back — which is what a REST upsert does — should
 * succeed and quietly keep the privileged columns it was never allowed to
 * touch, not fail with an error the user cannot act on.
 */
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- An administrator may set these; the service role bypasses triggers of this
  -- kind by being the one that runs migrations and admin tooling.
  if public.is_admin() then
    return new;
  end if;

  new.role        := old.role;
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
 * Verification is an administrator's decision, so an owner cannot grant it to
 * themselves. Same revert-don't-raise shape as above, and it records the audit
 * trail docs/DATA-MODEL.md asked for.
 *
 * Fires on INSERT as well as UPDATE, and that is the correction of 2026-09-02.
 * It was a BEFORE UPDATE trigger, which left the insert path completely
 * unguarded: a single POST creating a `providers` row with
 * `verification: 'verified'` bought the badge the whole platform's trust rests
 * on, and `plan: 'premium'` came free with it. A guard that only watches one of
 * the two ways a value can arrive is not a guard.
 *
 * Named to match 20260902000200_auth_hardening.sql, which replaces this body
 * with a richer one once the rejection columns exist. Sharing the name is what
 * makes replaying this file safe: it substitutes a *stricter* guard, never a
 * second one running beside the first.
 */
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
    new.owner_id     := auth.uid();
    new.verification := 'pending';
    new.plan         := 'basic';
    new.verified_by  := null;
    new.verified_at  := null;
    return new;
  end if;

  if public.is_admin() then
    if new.verification is distinct from old.verification then
      new.verified_by := auth.uid();
      new.verified_at := now();
      insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
      values (
        auth.uid(), 'verification', 'provider', new.id::text,
        jsonb_build_object('from', old.verification, 'to', new.verification)
      );
    end if;
    return new;
  end if;

  new.verification := old.verification;
  new.verified_by  := old.verified_by;
  new.verified_at  := old.verified_at;
  new.owner_id     := old.owner_id;
  new.plan         := old.plan;
  return new;
end;
$$;

drop trigger if exists providers_guard_verification on public.providers;
drop trigger if exists providers_guard_privileges on public.providers;
create trigger providers_guard_privileges
  before insert or update on public.providers
  for each row execute function public.guard_provider_privileges();

/**
 * Moderation flags on a campaign belong to administrators, for the same reason
 * a takedown must survive the owner republishing the trip.
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

  -- On INSERT as well, since 2026-09-02. `featured` decides the home page and
  -- `rating` is what travellers said; both were the owner's to write on the way
  -- in, because the guard only ever watched updates.
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

/**
 * A review requires a completed booking by the same person on the same trip.
 *
 * The UI has promised this since the first prototype and nothing enforced it.
 * It has to be a trigger rather than a policy because it is a statement about
 * a different table.
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
    select 1 from public.bookings b
    where b.user_id = new.user_id
      and b.campaign_id = new.campaign_id
      and b.status = 'completed'
  ) then
    raise exception 'A review requires a completed booking on this campaign'
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
-- Policies
--
-- RLS is enabled on every table without exception. A table with RLS enabled and
-- no policy denies everything, which is the correct direction to fail: a table
-- added later and forgotten about is invisible rather than public.
-- =============================================================================

alter table public.wilayat         enable row level security;
alter table public.profiles        enable row level security;
alter table public.providers       enable row level security;
alter table public.campaigns       enable row level security;
alter table public.bookings        enable row level security;
alter table public.travellers      enable row level security;
alter table public.reviews         enable row level security;
alter table public.notifications   enable row level security;
alter table public.saved_campaigns enable row level security;
alter table public.admin_audit     enable row level security;

-- ------------------------------------------------------------------- wilayat
-- Reference data. Public to read — the map and the filters need it before
-- anyone signs in — and writable only by migrations.

drop policy if exists wilayat_read on public.wilayat;
create policy wilayat_read on public.wilayat
  for select using (true);

-- ------------------------------------------------------------------ profiles
-- A person sees themselves. An administrator sees everyone. Nobody else sees
-- anybody: the directory in the admin dashboard is the only place a list of
-- accounts exists, and it is a list a normal user's token cannot produce.

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- No insert policy: profiles are created by the on_auth_user_created trigger.
-- No delete policy: removing a person is `removed = true`, never a DELETE,
-- because bookings and revenue history are reconstructed from these rows.

-- ----------------------------------------------------------------- providers
-- Campaign owners are public in the sense that matters — a pilgrim comparing
-- trips has to see who runs them — but "public" is the *view* below, not the
-- table. The table holds a scanned trade permit, a private phone number and the
-- account id behind the company.
--
-- This policy read `using (true)` until 2026-09-02, with SELECT granted to
-- `anon`, which published every permit NASEK held to anyone holding the key
-- compiled into the bundle. See 20260902000200_auth_hardening.sql for the whole
-- account of it; it is corrected here as well so that replaying this file
-- cannot reopen it.

drop policy if exists providers_read on public.providers;
create policy providers_read on public.providers
  for select using (owner_id = auth.uid() or public.is_admin());

-- No insert policy. Registration goes through `register_provider`, which is the
-- only thing that can hold the rules a policy cannot express — one company per
-- account, always `pending`, always `basic`. A direct INSERT alongside it was a
-- way to grant yourself the "Verified by NASEK" badge in a single request.
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
 * `providers` is readable by everyone because the listing needs the company
 * behind each trip — but the row also holds a scanned trade permit and a
 * private phone number, and "readable by everyone" would publish those too.
 * The view is what the public site reads; the table itself is read only by the
 * owner and the administration dashboard.
 *
 * A *definer* view: it reads the table as its owner and returns only the
 * columns named here. That inversion is the mechanism rather than an oversight.
 * As `security_invoker = true` it re-ran the caller's policies on the table
 * underneath, so closing that table would empty the view and take the public
 * catalogue with it. Supabase's database linter flags this as
 * `security_definer_view`; do not "fix" it. A view's job here is not to decide
 * which rows leave the database — the policy above does that — but which
 * columns can leave it at all.
 */
drop view if exists public.providers_public;
create view public.providers_public
with (security_invoker = false) as
  select id, name_ar, name_en, tagline_ar, tagline_en, description_ar, description_en,
         wilayah_id, verification, experience_years, rating, review_count,
         initials, brand_color, plan, joined_at
  from public.providers;

grant select on public.providers_public to anon, authenticated;

-- ----------------------------------------------------------------- campaigns
-- The catalogue is public, minus anything taken down or deleted. An owner also
-- sees their own suspended trips — otherwise a takedown would look like the
-- trip had vanished — and an administrator sees everything, because the screen
-- holding the restore button has to show what it can restore.

drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns
  for select using (
    -- `provider_approved` is what makes "your trips go live when we verify you"
    -- true rather than a sentence on a registration form. Without it a company
    -- could register and publish to the catalogue before anyone had looked at
    -- its permit, which is what happened until 2026-09-02.
    (suspended = false and deleted = false and public.provider_approved(provider_id))
    or public.owns_provider(provider_id)
    or public.is_admin()
  );

drop policy if exists campaigns_insert_own on public.campaigns;
create policy campaigns_insert_own on public.campaigns
  for insert to authenticated
  with check (public.owns_provider(provider_id) or public.is_admin());

drop policy if exists campaigns_update_own on public.campaigns;
create policy campaigns_update_own on public.campaigns
  for update to authenticated
  using (public.owns_provider(provider_id) or public.is_admin())
  with check (public.owns_provider(provider_id) or public.is_admin());

drop policy if exists campaigns_delete_own on public.campaigns;
create policy campaigns_delete_own on public.campaigns
  for delete to authenticated
  using (public.owns_provider(provider_id) or public.is_admin());

-- ------------------------------------------------------------------ bookings
-- Three parties have a legitimate interest in a booking and no one else does:
-- the traveller who made it, the campaign owner who has to run it, and NASEK.

drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings
  for select to authenticated using (
    user_id = auth.uid()
    or public.owns_campaign(campaign_id)
    or public.is_admin()
  );

drop policy if exists bookings_insert_own on public.bookings;
create policy bookings_insert_own on public.bookings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings
  for update to authenticated
  using (user_id = auth.uid() or public.owns_campaign(campaign_id) or public.is_admin())
  with check (user_id = auth.uid() or public.owns_campaign(campaign_id) or public.is_admin());

-- ---------------------------------------------------------------- travellers
-- Passport and civil-ID numbers. Reachable only through the booking they
-- belong to, and by exactly the same three parties.

drop policy if exists travellers_read on public.travellers;
create policy travellers_read on public.travellers
  for select to authenticated using (
    exists (
      select 1 from public.bookings b
      where b.id = travellers.booking_id
        and (b.user_id = auth.uid() or public.owns_campaign(b.campaign_id) or public.is_admin())
    )
  );

drop policy if exists travellers_insert_own on public.travellers;
create policy travellers_insert_own on public.travellers
  for insert to authenticated
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = travellers.booking_id and b.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------- reviews

drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews
  for select using (hidden = false or user_id = auth.uid() or public.is_admin());

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------- notifications
-- Strictly personal. Not even an administrator reads someone's notifications;
-- there is no operational reason to, and the dashboard never asks.

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------ saved campaigns

drop policy if exists saved_own on public.saved_campaigns;
create policy saved_own on public.saved_campaigns
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- admin audit
-- Readable by administrators, written by the triggers above. No update or
-- delete policy at all: an audit trail that can be edited by the people it
-- audits is decoration.

drop policy if exists admin_audit_read on public.admin_audit;
create policy admin_audit_read on public.admin_audit
  for select to authenticated using (public.is_admin());

drop policy if exists admin_audit_insert on public.admin_audit;
create policy admin_audit_insert on public.admin_audit
  for insert to authenticated with check (public.is_admin());

-- =============================================================================
-- Grants
--
-- Row-level security and table grants answer two different questions, and both
-- have to say yes. A grant decides whether a role may attempt a statement at
-- all; a policy decides which rows that statement can see. RLS with no grant is
-- a permission error, and a grant with no policy is an open table.
--
-- Supabase normally arranges these grants through default privileges, so most
-- of what follows is redundant on a healthy project. It is written out anyway
-- because the failure mode when it is missing is a flat "permission denied for
-- table" on every query — which reads like a broken key or a broken client, and
-- sends you looking a long way from the actual cause.
--
-- Note what is deliberately absent: no DELETE on profiles (removal is a flag,
-- because bookings are reconstructed from those rows), no INSERT on providers
-- (registration goes through `register_provider`, which is the only thing that
-- can enforce what a policy cannot say), and no write of any kind for `anon`.
-- An unauthenticated visitor may read the catalogue and nothing else.
-- =============================================================================

grant usage on schema public to anon, authenticated;

-- Public reading: the catalogue and the reference data behind it.
grant select on public.wilayat         to anon, authenticated;
grant select on public.campaigns       to anon, authenticated;
grant select on public.reviews         to anon, authenticated;
-- `providers` is deliberately absent: an anonymous visitor reads
-- `providers_public`, which has no permit, no phone number and no owner id in
-- it. Granting the table as well is what made the view decorative.
grant select on public.providers       to authenticated;

-- Signed-in reading. Every one of these is narrowed to the caller's own rows by
-- the policies above; the grant only makes the query attemptable.
grant select on public.profiles        to authenticated;
grant select on public.bookings        to authenticated;
grant select on public.travellers      to authenticated;
grant select on public.notifications   to authenticated;
grant select on public.saved_campaigns to authenticated;
grant select on public.admin_audit     to authenticated;

-- Writing, all of it policy-scoped.
grant update on public.profiles                          to authenticated;
grant update, delete on public.providers                 to authenticated;
grant insert, update, delete on public.campaigns         to authenticated;
grant insert, update on public.bookings                  to authenticated;
grant insert on public.travellers                        to authenticated;
grant insert, update, delete on public.reviews           to authenticated;
grant update on public.notifications                     to authenticated;
grant insert, delete on public.saved_campaigns           to authenticated;
grant insert on public.admin_audit                       to authenticated;

-- Sequence for admin_audit's generated identity column.
grant usage, select on all sequences in schema public to authenticated;
