# ناسِك | NASEK

An interactive prototype of the NASEK platform — an Omani marketplace that gathers
Hajj and Umrah campaigns in one place so pilgrims can search, compare and book,
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
npm run dev          # public site       http://localhost:5173
npm run dev:admin    # administration    http://localhost:5174
```

It runs with no configuration at all. Without a Supabase project NASEK falls
back to on-device data and shows sign-in codes on screen — useful for a demo,
and it says so in a banner rather than pretending otherwise. See
`docs/SUPABASE.md` to connect a real backend, which takes about twenty minutes.

| Script | What it does |
| --- | --- |
| `npm run dev` / `dev:admin` | Dev server for each application |
| `npm run build` | Typecheck, then build both to `dist/` and `dist-admin/` |
| `npm run build:web` / `build:admin` | Build one |
| `npm run preview` / `preview:admin` | Serve a production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | All 163 checks below |
| `npm run verify:auth` | Phone normalisation, the one-time-code lifecycle, password rules, and where each role lands |
| `npm run verify:isolation` | That no administration code reached the public bundle |
| `npm run verify:journeys` | Owner → pilgrim → admin, end to end |
| `npm run verify:ai` | The intelligence layer against fixed inputs |
| `npm run verify:map` | Every wilayah marker projects inside Oman's borders |

### Signing in

There are no demo accounts. A pilgrim needs no password at all: type an email
address or an Omani phone number and prove you received the message — that is
the whole of it, for a first-time pilgrim and a returning one alike. Where the
project has Google configured, **Continue with Google** appears above it and
skips even that; the button stays hidden when it is not, because an OAuth
provider that is not enabled fails by throwing the person out of the site.

Campaign owners and administrators *do* set a password, and the reason is how
often they sign in. An owner runs a live inventory of seats and an administrator
is who gets called when something is wrong — putting an email provider's
delivery time between either of them and their own dashboard is a bad trade at
exactly the wrong moment. The one-time code still works for both, and is the
recovery path. Administrators can additionally enrol an authenticator app from
**Security** in the dashboard sidebar, and should.

What arrives depends on the project's email templates, and NASEK accepts either:
a **six-digit code** to type, or a **sign-in link** to click. Supabase's default
templates send a link and cannot be edited without custom SMTP, so the link is
the common case; `services/auth/redirect.ts` completes that sign-in and lands
the person on the right dashboard. With no backend configured at all, a code is
generated on-device and shown on screen.

Administration is a **separate application on its own host** and is not
reachable from the public site at any address. Granting it is a database
operation, never a screen:

```sql
select * from public.promote_to_admin('you@example.com');
```

---

## The journeys that work end to end

**Pilgrim** — Home → smart or field search → filtered listing → campaign detail →
compare up to 3 → 4-step booking → confirmation with reference → dashboard.

**Campaign owner** — Register as owner → dashboard → add a trip → it appears
immediately in the public listing, map and search → manage bookings → analytics.

**Admin** — On its own host: email and password, plus an authenticator code
where the account has one enrolled → Postgres confirms the account holds the
role → verification queue → read the permit → approve, or refuse with a reason
the owner reads word for word and can correct → the "Verified by NASEK" badge
appears across every listing, and the owner's trips become visible at all.

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

**NASEK Assistant** (`assistant.ts`) classifies intent, then answers from the
same in-memory catalogue the listing page reads — so it can't quote a price or
seat count the site contradicts. Two rules are hard-wired: religious rulings are
always redirected to qualified scholars and the Ministry of Endowments and
Religious Affairs, and no claim of official licensing is made about any campaign.

### Swapping in a hosted model

Everything in the UI is written against the `AIProvider` interface. To move to a
hosted model, implement a `/api/ai/{search,match,ask}` route and change one line:

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
| Auth | **Real.** Supabase Auth: one-time codes for pilgrims, passwords plus optional TOTP for owners and administrators, Google when the project has it | Configure your own SMTP; add an SMS provider for phone codes; enable Google |
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
