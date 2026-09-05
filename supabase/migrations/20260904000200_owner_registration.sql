-- =============================================================================
-- NASEK — what a campaign owner actually has to tell us
--
-- The registration form asked for a company name, a tagline, years of trading
-- and a photograph of a permit. That is enough to identify a company and not
-- nearly enough to verify one: an administrator looking at the queue could see
-- a scanned licence and had nowhere to check the number on it against, no
-- expiry date to notice had passed, no commercial registration, and no address.
--
-- The columns below are the rest of that application. They are all nullable,
-- because rows registered before this migration exist and must not become
-- invalid retrospectively — the *form* is what makes them required, and the
-- administrator's screen is what shows an old row as incomplete.
--
-- This file also does three other things that belong with it:
--
--   * widens the permit bucket to accept PDF, because an official licence
--     arrives as a PDF at least as often as a photograph;
--   * rewrites `register_provider` / `resubmit_provider` to carry the new
--     fields — dropped and recreated, not overloaded, for the reason
--     20260902000200 gives: PostgREST resolves an RPC by its exact argument
--     names, so an old signature left in place keeps answering and keeps
--     writing rows with half the application missing;
--   * makes `set_provider_status` tell the owner what was decided.
-- =============================================================================

-- --------------------------------------------------------------- 1. columns

alter table public.providers add column if not exists governorate text;
alter table public.providers add column if not exists address text;
alter table public.providers add column if not exists commercial_registration text;
alter table public.providers add column if not exists permit_number text;
alter table public.providers add column if not exists permit_expiry date;
-- What the uploaded permit *is*. The review dialog has to decide between an
-- <img> and an embedded PDF viewer, and guessing from the file extension is
-- how a PDF ends up rendered as a broken image icon on the one screen where
-- somebody has to read the document.
alter table public.providers add column if not exists licence_mime text;

-- ------------------------------------------------------ 2. permits as PDF too

/*
 * The bucket stays private. Only the allow-list changes.
 *
 * `application/pdf` is added and nothing else: this bucket holds official
 * documents and an HTML file served back from the Storage origin would run
 * there. The 8 MB ceiling is unchanged and still matches what the upload form
 * refuses first, so an oversized file is rejected in the browser with a
 * sentence rather than by the API with a status code.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'provider-licences',
  'provider-licences',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------ 3. registration

drop function if exists public.register_provider(
  text, text, text, text, int, text, text, text, text, text, text, text
);

create or replace function public.register_provider(
  p_name_ar                 text,
  p_name_en                 text,
  p_tagline                 text default '',
  p_description             text default '',
  p_wilayah_id              text default null,
  p_governorate             text default null,
  p_address                 text default null,
  p_experience_years        int default 0,
  p_phone                   text default null,
  p_email                   text default null,
  p_initials                text default '?',
  p_brand_color             text default '#1c5e4c',
  p_commercial_registration text default null,
  p_permit_number           text default null,
  p_permit_expiry           date default null,
  p_licence_image           text default null,
  p_licence_file_name       text default null,
  p_licence_path            text default null,
  p_licence_mime            text default null
)
returns public.providers
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller  uuid := auth.uid();
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

  /*
   * The permit is mandatory here and not only on the form.
   *
   * The registration screen refuses to submit without one, which is the right
   * place to *say* so — but the screen is the half of this a determined caller
   * skips, and "no campaign is listed until somebody read the permit" is the
   * platform's entire proposition. A registration with nothing to read is not
   * an application, so it is refused where it cannot be argued with.
   */
  if coalesce(trim(p_licence_path), '') = ''
     and coalesce(trim(p_licence_image), '') = '' then
    raise exception 'A copy of the operating permit is required'
      using errcode = 'check_violation';
  end if;

  insert into public.providers (
    owner_id, name_ar, name_en, tagline_ar, tagline_en,
    description_ar, description_en, wilayah_id, governorate, address,
    verification, experience_years, phone, email, initials, brand_color, plan,
    commercial_registration, permit_number, permit_expiry,
    licence_image, licence_file_name, licence_path, licence_mime, submitted_at
  )
  values (
    caller, p_name_ar, p_name_en, p_tagline, p_tagline,
    -- One description, typed once, stored under both languages. NASEK does not
    -- ask an owner to write their company profile twice, and leaving one side
    -- empty would blank the company for readers of that language.
    coalesce(nullif(trim(p_description), ''), p_tagline),
    coalesce(nullif(trim(p_description), ''), p_tagline),
    p_wilayah_id, p_governorate, p_address,
    'pending',
    greatest(coalesce(p_experience_years, 0), 0),
    p_phone, p_email, p_initials, coalesce(p_brand_color, '#1c5e4c'), 'basic',
    p_commercial_registration, p_permit_number, p_permit_expiry,
    p_licence_image, p_licence_file_name, p_licence_path, p_licence_mime, now()
  )
  returning * into created;

  update public.profiles
     set role = 'provider', provider_id = created.id
   where id = caller;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (caller, 'register', 'provider', created.id::text,
          jsonb_build_object('name', p_name_en, 'wilayah', p_wilayah_id));

  perform public.queue_email(
    p_email,
    'owner_registered',
    'تم استلام طلب التسجيل في ناسك',
    'NASEK — we have your registration',
    'تم استلام طلب التسجيل وسيتم مراجعته من قبل إدارة ناسك. سنخطرك فور اتخاذ القرار.',
    'We have received your registration and it is now with the NASEK team for review. We will write to you as soon as a decision is made.',
    jsonb_build_object('provider_id', created.id, 'company', p_name_en)
  );

  return created;
end;
$fn$;

revoke all on function public.register_provider(
  text, text, text, text, text, text, text, int, text, text, text, text,
  text, text, date, text, text, text, text
) from public, anon;
grant execute on function public.register_provider(
  text, text, text, text, text, text, text, int, text, text, text, text,
  text, text, date, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------- 4. resubmission

drop function if exists public.resubmit_provider(
  text, text, text, text, int, text, text, text, text, text
);

create or replace function public.resubmit_provider(
  p_name_ar                 text,
  p_name_en                 text,
  p_tagline                 text default '',
  p_description             text default '',
  p_wilayah_id              text default null,
  p_governorate             text default null,
  p_address                 text default null,
  p_experience_years        int default 0,
  p_phone                   text default null,
  p_email                   text default null,
  p_commercial_registration text default null,
  p_permit_number           text default null,
  p_permit_expiry           date default null,
  p_licence_image           text default null,
  p_licence_file_name       text default null,
  p_licence_path            text default null,
  p_licence_mime            text default null
)
returns public.providers
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller uuid := auth.uid();
  target public.providers;
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
     set name_ar                 = p_name_ar,
         name_en                 = p_name_en,
         tagline_ar              = p_tagline,
         tagline_en              = p_tagline,
         description_ar          = coalesce(nullif(trim(p_description), ''), description_ar),
         description_en          = coalesce(nullif(trim(p_description), ''), description_en),
         wilayah_id              = coalesce(p_wilayah_id, wilayah_id),
         governorate             = coalesce(p_governorate, governorate),
         address                 = coalesce(p_address, address),
         experience_years        = greatest(coalesce(p_experience_years, 0), 0),
         phone                   = coalesce(p_phone, phone),
         email                   = coalesce(p_email, email),
         commercial_registration = coalesce(p_commercial_registration, commercial_registration),
         permit_number           = coalesce(p_permit_number, permit_number),
         permit_expiry           = coalesce(p_permit_expiry, permit_expiry),
         licence_image           = coalesce(p_licence_image, licence_image),
         licence_file_name       = coalesce(p_licence_file_name, licence_file_name),
         licence_path            = coalesce(p_licence_path, licence_path),
         licence_mime            = coalesce(p_licence_mime, licence_mime),
         verification            = 'pending',
         rejection_reason        = null,
         submitted_at            = now()
   where id = target.id
   returning * into target;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (caller, 'resubmit', 'provider', target.id::text,
          jsonb_build_object('name', p_name_en));

  return target;
end;
$fn$;

revoke all on function public.resubmit_provider(
  text, text, text, text, text, text, text, int, text, text,
  text, text, date, text, text, text, text
) from public, anon;
grant execute on function public.resubmit_provider(
  text, text, text, text, text, text, text, int, text, text,
  text, text, date, text, text, text, text
) to authenticated;

-- ------------------------------------------- 5. telling the owner what happened

/**
 * The administrator's decision on a company, and the message that goes with it.
 *
 * Same contract as before — admin only, a refusal needs a reason, one row and
 * one audit entry — with the notification and the queued email written inside
 * the same transaction. That placement is the point: an approval that commits
 * and a message that does not is how an owner sits on a "قيد المراجعة" screen
 * for a week after being approved, and the reverse — a message about a decision
 * that rolled back — is worse.
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
as $fn$
declare
  updated public.providers;
  before  public.verification_status;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;

  if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'A refusal needs a reason the owner can act on'
      using errcode = 'check_violation';
  end if;

  select verification into before from public.providers where id = p_provider_id;

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

  -- Nothing changed, so there is nothing to announce. Re-approving an approved
  -- company is a no-op an administrator may well do by accident, and it should
  -- not send them a second congratulatory email.
  if before is not distinct from p_status then
    return updated;
  end if;

  if p_status = 'verified' then
    perform public.notify_user(
      updated.owner_id, 'system',
      'تم اعتماد حسابك في ناسك',
      'Your NASEK account is approved',
      'تم اعتماد شركتك ويمكنك الآن إضافة الحملات. تخضع كل حملة لمراجعة الإدارة قبل نشرها.',
      'Your company has been approved. You can now create campaigns — each one is reviewed by NASEK before it appears publicly.'
    );
    perform public.queue_email(
      updated.email,
      'owner_approved',
      'تم اعتماد حسابك في منصة ناسك',
      'Your NASEK campaign owner account is approved',
      'تم اعتماد شركتك في منصة ناسك. يمكنك الآن الدخول إلى بوابة أصحاب الحملات وإضافة حملاتك.',
      'Your company has been approved on NASEK. You can now sign in to the Campaign Owner Portal and publish your campaigns.',
      jsonb_build_object('provider_id', updated.id)
    );
  elsif p_status = 'rejected' then
    perform public.notify_user(
      updated.owner_id, 'system',
      'تم رفض الطلب',
      'Your registration was refused',
      coalesce(updated.rejection_reason, ''),
      coalesce(updated.rejection_reason, '')
    );
    perform public.queue_email(
      updated.email,
      'owner_rejected',
      'بخصوص طلب التسجيل في ناسك',
      'About your NASEK registration',
      'تم رفض الطلب. السبب: ' || coalesce(updated.rejection_reason, ''),
      'Your registration was not approved. Reason: ' || coalesce(updated.rejection_reason, ''),
      jsonb_build_object('provider_id', updated.id, 'reason', updated.rejection_reason)
    );
  elsif p_status = 'suspended' then
    perform public.notify_user(
      updated.owner_id, 'system',
      'تم إيقاف حساب الشركة',
      'Your company account is suspended',
      coalesce(updated.rejection_reason, ''),
      coalesce(updated.rejection_reason, '')
    );
    perform public.queue_email(
      updated.email,
      'owner_suspended',
      'تم إيقاف حسابك في ناسك',
      'Your NASEK account has been suspended',
      'تم إيقاف حساب شركتك. السبب: ' || coalesce(updated.rejection_reason, ''),
      'Your company account has been suspended. Reason: ' || coalesce(updated.rejection_reason, ''),
      jsonb_build_object('provider_id', updated.id, 'reason', updated.rejection_reason)
    );
  end if;

  return updated;
end;
$fn$;

revoke all on function public.set_provider_status(uuid, public.verification_status, text)
  from public, anon;
grant execute on function public.set_provider_status(uuid, public.verification_status, text)
  to authenticated;

-- -------------------------------------------------- 6. the public view, again

/*
 * `providers_public` is recreated because a view's column list is fixed at
 * creation: adding columns to the table underneath does not add them here, and
 * dropping the view is the only way to change what it selects.
 *
 * What is added: `governorate`, because a pilgrim choosing between companies
 * has a legitimate interest in where one operates from. What is deliberately
 * still absent: the address, the commercial registration, the permit number and
 * its expiry, and every trace of the uploaded document. Those are what NASEK
 * verified *with*; publishing them would hand a forger the whole template.
 */
drop view if exists public.providers_public;
create view public.providers_public
with (security_invoker = false) as
  select id, name_ar, name_en, tagline_ar, tagline_en, description_ar, description_en,
         wilayah_id, governorate, verification, experience_years, rating, review_count,
         initials, brand_color, plan, joined_at
  from public.providers;

grant select on public.providers_public to anon, authenticated;
