# ناسِك | NASEK

An interactive prototype of the NASEK platform — an Omani marketplace that gathers
Hajj and Umrah campaigns in one place so pilgrims can search, choose and book,
and campaign owners can publish trips and manage registrations.

Built from the original NASEK business documents (`Nasek.docx`, `Nasek Platform.docx`
and the 32 app mockups), extended into a modern bilingual web application.

> **This is a prototype on demo data.** Every campaign and provider in it is
> fictional. No real payment is processed and no claim is made that any listed
> campaign holds an official licence.

---

## Running it

```bash
npm install
npm run dev          # customer website      http://localhost:5173
npm run dev:owner    # campaign owner portal http://localhost:5175
npm run dev:admin    # administration        http://localhost:5174
```

**Three applications, three doors, three hosts.** Not one site with three
sign-in options — three separate builds that share a database and share no
navigation at all.

| | Local | How you get in |
| --- | --- | --- |
| **Customer website** | `:5173` | nothing, to browse. Email + one-time code to book |
| **Campaign Owner Portal** | `:5175` | email + password. Accounts are created by NASEK |
| **Administration** | `:5174` | one access code, checked server-side |

A pilgrim's browser downloads **no** route, component or string belonging to the
other two. There is no owner link in the navbar, none in the footer, none on the
sign-in page, and no "are you a campaign owner?" anywhere — a customer should
not learn from this site that the other applications exist.

That is a claim about what ships, so it is checked against what ships:
`npm run verify:isolation` walks the import graph *and* greps `dist/` for owner
and administration wording, and `npm run verify:render` greps the rendered
markup of the home and sign-in pages for the same. Both fail the build rather
than warning.

It runs with no configuration at all. Without a Supabase project NASEK falls
back to on-device data and shows sign-in codes on screen — useful for a demo,
and it says so in a banner rather than pretending otherwise. See
`docs/SUPABASE.md` to connect a real backend, which takes about twenty minutes.

| Script | What it does |
| --- | --- |
| `npm run dev` / `dev:owner` / `dev:admin` | Dev server for each application |
| `npm run build` | Typecheck, then build all three to `dist/`, `dist-owner/`, `dist-admin/` |
| `npm run build:web` / `build:owner` / `build:admin` | Build one |
| `npm run preview` / `preview:owner` / `preview:admin` | Serve a production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | All 339 checks below |
| `npm run verify:auth` | Phone normalisation, the one-time-code lifecycle, password rules, and where each role lands |
| `npm run verify:isolation` | That no owner or administration code reached the customer bundle |
| `npm run verify:journeys` | Owner registers → publishes → NASEK approves → pilgrim books → admin moderates, end to end |
| `npm run verify:ai` | The intelligence layer against fixed inputs |
| `npm run verify:map` | Every wilayah marker projects inside Oman's borders |
| `npm run auth:urls` | Whether Supabase would honour the addresses sign-in emails point at |

### Signing in

There are no demo accounts, and three doors that share nothing.

**A pilgrim types an address and a code.** That is the whole of it. There is no
"create account" button, because verifying a code against an unknown address
*is* creating the account — `shouldCreateUser` is true, so a first-time pilgrim
and a returning one take an identical path and there is no "no account found"
dead end. Offering both a sign-in and a sign-up would be two names for one
operation, and a returning visitor wondering which they used last time.

The profile stays minimal on purpose. Everything a campaign actually needs — the
contact name, a phone number, traveller passports and civil IDs — is collected
on the **booking form**, at the point it becomes load-bearing, and the name and
phone are written back to the profile there so they are asked once and never
again. A pilgrim who browses and does not book is never asked for anything.

No password on this screen, and no "Continue with Google". Both were removed
with the three-door split: the two roles that hold a password each have an
application of their own, and a second way to do the one thing this page does is
a choice nobody arriving here wants to make.

**A campaign owner signs in at their own portal, with a password.** A separate
build on a separate host, with its own header and its own sign-in — no one-time
code on it anywhere, because that is the pilgrims' method. Recovery is a reset
link, which proves control of the same address a code would and ends in a
password rather than in a session with none.

There is **no public registration**. Owners are taken on by NASEK: an
administrator enters the company, the licensing numbers and the address, uploads
and reads the operating permit — image or PDF — and sends an invitation. The
owner sets their own password from that link and lands in the portal. That
removes a whole job from the verification queue: everything in it is there
because a person at NASEK put it there, rather than because a form was open to
the internet.

**An administrator types one access code.** Not an address, not a password. The
code is held in the `admin-access` Edge Function's environment, compared there in
constant time, rate-limited per source, and never reaches the browser in any
form — there is no hash of it in the bundle and no `VITE_` variable naming
anything about it. On a correct code the function checks in the database that the
target account really is an administrator, then mints a single-use magic-link
token which the browser redeems for an ordinary Supabase session.

That last part is the point: the code is a *door*, not authority. `is_admin()`
still runs inside Postgres against a signed token and the policies still scope
every row, so a session obtained by defeating every line of the client reads
exactly what a pilgrim's reads. Administrators can enrol an authenticator app
from **Security** in the sidebar, and should — the second factor is checked at
the gate whichever door opened the session.

Granting administration is a database operation, never a screen:

```sql
select * from public.promote_to_admin('you@example.com');
```

What arrives in an email depends on the project's templates, and NASEK accepts
either: a **six-digit code** to type, or a **sign-in link** to click. Supabase's
default templates send a link and cannot be edited without custom SMTP, so the
link is the common case; `services/auth/redirect.ts` completes that sign-in.
With no backend configured at all, a code is generated on-device and shown on
screen.

---

## The journeys that work end to end

**Pilgrim** — Home → smart or field search → filtered listing → campaign detail,
one trip at a time → sign up with an email address alone → 4-step booking, which
is where the traveller and contact details are collected → confirmation with
reference → dashboard, with the profile now filled in from what the booking
asked for. Everything up to the booking is open to a signed-out visitor: an
address is asked for at the moment it is needed, never to browse.

**Campaign owner** — an administrator adds the company and sends an invitation →
the owner opens the **Campaign Owner Portal**, a separate application on its own
host, and sets a password → signs in with **email and password** → dashboard →
creates a campaign → it goes to NASEK for review, **not to the public site** →
once an administrator approves it, it is live and the owner is told. Materially
editing a live campaign — its price, dates, services, photographs or terms —
sends it back to the queue. Seat counts do not.

The portal's own sections: overview, my campaigns, bookings, customers, reviews,
analytics, company profile (with the verification status and the permit NASEK
holds), and notifications.

**Admin** — On its own host: **one access code**, checked by an Edge Function
that holds it, then an authenticator code where the account has one enrolled →
Postgres confirms the account holds the role → two queues. Owners: read the
permit against the number and expiry on the application, approve or refuse with
a reason the owner reads word for word and can correct. Campaigns: read the
trip, approve it onto the public site or refuse it with a reason. Both
decisions write an in-app notification and queue an email in the same
transaction.

**Smart Match** — up to 7 questions, every one skippable → weighted scoring →
ranked matches with the reasons *and* the trade-offs behind each score.

---

## Architecture

Two applications, one database.

```
  nasek.om                        admin.nasek.om
  index.html                      admin.html
  src/main.tsx                    src/admin/main.tsx
       │                                │
       └──────────► shared ◄────────────┘
                      │
                 Supabase (Postgres + Auth + RLS)
```

They share the domain model, the design system, the i18n dictionaries and the
Supabase client — a campaign is the same campaign on both sides.

> **Known gap.** Only identity currently flows through Postgres: sessions,
> one-time codes, roles, profiles and campaign-owner registration. The
> catalogue — campaigns, bookings, reviews, notifications, saved trips and the
> admin's moderation decisions — is still held in `localStorage` per browser.
> The tables are there and are correctly locked down; nothing reads or writes
> them yet. Until that is finished, a trip one owner publishes is invisible to
> everyone else, and an admin's verification is invisible outside the browser
> that made it. They do not
share a bundle. Nothing under `src/admin/` is reachable from the public entry
point, so the JavaScript a pilgrim downloads contains no administration
screens, no table of accounts, and no evidence that either exists. That is
checked, against the built output, by `npm run verify:isolation`.

```
src/
  types.ts                  Domain model (User, Provider, Campaign, Booking…)
  data/                     Seed reference data — wilayat with real coordinates
  i18n/                     ar.ts / en.ts, plus adminAr/adminEn which ship
                            ONLY to the dashboard — see the note below
  services/
    ai/                     The intelligence layer, behind one interface
    api/                    The no-backend fallback: latency, filtering, sorting
    auth/                   Passwordless sign-in
      otp.ts                Send and verify a code — Supabase, or on-device
      session.ts            Who is signed in, according to the server
      phone.ts              Omani numbers → E.164, and back for display
    supabase/               Client and hand-written schema types
  store/AppStore.tsx        Session state, persisted to localStorage
  components/               ui primitives, layout, campaign, map, search, auth
  pages/                    The public site
  admin/                    The dashboard — a separate application
    main.tsx                Its entry point
    AdminApp.tsx            Its router and its one security gate
    session.ts              Asks Postgres whether this account administers NASEK
    layout/, tabs/          Sidebar shell and the six sections
supabase/migrations/        The schema, its policies, and admin provisioning
```

### Why the admin dictionary is a separate file

`i18n/adminEn.ts` and `adminAr.ts` hold the dashboard's strings and are
imported only by `src/admin/main.tsx`. Without the split, a pilgrim's browser
would download the phrase "NASEK administration", "Suspend account" and "Review
permit" along with everything else — and anyone reading that bundle would learn
an administration area exists and roughly what it can do. Routes and components
are the obvious half of separating two applications; the dictionary is the half
that is easy to miss.

The *keys* still appear in `MessageKey`, because types are erased at build time
and cost nothing at runtime. `t('admin.users')` stays type-checked everywhere,
while the string it resolves to ships only where it is needed.

### Language

Arabic is the primary language; English is secondary. The switch is not a
navigation translation — **every data field is bilingual** (`{ ar, en }`), the
document direction flips, and layout uses logical properties (`ms-`, `pe-`,
`start-`) so RTL is the same code path rather than a mirrored stylesheet.
`ar.ts` is typed against `en.ts`, so a missing translation is a compile error.

### Design system

Deep Islamic green (`#10402F`, sampled from the original NASEK mark) with soft
gold accents on warm ivory. Tokens live in `src/index.css` under `@theme`;
`surface`, `display`, `girih` and `rule-gold` are custom utilities. The girih
lattice is the only ornament in the system, always under 15% opacity.

---

## How the AI features work

All three run **on-device and deterministically** — no API key, no network, and
identical output for identical input, which is what a demo in front of
stakeholders needs.

**Natural-language search** (`nlSearch.ts`) is a real parser, not a canned
response. It normalises Arabic (diacritics, alef/ya/ta-marbuta, Arabic-Indic
digits, punctuation), reads Omani dialect forms like "أبغى", and extracts trip
type, wilayah, budget, travel method, party size, dates and services. It returns
each inference **with the words that produced it**, so the UI can show its
working before running the search.

**Smart Match** (`smartMatch.ts`) scores every candidate across seven weighted
criteria (budget 25, services 20, location 15, dates 15, method 10, quality 10,
seats 5). Each criterion that scores well contributes a sentence to `reasons`;
each that scores badly contributes one to `tradeoffs`. Showing the downsides is
what makes a "96% match" credible — and because both come from the same numbers
as the score, the explanation can never contradict the ranking.

### Swapping in a hosted model

Everything in the UI is written against the `AIProvider` interface. To move to a
hosted model, implement a `/api/ai/{search,match}` route and change one line:

```ts
// src/services/ai/index.ts
setAI(new RemoteAIProvider())
```

`RemoteAIProvider` is already written. The shapes it expects
(`NLSearchResult`, `MatchResult[]`) are exactly what a structured-output call
would return. The API key must live on that server route — never in this bundle.

---

## What is mocked

| Area | Now | For production |
| --- | --- | --- |
| Identity, sessions, roles | **Real.** Supabase Auth + Postgres, enforced by RLS | — |
| Owner registration | **Real.** Writes to `providers` via a guarded RPC | — |
| Campaigns, bookings, reviews, notifications, saved trips | **Still `localStorage`, per browser.** The tables exist, are indexed and are policy-protected — the app does not read or write them yet | Move `useCatalogue` and the booking path onto Postgres |
| Admin moderation (verify, suspend, feature) | **Still `localStorage`.** A decision is invisible to any other browser | Same |
| Transport | `services/api/client.ts` adds 180–520 ms latency and can fail on demand | `fetch` against the real API |
| Auth | **Real.** Supabase Auth: email one-time codes for pilgrims and nothing else asked of them, passwords plus optional TOTP for owners and administrators, Google when the project has it | Configure your own SMTP; add an SMS provider for phone codes; enable Google |
| Authorisation | **Real.** Postgres row-level security, evaluated before any row is returned | — |
| Payments | "Simulate payment" button; no card fields collect anything | Thawani or another licensed Omani gateway, server-side |
| Persistence | `localStorage`, per browser | Server-side, per account |
| Verification | Admin decision, recorded with who and when in `admin_audit` | Document review workflow on top of the trail |
| Map | Real Oman borders from public-domain GeoJSON, rendered as offline SVG | Interactive tiles only if street-level detail is ever needed |
| AI | On-device parser and scorer | Hosted model behind `RemoteAIProvider` |
| Notifications | In-app only | Push / SMS / email, plus the NASEK watch |
| NASEK Giving | Described only; **cannot accept money** | Regulated donation flow with a charitable partner |

---

## What to build next

1. **Real payments** via Thawani, with server-side booking creation so seat
   counts can't be raced. `docs/DATA-MODEL.md` describes the race precisely;
   the columns exist, the transaction does not.
2. **Encrypt traveller documents.** `travellers.civil_id` and `passport_no` are
   protected by policy but stored in plain text. `pgsodium` is the next step.
3. **Retire the last data-URL permits.** New registrations upload to the
   private `provider-licences` bucket and an administrator opens one through a
   signed URL that expires; rows created before 2026-09-02 still carry a base64
   data URL in `providers.licence_image`, now readable only by their owner and
   by administrators.
4. **Hosted AI** behind `RemoteAIProvider`, keeping the deterministic local
   provider as the offline fallback and as the test oracle.
6. **The wearables** from the original plan — the NASEK watch (prayer times,
   qibla, supervisor notifications) and bracelet (emergency contacts,
   locating a pilgrim separated from the group).
6. **Accessibility audit with real assistive tech.** The build uses semantic
   landmarks, labelled controls, visible focus, `aria-live` on results and a
   keyboard-navigable equivalent for the map — but that has been reasoned
   through, not tested with a screen reader.

---

## Security

Three properties, and it is worth being precise about which mechanism provides
each — because two of them used to be claims and are now facts.

**A normal user never sees the administration area.** Not a hidden button: the
code is not in the bundle. Separate entry point, separate Rollup graph,
separate `dist`, separate host — and the dictionary is split too, so not even
the word "administration" ships to the public site. `npm run verify:isolation`
checks this against the built output in CI, from two directions: that the
public graph reaches nothing under `src/admin/`, and that the strings which
should be admin-only appear in one bundle and not the other.

**A normal user cannot reach administration data.** This one is not in the
client at all, and could not be. `supabase/migrations/*_rls_policies.sql`
enforces it in Postgres, against a JWT the browser cannot forge, before a row
is returned. Type the administration URL, guess a table name, call the REST
endpoint directly with your own token — you get an empty result set. The
interface is not the security boundary; the database is. Turning the client's
`is_admin` check to `true` by hand gets you a dashboard frame drawn around
empty tables.

**Administration cannot be self-granted.** There is no "create admin" screen,
no role selector on any form, and the sign-up trigger hard-codes every new
profile to `customer`. A trigger reverts any attempt by a non-admin to change
their own `role`. The only path in is `promote_to_admin()`, which is granted to
`service_role` — the role the SQL editor runs as, and one the browser can never
hold. Campaign owners are the one legitimate promotion, and they go through
`register_provider()`, a function that takes no role argument and always
promotes the caller to `provider`, never to `admin`.

What none of this covers: NASEK is a static site plus a database, so anyone who
controls a browser controls what that browser *displays*. The guarantee is
about data, not pixels — which is the right place for it, and the opposite of
where the guarantee used to be.

---

## Credits

NASEK was founded as a student project at Gulf College. Founding team: الزهراء
بنت علي الجابري (CEO), بيان بنت حسين المعمري (COO), مُنتهى بنت خالد الزدجالي
(CFO), رياء بنت حميد الهشامي (HR), الفضل بن سعيد الهنائي (Marketing), عهد بنت
سليمان التوبي (Deputy Marketing), سعيد بن حمد السعدي (PR).
