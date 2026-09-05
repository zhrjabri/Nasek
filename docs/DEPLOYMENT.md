# Deploying NASEK

Two applications, two builds, two hosts, one database.

```
  nasek.om              →  dist/         the public site
  admin.nasek.om        →  dist-admin/   the administration dashboard
                    ↘   ↙
                  Supabase
```

They are separate on purpose. Sharing an origin would mean the dashboard
sharing cookies, storage and CSP with a site open to the whole internet, and it
would put the administration JavaScript on the same server a pilgrim downloads
from. `npm run verify:isolation` checks the second half of that against the
built output, not against anyone's intentions.

---

## Build

```bash
npm ci
npm run build          # typecheck, then both applications
```

produces:

| Directory | Contents | Deploy to |
| --- | --- | --- |
| `dist/` | Public site. `index.html`, hashed assets, permissive `robots.txt` | `nasek.vercel.app` |
| `dist-owner/` | Campaign Owner Portal. `index.html`, hashed assets, `Disallow: /` | `nasek-owner.vercel.app` |
| `dist-admin/` | Dashboard. `index.html`, hashed assets, `Disallow: /` | `nasek-admin.vercel.app` |

Any one can be built alone with `npm run build:web` / `npm run build:owner` /
`npm run build:admin`.

All three are static. No Node process, no server-side rendering, nothing to keep
running — every dynamic thing NASEK does goes to Supabase from the browser.

## Environment

All three builds read their configuration **at build time**, not at runtime. Vite
inlines it into the JavaScript, so changing a value means rebuilding and
redeploying — setting it on the host afterwards does nothing.

| Variable | Public build | Owner build | Admin build |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | required | required | required |
| `VITE_SUPABASE_ANON_KEY` | required | required | required |
| `VITE_SITE_URL` | the deployed address | — | — |
| `VITE_OWNER_URL` | — | the deployed address | — |
| `VITE_ADMIN_URL` | — | — | the deployed address |

Each build reads only its own address variable, and nothing else in the table
is a secret: Vite inlines every `VITE_` value into the JavaScript each visitor
downloads. The administration access code, the service role key and the Resend
credentials are Edge Function secrets and appear nowhere in any bundle.

`VITE_ADMIN_EMAIL` used to be here and is gone. It named the account the
dashboard signed in as, because the login screen asked for a password and had
to know whose. The dashboard now opens on a single access code checked by the
`admin-access` Edge Function against `is_admin()` in Postgres, so there is
nothing left for it to name — and no runtime code has read it since.

`VITE_SITE_URL`, `VITE_OWNER_URL` and `VITE_ADMIN_URL` are what a sign-in or
invitation email points at. Without them the app falls
back to the origin the page happens to be served on, which is right in
development and wrong in a deployment: a preview build's origin changes on
every push, so it is never on the Supabase redirect allow-list, and Supabase
answers an unlisted address by silently substituting the project's Site URL.

Every address you set here must also be on that allow-list. Check it, and fix
it, without opening the dashboard:

```bash
npm run auth:urls              # what would the project actually honour?
npm run auth:urls -- --apply   # add what is missing (needs SUPABASE_ACCESS_TOKEN)
```

Set them as build environment variables in your host's dashboard, or in CI. See
`docs/SUPABASE.md` for where to find them, and `.env.example` for the warning
about which key must never go here.

## Hosting

Both apps use `HashRouter`, so addresses look like `nasek.om/#/campaigns`. That
costs a `#` and buys deployment to any static host with no rewrite rules at
all. If your host can rewrite unknown paths to `index.html`, you can switch
both to `BrowserRouter` — change the one line in `src/main.tsx` and its twin in
`src/admin/main.tsx`, and drop `base: './'` in `vite.shared.ts`.

### Vercel

```bash
npx vercel --prod                                   # from dist/
npx vercel --prod                                   # from dist-admin/
```

Two projects, same repository, different build commands and output
directories:

| | Public | Admin |
| --- | --- | --- |
| Build command | `npm run build:web` | `npm run build:admin` |
| Output directory | `dist` | `dist-admin` |
| Domain | `nasek.om` | `admin.nasek.om` |

Set the two Supabase variables on **both** projects, for the **Production**
environment (and Preview, if you use preview deployments). Vercel exposes
environment variables to the build, and Vite inlines them there — so a variable
added *after* a deployment changes nothing until you redeploy. Use
**Redeploy** with *"Use existing Build Cache"* switched **off**.

This is not a detail. `nasek.vercel.app` was deployed for a while with none of
them set, and the result was not a broken site — it was a working-looking one.
No Supabase client was built, so the sign-in screen fell back to generating a
six-digit code in the visitor's own browser and displaying it on the page.
Anyone could sign in as anyone, no email was ever requested, and nothing in the
build, the typecheck, the harnesses or the deployment reported a problem.

Two things now make that unrepeatable:

* `npm run build` **fails** when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`
  is missing from a production build (`assertBackendConfigured()` in
  `vite.shared.ts`). A misconfigured deployment stops at the build rather than
  succeeding into something worse.
* The on-device fallback is compiled out of production regardless
  (`ALLOW_LOCAL_OTP_FALLBACK` in `src/services/auth/otp.ts`). If a build ever
  does ship without a backend, sign-in reports that it is unavailable; it does
  not invent a code. `npm run verify:isolation` checks this against the built
  bundles rather than against this paragraph.

Neither affects `npm run dev` or `npm run verify`, which legitimately run
without a backend.

### Netlify

Same shape: two sites, `npm run build:web` → `dist` and `npm run build:admin` →
`dist-admin`.

### Cloudflare Pages, S3 + CloudFront, or any static host

Upload the directory. There is nothing else to configure.

### GitHub Pages

`.github/workflows/deploy.yml` publishes the **public site only**. GitHub Pages
serves one site per repository, and the administration dashboard should not be
on a subpath of a public one anyway — put it on a host where it can have its
own domain.

## Recommended headers

Neither app needs them to work, and both are noticeably harder to attack with
them. On the administration host in particular:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains
Permissions-Policy: geolocation=(), camera=(), microphone=()
```

A Content-Security-Policy is worth adding once you have settled on fonts and
the Supabase host; both apps load Google Fonts and talk to
`https://<project>.supabase.co`, and nothing else.

## Before you deploy

```bash
npm run typecheck
npm run build
npm run verify           # 163 checks, including bundle isolation
```

`verify:isolation` reads the built `dist/` and fails if any administration
string reached it. It is the check most worth having in CI: the separation is
the sort of thing that stays true until someone imports a helper across it, and
nothing else would notice.

Then, once:

- Sign in to the public site as an ordinary account, and confirm the
  administration site refuses it (see `docs/SUPABASE.md` §7).
- Confirm the public site's JavaScript contains no reference to the
  administration host.
- Check `dist-admin/robots.txt` says `Disallow: /`.
