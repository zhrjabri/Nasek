-- =============================================================================
-- NASEK — how someone becomes an administrator
--
-- Deliberately not something the application can do.
--
-- There is no "sign up as an administrator" screen, no role selector on the
-- registration form, and no code path in either app that writes `role`. The
-- trigger in 20260901000200 hard-codes every new profile to 'customer', and
-- `guard_profile_privileges` reverts any attempt by a non-admin to change it.
-- Together those mean the only way into the administration dashboard is for
-- someone who already has database access to put you there, on purpose.
--
-- That is the property the prototype could never have. A passphrase compiled
-- into the bundle protects a door that everyone is standing next to; a role
-- that only the database can grant protects a door that is not in the building.
-- =============================================================================

/**
 * Promote an existing account to administrator, by the address they sign in
 * with.
 *
 * Takes an email rather than a uuid because the person running it is looking
 * at a colleague, not at a primary key. The account must already exist — sign
 * in once on the public site first, which creates the auth user and its
 * profile, then run this.
 *
 * EXECUTE is granted to `service_role` only. That role is what the Supabase SQL
 * editor and the CLI run as; the browser's anon key can never reach it, so this
 * function is unreachable from either application no matter what an attacker
 * sends. Calling it as `authenticated` is a permission denied, not a check that
 * happens to fail.
 */
create or replace function public.promote_to_admin(target_email text)
returns table (id uuid, email citext, role public.user_role)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  found_id uuid;
begin
  select p.id into found_id
  from public.profiles p
  where p.email = lower(trim(target_email));

  if found_id is null then
    raise exception 'No NASEK account exists for %. Sign in once on the public site first, then run this again.', target_email
      using errcode = 'no_data_found';
  end if;

  update public.profiles p
     set role = 'admin', suspended = false, removed = false
   where p.id = found_id;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (null, 'promote', 'profile', found_id::text,
          jsonb_build_object('email', lower(trim(target_email)), 'via', 'promote_to_admin'));

  return query
    select p.id, p.email, p.role from public.profiles p where p.id = found_id;
end;
$$;

revoke all on function public.promote_to_admin(text) from public, anon, authenticated;
grant execute on function public.promote_to_admin(text) to service_role;

/** The inverse. Same restriction, same reasoning. */
create or replace function public.demote_admin(target_email text)
returns table (id uuid, email citext, role public.user_role)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  found_id uuid;
begin
  select p.id into found_id
  from public.profiles p
  where p.email = lower(trim(target_email));

  if found_id is null then
    raise exception 'No NASEK account exists for %.', target_email
      using errcode = 'no_data_found';
  end if;

  update public.profiles p set role = 'customer' where p.id = found_id;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (null, 'demote', 'profile', found_id::text,
          jsonb_build_object('email', lower(trim(target_email))));

  return query
    select p.id, p.email, p.role from public.profiles p where p.id = found_id;
end;
$$;

revoke all on function public.demote_admin(text) from public, anon, authenticated;
grant execute on function public.demote_admin(text) to service_role;

-- -----------------------------------------------------------------------------
-- TO CREATE YOUR FIRST ADMINISTRATOR
--
--   1. Open the public site and sign in with the address that should hold it.
--      One-time code, no password — that creates the auth user and its profile.
--   2. Open the Supabase dashboard → SQL Editor and run:
--
--        select * from public.promote_to_admin('you@example.com');
--
--   3. Open the administration dashboard and sign in with the same address.
--
-- To check who currently holds it:
--
--        select id, email, name, created_at from public.profiles where role = 'admin';
--
-- To take it away:
--
--        select * from public.demote_admin('them@example.com');
-- -----------------------------------------------------------------------------
