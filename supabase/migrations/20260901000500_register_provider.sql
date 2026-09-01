-- =============================================================================
-- NASEK — registering as a campaign owner
--
-- This exists because of a tension the RLS migration creates on purpose.
--
-- `guard_profile_privileges` reverts any attempt by a non-administrator to
-- change their own `role` or `provider_id`. That is exactly right for 'admin' —
-- it is the line that makes the whole separation hold. But it also blocks the
-- legitimate case: a campaign owner registering their company genuinely does
-- need to become a 'provider' and be linked to it, and there is nobody else to
-- do it for them. Without this function, owner registration would need an
-- administrator to complete every signup by hand.
--
-- So the promotion happens here, in one SECURITY DEFINER function that the
-- caller cannot influence beyond its arguments. Note what it does *not* accept:
-- there is no role parameter, no owner id, and no verification status. It
-- always promotes the caller and nobody else, always to 'provider' and never to
-- 'admin', and always leaves the company `pending` — verification remains an
-- administrator's decision, made against the permit, exactly as before.
--
-- 'provider' is not a privileged role in the way 'admin' is. It grants control
-- over one company and the trips belonging to it, all of which the policies
-- scope to `owner_id = auth.uid()`. Granting it to yourself gets you authority
-- over a company you just created and nothing else.
-- =============================================================================

create or replace function public.register_provider(
  p_name_ar           text,
  p_name_en           text,
  p_tagline           text default '',
  p_wilayah_id        text default null,
  p_experience_years  int default 0,
  p_phone             text default null,
  p_email             text default null,
  p_initials          text default '?',
  p_brand_color       text default '#1c5e4c',
  p_licence_image     text default null,
  p_licence_file_name text default null
)
returns public.providers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  created public.providers;
begin
  if caller is null then
    raise exception 'You must be signed in to register a campaign'
      using errcode = 'insufficient_privilege';
  end if;

  -- One company per account. Without this, a repeated submit — a double click,
  -- a retried request — would leave an owner with two companies and their
  -- profile pointing at whichever was written last.
  if exists (select 1 from public.providers where owner_id = caller) then
    raise exception 'This account already has a registered campaign'
      using errcode = 'unique_violation';
  end if;

  insert into public.providers (
    owner_id, name_ar, name_en, tagline_ar, tagline_en,
    description_ar, description_en, wilayah_id, verification,
    experience_years, phone, email, initials, brand_color, plan,
    licence_image, licence_file_name
  )
  values (
    caller, p_name_ar, p_name_en, p_tagline, p_tagline,
    p_tagline, p_tagline, p_wilayah_id,
    -- Always pending. An owner cannot verify themselves, and the whole basis of
    -- the "Verified by NASEK" badge is that somebody looked at the permit.
    'pending',
    greatest(coalesce(p_experience_years, 0), 0),
    p_phone, p_email, p_initials, p_brand_color, 'basic',
    p_licence_image, p_licence_file_name
  )
  returning * into created;

  -- The promotion. Fixed to 'provider'; the caller has no say in it.
  update public.profiles
     set role = 'provider', provider_id = created.id
   where id = caller;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (caller, 'register', 'provider', created.id::text,
          jsonb_build_object('name', p_name_en, 'wilayah', p_wilayah_id));

  return created;
end;
$$;

revoke all on function public.register_provider(
  text, text, text, text, int, text, text, text, text, text, text
) from public, anon;
grant execute on function public.register_provider(
  text, text, text, text, int, text, text, text, text, text, text
) to authenticated;
