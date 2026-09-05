-- =============================================================================
-- NASEK — people editing their own details, safely
--
-- Two audiences, two entirely different problems.
--
-- A CUSTOMER's profile is theirs. Name, phone, wilayah, nationality — nobody
-- else has an interest in any of it, so the only rules are "your own row" (which
-- `profiles_update_self` already says) and "not the columns that decide what you
-- are". The one genuine subtlety is the email address, because it is also the
-- credential: changing `profiles.email` would desynchronise the profile from
-- `auth.users` and change nothing about how anybody signs in. So the column
-- becomes unwritable by its owner and is instead *followed* — a trigger copies
-- the address across after Supabase Auth has confirmed a change.
--
-- A CAMPAIGN OWNER's profile is not entirely theirs. Half of it is marketing —
-- a tagline, a description, a phone number — and half of it is the evidence
-- NASEK verified them on: the legal name, the commercial registration, the
-- permit number and the permit itself. An approved company that can quietly
-- swap its legal name and its licence is a company whose "Verified by NASEK"
-- badge means nothing, and today it can: `providers_update_own` allows the
-- update and the guard reverts only the verification flag.
--
-- So the columns are split. Marketing fields save immediately. Verification
-- fields cannot be written by an owner at all — the guard reverts them — and go
-- instead into `provider_profile_changes`, where an administrator approves or
-- refuses them. The badge stays on the old, checked information until somebody
-- has looked at the new.
--
-- WHILE HERE, TWO REGRESSIONS ARE REPAIRED
--
-- `20260905000100_admin_creates_owners.sql` recreated `guard_provider_privileges`
-- from the 2026-09-02 version and silently dropped two things the 2026-09-03
-- version had added:
--
--   * the `nasek.aggregating` exemption, without which the review-average
--     recompute is reverted by the guard it triggers;
--   * the `rejected -> pending` branch, without which `resubmit_provider`
--     writes a resubmission that the guard immediately puts back to `rejected`.
--
-- Both are restored below. This is the hazard of `create or replace` on a
-- function three migrations have touched, and the reason this one states the
-- whole body rather than assuming what came before.
-- =============================================================================

-- ============================================================ 1. the customer

alter table public.profiles add column if not exists nationality text;

comment on column public.profiles.nationality is
  'The account holder''s nationality, for prefilling a booking. Travellers on a '
  'booking keep their own — a person may book for family of another nationality, '
  'and the booking is where that matters.';

/**
 * Columns a person may not edit on their own profile.
 *
 * `email` joins the list, and it is the important addition. It is not a
 * privilege escalation like `role` — it is a *lie*: `auth.users` holds the
 * address anyone actually signs in with, and writing a different one here would
 * leave the interface showing an address that receives nothing. Worse, the
 * unique index would let somebody park another person's address on their own
 * profile row.
 *
 * Changing the real address goes through `supabase.auth.updateUser({ email })`,
 * which emails a confirmation to the new address and does nothing until it is
 * clicked. The trigger below then copies it here.
 *
 * Still reverting rather than raising, for the reason the original gives: a
 * REST update that sends the whole row back should succeed and quietly keep the
 * columns it was never allowed to touch.
 */
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- An administrator may set these. So may the trigger below, which runs with
  -- no `auth.uid()` at all because it fires on `auth.users`.
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;

  new.role        := old.role;
  new.suspended   := old.suspended;
  new.removed     := old.removed;
  new.provider_id := old.provider_id;
  new.created_at  := old.created_at;
  new.email       := old.email;
  return new;
end;
$fn$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

/**
 * Follow a confirmed email change from `auth.users` into `profiles`.
 *
 * Supabase's email change is a two-step: `updateUser({ email })` records a
 * pending address and emails it a link; only when that link is followed does
 * `auth.users.email` actually move. This fires on that move, which is exactly
 * the moment the profile should agree — and never before, so an unconfirmed
 * address never appears anywhere.
 *
 * The `is distinct from` guard matters: `auth.users` is updated on every
 * sign-in (last_sign_in_at, refresh tokens), and re-writing the profile on each
 * one would be a write amplification for nothing.
 */
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ======================================================= 2. the owner's guard

/**
 * Who may write what on a company — as a whitelist, not a blacklist.
 *
 * Every previous version of this function listed the columns an owner may *not*
 * write and let the rest through. That is the wrong way round for a table this
 * one, and the proof is that it was wrong: `commercial_registration`,
 * `permit_number`, `permit_expiry`, `licence_path` and both legal-name columns
 * were all added after the guard was written, none of them appeared on the deny
 * list, and an approved company could therefore replace its licence and its
 * legal identity while keeping the badge that says NASEK checked them.
 *
 * Inverting it fixes that permanently: a column added tomorrow is protected by
 * default and has to be named here to become editable. The cost is that this
 * list has to be maintained, which is precisely the point — adding a field to
 * the owner's form is now a decision about whether it is verification evidence.
 *
 * WHAT AN OWNER MAY WRITE DIRECTLY
 *   tagline, description, wilayah, governorate, address, phone, email,
 *   experience_years, initials, brand_color
 * — marketing and contact. Wrong, they are embarrassing; they are not evidence.
 *
 * EVERYTHING ELSE
 * reverted, including the legal name, the registration, the permit and its
 * expiry. Those move through `submit_provider_profile` into
 * `provider_profile_changes` and wait for an administrator.
 *
 * TWO TRANSACTION-LOCAL ESCAPE HATCHES, both pre-existing patterns:
 *   `nasek.aggregating`     the review-average recompute, which runs under
 *                           whoever wrote the review.
 *   `nasek.verified_write`  a definer function that has *already* checked
 *                           authorisation — `resubmit_provider`,
 *                           `review_provider_changes` — writing the
 *                           verification columns on purpose.
 * Both are `set_config(..., true)`, so they last one transaction and cannot be
 * set through PostgREST by a client.
 */
create or replace function public.guard_provider_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  verified_write boolean :=
    coalesce(current_setting('nasek.verified_write', true), 'off') = 'on';
  aggregating boolean :=
    coalesce(current_setting('nasek.aggregating', true), 'off') = 'on';
begin
  if tg_op = 'INSERT' then
    if public.is_admin() then
      return new;
    end if;
    -- No JWT: a definer function invoked out of band, which is the only way to
    -- reach this branch. `providers` has no INSERT policy or grant for any
    -- client role. See 20260905000100.
    if auth.uid() is null then
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

  if public.is_admin() then
    if new.verification is distinct from old.verification then
      new.verified_by := auth.uid();
      new.verified_at := now();
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

  -- ------------------------------------------------ everything else: an owner

  /*
   * A refused company correcting itself rejoins the queue.
   *
   * `resubmit_provider` writes `verification = 'pending'` and this is what lets
   * that stand — without it the guard puts the row straight back to `rejected`
   * and the owner's correction disappears with no error anywhere.
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

  new.id          := old.id;
  new.owner_id    := old.owner_id;
  new.plan        := old.plan;
  new.verified_by := old.verified_by;
  new.verified_at := old.verified_at;
  new.joined_at   := old.joined_at;
  new.created_at  := old.created_at;

  if not aggregating then
    new.rating       := old.rating;
    new.review_count := old.review_count;
  end if;

  /*
   * The verification evidence. This is the block the whole migration exists for.
   *
   * `verified_write` is on only inside a definer function that has already
   * established the caller may do this — a resubmission after a refusal, or an
   * administrator's approval of a pending change. An ordinary
   * `PATCH /providers?id=eq.…` from an owner's browser has it off, and every
   * one of these silently keeps its old value.
   */
  if not verified_write then
    new.name_ar                 := old.name_ar;
    new.name_en                 := old.name_en;
    new.commercial_registration := old.commercial_registration;
    new.permit_number           := old.permit_number;
    new.permit_expiry           := old.permit_expiry;
    new.licence_path            := old.licence_path;
    new.licence_file_name       := old.licence_file_name;
    new.licence_mime            := old.licence_mime;
    new.licence_image           := old.licence_image;
  end if;

  return new;
end;
$fn$;

drop trigger if exists providers_guard_privileges on public.providers;
create trigger providers_guard_privileges
  before insert or update on public.providers
  for each row execute function public.guard_provider_privileges();

-- ================================================= 3. proposed owner changes

/**
 * A change to verification-sensitive information, waiting to be read.
 *
 * `proposed` is JSON rather than a mirror of the provider columns, and that is
 * a deliberate trade. A shadow table would give type checking and would have to
 * be migrated in step with `providers` for ever; JSON records only what the
 * owner actually changed, which is also what an administrator wants to see —
 * a diff, not a second copy of a company.
 *
 * Only one row per company may be `pending`. A second submission supersedes the
 * first rather than queueing behind it: an administrator should review what the
 * owner believes to be true now, not a history of what they typed on Tuesday.
 */
create table if not exists public.provider_profile_changes (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references public.providers (id) on delete cascade,
  submitted_by uuid references public.profiles (id) on delete set null,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected', 'superseded')),
  /** Only the sensitive fields that differ from the live row, as {column: value}. */
  proposed     jsonb not null default '{}'::jsonb,
  /*
   * A replacement permit, if the submission carries one.
   *
   * Kept as its own columns rather than inside `proposed` because the
   * administrator's review dialog has to open the document, and a path buried
   * in JSON is a path somebody has to remember to look for. The object itself
   * lives in the private `provider-licences` bucket under the owner's folder,
   * exactly like the original — nothing about storage changes here.
   */
  licence_path      text,
  licence_file_name text,
  licence_mime      text,
  rejection_reason  text,
  created_at   timestamptz not null default now(),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz
);

create index if not exists provider_profile_changes_pending_idx
  on public.provider_profile_changes (provider_id, created_at desc)
  where status = 'pending';

alter table public.provider_profile_changes enable row level security;

/*
 * The owner reads their own; an administrator reads all.
 *
 * No insert, update or delete policy at all — both directions go through the
 * definer functions below, which is what stops an owner writing themselves an
 * `approved` row. A table whose only writers are functions that check
 * authorisation in code is a table with nothing to get wrong in a policy.
 */
drop policy if exists provider_changes_read on public.provider_profile_changes;
create policy provider_changes_read on public.provider_profile_changes
  for select to authenticated
  using (public.owns_provider(provider_id) or public.is_admin());

grant select on public.provider_profile_changes to authenticated;

-- =============================================== 4. an owner submits a change

/**
 * Save what an owner may save, and queue what they may not.
 *
 * One call, because the owner pressed one button. Splitting it into "save the
 * safe half" and "submit the rest" would put the seam in the interface, where
 * a failure between the two leaves a company half-updated and nobody sure
 * which half.
 *
 * The marketing fields are applied to `providers` directly — the policy allows
 * it and the guard permits those columns. The verification fields are compared
 * against the live row and only the *differences* are recorded, so an owner who
 * edits their phone number and re-saves the form does not raise a review of a
 * legal name they never touched.
 *
 * A company that is not yet `verified` is a special case and takes the direct
 * path for everything: there is no approved information to protect, and making
 * a pending company wait for a review of a change to an application that is
 * itself still in review would be a queue inside a queue.
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
  insert into public.notifications (user_id, kind, title_ar, title_en, body_ar, body_en)
  select p.id, 'system',
         'تحديث بيانات صاحب حملة بانتظار المراجعة',
         'A campaign owner profile update is awaiting review',
         'قدّمت «' || company.name_ar || '» تعديلاً على بياناتها الموثّقة.',
         '"' || company.name_en || '" has submitted a change to its verified details.'
    from public.profiles p
   where p.role = 'admin' and p.suspended = false and p.removed = false;

  return jsonb_build_object('review_required', true, 'change_id', change_id);
end;
$fn$;

revoke all on function public.submit_provider_profile(
  text, text, text, text, text, text, text, int,
  text, text, text, date, text, text, text
) from public, anon;
grant execute on function public.submit_provider_profile(
  text, text, text, text, text, text, text, int,
  text, text, text, date, text, text, text
) to authenticated;

-- ============================================ 5. an administrator reviews it

/**
 * Approve or refuse a proposed change to a company's verified details.
 *
 * On approval the JSON is applied to `providers`, with `verified_write` on —
 * the one place other than a resubmission where those columns legitimately
 * move. The company keeps its `verified` badge because an administrator has
 * just re-checked what the badge is about, which is the whole point of routing
 * the change through here rather than letting the owner write it.
 *
 * On refusal nothing is applied. The live row still holds the information NASEK
 * approved, and the owner is told why in the words the administrator used.
 *
 * A refusal needs a reason, for the same reason `set_provider_status` demands
 * one: an owner who cannot tell what was wrong cannot correct it, and will
 * submit the same thing again.
 */
create or replace function public.review_provider_changes(
  p_change_id uuid,
  p_approve   boolean,
  p_reason    text default null
)
returns public.provider_profile_changes
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  entry   public.provider_profile_changes;
  company public.providers;
  owner   uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;

  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'A refusal needs a reason the owner can act on'
      using errcode = 'check_violation';
  end if;

  select * into entry
    from public.provider_profile_changes
   where id = p_change_id
   for update;

  if not found then
    raise exception 'No such change' using errcode = 'no_data_found';
  end if;
  if entry.status <> 'pending' then
    raise exception 'That change has already been decided'
      using errcode = 'check_violation';
  end if;

  select * into company from public.providers where id = entry.provider_id;
  select pr.owner_id into owner from public.providers pr where pr.id = entry.provider_id;

  if p_approve then
    perform set_config('nasek.verified_write', 'on', true);
    update public.providers
       set name_ar = coalesce(entry.proposed ->> 'name', name_ar),
           name_en = coalesce(entry.proposed ->> 'name', name_en),
           -- `?` distinguishes "the owner cleared this" from "the owner did not
           -- touch it". Without it, clearing a commercial registration would be
           -- indistinguishable from leaving it alone, and could never be done.
           commercial_registration = case
             when entry.proposed ? 'commercial_registration'
               then entry.proposed ->> 'commercial_registration'
             else commercial_registration
           end,
           permit_number = case
             when entry.proposed ? 'permit_number'
               then entry.proposed ->> 'permit_number'
             else permit_number
           end,
           permit_expiry = case
             when entry.proposed ? 'permit_expiry'
               then (entry.proposed ->> 'permit_expiry')::date
             else permit_expiry
           end,
           licence_path      = coalesce(entry.licence_path, licence_path),
           licence_file_name = coalesce(entry.licence_file_name, licence_file_name),
           licence_mime      = coalesce(entry.licence_mime, licence_mime)
     where id = entry.provider_id;
    perform set_config('nasek.verified_write', 'off', true);
  end if;

  update public.provider_profile_changes
     set status           = case when p_approve then 'approved' else 'rejected' end,
         rejection_reason = case when p_approve then null else nullif(trim(p_reason), '') end,
         reviewed_by      = auth.uid(),
         reviewed_at      = now()
   where id = entry.id
   returning * into entry;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (
    auth.uid(),
    case when p_approve then 'profile_change_approved' else 'profile_change_rejected' end,
    'provider', entry.provider_id::text,
    jsonb_build_object('change', entry.proposed, 'reason', entry.rejection_reason)
  );

  if p_approve then
    perform public.notify_user(
      owner, 'system',
      'تم اعتماد تعديل بيانات شركتك',
      'Your company details have been approved',
      'تم اعتماد التعديل الذي قدّمته على بيانات شركتك الموثّقة.',
      'The change you submitted to your verified company details has been approved.'
    );
    perform public.queue_email(
      company.email, 'owner_profile_approved',
      'تم اعتماد تعديل بياناتك',
      'Your NASEK company details were approved',
      'تم اعتماد التعديل الذي قدّمته على بيانات شركتك الموثّقة.',
      'The change you submitted to your verified company details has been approved.',
      jsonb_build_object('provider_id', entry.provider_id)
    );
  else
    perform public.notify_user(
      owner, 'system',
      'لم يُعتمد تعديل بيانات شركتك',
      'Your company details change was not approved',
      coalesce(entry.rejection_reason, ''),
      coalesce(entry.rejection_reason, '')
    );
    perform public.queue_email(
      company.email, 'owner_profile_rejected',
      'بخصوص تعديل بيانات شركتك',
      'About the change to your NASEK company details',
      'لم يُعتمد التعديل. السبب: ' || coalesce(entry.rejection_reason, ''),
      'Your change was not approved. Reason: ' || coalesce(entry.rejection_reason, ''),
      jsonb_build_object('provider_id', entry.provider_id, 'reason', entry.rejection_reason)
    );
  end if;

  return entry;
end;
$fn$;

revoke all on function public.review_provider_changes(uuid, boolean, text) from public, anon;
grant execute on function public.review_provider_changes(uuid, boolean, text) to authenticated;
