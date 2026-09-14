# Setting up the NASEK backend

NASEK runs without any of this — it falls back to on-device data and shows
verification codes on screen. Everything below is what turns that into a real
product: accounts that exist outside one browser, and an administration
dashboard a determined visitor cannot open.

Budget about twenty minutes. You need a Supabase account, and the free tier is
enough to start — there is nothing here that costs money. NASEK needs no SMS
provider: every way into the product is email-shaped, and a campaign owner's
phone number is contact information rather than a credential.

---

## 1. Create the project

1. <https://supabase.com/dashboard> → **New project**.
2. Pick a region close to your users. `eu-central-1` (Frankfurt) is usually the
   lowest-latency choice for Oman among Supabase's regions; `ap-south-1`
   (Mumbai) is also worth testing.
3. Save the database password somewhere safe. You will not be shown it again,
   and you need it for the CLI.

## 2. Apply the migrations

The files in `supabase/migrations/` are the whole schema, its security
policies, the reference data, the administrator tooling, the booking
transaction, the owner verification workflow, the campaign approval workflow,
the outbound message queue and the two Storage buckets. They are ordered by
filename and must be applied in that order.

Two buckets are created by the migrations and their difference is deliberate:

| Bucket | Read | Holds |
| --- | --- | --- |
| `provider-licences` | **private**, signed URLs that expire in minutes | operating permits — images and PDF |
| `campaign-images` | public | campaign photographs |

A permit is evidence and exactly two people have any business seeing it. A
campaign photograph is advertising whose whole purpose is to be fetched by an
anonymous visitor on a phone. Writing to either is restricted to the uploader's
own folder; only reading differs.

> **Upgrading an existing project.** `20260904000300_campaign_approval.sql`
> adds approval to campaigns and backfills every row that already existed to
> `active`, so applying it does **not** empty a live catalogue. From that point
> on, a new or materially-edited campaign goes to `pending_approval` and waits
> for an administrator.

**With the CLI** (recommended — it records what has been applied):

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>   # from the dashboard URL
supabase db push
```

**Without the CLI:** run `npm run db:bundle`, then paste
`supabase/all-migrations.sql` into the dashboard → **SQL Editor**. Every
statement is written to be safely re-runnable, so a partial application can be
repeated.

One thing can go wrong on that path and nowhere else. The SQL Editor runs the
whole paste as a single transaction, and Postgres will not let a value added to
an enum be *used* in the transaction that added it. If it stops with **"unsafe
use of new value of enum type"**, run
`20260902000100_provider_status_values.sql` on its own first and then paste the
bundle again — nothing is lost by repeating it.

Check it worked:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;
```

Every row must show `rowsecurity = true`. If any table shows `false`, stop and
re-run `20260901000200_rls_policies.sql` — a table without RLS is readable by
anyone holding the anon key, which is everyone.

Then check the two most recent migrations landed, because the application
tolerates their absence rather than failing loudly and you would otherwise not
notice:

```sql
select to_regclass('public.reviews_public')      as reviews_view,
       to_regclass('public.booking_reference_seq') as reference_sequence;
```

Both must be non-null.

* **`reviews_public`** (`20260903000100`) is what puts a name under a review.
  Without it the site falls back to the bare `reviews` table and every byline
  reads "A pilgrim" — visibly wrong rather than broken.
* **`booking_reference_seq`** (`20260903000200`) is what stops two people
  booking two *different* trips at the same moment from being handed the same
  booking reference. The old expression derived it from `count(*)`, which the
  per-row lock in `book_campaign` does not serialise, so the second traveller
  met a unique-violation at the instant they pressed pay. The same migration
  stops a campaign being booked before its company has been approved.

`npm run verify:backend` asserts both against the live project.

Then check the one that was wrong until 2026-09-02:

```sql
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'providers' and grantee in ('anon', 'authenticated');
```

`anon` must not appear. The trade permits, the owners' private phone numbers
and the account ids behind every company live on that table; `providers_public`
is what a signed-out visitor reads instead. `npm run verify:backend` asserts
this from outside, with the same key a browser gets.

## 3. Point the applications at it

Dashboard → **Project Settings → API**. Copy the **Project URL** and the
**anon public** key into `.env`:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Never put the **service_role** key here. It bypasses row-level security
completely, and `VITE_`-prefixed variables are compiled into the JavaScript
every visitor downloads.

## 4. What the sign-in email contains

Two paths work, and which one your project uses is not entirely up to you.

### The link (works on every plan, no configuration)

Supabase's **default** templates render `{{ .ConfirmationURL }}` and nothing
else — a link, no code. On newer projects those templates cannot be edited at
all unless custom SMTP is configured, so for many projects this is simply what
arrives.

NASEK handles it. `signInWithOtp` sends an `emailRedirectTo` pointing back at
whichever application the person started from, and `services/auth/redirect.ts`
completes the session when they land. The sign-in screen says so, so nobody
sits looking at a row of empty boxes with only a link in their inbox.

**Two things you must configure for this to work.**

### a. Tell the build where the site lives

`VITE_SITE_URL` in `.env` — plus `VITE_OWNER_URL` for the Campaign Owner Portal
and `VITE_ADMIN_URL` for the dashboard — is the address each application's
emails point at:

```
VITE_SITE_URL=https://your-site.example.com/
```

Leave it blank and NASEK falls back to the origin the page is running on. That
is correct in development and wrong everywhere else — a build made on a laptop
puts `http://localhost:5173/` into a real email, which is an address nobody can
follow from an inbox and which does not exist on a phone at all. It is read at
**build** time, so it belongs in your host's build environment, not in a
runtime setting.

### b. Tell the project to accept that address

Dashboard → **Authentication → URL Configuration**:

| Field | Value |
| --- | --- |
| Site URL | your public site (`http://localhost:5173` while developing) |
| Redirect URLs | `http://localhost:5173/**`, `http://localhost:5175/**`, `http://localhost:5174/**`, and every deployed address |

If a redirect target is not on this list, Supabase does not refuse it and does
not report an error — it silently substitutes the Site URL. The person clicks a
link and lands somewhere else, which looks exactly like a bug in the app and is
not one. A fresh project ships with the Site URL set to `http://localhost:3000`,
which matches nothing this repository serves, so it is a particularly quiet way
to get a wrong destination.

Both halves are checkable from outside the dashboard:

```bash
npm run auth:urls              # report: what would this project honour?
npm run auth:urls -- --apply   # set Site URL and add the missing entries
```

The report needs nothing but the anon key already in `.env`; `--apply` needs a
personal access token from
<https://supabase.com/dashboard/account/tokens>:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:urls -- --apply
```

It merges into the existing allow-list rather than replacing it, and it keeps
the localhost entries alongside the deployed ones — one project backs both, so
removing them breaks every developer's sign-in.

This is URL configuration, not template editing, and is available on the free
plan.

### The typed code (needs an editable template)

If your plan lets you edit templates — which today means having custom SMTP
configured — putting `{{ .Token }}` in them gives a typed code instead, and
the code screen becomes the primary path. Edit **both**:

- **Magic Link** — used when the address has signed in before
- **Confirm signup** — used the first time an address is ever seen

Editing only one means the very first sign-in still gets a link.

```html
<h2>Your NASEK sign-in code</h2>
<p>Enter this code to continue. It expires in one hour.</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p style="color:#666;font-size:13px">
  If you did not ask to sign in to NASEK, ignore this message.
</p>
```

Remove `{{ .ConfirmationURL }}` if you do this — with a code in the email the
link is redundant, and NASEK accepts either.

### How many digits the code has

**Dashboard → Authentication → Sign In / Providers → Email → Email OTP Length.**
GoTrue's default is 6; the setting accepts 6 to 10. NASEK's project is set to
**8**.

That number is mirrored in exactly one place in this repository —
`EMAIL_CODE_LENGTH` in `src/services/auth/otp.ts` — and it decides how many
boxes the sign-in screen draws. **Change the setting and you must change that
constant**, or the form draws the wrong number of boxes.

It has been wrong once, and the failure was not obvious from either side: the
project was moved to 8, the constant still said 6, and a pilgrim received a
code they could physically enter only two thirds of. The screen then told them
"الرمز غير صحيح" — a correct code, refused by the form before Supabase was ever
asked. Two things were changed so it cannot be that bad again:

- `verifyOtp` accepts any length from 6 to 10 and lets the server decide, so a
  drifted constant costs some empty boxes rather than every sign-in.
- No copy in either language names a number of digits any more. "We sent your
  sign-in code to…" stays true at any setting.

An authenticator code is a different thing — six digits by RFC 6238 — and is
`TOTP_CODE_LENGTH` in `src/components/auth/CodeInput.tsx`. Do not change one
to match the other.

### The default mail service will not do for long

Supabase's built-in SMTP is rate-limited to a handful of messages an hour and
is explicitly not for production. Set your own under **Project Settings →
Authentication → SMTP Settings** — Resend, Postmark, AWS SES and SendGrid all
work, and doing so also unlocks template editing. Until then, sign-ins start
failing silently under any real traffic, and the symptom is a message that
simply never arrives.

## 5. The three redirect URLs

NASEK is three applications on three hosts, and each one emails links that have
to come back to *itself*:

| Application | Emails | Build variable |
| --- | --- | --- |
| Customer site | the pilgrim's one-time code / sign-in link | `VITE_SITE_URL` |
| Campaign Owner Portal | password resets and self-registration confirmations | `VITE_OWNER_URL` |
| Administration | nothing routine — the access code needs no email | `VITE_ADMIN_URL` |

Every one of those addresses must be on **Authentication → URL Configuration →
Redirect URLs**, including the development ones:

```
http://localhost:5173/
http://localhost:5175/
http://localhost:5174/
https://<your public site>/
https://<your owner portal>/
https://<your admin site>/
```

`authRedirectTarget()` computes each application's target from the page it is
running on, so the customer site returns to the customer site and the portal to
the portal. **An address that is not on this list is not rejected** — Supabase
silently substitutes the Site URL, which for a three-application project is
wrong two times in three. `npm run auth:urls` checks this from the outside, and
`npm run auth:urls -- --apply` fixes it.

The one that bites hardest is the owner portal: if its address is missing from
the allow-list, an owner's password-reset link lands on the Site URL instead,
which will not let them in and cannot tell them why. (An owner an administrator
creates is not emailed at all — see §8a.)

> **Continue with Google is gone.** The customer site had it, conditional on the
> project having Google enabled. The brief for the three-door split was one
> authentication method per audience — a pilgrim signs in with a code, an owner
> with a password, an administrator with an access code — so `oauth.ts` and the
> button were removed. Nothing in the dashboard needs turning off; if Google is
> still enabled on the project it is simply never offered.

## 6. Phone sign-in — deliberately not configured

**Leave Authentication → Providers → Phone switched off.** Nothing in NASEK
signs anybody in by phone, and turning it on would open a route no part of this
repository has been written or tested against. `npm run verify:backend` checks
that it is off.

There were two reasons to consider it and neither survived. Campaign owners were
briefly able to sign in with their number and password, which made an SMS
provider — Twilio or similar — a paid, third-party dependency standing between
an owner and their own dashboard, for the convenience of typing a number instead
of an address. And the customer sign-in screen once offered a phone code
alongside the email one; the public site now has a single door, and
`AuthPages.tsx` passes `channels={['email']}`.

A campaign owner's phone number is still collected at registration, still
required on their profile, and still what a pilgrim's WhatsApp invoice is
addressed to through `booking_provider_contact`. It is contact information. It
authenticates nothing.

The dormant phone branch inside `src/services/auth/otp.ts` is left where it is
rather than deleted, because it belongs to the pilgrim code path and removing it
would mean editing the one flow every customer uses in order to tidy a route
none of them can reach.

## 7. Create the first administrator

There is deliberately no way to do this from either application. No "create
admin" screen, no role selector on any form, and the sign-up trigger hard-codes
every new profile to `customer`.

1. Open the **public** site and sign in with the address that should hold
   administration. This creates the account.
2. Dashboard → **SQL Editor**:

   ```sql
   select * from public.promote_to_admin('you@example.com');
   ```

To see who currently holds it:

```sql
select id, email, name, created_at from public.profiles where role = 'admin';
```

To take it away:

```sql
select * from public.demote_admin('them@example.com');
```

`promote_to_admin` is granted to `service_role` only, which is the role the SQL
Editor and the CLI run as. Calling it with the anon key — from either app, or
from a script someone writes — is a permission error, not a check that happens
to fail.

## 7b. Notifications belong to a person *and* an audience

`notifications.user_id` says whose row it is. `notifications.audience`
(`customer` | `owner` | `admin`, added by `20260909000100`) says which of the
three applications should show it, and the two are different questions: one
profile is one person, and that person may be both a pilgrim and a company
owner. Conflating them is what put "تم اعتماد حملتك" into a Customer Dashboard.

Each build asks for its own — `APP_AUDIENCE` in `src/services/data/catalogue.ts`,
derived from the `VITE_NASEK_APP` baked into each Vite config — and the policy
refuses an owner-audience row to any account that owns no company, and an
admin-audience row to anyone who is not an administrator.

**Anything new that writes a notification must name its audience.** Through
`notify_user` the parameter defaults to `owner`, which is what nine of the ten
existing writers are; a customer notification must pass `'customer'`
explicitly, or it lands in an inbox its reader never opens.

### Proving the boundary without creating an account

The interesting case — "a customer with their own JWT cannot read owner rows" —
needs a signed-in session, and you should not make a test account on a live
project to get one. `auth.uid()` reads `request.jwt.claims`, so you can set that
GUC directly and roll the whole thing back. It reads nothing it would not
already return and writes nothing at all:

```sql
begin;
-- Any real customer id: an account with role 'customer' that owns no provider.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (
    select p.id from public.profiles p
     where p.role = 'customer'
       and not exists (select 1 from public.providers pr where pr.owner_id = p.id)
     limit 1
  ))::text, true);

select public.is_provider_owner() as owns_a_company;   -- expect: false
select public.is_admin()          as is_an_admin;      -- expect: false

-- What the policy would return for them. Expect zero owner rows.
select audience, count(*)
  from public.notifications
 where user_id = auth.uid()
   and case audience
         when 'owner' then public.is_provider_owner()
         when 'admin' then public.is_admin()
         else true
       end
 group by audience;
rollback;
```

Repeat with an owner's id and the same query returns their `owner` rows, which
is the other half of the property: isolation, not suppression.

## 8. Deploy the Edge Functions

Three of them, and the dashboard cannot be opened without `admin-access`.

```bash
npm install -g supabase        # if you have not already
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy admin-access
supabase functions deploy admin-create-owner
supabase functions deploy send-emails
```

### a. Adding campaign owners

`admin-create-owner` is what the **Add campaign owner** button on the
administration dashboard calls. An administrator enters the company, uploads the
permit, and sets the owner's sign-in email and a temporary password. The
function creates the auth account (confirmed, with that password) and the
company in one request; the owner then signs in at the Campaign Owner Portal
with email and password. **Nothing is emailed**, so it does not depend on SMTP
or Resend — the administrator passes the temporary password on themselves.
Owners can still register themselves on the portal; that path is separate.

It needs no secrets beyond the platform's own. (`NASEK_OWNER_PORTAL_URL` is no
longer read by this function, but keep it: `send-emails` still uses it to link
decision emails to the portal.)

If the company cannot be written after the account was created, the function
deletes that new account again (only when no company points at it) and removes
the uploaded permit, so a failed attempt leaves nothing behind. An address that
already has any NASEK account is refused rather than reused.

### b. The administration access code

The dashboard opens on one secret code. It is **not** in the bundle, not in a
`VITE_` variable, and not in this repository — it lives in the `admin-access`
function's environment and is compared there, in constant time, against a code
the browser never receives.

```bash
supabase secrets set ADMIN_ACCESS_CODE="a long random phrase you will remember"
```

Generate one you have not used elsewhere; length is what matters:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Two optional refinements:

```bash
# Store a derivation rather than the phrase. If both are set, the hash wins.
supabase secrets set ADMIN_ACCESS_CODE_SALT="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
supabase secrets set ADMIN_ACCESS_CODE_HASH="<sha256 of SALT+CODE, hex>"

# Name the account the code opens. Required only if you have more than one
# administrator — with several, the function refuses rather than guessing.
supabase secrets set NASEK_ADMIN_EMAIL="you@example.com"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform. Do not set them, and never put the service role key anywhere a
browser can reach.

**What the code does and does not buy.** It produces an ordinary Supabase
session for the administrator account — the function mints a single-use
magic-link token with the service role and the browser redeems it. Whether that
session administers NASEK is still decided by `is_admin()` inside Postgres and
enforced row by row by the policies. Holding the code is a door, not authority:
defeat every line of the client and you hold a session that reads what a
pilgrim's reads.

Failed attempts are counted per source in `admin_access_attempts`; eight inside
fifteen minutes and the door stops answering for a while.

### c. Approval and refusal emails (optional)

Decisions queue a message in `public.email_outbox` inside the same transaction
that takes the decision, and `send-emails` drains that queue. With no mail
provider configured the rows simply sit there — **which is a supported state**:
every decision also writes an in-app notification, so an owner still sees it in
their portal. Nothing is blocked on this.

To actually send:

```bash
supabase secrets set RESEND_API_KEY="re_..."
supabase secrets set EMAIL_FROM="NASEK <no-reply@your-verified-domain>"
supabase secrets set NASEK_OWNER_PORTAL_URL="https://<your owner portal>/"
supabase secrets set CRON_SECRET="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
```

The domain in `EMAIL_FROM` has to be verified with Resend, or every message is
rejected. Then run the drain on a schedule — Supabase's Cron, a GitHub Action,
anything that can POST once a minute:

```
POST https://<project-ref>.supabase.co/functions/v1/send-emails
Header: x-cron-secret: <CRON_SECRET>
```

An administrator's own session can also call it, so **Security → Message
delivery** in the dashboard shows what has been queued, sent or failed, and why.

### Then turn on two-factor — and do not set a password

The access code opens the dashboard, and it is the only way in. There is
deliberately no password: one set on the administrator's account would be a
second door that skips the access code entirely, straight through Supabase's
own sign-in endpoint. The dashboard no longer offers to set one, and
`is_admin()` refuses any session that signed in with a password
(`20260913000200_security_hardening.sql`), so a password that already exists on
the account grants nothing. Do not add one from the Supabase dashboard either.

**Security** in the sidebar enrols an authenticator app (TOTP — Google
Authenticator, 1Password, Aegis, any of them).

Do enrol one. The second factor is checked at the gate, whichever door opened
the session — including this one — so an access code that leaks is not on its
own enough to reach the dashboard. An administration account can suspend a
company, hide a review and read every booking on the platform; it is the single
most valuable credential NASEK has. Nothing needs buying: Supabase supports TOTP
on every plan.

## 9. Check the security actually holds

Worth doing once, because "I wrote policies" and "the policies work" are
different claims.

**As an anonymous visitor** (SQL Editor → set the role first):

```sql
set local role anon;
select * from public.profiles;      -- expect 0 rows
select * from public.bookings;      -- expect 0 rows
select * from public.campaigns;     -- expect only live, unsuspended trips
reset role;
```

**As a normal signed-in user**, the honest test is from a browser. Sign in to
the public site as an ordinary account, open the console and run:

```js
const { data, error } = await window.supabase
  .from('profiles').select('*')
```

You should get exactly one row — your own — regardless of how many accounts
exist. If you get more, RLS is not on.

**The one that matters most:** open the administration site while signed in as
that ordinary account. You should see "this account is not an administrator",
and no amount of editing local storage, patching the bundle or calling
`is_admin()` from the console changes it — because the answer is decided in
Postgres against a signed token, and every admin-scoped query returns nothing
to that account anyway.

---

## What is still worth doing before real traffic

- **Backups.** Supabase's free tier keeps daily backups for a limited window.
  Check the retention on your plan against what losing a week of bookings would
  cost.
- **Google sign-in.** Section 5 above. Optional, but it is the fastest way in
  for most pilgrims and the button stays hidden until you configure it.
- **Encrypt traveller documents.** `travellers.civil_id` and `passport_no` are
  personal data, protected by policy but stored in plain text. `pgsodium` or
  application-side encryption is the next step.
- **Old permit images.** New registrations upload to the private
  `provider-licences` bucket and store only an object path; an administrator
  opens one through a signed URL that expires in ten minutes. Rows created
  before 2026-09-02 still carry a base64 data URL in
  `providers.licence_image`, readable now only by their owner and by
  administrators. Nothing breaks if you leave them, but moving them into the
  bucket and clearing the column is the tidier end state.
- **Leaked-password protection.** **Authentication → Policies** can check every
  new password against HaveIBeenPwned. It costs nothing and NASEK surfaces
  whatever it says; it is off by default.
- **Rate limits.** Check **Authentication → Rate Limits** against your expected
  sign-in volume; the defaults are conservative.
