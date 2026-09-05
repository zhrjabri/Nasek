-- =============================================================================
-- NASEK — `admin_create_provider` must not be STRICT
--
-- `20260905000100` declared it `returns null on null input`. That was a
-- mistake, and a quiet one: a STRICT function is not called at all when any
-- argument is NULL — Postgres short-circuits and yields NULL without entering
-- the body.
--
-- Which is fatal for this particular function, because half its arguments are
-- optional *by design*. The "Add campaign owner" form marks the commercial
-- registration and the permit expiry as optional — a sole trader may hold no
-- Ministry of Commerce record, and some permits are open-ended — and
-- `admin-create-owner` sends `null` for each blank field. So an administrator
-- adding a perfectly ordinary company with no commercial registration got:
--
--   * no `providers` row,
--   * no promotion of the account to `provider`,
--   * no notification,
--   * and no error — the Edge Function saw `createError === null`, reported
--     success, and the invitation went out to somebody whose company did not
--     exist.
--
-- The failure is silent in both directions, which is the worst shape available.
--
-- `ALTER FUNCTION` rather than `CREATE OR REPLACE`: this changes one attribute
-- and does not restate the body. Restating it would mean re-typing 90 lines
-- that three migrations have touched, which is exactly how the review-aggregate
-- exemption and the resubmission branch were lost from
-- `guard_provider_privileges` and had to be repaired in `20260906000100`.
--
-- The NULL-handling the function actually wants is what it already does inside
-- the body — `coalesce`, `nullif(trim(...), '')` and an explicit check that a
-- permit path is present. None of that needs STRICT, and STRICT prevented all
-- of it from running.
-- =============================================================================

alter function public.admin_create_provider(
  uuid, text, text, text, text, text, text, text, int, text, text,
  text, text, date, text, text, text, public.verification_status
) called on null input;
