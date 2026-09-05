-- =============================================================================
-- NASEK — the Giving sign-up list
--
-- The Giving page collects an address, thanks the person, and throws it away.
-- The page is honest that the programme is planned rather than running, but it
-- is not honest that the expression of interest goes nowhere — somebody who
-- types their address there has every reason to expect NASEK will have it when
-- the programme opens.
--
-- One table, and deliberately the narrowest one that can hold the promise.
--
-- WHY ANON MAY INSERT AND NOBODY MAY READ
--
-- The whole point is that a signed-out visitor can leave an address; requiring
-- an account first would be a worse ask than the one being made. So `anon` gets
-- INSERT and nothing else. Nobody gets SELECT except an administrator, which
-- means the list cannot be read back by the public key that can write to it —
-- an open mailing list is a harvestable one, and this is the exact shape of
-- table that leaks when somebody grants SELECT to match the INSERT.
--
-- No UPDATE and no DELETE for anyone: an address on this list is either there
-- or withdrawn by a person at NASEK running SQL, and there is no interface that
-- needs either.
-- =============================================================================

create table if not exists public.giving_interest (
  id         uuid primary key default gen_random_uuid(),
  email      citext not null,
  -- Set when the person happened to be signed in. Null is the normal case and
  -- is not a defect: the form is offered to everybody.
  user_id    uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Signing up twice is the same intent expressed twice, not two people.
  unique (email)
);

create index if not exists giving_interest_created_idx
  on public.giving_interest (created_at desc);

alter table public.giving_interest enable row level security;

/*
 * Anyone may add themselves. The WITH CHECK is what stops the insert being a
 * way to write a row *about somebody else*: an anonymous caller may only leave
 * a null `user_id`, and a signed-in one may only name themselves.
 */
drop policy if exists giving_interest_insert on public.giving_interest;
create policy giving_interest_insert on public.giving_interest
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

/* Read by administrators alone — see the header. */
drop policy if exists giving_interest_read on public.giving_interest;
create policy giving_interest_read on public.giving_interest
  for select to authenticated using (public.is_admin());

grant insert on public.giving_interest to anon, authenticated;
grant select on public.giving_interest to authenticated;
