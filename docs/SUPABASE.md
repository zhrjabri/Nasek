# Setting up the NASEK backend

NASEK runs without any of this — it falls back to on-device data and shows
verification codes on screen. Everything below is what turns that into a real
product: accounts that exist outside one browser, and an administration
dashboard a determined visitor cannot open.

Budget about twenty minutes. You need a Supabase account (the free tier is
enough to start) and, for SMS, a Twilio account (which is not free).

---

## 1. Create the project

1. <https://supabase.com/dashboard> → **New project**.
2. Pick a region close to your users. `eu-central-1` (Frankfurt) is usually the
   lowest-latency choice for Oman among Supabase's regions; `ap-south-1`
   (Mumbai) is also worth testing.
3. Save the database password somewhere safe. You will not be shown it again,
   and you need it for the CLI.

## 2. Apply the migrations

The four files in `supabase/migrations/` are the whole schema, its security
policies, the reference data and the administrator tooling. They are ordered by
filename and must be applied in that order.

**With the CLI** (recommended — it records what has been applied):

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>   # from the dashboard URL
supabase db push
```

**Without the CLI:** open the dashboard → **SQL Editor**, then paste and run
each file in `supabase/migrations/` in filename order. Every statement is
written to be safely re-runnable, so a partial application can be repeated.

Check it worked:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;
```

Every row must show `rowsecurity = true`. If any table shows `false`, stop and
re-run `20260901000200_rls_policies.sql` — a table without RLS is readable by
anyone holding the anon key, which is everyone.

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
sits looking at six empty boxes with only a link in their inbox.

**One thing you must configure for this to work.** Dashboard →
**Authentication → URL Configuration**:

| Field | Value |
| --- | --- |
| Site URL | `http://localhost:5173` (your public domain in production) |
| Redirect URLs | `http://localhost:5173/**` and `http://localhost:5174/**` |

Add your real domains alongside them before deploying — `https://nasek.om/**`
and `https://admin.nasek.om/**`. If a redirect target is not on this list,
Supabase silently falls back to the Site URL, and an administrator clicking a
link ends up on the public site instead of the dashboard. That failure looks
like a bug in the app and is not one.

This is URL configuration, not template editing, and is available on the free
plan.

### The typed code (needs an editable template)

If your plan lets you edit templates — which today means having custom SMTP
configured — putting `{{ .Token }}` in them gives a six-digit code instead, and
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

### The default mail service will not do for long

Supabase's built-in SMTP is rate-limited to a handful of messages an hour and
is explicitly not for production. Set your own under **Project Settings →
Authentication → SMTP Settings** — Resend, Postmark, AWS SES and SendGrid all
work, and doing so also unlocks template editing. Until then, sign-ins start
failing silently under any real traffic, and the symptom is a message that
simply never arrives.

## 5. Phone codes (optional)

NASEK's sign-in screen offers **Continue with Phone** and the whole code path
behind it is written and working. What is not configured is delivery, because
that needs a paid account and a decision about who pays per message.

To turn it on: **Authentication → Providers → Phone** → enable, then choose a
provider (Twilio, MessageBird, Vonage or Textlocal) and paste its credentials.

Two things specific to Oman:

- Confirm the provider actually delivers to **+968** and what it costs per
  message. Delivery to the Gulf is not uniform between providers.
- Some Omani networks require a registered **sender ID** or an alphanumeric
  sender for A2P traffic. Ask the provider before launch rather than after
  codes stop arriving.

Nothing needs to change in the code. `src/services/auth/otp.ts` already calls
`signInWithOtp({ phone })` and verifies with `type: 'sms'`; it starts working
the moment the provider is configured.

## 6. Create the first administrator

There is deliberately no way to do this from either application. No "create
admin" screen, no role selector on any form, and the sign-up trigger hard-codes
every new profile to `customer`.

1. Open the **public** site and sign in with the address that should hold
   administration. This creates the account.
2. Dashboard → **SQL Editor**:

   ```sql
   select * from public.promote_to_admin('you@example.com');
   ```

3. Open the administration site and sign in with the same address.

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

## 7. Check the security actually holds

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
- **Seat concurrency.** `docs/DATA-MODEL.md` describes the race: two people
  booking the last seat at once. The schema has the columns; the booking path
  still needs to be a single transaction that locks the campaign row,
  re-checks, decrements and inserts. Until then `seats_available` can go wrong
  under load.
- **Encrypt traveller documents.** `travellers.civil_id` and `passport_no` are
  personal data, protected by policy but stored in plain text. `pgsodium` or
  application-side encryption is the next step.
- **Move permit images to Storage.** `providers.licence_image` holds a data URL
  because the prototype had nowhere else to put it. A bucket with short-lived
  signed URLs is where it belongs.
- **Rate limits.** Check **Authentication → Rate Limits** against your expected
  sign-in volume; the defaults are conservative.
