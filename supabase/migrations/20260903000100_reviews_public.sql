-- =============================================================================
-- NASEK — a review needs the name of whoever wrote it
--
-- Four screens print `review.userName`: the campaign page, the home page's
-- testimonial strip, the owner's dashboard and the administration list. The
-- mapper that fills it reads `user_name` off the row — and no such column
-- exists, on any table, so every one of those bylines has been an empty string
-- for as long as reviews have come from Postgres.
--
-- The name cannot simply be joined in from the client. `profiles` returns the
-- caller's own row and nothing else, so a pilgrim reading a campaign page would
-- get their own name against their own review and a blank against everyone
-- else's — which is worse than blank, because it looks correct.
--
-- So the join happens in the database, in a view that reads as its owner. Same
-- device as `providers_public`, and for the same reason: a view is the right
-- tool for deciding which *columns* may leave, while the row-level decision
-- stays where it belongs.
--
-- WHICH ROWS
--
-- A definer view does not consult `reviews_read`, so the predicate that policy
-- uses is written out here instead. It has to match, and it does: a hidden
-- review is visible to the person who wrote it and to an administrator, and to
-- nobody else. Getting this wrong in the permissive direction would publish
-- every review an administrator had taken down.
--
-- WHICH COLUMNS
--
-- The reviewer's display name, and only if they gave one. `fallbackName` in the
-- application derives a greeting from the local part of an email address when a
-- profile has no name — which is fine on that person's own dashboard and is not
-- something to print under a public review. An empty name comes back null and
-- the interface says "A pilgrim" instead.
--
-- Note what is absent: no email, no phone, no wilayah. A byline is a name.
-- =============================================================================

drop view if exists public.reviews_public;
create view public.reviews_public
with (security_invoker = false) as
  select
    r.id,
    r.user_id,
    r.campaign_id,
    r.provider_id,
    r.rating,
    r.comment_ar,
    r.comment_en,
    r.hidden,
    r.created_at,
    nullif(trim(p.name), '') as user_name
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  -- Mirrors `reviews_read` exactly. See the note above.
  where r.hidden = false
     or r.user_id = auth.uid()
     or public.is_admin();

grant select on public.reviews_public to anon, authenticated;

comment on view public.reviews_public is
  'Reviews with their author''s display name. A definer view because the name lives in profiles, which is closed to everyone but its owner and an administrator. Row visibility mirrors the reviews_read policy; expect the linter to flag security_definer_view, and do not "fix" it — see providers_public.';
