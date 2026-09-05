-- =============================================================================
-- NASEK — campaign owners are taken on, not signed up
--
-- Public self-registration is gone. An owner used to fill in a form on the
-- customer website, upload a permit and land in a queue; NASEK now creates the
-- company itself — an administrator enters the details, reads the permit, and
-- sends an invitation — and the owner's first contact with the platform is a
-- link to a portal that already knows who they are.
--
-- WHY THE CHANGE IS MORE THAN COSMETIC
--
-- The old queue conflated two jobs. "Is this permit genuine" is verification,
-- which is what NASEK is for. "Is this application real at all" is moderation,
-- which an open form makes somebody's daily work — and a queue that fills with
-- noise is a queue whose real entries wait behind it. Removing the form removes
-- the second job entirely: everything in the queue is now there because a human
-- at NASEK put it there.
--
-- WHAT THIS FILE ADDS
--
--   1. `admin_create_provider` — creates the company row for an auth account
--      the `admin-create-owner` Edge Function has just invited, and promotes
--      that account to `provider`.
--   2. A narrow relaxation of `guard_provider_privileges`, so a definer
--      function running with no JWT can set `owner_id` itself.
--   3. Storage policies letting an administrator write a permit into the new
--      owner's folder — because at upload time the owner has an account but has
--      never signed in.
--
-- `register_provider` and `resubmit_provider` are deliberately left in place.
-- The first now has no caller and is kept only so that an existing deployment
-- mid-upgrade does not error; the second is how a *refused* company corrects
-- itself from inside the portal, which is still a thing that happens.
-- =============================================================================

-- ------------------------------------------------------------- 1. the guard

/**
 * Who may write what on a company.
 *
 * Unchanged except for one branch, and that branch is worth stating precisely
 * because it looks at first glance like a hole.
 *
 * The insert path used to end with `new.owner_id := auth.uid()` for every
 * non-administrator, which is right for a self-registration — the caller *is*
 * the owner — and impossible for an invitation, where the caller is a definer
 * function running under the service role with no JWT at all and `auth.uid()`
 * is null. Left alone it would write a company owned by nobody.
 *
 * So: when there is no `auth.uid()`, the supplied `owner_id` is honoured. That
 * is safe because there is no client path to this table at all — `providers`
 * has **no INSERT policy**, for anyone, and the grants deliberately omit
 * INSERT. The only things that can reach this branch are SECURITY DEFINER
 * functions granted to named roles, and each of those states its own
 * authorisation in code. The trigger is belt-and-braces around a door that is
 * already shut.
 */
create or replace function public.guard_provider_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if public.is_admin() then
      return new;
    end if;

    -- No JWT: a definer function invoked out of band, which is the only way to
    -- get here. See the note above for why the supplied owner is trusted.
    if auth.uid() is null then
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
$fn$;

drop trigger if exists providers_guard_privileges on public.providers;
create trigger providers_guard_privileges
  before insert or update on public.providers
  for each row execute function public.guard_provider_privileges();

-- ------------------------------------------------- 2. creating an owner

/**
 * Create a campaign owner's company, on behalf of an administrator.
 *
 * Granted to `service_role` alone — the same grant `promote_to_admin` carries,
 * and for the same reason. The caller is the `admin-create-owner` Edge
 * Function, which has already checked, using the administrator's own JWT
 * against `is_admin()`, that the person clicking the button is entitled to; and
 * which has already created the auth account whose id arrives here as
 * `p_owner_id`.
 *
 * The split is deliberate. Creating an auth user needs the service role and
 * cannot happen in SQL; deciding what a company row may contain is a database
 * concern and should not be reimplemented in TypeScript. Each half does the
 * part it is actually able to do properly.
 *
 * `p_verification` lets an administrator take on a company that is already
 * checked — which is the ordinary case, since they have the permit in front of
 * them — while still allowing `pending` for one taken on provisionally. It is
 * constrained to those two values: an administrator has no reason to create a
 * company that is already refused or suspended, and allowing it would mean an
 * owner's first sight of NASEK was a rejection.
 */
create or replace function public.admin_create_provider(
  p_owner_id                uuid,
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
  p_licence_path            text default null,
  p_licence_file_name       text default null,
  p_licence_mime            text default null,
  p_verification            public.verification_status default 'verified'
)
returns public.providers
-- Deliberately NOT `returns null on null input`. Half these arguments are
-- optional by design — a sole trader may hold no commercial registration, a
-- permit may be open-ended — and a STRICT function is skipped entirely the
-- moment any argument is NULL, yielding NULL without creating anything and
-- without raising. The body does its own NULL handling with `coalesce` and
-- `nullif`. See 20260906000200, which repairs a database that already has it.
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  created public.providers;
begin
  if p_verification not in ('verified', 'pending') then
    raise exception 'A company can only be created as verified or pending'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.providers where owner_id = p_owner_id) then
    raise exception 'This account already has a registered campaign'
      using errcode = 'unique_violation';
  end if;

  /*
   * The permit is required here exactly as it was on the old registration form.
   *
   * The audience changed — an administrator uploads it now, having looked at
   * it — and the rule did not: NASEK's whole proposition to a pilgrim is that
   * somebody read the licence before the trips appeared. A company created with
   * nothing on file would be a verification badge resting on nobody's memory.
   */
  if coalesce(trim(p_licence_path), '') = '' then
    raise exception 'A copy of the operating permit is required'
      using errcode = 'check_violation';
  end if;

  insert into public.providers (
    owner_id, name_ar, name_en, tagline_ar, tagline_en,
    description_ar, description_en, wilayah_id, governorate, address,
    verification, experience_years, phone, email, initials, plan,
    commercial_registration, permit_number, permit_expiry,
    licence_path, licence_file_name, licence_mime, submitted_at,
    verified_at
  )
  values (
    p_owner_id, p_name_ar, p_name_en, p_tagline, p_tagline,
    coalesce(nullif(trim(p_description), ''), p_tagline),
    coalesce(nullif(trim(p_description), ''), p_tagline),
    p_wilayah_id, p_governorate, p_address,
    p_verification,
    greatest(coalesce(p_experience_years, 0), 0),
    p_phone, p_email,
    coalesce(nullif(trim(substring(p_name_en from 1 for 1)), ''), '?'),
    'basic',
    p_commercial_registration, p_permit_number, p_permit_expiry,
    p_licence_path, p_licence_file_name, p_licence_mime, now(),
    case when p_verification = 'verified' then now() else null end
  )
  returning * into created;

  update public.profiles
     set role = 'provider', provider_id = created.id
   where id = p_owner_id;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (
    null, 'create', 'provider', created.id::text,
    jsonb_build_object('name', p_name_en, 'by', 'admin-create-owner', 'status', p_verification)
  );

  /*
   * No `queue_email` here, and that is not an omission.
   *
   * The invitation is sent by Supabase Auth from the Edge Function that called
   * this — one message, carrying the link that lets the owner set a password.
   * Queueing a second "your company has been created" beside it would arrive at
   * the same inbox seconds apart saying almost the same thing, and the one an
   * owner needs is the one with the link in it.
   *
   * The in-app notification is worth writing, because it is waiting for them
   * the moment they arrive.
   */
  perform public.notify_user(
    p_owner_id, 'system',
    'مرحباً بك في ناسِك',
    'Welcome to NASEK',
    case
      when p_verification = 'verified'
        then 'تم إنشاء حساب شركتك واعتماده. يمكنك الآن إضافة حملاتك، وتخضع كل حملة لمراجعة الإدارة قبل نشرها.'
      else 'تم إنشاء حساب شركتك وهو قيد المراجعة لدى فريق ناسِك.'
    end,
    case
      when p_verification = 'verified'
        then 'Your company account has been created and approved. You can add campaigns now — each one is reviewed by NASEK before it appears publicly.'
      else 'Your company account has been created and is with the NASEK team for review.'
    end
  );

  return created;
end;
$fn$;

revoke all on function public.admin_create_provider(
  uuid, text, text, text, text, text, text, text, int, text, text,
  text, text, date, text, text, text, public.verification_status
) from public, anon, authenticated;
grant execute on function public.admin_create_provider(
  uuid, text, text, text, text, text, text, text, int, text, text,
  text, text, date, text, text, text, public.verification_status
) to service_role;

-- --------------------------------------------- 3. an administrator's upload

/*
 * An administrator may write anywhere in the permit bucket.
 *
 * The existing policy scopes writes to `<auth.uid()>/…`, which is exactly right
 * for an owner uploading their own document and impossible for an administrator
 * uploading somebody else's: the file has to land under the *new owner's*
 * folder, because that is what the read policy is written about and what lets
 * that owner see their own permit in the portal afterwards.
 *
 * The alternative — letting the administrator keep it under their own uid —
 * would work for the review screen and leave the owner unable to read the
 * document NASEK holds about them, which is the wrong answer to a reasonable
 * question.
 *
 * Read is unchanged: the owner of the folder, or an administrator. The bucket
 * is still private and every view is still a signed URL that expires.
 */
drop policy if exists "licences: admin uploads for any owner" on storage.objects;
create policy "licences: admin uploads for any owner" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'provider-licences' and public.is_admin());

drop policy if exists "licences: admin replaces any file" on storage.objects;
create policy "licences: admin replaces any file" on storage.objects
  for update to authenticated
  using (bucket_id = 'provider-licences' and public.is_admin())
  with check (bucket_id = 'provider-licences' and public.is_admin());
