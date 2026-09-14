# NASEK | ناسك

**An Omani digital platform that brings Hajj and Umrah campaigns together in one place.**

NASEK connects licensed campaign operators with pilgrims: operators publish their trips,
manage bookings and answer reviews; pilgrims search, compare and book with confidence.
The platform is bilingual throughout — Arabic (RTL) and English (LTR) — and is built as
three separate applications for three separate audiences.

---

## Live Applications

| Application | Audience | URL |
| --- | --- | --- |
| **Customer Platform** | Pilgrims | <https://nasek.vercel.app/> |
| **Campaign Owner Portal** | Campaign operators | <https://nasek-owner.vercel.app/> |
| **Admin Portal** | NASEK administration | <https://nasek-admin.vercel.app/> |

These are **three separate applications on three separate origins**, and that is a
deliberate architectural decision rather than a deployment convenience. Each has its own
build, its own entry point and its own host. A pilgrim's browser downloads no route,
component or string belonging to the other two, and the public site carries no link to
either — not in the navbar, not in the footer, not on the sign-in page.

That isolation is asserted against the built bundles rather than trusted:
`npm run verify:isolation` reads the compiled output and fails if owner or administration
code has leaked into the customer build.

> The links above are for this repository's readers. They are intentionally **not**
> published anywhere on the customer website.

---

## Platform Architecture

### Customer Platform

Browse and filter campaigns · Smart Match questionnaire · interactive map of Oman ·
NASEK Giving · save campaigns · booking flow · customer dashboard (bookings, saved trips,
notifications, profile).

Sign-in is **email plus an 8-digit one-time code** — no password to choose, forget or
reuse. Signing in for the first time creates the account, so there is no separate
registration.

### Campaign Owner Portal

A separate portal for campaign operators. An owner either registers there (pending until an
administrator approves the permit) or is created by an administrator with a temporary
password. Sign-in is **email plus password**; the company phone is contact information only.

Company profile · campaign management (create, edit, publish, withdraw) · bookings ·
customers · reviews and replies · notifications · analytics. Changes to verified company
details are submitted as a proposal for administrative review rather than written directly.

### Admin Portal

A separate administration application behind its own **Admin Access** authentication.

Campaign approvals · campaign owner and provider management · profile-change approvals ·
bookings and reviews oversight · notifications · platform administration. Administrative
decisions are recorded with who made them and when.

---

## Technology Stack

| Layer | Technology |
| --- | --- |
| UI | [React 19](https://react.dev) · [React Router 7](https://reactrouter.com) |
| Language | [TypeScript 5.7](https://www.typescriptlang.org) |
| Build | [Vite 6](https://vite.dev) — one shared config, four entry points |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) via `@tailwindcss/vite` |
| Icons | [lucide-react](https://lucide.dev) |
| Charts | [Recharts](https://recharts.org) |
| Backend | [Supabase](https://supabase.com) — Postgres, Auth, Row-Level Security, Edge Functions |
| Hosting | [Vercel](https://vercel.com) — three projects, one repository |
| CI | [GitHub Actions](https://github.com/features/actions) — typecheck, build, verification suite |

Verification runs under [jsdom](https://github.com/jsdom/jsdom). There is no test-runner
dependency: each check is a script built with Vite in SSR mode and executed with Node.

---

## Project Structure

```
├── index.html              Customer entry
├── owner.html              Campaign Owner Portal entry
├── admin.html              Admin Portal entry
├── harness.html            Visual harness — development only, never deployed
├── vite.config.ts          One config per application, sharing vite.shared.ts
├── vite.owner.config.ts
├── vite.admin.config.ts
├── vite.harness.config.ts
│
├── src/
│   ├── pages/              Customer screens
│   ├── owner/              Campaign Owner Portal
│   ├── admin/              Admin Portal
│   ├── components/         Shared UI, including the design system in components/ui
│   ├── services/           Supabase client, auth, data access, AI features
│   ├── store/              Application state
│   ├── hooks/              Shared React hooks
│   ├── i18n/               Arabic and English dictionaries, one per application
│   ├── data/               Static reference data (governorates, services)
│   └── harness/            Visual harness — development only, never deployed
│
├── supabase/
│   ├── migrations/         Schema, policies and functions, in order
│   └── functions/          Edge Functions
│
├── scripts/                Verification and maintenance scripts
└── docs/                   DATA-MODEL.md · SUPABASE.md · DEPLOYMENT.md
```

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/zhrjabri/Nasek.git
cd Nasek
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env
```

`.env.example` is committed, holds no secrets, and documents every variable the
applications read. Fill in your own Supabase project values — `.env` is git-ignored and
must never be committed.

### 3. Run an application

Each application has its own port, and the port is fixed rather than incremental because
sign-in redirect URLs are registered against it.

```bash
npm run dev          # Customer Platform       http://localhost:5173
npm run dev:owner    # Campaign Owner Portal   http://localhost:5175
npm run dev:admin    # Admin Portal            http://localhost:5174
npm run harness      # Visual harness          http://localhost:5177
```

### 4. Verify

```bash
npm run typecheck    # TypeScript, no emit
npm run build        # typecheck + build all three applications
npm run verify       # the full verification suite
```

Individual checks can be run on their own — for example `npm run verify:isolation`
(no cross-application code leaks), `npm run verify:render` (every screen draws its first
frame), `npm run verify:auth`, `npm run verify:admin`. Run `npm run` to list them all.

To preview a production build locally: `npm run preview`, `npm run preview:owner`,
`npm run preview:admin`.

---

## Security

**No secret belongs in this repository.** `.env` is git-ignored and is never committed;
`.env.example` documents the variable names and contains no values.

Configure the following as environment variables locally, and as deployment secrets in
Vercel, Supabase and GitHub Actions:

- Supabase **service-role key** — bypasses row-level security; server-side only, never in
  client code or a `VITE_`-prefixed variable
- **Admin Access Code**
- **Resend API key**
- **SMTP password**
- **CRON secret**
- Any **access or refresh token**

Only the Supabase **anon/publishable** key belongs in a client build, and only because
row-level security is what actually protects the data — every policy is evaluated in
Postgres before a row is returned.

Anything prefixed `VITE_` is **inlined into the JavaScript bundle at build time** and is
therefore public. Treat it accordingly.

If a secret is ever committed, rotate it first and rewrite history second. Removing the
file alone does not revoke the key.

---

## Deployment

```
push to main  →  GitHub Actions: typecheck · build all three · verification suite
              →  Vercel builds each application from the same commit
```

| Application | Vercel deployment |
| --- | --- |
| Customer Platform | <https://nasek.vercel.app> |
| Campaign Owner Portal | <https://nasek-owner.vercel.app> |
| Admin Portal | <https://nasek-admin.vercel.app> |

Three Vercel projects build from one repository, each with its own entry point, output
directory and environment. The GitHub Actions workflow verifies; it does not deploy.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full procedure.

---

## Design System

All three applications share one design system — the same tokens in `src/index.css` and
the same components in `src/components/ui`. What differs between them is density:
44px on the customer site, 40px in the owner portal, 36px in administration.

Six tiers, no two sharing a visual weight:

| Tier | Role | Treatment |
| --- | --- | --- |
| **Primary** | The next step | Filled deep green with a gold rule inset along the bottom |
| **Secondary** | A real alternative | A frame, never a fill |
| **Tertiary — the Gold Rule** | Onward links | Text, an arrow, and a gold rule that grows on hover |
| **Icon** | No room for a word | A ring that fills when active |
| **Destructive** | Irreversible | A red hairline that fills only on hover — obvious, never aggressive |
| **Approval** | The affirming act | Gold, so approve and refuse are separable across a table |

Palette: deep manuscript green, antique gold, and a cool ivory ground. Arabic is set in
Kufi and English in Plus Jakarta Sans, with Cormorant Garamond for display.

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Tables, relationships and row-level security policies |
| [`docs/SUPABASE.md`](docs/SUPABASE.md) | Project setup, migrations, Edge Functions, auth configuration |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Build and deployment procedure for all three applications |

---

## Status

NASEK is in active development. Identity, sessions, roles and authorisation run on
Supabase Auth and Postgres row-level security; the campaign catalogue, bookings and
moderation decisions are served from Postgres.

**Payments are not implemented.** No card details are collected and no money moves; a
production launch requires a licensed Omani payment gateway with server-side booking
creation. NASEK Giving is described in the interface but cannot accept funds.

---

<div align="center">

**NASEK** · ناسك · Made in Oman

</div>
