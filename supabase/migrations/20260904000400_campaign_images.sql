-- =============================================================================
-- NASEK — photographs of a trip
--
-- A campaign had no images at all: no column, no bucket, and a card in the
-- catalogue drawn as a coloured panel with a monogram on it. The brief asks for
-- them, and a Hajj campaign with no picture of the hotel is a listing a pilgrim
-- cannot judge.
--
-- WHY THIS BUCKET IS PUBLIC AND THE PERMIT BUCKET IS NOT
--
-- These are the two kinds of file NASEK holds and they are opposites, so they
-- get opposite buckets rather than one compromise.
--
-- A permit is evidence. Exactly two people have any business seeing it — the
-- owner who uploaded it and the administrator verifying it — and it is served
-- through a signed URL that expires in minutes, from a bucket with no public
-- read at all.
--
-- A campaign photograph is advertising. Its entire purpose is to be fetched by
-- an anonymous visitor, on a phone, on a page that has to paint quickly, and to
-- keep working when that page is bookmarked or shared. A signed URL is the
-- wrong shape for that in three ways: it needs a round trip per image before
-- anything can render, it cannot be cached by a CDN for its full life, and it
-- stops working while the page it is on is still open.
--
-- So: public to READ, and locked down on every other verb. An upload may only
-- land under the uploader's own account id, may only replace or delete a file
-- in that same folder, and is size- and type-limited by the bucket itself. The
-- consequence worth naming out loud: a photograph attached to a campaign that
-- is still in the review queue is reachable by anyone holding its URL. That is
-- accepted — it is a photograph of a hotel, the *campaign* remains invisible,
-- and no amount of guessing produces the path.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-images',
  'campaign-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
 * Every object lives under a folder named for the account that owns it:
 *
 *     campaign-images/<auth.uid()>/<timestamp>-<name>.jpg
 *
 * — the same shape the permit bucket uses, and for the same reason: one
 * expression then decides both "may you write here" and "may you delete this",
 * and a path aimed at somebody else's folder is not constructible by the client
 * rather than merely refused by the API.
 */

drop policy if exists "campaign images: owner uploads into own folder" on storage.objects;
create policy "campaign images: owner uploads into own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'campaign-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "campaign images: owner replaces own file" on storage.objects;
create policy "campaign images: owner replaces own file" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'campaign-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  )
  with check (
    bucket_id = 'campaign-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

/*
 * Deletion belongs to the owner and to an administrator.
 *
 * The administrator half matters: taking a campaign down leaves its photographs
 * served from a public bucket, and "remove this image" has to be something
 * NASEK can actually do when what was uploaded should not have been.
 */
drop policy if exists "campaign images: owner deletes own file" on storage.objects;
create policy "campaign images: owner deletes own file" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'campaign-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

/*
 * Reading is granted by the bucket being public, not by a policy, which is how
 * Storage works: a public bucket serves objects over the render endpoint
 * without consulting `storage.objects` at all. A SELECT policy is added anyway
 * so that the *listing* API behaves — an owner managing their own images has to
 * be able to enumerate their folder, and an anonymous visitor has no business
 * enumerating anything.
 */
drop policy if exists "campaign images: owner lists own folder" on storage.objects;
create policy "campaign images: owner lists own folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'campaign-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
