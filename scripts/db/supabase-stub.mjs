/*
 * A Postgres that behaves like the parts of Supabase NASEK's SQL relies on.
 *
 * `npm run verify:backend` probes the real project, but only with the public
 * key — it can prove that a signed-out caller is refused, and nothing about
 * what a signed-in customer or owner can do. Those are the questions the
 * booking, seat, review and permit rules turn on, and answering them against
 * production would mean creating real accounts and real bookings.
 *
 * So this boots PGlite — the actual Postgres engine, compiled to WebAssembly —
 * applies every migration in `supabase/migrations` in order, and lets a check
 * act as a particular person by switching to the `authenticated` role and
 * setting `request.jwt.claims`, exactly as PostgREST does. Row-level security,
 * grants, triggers and SECURITY DEFINER all behave as they do on the project,
 * because they are the same engine.
 *
 * What is stubbed, and only as far as the migrations use it:
 *
 *   roles     `anon`, `authenticated`, `service_role` (the last bypasses RLS)
 *   auth      `users`, `uid()`, `jwt()`, `role()`
 *   storage   `buckets`, `objects` with RLS on, `foldername()`
 *
 * Grants are the pessimistic case on purpose. Older Supabase projects give
 * `anon` and `authenticated` every privilege on every new table through
 * default privileges; this does the same, so a check passes only if the
 * migrations themselves close the door — not because the stub never opened it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const STUB = /* sql */ `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant anon, authenticated, service_role to postgres;

create schema auth;
create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  phone               text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  raw_app_meta_data   jsonb not null default '{}'::jsonb,
  email_confirmed_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id                  text primary key,
  name                text not null,
  owner               uuid,
  public              boolean default false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create table storage.objects (
  id                uuid primary key default gen_random_uuid(),
  bucket_id         text references storage.buckets (id),
  name              text,
  owner             uuid,
  owner_id          text,
  metadata          jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  last_accessed_at  timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

export const migrationFiles = () =>
  fs
    .readdirSync(path.join(root, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()

/**
 * Boot a database with every applied migration, and optionally extra SQL
 * (the pending migration) on top.
 */
export async function boot({ extraSql = [], exclude = [] } = {}) {
  const db = await PGlite.create({ extensions: { citext } })
  await db.exec(STUB)
  for (const file of migrationFiles().filter((f) => !exclude.includes(f))) {
    const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', file), 'utf8')
    try {
      await db.exec(sql)
    } catch (error) {
      throw new Error(`migration ${file} failed to apply: ${error.message}`)
    }
  }
  for (const { name, sql } of extraSql) {
    try {
      await db.exec(sql)
    } catch (error) {
      throw new Error(`${name} failed to apply: ${error.message}`)
    }
  }
  return db
}

/**
 * Run `fn` as a signed-in person (or as the anonymous role when `userId` is
 * null), inside a transaction that is rolled back unless `keep` is set — so a
 * refused attempt can never leave anything behind for the next check.
 *
 * `amr` is the sign-in method list Supabase puts in the token, e.g.
 * `[{ method: 'otp' }]` for a code or magic link, `[{ method: 'password' }]`.
 * `fn` receives a `q(sql, params)` that returns rows.
 */
export async function as(db, userId, fn, { role, keep = false, amr } = {}) {
  const claimRole = role ?? (userId ? 'authenticated' : 'anon')
  const claims = { role: claimRole }
  if (userId) claims.sub = userId
  if (amr) claims.amr = amr
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec(`set local role ${claimRole}`)
    const q = async (sql, params = []) => (await tx.query(sql, params)).rows
    const result = await fn(q)
    await tx.exec('reset role')
    if (!keep) await tx.rollback()
    return result
  })
}

export { root }
