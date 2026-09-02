-- =============================================================================
-- NASEK — where a trade permit is kept
--
-- Until now a permit was a base64 data URL in a text column, downscaled in the
-- browser first so it would fit. That was the prototype's answer to having no
-- server, and it has three costs that only get worse:
--
--   * Every read of `providers` carries a few hundred kilobytes of image per
--     row, whether or not anyone is looking at a permit.
--   * The image is degraded before it is stored, by a step whose entire purpose
--     is to fit a quota — on a document whose whole job is to be legible enough
--     to verify.
--   * A text column is protected only by whatever policy happens to sit on the
--     table around it. That is exactly how these ended up world-readable.
--
-- Storage answers all three. The bucket is private, so an object URL is
-- worthless without a signature; the signature is minted per view and expires;
-- and the path itself encodes the owner, so a policy can be written about it.
--
-- `licence_image` stays on the table. Rows registered before this migration
-- still carry one, and the no-backend fallback has nowhere else to put it.
-- =============================================================================

/*
 * The bucket.
 *
 * `public = false` is the line that matters: a public bucket serves every
 * object to anyone who can guess or is given its path, forever, and there is no
 * policy that undoes that. Private means every read goes through a signed URL
 * minted by someone the policies below said yes to.
 *
 * 8 MB matches what the upload form accepts, so an oversized file is refused by
 * the browser with a sentence about the size rather than by the API with a
 * status code. The MIME allow-list is there because this bucket holds
 * photographs of paper and nothing else — an HTML file uploaded here and served
 * back would run on the Storage origin. Images only, matching what the upload
 * form can render a preview of: an administrator has to *look* at a permit, and
 * a format the review dialog cannot display is a permit nobody can verify.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'provider-licences',
  'provider-licences',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
 * Every object lives under a folder named for the account that owns it:
 *
 *     provider-licences/<auth.uid()>/<timestamp>-<name>.jpg
 *
 * which is what lets one expression decide both "may you write here" and "may
 * you read this back". `storage.foldername(name)` splits the path; element 1 is
 * the first segment. An owner who tries to write under someone else's uuid
 * fails the check rather than succeeding into a folder they cannot read.
 */

drop policy if exists "licences: owner uploads into own folder" on storage.objects;
create policy "licences: owner uploads into own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provider-licences'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "licences: owner replaces own file" on storage.objects;
create policy "licences: owner replaces own file" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'provider-licences'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'provider-licences'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

/**
 * Reading: the owner, and an administrator.
 *
 * The administrator half is the point of the whole feature — verification means
 * a person looks at the permit — and it is also the only route by which a
 * permit leaves this bucket. There is no anonymous read policy, so a signed-out
 * visitor holding a path gets nothing, and neither does a signed-in pilgrim.
 */
drop policy if exists "licences: owner and admin read" on storage.objects;
create policy "licences: owner and admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'provider-licences'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "licences: owner deletes own file" on storage.objects;
create policy "licences: owner deletes own file" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'provider-licences'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
