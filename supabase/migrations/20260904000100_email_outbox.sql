-- =============================================================================
-- NASEK — the outbox
--
-- NASEK now has to *tell* people things: a campaign owner whose company was
-- approved, an owner whose trip was refused and why. Both decisions are taken
-- inside Postgres, by a SECURITY DEFINER function, in the same transaction that
-- writes the status — and that is precisely where an email cannot be sent from.
--
-- So this is a queue rather than a sender. The decision writes a row; something
-- outside the database drains it. That split buys three things worth having:
--
--   * A decision never fails because an email provider was down, and an email
--     is never sent for a decision that was rolled back. Both are consequences
--     of the row being written in the same transaction as the status.
--   * NASEK works with no email infrastructure at all. The rows accumulate,
--     the owner still sees the decision in their portal and in their in-app
--     notifications, and nothing in the product is blocked on an SMTP account
--     somebody has not opened yet.
--   * SMTP credentials live in an Edge Function's secrets, which is the one
--     place in this system a browser cannot reach. Nothing here holds one.
--
-- The drainer is `supabase/functions/send-emails/`. It authenticates as the
-- service role, which bypasses RLS — so this table needs no policy that lets
-- anybody but an administrator read it, and none at all that lets anybody
-- write it.
-- =============================================================================

create table if not exists public.email_outbox (
  id          bigint generated always as identity primary key,
  to_email    citext not null,
  -- Which message this is. The sender uses it to pick a layout; the column
  -- exists so that "did the approval mail go out" is a query rather than a
  -- guess at a subject line.
  template    text not null,
  subject_ar  text not null,
  subject_en  text not null,
  body_ar     text not null,
  body_en     text not null,
  -- Whatever the sender needs that is not prose: the campaign id, a link back
  -- into the portal, the reason text on its own.
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'queued'
              check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts    int not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index if not exists email_outbox_pending_idx
  on public.email_outbox (status, created_at)
  where status in ('queued', 'failed');

/**
 * Put a message in the queue.
 *
 * SECURITY DEFINER and revoked from every client role: the only callers are the
 * other definer functions in this schema, which have already decided that
 * something happened worth telling somebody about. Exposing this to
 * `authenticated` would turn NASEK's own mail sender into an open relay.
 *
 * A null or empty address is a no-op rather than an error. A company that
 * registered without one is a data problem to fix somewhere else; it must not
 * be a reason an administrator's approval fails.
 */
create or replace function public.queue_email(
  p_to         text,
  p_template   text,
  p_subject_ar text,
  p_subject_en text,
  p_body_ar    text,
  p_body_en    text,
  p_payload    jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(trim(p_to), '') = '' then
    return;
  end if;

  insert into public.email_outbox (
    to_email, template, subject_ar, subject_en, body_ar, body_en, payload
  )
  values (
    trim(p_to), p_template, p_subject_ar, p_subject_en, p_body_ar, p_body_en,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

/**
 * The same news, delivered where it cannot bounce.
 *
 * Every message this schema queues is also written as an in-app notification,
 * and that is deliberate belt-and-braces rather than duplication. Email is the
 * channel NASEK does not control: an address goes stale, a provider is not
 * configured yet, a filter eats it. The notification is in the owner's own
 * portal the moment the transaction commits, which makes the portal — not the
 * inbox — the authoritative place a decision is communicated.
 *
 * Also revoked from clients. `notifications` has no insert policy for exactly
 * this reason: nobody gets to write a notification into somebody else's list.
 */
create or replace function public.notify_user(
  p_user_id  uuid,
  p_kind     public.notification_kind,
  p_title_ar text,
  p_title_en text,
  p_body_ar  text,
  p_body_en  text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, kind, title_ar, title_en, body_ar, body_en)
  values (p_user_id, p_kind, p_title_ar, p_title_en, p_body_ar, p_body_en);
end;
$$;

revoke all on function public.queue_email(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.notify_user(uuid, public.notification_kind, text, text, text, text)
  from public, anon, authenticated;

-- ------------------------------------------------------------------ policies

alter table public.email_outbox enable row level security;

/*
 * Readable by an administrator, and by nobody else.
 *
 * There is no insert, update or delete policy at all. The queue is written by
 * the definer functions above and drained by the service role, both of which
 * are outside RLS — so a table with no write policy is exactly right: any
 * client statement against it fails, including one from an administrator's own
 * session. An administrator can see what NASEK tried to send; they cannot make
 * NASEK send something.
 */
drop policy if exists email_outbox_read on public.email_outbox;
create policy email_outbox_read on public.email_outbox
  for select to authenticated using (public.is_admin());

grant select on public.email_outbox to authenticated;
