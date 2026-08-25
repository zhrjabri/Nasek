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
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify:ai` | Runs the intelligence layer against fixed inputs and prints what it extracted, scored and answered |
| `npm run verify:map` | Checks every wilayah marker projects inside Oman's borders and that distances are realistic |
| `npm run build:map` | Regenerates `src/data/omanOutline.ts` from the boundary GeoJSON in `scripts/data/` |

### Demo accounts

The sign-in page has one-click entry for all three roles — no password is checked
anywhere. You can also type the addresses directly:

| Role | Email | Lands on |
| --- | --- | --- |
| Customer | `customer@nasek.demo` | `/dashboard` |
| Campaign owner | `provider@nasek.demo` | `/provider` |
| NASEK admin | `admin@nasek.demo` | `/admin` |

---

## The journeys that work end to end

**Pilgrim** — Home → smart or field search → filtered listing → campaign detail →
compare up to 3 → 4-step booking → confirmation with reference → dashboard.

**Campaign owner** — Register as owner → dashboard → add a trip → it appears
immediately in the public listing, map and search → manage bookings → analytics.

**Admin** — Verification queue → verify a provider → the "Verified by NASEK"
badge appears across every listing in the same session.

**Smart Match** — up to 7 questions, every one skippable → weighted scoring →
ranked matches with the reasons *and* the trade-offs behind each score.

---

## Architecture

```
src/
  types.ts                  Domain model (User, Provider, Campaign, Booking, Review…)
  data/                     Seed data — wilayat, providers, 20 campaigns, reviews,
                            generated booking history
  i18n/                     ar.ts / en.ts + I18nProvider (t, bl, money, date, dir)
  services/
    ai/                     The intelligence layer, behind one interface
      types.ts              AIProvider — the seam
      lexicon.ts            Bilingual keyword tables + Arabic normalisation
      nlSearch.ts           Free text → search filters, with evidence
      smartMatch.ts         Weighted scoring → ranked matches + explanations
      assistant.ts          Intent routing over the live catalogue
      index.ts              LocalAIProvider (default) / RemoteAIProvider (stub)
    api/                    Mock backend: latency, failures, filtering, sorting
  store/AppStore.tsx        Session state, persisted to localStorage
  hooks/useCatalogue.ts     The catalogue as this session sees it
  components/               ui primitives, layout, campaign, map, search, assistant
  pages/                    13 routes
```

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
| Data | Seed files in `src/data` | Postgres via a REST/GraphQL API |
| Transport | `services/api/client.ts` adds 180–520 ms latency and can fail on demand | `fetch` against the real API |
| Auth | Email is looked up; **passwords are never checked or stored** | Real identity provider, httpOnly session cookies, hashed credentials |
| Payments | "Simulate payment" button; no card fields collect anything | Thawani or another licensed Omani gateway, server-side |
| Persistence | `localStorage`, per browser | Server-side, per account |
| Verification | Admin toggles a session flag | Document upload, review workflow, audit trail |
| Map | Real Oman borders from public-domain GeoJSON, rendered as offline SVG | Interactive tiles only if street-level detail is ever needed |
| AI | On-device parser and scorer | Hosted model behind `RemoteAIProvider` |
| Notifications | In-app only | Push / SMS / email, plus the NASEK watch |
| NASEK Giving | Described only; **cannot accept money** | Regulated donation flow with a charitable partner |

---

## What to build next

1. **A real backend** — the schema in `types.ts` maps 1:1 onto tables; the API
   surface `services/api` already defines the endpoints needed.
2. **Real payments** via Thawani, with server-side booking creation so seat
   counts can't be raced.
3. **Provider onboarding and verification**, including document upload — the
   trust badge currently rests on nothing but an admin toggle.
4. **Review integrity** — only travellers with a completed booking may review.
   The rule is stated in the UI but not enforced anywhere yet.
5. **Hosted AI** behind `RemoteAIProvider`, keeping the deterministic local
   provider as the offline fallback and as the test oracle.
6. **The wearables** from the original plan — the NASEK watch (prayer times,
   qibla, supervisor notifications) and bracelet (emergency contacts,
   locating a pilgrim separated from the group).
7. **Accessibility audit with real assistive tech.** The build uses semantic
   landmarks, labelled controls, visible focus, `aria-live` on results and a
   keyboard-navigable equivalent for the map — but that has been reasoned
   through, not tested with a screen reader.

---

## Credits

NASEK was founded as a student project at Gulf College. Founding team: الزهراء
بنت علي الجابري (CEO), بيان بنت حسين المعمري (COO), مُنتهى بنت خالد الزدجالي
(CFO), رياء بنت حميد الهشامي (HR), الفضل بن سعيد الهنائي (Marketing), عهد بنت
سليمان التوبي (Deputy Marketing), سعيد بن حمد السعدي (PR).
