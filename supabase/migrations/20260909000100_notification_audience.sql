-- =============================================================================
-- NASEK — a notification has an audience, not just a recipient
--
-- A campaign owner signed in to the *customer* site and found "تم اعتماد
-- حملتك" and "تم اعتماد شركتك" in their Customer Dashboard.
--
-- Nothing leaked. `notifications_own` has always been `user_id = auth.uid()`
-- with no administrator exception and no provider join, and every one of those
-- rows was addressed to that person's own profile id by `set_campaign_status`
-- and `set_provider_status`, which write to `providers.owner_id`. The rows were
-- theirs. Row-level security was doing exactly what it says.
--
-- What was missing is the other half of "who is this for". A notification
-- records a *person* and never an *audience*, and `kind` — booking, trip,
-- availability, system — describes the subject rather than the reader. One
-- profile is one person, who may be both a pilgrim and a company, and NASEK had
-- a single undifferentiated inbox for the two, rendered by whichever dashboard
-- they happened to open. `landingFor()` sends every role to /dashboard, so for
-- an owner that dashboard is the customer one.
--
-- Worth recording, because it makes the fix obvious: of the ten writers in this
-- schema, nine address a provider owner and one addresses every administrator.
-- Not one addresses a customer. The Customer Dashboard was showing an
-- owner-and-admin inbox because that is the only kind of row that exists.
--
-- WHAT THIS DOES
--
--   1. `audience` on `notifications`, defaulting to `owner` — which is what
--      every existing row and every current writer is, so the backfill is a
--      statement of fact rather than a guess.
--   2. The administrator rows relabelled, identified by the one title that only
--      `submit_provider_profile` writes.
--   3. `notify_user` takes the audience.
--   4. The read policy tightened: still `user_id = auth.uid()` first, and now an
--      owner-audience row is unreadable by an account that owns no company, and
--      an admin-audience row by an account that is not an administrator.
--
-- Additive throughout. Nothing is deleted, no column is dropped, no row is
-- removed, and every statement is safe to run twice.
--
-- WHY THE READ POLICY IS NOT THE WHOLE FIX
--
-- For the owner who reported this it changes nothing — they do own the company,
-- so the rows remain legitimately theirs and RLS must keep returning them. What
-- keeps them out of their *Customer Dashboard* is the client asking for
-- `audience = customer`, which is a product boundary rather than a security
-- one. The policy is the security half: it is what stops an account that is
-- merely a customer from reading owner rows through PostgREST, whatever the
-- browser asks for. Neither half is sufficient alone, and both are here.
-- =============================================================================


-- ============================================================ 1. the audience

do $$ begin
  create type public.notification_audience as enum ('customer', 'owner', 'admin');
exception when duplicate_object then null; end $$;

/*
 * `default 'owner'`, and the default is the backfill.
 *
 * `add column ... default` writes the default into every existing row, so the
 * choice of default *is* the classification of history. `owner` is right for
 * all of it: `set_provider_status`, `set_campaign_status`, `book_campaign`,
 * `admin_create_provider` and `review_provider_changes` all write to
 * `providers.owner_id`, and nothing in this schema has ever written a
 * notification to a customer. `DEMO_NOTIFICATIONS` in the client is `[]`, and
 * `notifications` carries no insert grant for `authenticated`, so there is no
 * other writer that could have produced one.
 *
 * The default stays afterwards rather than being dropped, deliberately. A
 * future writer that forgets the column gets `owner`: invisible to customers,
 * visible to the owner it was addressed to. That is the direction to fail in —
 * the other default would leak the next notification into the very dashboard
 * this migration exists to clear.
 */
alter table public.notifications
  add column if not exists audience public.notification_audience not null default 'owner';

comment on column public.notifications.audience is
  'Which of the three NASEK applications should show this. Not the same question as user_id: one profile can be both a pilgrim and a company owner, and those are different inboxes.';

/*
 * The administrator rows, identified by the title only they carry.
 *
 * `submit_provider_profile` is the single writer that addresses administrators,
 * and the only one that inserts into `notifications` directly rather than
 * through `notify_user`. Its title is a literal in that function and appears
 * nowhere else in the schema, so this selects exactly that population — no
 * heuristic, and no join against a role that may since have changed.
 */
update public.notifications
   set audience = 'admin'
 where title_ar = 'تحديث بيانات صاحب حملة بانتظار المراجعة'
   and audience is distinct from 'admin';

-- Every dashboard asks the same question: my rows, this audience, newest first.
create index if not exists notifications_user_audience_idx
  on public.notifications (user_id, audience, created_at desc);


-- ================================================= 2. "do you own a company?"

/**
 * Whether this account owns any provider at all.
 *
 * `owns_provider(uuid)` answers it for one company; the notifications policy
 * needs it for none in particular. SECURITY DEFINER for the reason
 * `provider_approved` is: the policy must be answerable by an account that
 * cannot read `providers` itself, and the answer — "this person runs a company
 * on NASEK" — is already on every campaign card.
 */
create or replace function public.is_provider_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.providers pr where pr.owner_id = auth.uid());
$$;

revoke all on function public.is_provider_owner() from public;
grant execute on function public.is_provider_owner() to authenticated;
-- `20260906000300` granted every function then existing to `service_role` and
-- set default privileges for future *tables*, not functions. A new function is
-- therefore not covered, and the lesson that migration records is a function
-- the Edge Functions could not call, discovered in production.
grant execute on function public.is_provider_owner() to service_role;


-- =============================================== 3. notify_user, with audience

/*
 * The parameter is added with a default, and the five callers are left alone.
 *
 * `20260906000200` states this project's rule and the two occasions it was
 * learned: restating a function body in a migration is how the review-aggregate
 * exemption and the resubmission branch were lost from
 * `guard_provider_privileges`. Every one of the five functions that calls this
 * — `set_provider_status`, `set_campaign_status`, `book_campaign`,
 * `admin_create_provider`, `review_provider_changes` — writes to a provider
 * owner, which is exactly what the default says. Restating some four hundred
 * lines of moderation and booking logic would change no behaviour, and risk
 * changing some.
 *
 * The one writer whose audience differs is `submit_provider_profile`, and it is
 * restated below because it genuinely has to be.
 *
 * Dropped first rather than overloaded: a six-argument and a seven-argument
 * `notify_user` would make every existing call ambiguous. The six-argument
 * calls inside the untouched functions resolve to this signature and take the
 * default, which is why they need no edit.
 */
drop function if exists public.notify_user(
  uuid, public.notification_kind, text, text, text, text);

create or replace function public.notify_user(
  p_user_id  uuid,
  p_kind     public.notification_kind,
  p_title_ar text,
  p_title_en text,
  p_body_ar  text default '',
  p_body_en  text default '',
  p_audience public.notification_audience default 'owner'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications
    (user_id, kind, title_ar, title_en, body_ar, body_en, audience)
  values
    (p_user_id, p_kind, p_title_ar, p_title_en, p_body_ar, p_body_en, p_audience);
end;
$fn$;

revoke all on function public.notify_user(
  uuid, public.notification_kind, text, text, text, text, public.notification_audience)
  from public, anon, authenticated;
grant execute on function public.notify_user(
  uuid, public.notification_kind, text, text, text, text, public.notification_audience)
  to service_role;


-- ============================= 4. the one writer that is not an owner writer

/*
 * `submit_provider_profile`, restated for one reason only: its notification
 * goes to every administrator, and it is the single place in the schema that
 * inserts into `notifications` without going through `notify_user`, so no
 * default can classify it correctly.
 *
 * The body below is `20260906000100`'s verbatim, and that is still the only
 * definition this function has ever had — no later migration amends it, so
 * restating it cannot lose a fix the way restating `guard_provider_privileges`
 * did. Exactly two lines differ: `audience` in the column list, and `'admin'`
 * in the select. Confirm that before and after with
 *
 *     select pg_get_functiondef('public.submit_provider_profile(
 *       text,text,text,text,text,text,text,int,text,text,text,date,text,text,text
 *     )'::regprocedure);
 */
create or replace function public.submit_provider_profile(
  -- always applied
  p_tagline                 text default null,
  p_description             text default null,
  p_wilayah_id              text default null,
  p_governorate             text default null,
  p_address                 text default null,
  p_phone                   text default null,
  p_email                   text default null,
  p_experience_years        int default null,
  -- reviewed when the company is already approved
  p_name                    text default null,
  p_commercial_registration text default null,
  p_permit_number           text default null,
  p_permit_expiry           date default null,
  p_licence_path            text default null,
  p_licence_file_name       text default null,
  p_licence_mime            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller   uuid := auth.uid();
  company  public.providers;
  changes  jsonb := '{}'::jsonb;
  needs_review boolean;
  change_id uuid;
begin
  if caller is null then
    raise exception 'You must be signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into company from public.providers where owner_id = caller for update;
  if not found then
    raise exception 'This account has no registered campaign'
      using errcode = 'no_data_found';
  end if;

  -- ------------------------------------------------------ the ordinary half
  update public.providers
     set tagline_ar       = coalesce(p_tagline, tagline_ar),
         tagline_en       = coalesce(p_tagline, tagline_en),
         description_ar   = coalesce(p_description, description_ar),
         description_en   = coalesce(p_description, description_en),
         wilayah_id       = coalesce(p_wilayah_id, wilayah_id),
         governorate      = coalesce(p_governorate, governorate),
         address          = coalesce(p_address, address),
         phone            = coalesce(p_phone, phone),
         email            = coalesce(p_email, email),
         experience_years = greatest(coalesce(p_experience_years, experience_years), 0)
   where id = company.id;

  -- ----------------------------------------------------- what changed, of the
  -- ----------------------------------------------------- evidence
  if p_name is not null and trim(p_name) <> '' and trim(p_name) is distinct from company.name_en then
    changes := changes || jsonb_build_object('name', trim(p_name));
  end if;
  if p_commercial_registration is distinct from company.commercial_registration then
    changes := changes || jsonb_build_object('commercial_registration', p_commercial_registration);
  end if;
  if p_permit_number is distinct from company.permit_number then
    changes := changes || jsonb_build_object('permit_number', p_permit_number);
  end if;
  if p_permit_expiry is distinct from company.permit_expiry then
    changes := changes || jsonb_build_object('permit_expiry', p_permit_expiry);
  end if;
  if coalesce(trim(p_licence_path), '') <> '' then
    changes := changes || jsonb_build_object('licence_path', p_licence_path);
  end if;

  if changes = '{}'::jsonb then
    return jsonb_build_object('review_required', false);
  end if;

  /*
   * Not yet approved: apply it and be done.
   *
   * `verified_write` is turned on for exactly this statement. The company is
   * `pending` or `unverified`, so there is no approved information to protect
   * and an administrator will read the whole application anyway.
   */
  needs_review := company.verification = 'verified';

  if not needs_review then
    perform set_config('nasek.verified_write', 'on', true);
    update public.providers
       set name_ar                 = coalesce(nullif(trim(p_name), ''), name_ar),
           name_en                 = coalesce(nullif(trim(p_name), ''), name_en),
           commercial_registration = coalesce(p_commercial_registration, commercial_registration),
           permit_number           = coalesce(p_permit_number, permit_number),
           permit_expiry           = coalesce(p_permit_expiry, permit_expiry),
           licence_path            = coalesce(nullif(trim(p_licence_path), ''), licence_path),
           licence_file_name       = coalesce(nullif(trim(p_licence_file_name), ''), licence_file_name),
           licence_mime            = coalesce(nullif(trim(p_licence_mime), ''), licence_mime)
     where id = company.id;
    perform set_config('nasek.verified_write', 'off', true);
    return jsonb_build_object('review_required', false);
  end if;

  -- --------------------------------------------------- queue it for review
  -- One pending submission per company: the newest replaces the last.
  update public.provider_profile_changes
     set status = 'superseded'
   where provider_id = company.id and status = 'pending';

  insert into public.provider_profile_changes (
    provider_id, submitted_by, proposed, licence_path, licence_file_name, licence_mime
  )
  values (
    company.id, caller, changes,
    nullif(trim(p_licence_path), ''),
    nullif(trim(p_licence_file_name), ''),
    nullif(trim(p_licence_mime), '')
  )
  returning id into change_id;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (caller, 'profile_change_submitted', 'provider', company.id::text, changes);

  /*
   * Every administrator is told, because there is no one administrator.
   *
   * The owner's own confirmation is the screen they are looking at — the portal
   * shows the pending change back to them — so this notification is only for
   * the people who have to act on it.
   */
  insert into public.notifications (user_id, kind, title_ar, title_en, body_ar, body_en, audience)
  select p.id, 'system',
         'تحديث بيانات صاحب حملة بانتظار المراجعة',
         'A campaign owner profile update is awaiting review',
         'قدّمت «' || company.name_ar || '» تعديلاً على بياناتها الموثّقة.',
         '"' || company.name_en || '" has submitted a change to its verified details.',
         -- The audience, named rather than defaulted: this is the one writer in
         -- the schema whose recipients are administrators.
         'admin'
    from public.profiles p
   where p.role = 'admin' and p.suspended = false and p.removed = false;

  return jsonb_build_object('review_required', true, 'change_id', change_id);
end;
$fn$;

-- `create or replace` keeps a function's existing privileges, so these are a
-- restatement rather than a repair. Kept so the file describes the whole of
-- what this function's access should be, instead of depending on a reader
-- knowing that 20260906000100 granted it.
revoke all on function public.submit_provider_profile(
  text, text, text, text, text, text, text, int,
  text, text, text, date, text, text, text
) from public, anon;
grant execute on function public.submit_provider_profile(
  text, text, text, text, text, text, text, int,
  text, text, text, date, text, text, text
) to authenticated;


-- ====================================================== 5. the read boundary

/*
 * Still personal first, and now scoped by audience as well.
 *
 * `user_id = auth.uid()` is unchanged, and remains the whole of the isolation
 * between two people: owner A cannot reach owner B's rows, a customer cannot
 * reach anybody's, and an administrator still reads no inbox but their own.
 * What the `case` adds is a second question for the two audiences that are not
 * the default — is this reader actually a company owner, is this reader
 * actually an administrator — answered inside Postgres, so a customer with
 * their own JWT and a hand-written PostgREST request gets nothing, rather than
 * whatever the browser was merely told not to draw.
 *
 * `else true` is the customer audience: a row addressed to a person as a
 * pilgrim needs no right beyond being that person.
 */
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for select to authenticated using (
    user_id = auth.uid()
    and case audience
          when 'owner' then public.is_provider_owner()
          when 'admin' then public.is_admin()
          else true
        end
  );

/*
 * The same predicate on the update side.
 *
 * Marking a notification read is the only update anybody makes, and a row that
 * cannot be read must not be markable either — otherwise the update policy
 * becomes a way to confirm that a row exists.
 */
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (
    user_id = auth.uid()
    and case audience
          when 'owner' then public.is_provider_owner()
          when 'admin' then public.is_admin()
          else true
        end
  )
  with check (user_id = auth.uid());

/*
 * And the update grant narrowed to the one column anyone is meant to write.
 *
 * `20260901000200` granted UPDATE on the whole table, which was wider than
 * anything asked for it: `markNotificationRead` and `markAllNotificationsRead`
 * set `{ read: true }` and nothing else, in either application. Table-wide, a
 * signed-in person could rewrite the title of their own notification — and,
 * now that there is one, could set `audience` to `customer` and put an owner
 * row back into the Customer Dashboard.
 *
 * That last one is why this belongs in this migration rather than a later
 * tidy-up: leaving it would mean the column added above could be edited away
 * from the client, which would make the boundary advisory. Column-level, the
 * only thing a browser may change about a notification is whether it has been
 * read.
 */
revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;


-- ====================================================== 6. what this changed

/*
 * After applying, this should return one row per audience with the counts you
 * expect — owner the bulk of them, admin a few, customer zero until the first
 * customer notification is ever written:
 *
 *     select audience, count(*) from public.notifications group by audience;
 *
 * And the reported account should still hold its owner history, now labelled:
 *
 *     select n.audience, count(*)
 *       from public.notifications n
 *       join public.profiles p on p.id = n.user_id
 *      where p.email = 'aljabrialzahra1@gmail.com'
 *      group by n.audience;
 *
 * Nothing has been deleted. Those rows stay, and stay readable in the Owner
 * Portal, which is where they were always addressed.
 */
