-- =============================================================================
-- NASEK — the service role can reach nothing
--
-- Every Edge Function is broken, and has been since the first one was written.
-- `admin-access` reports `lookup_failed`; `admin-create-owner` and
-- `send-emails` would fail the same way the moment they were called. The cause
-- is one line that was never written.
--
-- `20260901000200_rls_policies.sql` ends with a careful block of grants:
--
--     grant usage on schema public to anon, authenticated;
--     grant select on public.campaigns to anon, authenticated;
--     ...
--
-- and names `anon` and `authenticated` throughout. It never names
-- `service_role`. On a project where Supabase's default privileges happen to
-- cover that role, nothing goes wrong and the omission is invisible. On this
-- one they do not, so `service_role` holds no privilege on any table or
-- function in `public` — and a service-role client gets
--
--     42501  permission denied for table profiles
--
-- on its very first query.
--
-- The failure mode is worth naming because it is so quiet: RLS is irrelevant
-- here. `service_role` carries BYPASSRLS, so every policy in this schema is
-- skipped for it — and then the plain SQL GRANT underneath, which BYPASSRLS
-- does nothing about, refuses the statement. Policies and grants answer two
-- different questions and both have to say yes; this is the half nobody looks
-- at because it usually comes for free.
--
-- WHY THIS DOES NOT WEAKEN ANYTHING
--
-- `service_role` is the key that already bypasses row-level security by design.
-- It never reaches a browser — it is injected into Edge Functions by the
-- platform and appears in no `VITE_` variable, no bundle and no file in this
-- repository. Granting it table access does not give it anything it was not
-- already trusted with; it makes the trust it already has usable. Supabase's
-- own default for a project is exactly this grant.
--
-- `anon` and `authenticated` are deliberately untouched. Their grants remain
-- exactly as `20260901000200` and `20260902000200` left them — in particular
-- `anon` still has no access to `providers`, and every policy in the schema is
-- unchanged.
-- =============================================================================

grant usage on schema public to service_role;

/*
 * Tables and sequences.
 *
 * Blanket rather than enumerated, and that is the considered choice. The
 * alternative — granting exactly the four tables today's functions read — is
 * how this bug happened in the first place: a list that has to be maintained,
 * maintained by someone who will not find out they forgot until a function
 * fails in production with a message about privileges. `service_role` is the
 * trusted server-side identity; the useful boundary for it is "not in a
 * browser", not "these four tables".
 */
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

/*
 * Functions, including the SECURITY DEFINER ones.
 *
 * `admin_create_provider` was already granted to `service_role` explicitly, and
 * `promote_to_admin` and `demote_admin` have been since 20260901000400 — so the
 * role's ability to reach the privileged surface is not new. What was missing
 * is the ordinary ones it also needs: `prune_admin_access_attempts`, called by
 * `admin-access` after every attempt, and `is_admin`, which several definer
 * bodies call internally.
 *
 * Note that `revoke all on function ... from public` in the earlier migrations
 * did not target `service_role` — but revoking from PUBLIC removes the implicit
 * grant every role inherits, and `service_role` had no grant of its own to fall
 * back on. That is why even `is_admin()` was refused.
 */
grant execute on all functions in schema public to service_role;

/*
 * And for everything added after this file.
 *
 * Without this, the next migration that creates a table reintroduces the exact
 * bug — a new table the Edge Functions cannot read, discovered in production.
 * `alter default privileges` is scoped to the role that runs it, which is the
 * role migrations are applied as, so it covers what this project actually
 * creates.
 */
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
