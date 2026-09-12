-- =============================================================================
-- NASEK — two security fixes from the review of 20260911000100
--
-- =============================================================================
-- FIX 1 — `logo_path` was writable around its own validation
-- =============================================================================
--
-- 20260911000100 added `set_provider_logo`, which checks that the object path
-- an owner is claiming sits under their own storage folder:
--
--     if split_part(cleaned, '/', 1) <> caller::text then
--       raise exception 'A logo must be a file you uploaded'
--
-- That check was the whole point of the function, and it was never reachable
-- from the only direction that mattered. Its own docblock said so and then did
-- not act on it: `guard_provider_privileges` is a deny-list of columns it
-- restores from `old`, `logo_path` was not on that list, `providers_update_own`
-- admits `owner_id = auth.uid()`, and `grant update, delete on public.providers
-- to authenticated` has stood since 20260901000200 and was never narrowed. So
--
--     PATCH /rest/v1/providers?id=eq.<your own company>
--     { "logo_path": "<some other company's uid>/logo-1.png" }
--
-- succeeded, and `set_provider_logo` was advisory. A verified company could put
-- a competitor's logo — or any external URL, since `campaignImageUrl` passes an
-- absolute URL through untouched — on its own cards, next to NASEK's "verified"
-- badge, on the public catalogue.
--
-- THE FIX, AND WHY THIS SHAPE
--
-- The guard restores `logo_path` from `old` on every ordinary owner UPDATE,
-- exactly as it already does for `plan`, `verification` and the permit
-- evidence. `set_provider_logo` then opens a transaction-local window to write
-- it, the same mechanism `submit_provider_profile` and `review_provider_changes`
-- already use for evidence columns.
--
-- A SEPARATE FLAG, not `nasek.verified_write`. That flag means "a definer
-- function has already established this caller may write verification
-- evidence", and a logo is deliberately not verification evidence — that
-- distinction is what keeps a rebrand from re-opening a company's approval.
-- Reusing it would also mean an administrator approving a permit change could
-- silently move a logo in the same statement. Two trusted operations, two
-- flags, neither able to stand in for the other.
--
-- Column-level `revoke update (logo_path)` was the alternative. It is rejected
-- because PostgREST reports a column-privilege refusal as a request-shaped
-- error rather than a policy one, and because it would sit apart from the
-- mechanism every other protected column on this table already uses. One
-- pattern is worth more than a marginally shorter statement.
--
-- =============================================================================
-- FIX 2 — the WhatsApp invoice had no number to send to
-- =============================================================================
--
-- The manual-payment workflow ends with the customer sending their invoice to
-- the campaign owner on WhatsApp. It could not: `providers_public` withholds
-- `phone` — correctly, it is a private column — and `providers_public` is the
-- only provider source a customer can read. So `toProvider` produced `phone:
-- ''`, `buildInvoice` produced `providerPhone: null`, `invoiceWhatsappUrl`
-- returned null, and every customer saw "no contact number is available"
-- instead of the button the whole flow exists to reach.
--
-- Widening `providers_public` would fix it by publishing every company's phone
-- number to every anonymous visitor and to every scraper holding the public
-- key. That is not a trade worth making for a link one customer needs after
-- they have booked.
--
-- So the booking itself becomes the authorisation boundary. `booking_provider_
-- contact` returns one column — the phone — and only to the customer who owns
-- the booking being asked about. No name, no email, no address, no commercial
-- registration, no permit, no licence: the caller already has the company's
-- name from `providers_public`, and needs nothing else to send an invoice.
-- =============================================================================


-- ==========================================================================
-- 1. the guard restores logo_path
-- ==========================================================================

/**
 * Who may write what on a company.
 *
 * Restated in full because `create or replace` cannot patch a body, and this
 * function has been rewritten by three migrations already — 20260902000200,
 * 20260905000100 and 20260906000100, the middle one of which silently dropped
 * two branches the one before it had added. Everything below is the
 * 20260906000100 version with one addition, and the addition is named in the
 * comment where it sits so the next person to restate this does not lose it.
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
  /*
   * The logo's own window. Set only by `set_provider_logo`, which has already
   * checked that the caller owns the company and that the path is theirs.
   *
   * Deliberately not `verified_write`: a logo is presentation, that flag is
   * about verification evidence, and one must not unlock the other.
   */
  logo_write boolean :=
    coalesce(current_setting('nasek.logo_write', true), 'off') = 'on';
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
    -- A company cannot arrive with a logo it never uploaded.
    new.logo_path        := null;
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
   * THE ADDITION — 20260912000100.
   *
   * The company logo is not the owner's to write through a generic UPDATE. It
   * is a *reference to a storage object*, and the only thing that can say
   * whether the object is theirs is `set_provider_logo`, which compares the
   * path's first segment against the caller's own id. Without this line that
   * comparison was decoration: `PATCH /providers?id=eq.<own>` with any
   * `logo_path` at all went straight through, including one naming another
   * company's folder or an absolute URL on somebody else's origin.
   *
   * An administrator is already past this point, so their access is unchanged.
   */
  if not logo_write then
    new.logo_path := old.logo_path;
  end if;

  /*
   * The verification evidence. This is the block 20260906000100 exists for.
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


-- ==========================================================================
-- 2. and set_provider_logo opens the window it needs
-- ==========================================================================

/**
 * Set, replace or remove a company's logo.
 *
 * Unchanged in what it checks — owner-or-admin, the path under the caller's own
 * storage folder, a raster extension — and changed in that those checks now
 * mean something: the guard restores `logo_path` on every other path, so this
 * is the only way the column moves.
 *
 * `nasek.logo_write` is turned on for exactly one statement and turned off
 * again straight after it. Every check that can refuse runs *before* the flag
 * is set, so no refusal path leaves it on; and `set_config(..., true)` is
 * transaction-local, so even an error raised by the UPDATE itself takes the
 * setting down with the aborted transaction rather than leaving a window open.
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
   * The path has to be under the caller's own folder, and has to be an image.
   *
   * `split_part(path, '/', 1)` is the same segment `storage.foldername(name)[1]`
   * gives the bucket's own policies, so an object this function accepts is
   * exactly an object the caller was able to upload.
   *
   * The pattern is anchored at both ends now. The previous form, `!~
   * '\.(png|jpg|jpeg|webp)$'`, checked only the tail — so `../../elsewhere.png`
   * and `https://attacker.example/x.png` both satisfied it, and only the folder
   * check stood between them and the column. Anchoring means the whole value
   * has to be one uuid, one slash, and one plain file name.
   *
   * An administrator is exempt from the folder rule: they may point a company
   * at a file handed to them out of band. They are not exempt from the shape.
   */
  if cleaned is not null then
    if cleaned !~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$' then
      raise exception 'A logo must be a PNG, JPG or WebP image you uploaded'
        using errcode = 'check_violation';
    end if;
    if not public.is_admin() and split_part(cleaned, '/', 1) <> caller::text then
      raise exception 'A logo must be a file you uploaded'
        using errcode = 'check_violation';
    end if;
  end if;

  perform set_config('nasek.logo_write', 'on', true);
  update public.providers
     set logo_path = cleaned
   where id = p_provider_id
   returning * into updated;
  perform set_config('nasek.logo_write', 'off', true);

  return updated;
end;
$fn$;

revoke all on function public.set_provider_logo(uuid, text) from public, anon;
grant execute on function public.set_provider_logo(uuid, text) to authenticated;


-- ==========================================================================
-- 3. the number a customer needs, and nothing else
-- ==========================================================================

/**
 * The campaign owner's phone, for a booking the caller actually holds.
 *
 * The manual-payment workflow ends with the customer sending their NASEK
 * invoice to the owner on WhatsApp, which needs the owner's number in the
 * browser. `providers_public` withholds `phone` and should keep withholding it:
 * publishing every company's number to every anonymous visitor is a large,
 * permanent disclosure in exchange for a link one customer needs once.
 *
 * The booking is the boundary instead. You get a number if you are the customer
 * on a booking with that company, and the number you get is the one on the
 * company that booking is actually with — not one you named.
 *
 * WHAT IT RETURNS: one `text`. Not the name (already public), not the email,
 * the address, the commercial registration, the permit or the licence. A
 * function that returns a row is a function that grows columns; this one
 * cannot.
 *
 * NULL means the company has no number on file, which the interface renders as
 * "no contact number is available" — the same fail-closed state as before, now
 * reached honestly rather than because the column was unreadable.
 *
 * WHO IS DELIBERATELY NOT HERE: the campaign owner and the administrator. Both
 * can already read `providers` directly for the companies they are entitled to,
 * and adding them here would turn a narrow lookup into a way to walk from any
 * booking id to a phone number.
 */
create or replace function public.booking_provider_contact(p_booking_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller uuid := auth.uid();
  phone  text;
begin
  if caller is null then
    raise exception 'You must be signed in'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * One statement, and the ownership test is inside it rather than after it.
   *
   * Reading the booking first and checking `user_id` afterwards would answer
   * "no such booking" and "not yours" differently, which turns this into a way
   * to test whether a booking id exists. Joined and filtered together, both
   * cases return the same nothing.
   */
  select pr.phone into phone
    from public.bookings b
    join public.campaigns c on c.id = b.campaign_id
    join public.providers pr on pr.id = c.provider_id
   where b.id = p_booking_id
     and b.user_id = caller;

  if not found then
    raise exception 'No such booking'
      using errcode = 'no_data_found';
  end if;

  return nullif(btrim(coalesce(phone, '')), '');
end;
$fn$;

revoke all on function public.booking_provider_contact(uuid) from public, anon;
grant execute on function public.booking_provider_contact(uuid) to authenticated;


-- ==========================================================================
-- 4. what this file did not touch
-- ==========================================================================

/*
 * Stated because a reader's next question is whether the fix widened anything.
 *
 *   * `providers_public` is not recreated. It still withholds `phone`, `email`,
 *     `address`, `commercial_registration`, `permit_number`, `permit_expiry`
 *     and every `licence_*` column.
 *   * No grant is added to `anon`, and no policy is dropped or loosened.
 *   * `providers_update_own` is unchanged: an owner still updates their own
 *     company's presentational fields exactly as before, and the guard decides
 *     which columns survive — one more column than it did yesterday.
 *   * No row is written, deleted or back-filled.
 */
