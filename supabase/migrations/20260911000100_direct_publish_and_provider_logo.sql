-- =============================================================================
-- NASEK — the company is approved, not each of its trips; and a company has a
-- logo
--
-- Two changes, in one file because they touch the same table and the same
-- guard, and because keeping them apart would mean two SQL Editor runs for one
-- deployment.
--
-- =============================================================================
-- PART A — approval moves to the company, and stays there
-- =============================================================================
--
-- 20260904000300 put every individual trip through an administrator. That was
-- the right instinct aimed at the wrong object: NASEK verifies *companies* —
-- their commercial registration, their ministry permit, the document behind
-- both — and a company that has passed that does not need permission to publish
-- its own timetable. What the queue actually produced was a delay between an
-- owner pressing Publish and a pilgrim being able to book, on a platform whose
-- whole product is that the trip is bookable.
--
-- So the approval requirement is not being removed. It is being kept exactly
-- where the evidence is:
--
--   COMPANY   approval REQUIRED, unchanged. `set_provider_status`, the
--             verification queue, the permit review and the profile-change
--             review all stand untouched by this file.
--   TRIP      no approval. An approved company presses Publish and the trip is
--             live; an unapproved one cannot insert a trip at all.
--
-- WHAT ENFORCES IT, AND WHERE
--
-- In the guard, not in the browser. `guard_campaign_moderation` now refuses the
-- INSERT outright when the company is not eligible — previously an unapproved
-- owner *could* create a trip, it simply sat invisible in a queue, which is a
-- different and weaker promise. Eligibility is `provider_can_publish`, added
-- below: verified, and with an owner account that is neither suspended nor
-- removed. `campaigns_read` is deliberately NOT touched; it already withholds a
-- trip whose company is not verified, which is what keeps a company suspended
-- *after* publishing from leaving its trips on the public site.
--
-- WHAT GOES
--
-- The material-edit branch. Changing a price used to send a live trip back to
-- the queue; with no queue to go back to, that would strand it invisible for
-- ever. An approved company may correct its own listing, which is the same
-- trust the approval already extended.
--
-- WHAT STAYS
--
-- `set_campaign_status`, because an administrator still has to be able to take
-- a bad trip down — and `suspended`, which is the other lever, is untouched.
-- Its wording is corrected: it used to announce "your campaign is approved",
-- which was true of a queue and is now false of everything except an
-- administrator reinstating something they had taken down.
--
-- =============================================================================
-- PART B — a company has one logo
-- =============================================================================
--
-- One column, one RPC, and NO new storage infrastructure. `campaign-images` is
-- already a public bucket that accepts exactly PNG, JPEG and WebP, already
-- policed so that a file may only be written, replaced or deleted inside a
-- folder named for the uploader's own account, and already read by anonymous
-- visitors over the CDN — which is every property a company logo needs. A
-- second bucket would be the same bucket with a different name.
--
-- The logo is on the *company*, so every trip that company runs shows it
-- without an owner uploading anything per trip.
--
-- AND IT IS NOT VERIFICATION EVIDENCE
--
-- This matters more than it looks. `submit_provider_profile` splits an owner's
-- fields in two: the presentational ones apply immediately, and the ones NASEK
-- checked the company against — its registered name, commercial registration,
-- permit number and expiry, the permit scan — are queued for an administrator
-- when the company is already verified. A logo is presentation. It applies
-- immediately, it does not open a profile-change review, and it does not touch
-- `campaigns` at all, so changing it cannot move a single trip.
-- =============================================================================


-- ==========================================================================
-- PART A
-- ==========================================================================

-- ------------------------------------------------------- 1. eligibility

/**
 * May this company publish?
 *
 * Stricter than `provider_approved`, which asks only whether the company row
 * says 'verified'. Publishing is an action taken by a person, so the person's
 * account has to be in good standing too: an owner whose profile an
 * administrator has suspended or removed cannot put new trips on the platform
 * by virtue of the company still being marked verified.
 *
 * `provider_approved` is left exactly as it is. It answers a different question
 * — "may a pilgrim see this company's trips" — and `campaigns_read` asks it on
 * every catalogue query, where the extra join would be paid for by every
 * anonymous visitor on every page.
 */
create or replace function public.provider_can_publish(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.providers pr
    left join public.profiles p on p.id = pr.owner_id
    where pr.id = target
      and pr.verification = 'verified'
      and coalesce(p.suspended, false) = false
      and coalesce(p.removed, false) = false
  );
$$;

revoke all on function public.provider_can_publish(uuid) from public;
grant execute on function public.provider_can_publish(uuid) to authenticated, anon;


-- --------------------------------------------------------- 2. the guard

/**
 * Who may write what on a campaign — restated for direct publishing.
 *
 * Three changes from the 20260904000300 version, and nothing else moves:
 *
 *   1. INSERT refuses an ineligible company instead of accepting a trip into a
 *      queue. This is the load-bearing line of Part A: "an unapproved provider
 *      cannot publish" is now a refusal with a message, not an invisible row.
 *   2. INSERT writes 'active'. A trip by an approved company is live when it is
 *      saved.
 *   3. The material-edit branch is gone. An approved company correcting its own
 *      price or dates keeps the trip live; there is no queue for it to return
 *      to, and sending it to one would take a bookable trip off the site with
 *      no way back.
 *
 * Everything the older guard protected, it still protects. `suspended`,
 * `featured`, `rating` and `review_count` are reverted on every owner write,
 * and so are `status`, `rejection_reason`, `reviewed_by` and `reviewed_at` —
 * an owner still cannot reinstate a trip an administrator has taken down.
 */
create or replace function public.guard_campaign_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- An administrator writes these columns directly; `set_campaign_status` is
  -- the route the dashboard uses, and it is also an admin.
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    /*
     * The company gate, stated where it cannot be skipped.
     *
     * The portal checks this too and shows the owner a readable explanation,
     * but the portal is not the only thing that can POST to `campaigns`. The
     * message is deliberately the same sentence the interface shows.
     */
    if not public.provider_can_publish(new.provider_id) then
      raise exception 'Your company must be approved by Admin before you can publish trips'
        using errcode = 'check_violation';
    end if;

    new.suspended        := false;
    new.featured         := false;
    new.rating           := 0;
    new.review_count     := 0;
    -- Live on save. No queue, no pending_approval.
    new.status           := 'active';
    new.rejection_reason := null;
    new.reviewed_by      := null;
    new.reviewed_at      := now();
    new.submitted_at     := now();
    return new;
  end if;

  new.suspended    := old.suspended;
  new.featured     := old.featured;
  new.rating       := old.rating;
  new.review_count := old.review_count;

  /*
   * Still never the owner's to move.
   *
   * An administrator can deactivate a trip with `set_campaign_status`; without
   * these five lines the owner could simply save the row back to 'active' and
   * undo it. Removing the *queue* does not mean removing moderation.
   */
  new.status           := old.status;
  new.rejection_reason := old.rejection_reason;
  new.reviewed_by      := old.reviewed_by;
  new.reviewed_at      := old.reviewed_at;
  new.submitted_at     := old.submitted_at;

  return new;
end;
$fn$;

drop trigger if exists campaigns_guard_moderation on public.campaigns;
create trigger campaigns_guard_moderation
  before insert or update on public.campaigns
  for each row execute function public.guard_campaign_moderation();


-- ------------------------------------------- 3. the trips already queued

/**
 * What happens to a trip that is sitting in a queue that no longer exists.
 *
 * Not "activate everything". Three groups, treated differently, and the
 * distinction is the whole point:
 *
 *   * `pending_approval` whose company is eligible — these are trips an
 *     approved company submitted and would, under the new model, have
 *     published directly. They go live. Leaving them pending would strand them
 *     invisible for ever, since nothing will ever review them.
 *   * `pending_approval` whose company is NOT eligible — unapproved, suspended,
 *     or with a barred owner. These stay exactly where they are. The new model
 *     says an ineligible company's trips are not public, and that must hold for
 *     the backlog as much as for a new insert.
 *   * `rejected` — an administrator looked at these and said no. That decision
 *     is not this migration's to reverse, whatever the company's standing. They
 *     stay refused, and an administrator can reinstate one with
 *     `set_campaign_status` if they choose.
 *
 * Every activation is written to `admin_audit` with a null actor, which is how
 * this schema already records a decision no person made. Re-running the file
 * is safe: the second pass finds nothing in `pending_approval` to move.
 */
insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
select
  null,
  'campaign_auto_activated',
  'campaign',
  c.id::text,
  jsonb_build_object(
    'from', 'pending_approval',
    'to', 'active',
    'reason', 'individual trip approval retired by 20260911000100'
  )
from public.campaigns c
where c.status = 'pending_approval'
  and public.provider_can_publish(c.provider_id);

update public.campaigns c
   set status      = 'active',
       reviewed_at = coalesce(c.reviewed_at, now())
 where c.status = 'pending_approval'
   and public.provider_can_publish(c.provider_id);


-- ----------------------------------------- 4. the administrator's lever

/**
 * Take a trip down, or put it back.
 *
 * Same function, same signature, same audit entry — an administrator still
 * needs this and Part A does not change that. Two things are corrected:
 *
 *   1. `pending_approval` is refused. There is no queue to send a trip to, and
 *      a trip moved there would be invisible with nothing scheduled to look at
 *      it. 'rejected' is how a trip is taken down, and 'active' puts it back.
 *   2. The wording. It announced "تم اعتماد حملتك / Your campaign is approved",
 *      which described a queue. Publishing no longer passes through here, so
 *      the only thing this function can now announce is a moderation decision,
 *      and it says so.
 */
create or replace function public.set_campaign_status(
  p_campaign_id uuid,
  p_status      public.campaign_status,
  p_reason      text default null
)
returns public.campaigns
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  updated public.campaigns;
  before  public.campaign_status;
  company public.providers;
  owner   uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may change a campaign''s status'
      using errcode = 'insufficient_privilege';
  end if;

  select status into before from public.campaigns where id = p_campaign_id;
  if not found then
    raise exception 'No such campaign' using errcode = 'no_data_found';
  end if;

  if p_status = 'pending_approval' then
    raise exception 'Individual trips are no longer reviewed; deactivate the trip instead'
      using errcode = 'check_violation';
  end if;

  if p_status = 'rejected' and nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required when taking a trip down'
      using errcode = 'check_violation';
  end if;

  /*
   * Reinstating a trip whose company is no longer verified would produce a row
   * marked 'active' that `campaigns_read` still hides — an administrator would
   * believe they had put it back and the owner would be told it was live.
   */
  if p_status = 'active' then
    select p.* into company
      from public.providers p
      join public.campaigns c on c.provider_id = p.id
     where c.id = p_campaign_id;

    if company.verification <> 'verified' then
      raise exception 'That company is not verified, so its trips cannot be shown'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.campaigns
     set status           = p_status,
         rejection_reason = case
           when p_status = 'rejected' then nullif(trim(p_reason), '')
           else null
         end,
         reviewed_by      = auth.uid(),
         reviewed_at      = now()
   where id = p_campaign_id
   returning * into updated;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (
    auth.uid(), 'campaign_status', 'campaign', updated.id::text,
    jsonb_build_object('from', before, 'to', p_status, 'reason', nullif(trim(p_reason), ''))
  );

  if before is not distinct from p_status then
    return updated;
  end if;

  select pr.owner_id into owner
    from public.providers pr where pr.id = updated.provider_id;

  if p_status = 'active' then
    perform public.notify_user(
      owner, 'trip',
      'تمت إعادة تفعيل رحلتك',
      'Your trip has been reinstated',
      'أعادت إدارة ناسِك تفعيل رحلتك، وهي الآن معروضة للحجز.',
      'NASEK has reinstated your trip. It is listed and open for bookings again.'
    );
  elsif p_status = 'rejected' then
    perform public.notify_user(
      owner, 'trip',
      'تم إيقاف رحلتك',
      'Your trip has been deactivated',
      coalesce(updated.rejection_reason, ''),
      coalesce(updated.rejection_reason, '')
    );
    perform public.queue_email(
      (select pr.email from public.providers pr where pr.id = updated.provider_id),
      'campaign_deactivated',
      'بخصوص رحلتك في ناسِك',
      'About your NASEK trip',
      'أوقفت إدارة ناسِك عرض رحلتك. السبب: ' || coalesce(updated.rejection_reason, ''),
      'NASEK has taken your trip off the site. Reason: ' || coalesce(updated.rejection_reason, ''),
      jsonb_build_object('campaign_id', updated.id, 'reason', updated.rejection_reason)
    );
  end if;

  return updated;
end;
$fn$;

revoke all on function public.set_campaign_status(uuid, public.campaign_status, text)
  from public, anon;
grant execute on function public.set_campaign_status(uuid, public.campaign_status, text)
  to authenticated;


-- ==========================================================================
-- PART B — the company logo
-- ==========================================================================

-- ---------------------------------------------------------- 5. the column

/*
 * A path, never a URL and never the image itself.
 *
 * The same rule `campaigns.images` and `providers.licence_path` follow: a path
 * survives the project changing domain, it is what the storage policies are
 * written about, and a signed or rendered URL is derived at the moment of
 * display. `licence_image` — the prototype's base64 column — is the thing this
 * is deliberately not.
 *
 * Nullable, with no default and no backfill. A company that has not uploaded a
 * logo has not uploaded a logo, and every screen already knows how to draw the
 * initials-and-brand-colour monogram instead.
 */
alter table public.providers add column if not exists logo_path text;

comment on column public.providers.logo_path is
  'Object path in the public `campaign-images` bucket, shaped <owner_uid>/logo-<ts>.<ext>. '
  'NULL means no logo; every surface falls back to the initials monogram. Never a URL.';

/*
 * The public view has to carry it, or no pilgrim can see a logo.
 *
 * A view's column list is fixed at creation, so adding a column to `providers`
 * does not add it here — the view has to be recreated. Everything else about it
 * is reproduced exactly: the address, the commercial registration, the permit
 * number and its expiry, and every trace of the uploaded document stay out,
 * because those are what NASEK verified the company *with*.
 */
drop view if exists public.providers_public;
create view public.providers_public
with (security_invoker = false) as
  select id, name_ar, name_en, tagline_ar, tagline_en, description_ar, description_en,
         wilayah_id, governorate, verification, experience_years, rating, review_count,
         initials, brand_color, logo_path, plan, joined_at
  from public.providers;

grant select on public.providers_public to anon, authenticated;


-- ------------------------------------------------------------- 6. the RPC

/**
 * Set, replace or remove a company's logo.
 *
 * A function rather than a column update for one reason that is not obvious:
 * `guard_provider_privileges` does not revert `logo_path`, so an owner *could*
 * PATCH it directly — and could therefore point their company's logo at any
 * object path they liked, including one in another company's folder. Nothing
 * leaks (the bucket is public to read), but a company's logo should be a file
 * that company uploaded, and the check belongs where it cannot be skipped.
 *
 * So the path is validated against the caller's own storage folder, which is
 * the same first-segment rule the bucket's own policies enforce on the upload
 * itself. Two independent checks on the same fact, which is the point.
 *
 * Passing null or an empty string removes the logo. The object itself is
 * deleted by the client, which has the session the storage policy is written
 * about; a failure there leaves an unreferenced file rather than a broken
 * company, which is the right way round.
 *
 * Deliberately NOT `submit_provider_profile`. A logo is presentation, not
 * verification evidence — it opens no profile-change review, and it touches no
 * campaign, so changing it cannot move a trip.
 */
create or replace function public.set_provider_logo(
  p_provider_id uuid,
  p_path        text default null
)
returns public.providers
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller  uuid := auth.uid();
  cleaned text := nullif(btrim(coalesce(p_path, '')), '');
  updated public.providers;
begin
  if caller is null then
    raise exception 'You must be signed in' using errcode = 'insufficient_privilege';
  end if;

  if not public.owns_provider(p_provider_id) and not public.is_admin() then
    raise exception 'That company is not yours to change'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * The path has to be under the caller's own folder.
   *
   * `split_part(path, '/', 1)` is the same segment `storage.foldername(name)[1]`
   * gives the bucket policies, so an object this function will accept is
   * exactly an object the caller was able to upload. An administrator is
   * exempt: they may point a company at a file they were given out of band.
   */
  if cleaned is not null and not public.is_admin() then
    if split_part(cleaned, '/', 1) <> caller::text then
      raise exception 'A logo must be a file you uploaded'
        using errcode = 'check_violation';
    end if;
    if cleaned !~ '\.(png|jpg|jpeg|webp)$' then
      raise exception 'A logo must be a PNG, JPG or WebP image'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.providers
     set logo_path = cleaned
   where id = p_provider_id
   returning * into updated;

  return updated;
end;
$fn$;

revoke all on function public.set_provider_logo(uuid, text) from public, anon;
grant execute on function public.set_provider_logo(uuid, text) to authenticated;


-- ==========================================================================
-- 7. what this migration did to the trips that were already queued
-- ==========================================================================

/*
 * The last statement returns a table rather than nothing, on purpose.
 *
 * "Success. No rows returned" would leave the question in §9 unanswerable:
 * which pending trips were published, and which were deliberately left alone.
 * These three counts are the answer, and they are read after the fact from the
 * rows themselves rather than from a counter the migration kept.
 */
select
  (select count(*) from public.admin_audit
    where action = 'campaign_auto_activated')                       as trips_published_by_this_migration,
  (select count(*) from public.campaigns
    where status = 'pending_approval')                              as trips_left_pending_ineligible_company,
  (select count(*) from public.campaigns
    where status = 'rejected')                                      as trips_left_rejected_by_an_admin,
  (select count(*) from public.campaigns
    where status = 'active' and deleted = false)                    as trips_active_now,
  (select count(*) from public.providers
    where verification = 'verified')                                as companies_verified,
  (select count(*) from public.providers)                           as companies_total;
