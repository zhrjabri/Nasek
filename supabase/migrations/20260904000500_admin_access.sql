-- =============================================================================
-- NASEK — the administration access code
--
-- The dashboard used to ask for an email address and a password, with the
-- address baked into the bundle as `VITE_ADMIN_EMAIL`. That worked, and it is
-- not what was asked for: administration should open on a single secret code,
-- and that code must never be a value the browser holds, compares, or could be
-- made to reveal.
--
-- So the code is not in this database either. It lives in one place — the
-- secrets of the `admin-access` Edge Function — and this file is only the two
-- things the database has to contribute:
--
--   1. A record of every attempt, so a code cannot be guessed at machine speed.
--   2. Somewhere for an administrator to read that record.
--
-- HOW THE WHOLE THING FITS TOGETHER, since no single file shows it:
--
--   browser  ──code──▶  admin-access Edge Function   (holds the code's hash;
--                       constant-time compare;        the browser never sees
--                       rate-limited by the table     the code, the hash, or
--                       below)                        the service role key)
--                              │
--                              │ on success, service role mints a single-use
--                              │ magic-link token for the administrator account
--                              ▼
--   browser  ──token──▶  supabase.auth.verifyOtp()   ⇒ an ordinary, signed
--                                                      Supabase session
--                              │
--                              ▼
--                        is_admin() inside Postgres, and RLS
--
-- The last line is the one that has not changed and must not. The access code
-- is a *door*, not an authorisation: it produces a normal session for a normal
-- account, and whether that account administers NASEK is still decided by
-- `is_admin()` against a signed JWT, and still enforced row by row by the
-- policies in 20260901000200. Forging everything this file describes gets you a
-- session that reads exactly what any pilgrim's reads.
-- =============================================================================

create table if not exists public.admin_access_attempts (
  id         bigint generated always as identity primary key,
  /*
   * A hash of the caller's address, never the address.
   *
   * Rate limiting needs to recognise "the same source again", which a hash does
   * perfectly well. Storing the address itself would turn a security control
   * into a log of who tried to reach administration and from where, which is a
   * thing worth not having. The Edge Function salts and hashes before it gets
   * here; this column is opaque by the time it is written.
   */
  ip_hash    text not null,
  succeeded  boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_access_attempts_window_idx
  on public.admin_access_attempts (ip_hash, created_at desc);

alter table public.admin_access_attempts enable row level security;

/*
 * Readable by an administrator; writable by nobody.
 *
 * Same shape as `email_outbox`: rows arrive from the service role, which is
 * outside RLS, so the absence of an insert policy is the control rather than an
 * omission. An administrator can see that somebody has been trying the door;
 * they cannot manufacture or erase that history from the dashboard.
 */
drop policy if exists admin_access_attempts_read on public.admin_access_attempts;
create policy admin_access_attempts_read on public.admin_access_attempts
  for select to authenticated using (public.is_admin());

grant select on public.admin_access_attempts to authenticated;

/**
 * Housekeeping.
 *
 * The table only exists to answer "how many failures from this source in the
 * last few minutes", so anything older than a day is noise that would otherwise
 * grow without bound. Called by the Edge Function, opportunistically, rather
 * than scheduled — there is no scheduler here, and a sweep that runs on the
 * rare occasion somebody signs in to administration is exactly often enough.
 */
create or replace function public.prune_admin_access_attempts()
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  delete from public.admin_access_attempts where created_at < now() - interval '1 day';
$fn$;

revoke all on function public.prune_admin_access_attempts() from public, anon, authenticated;
