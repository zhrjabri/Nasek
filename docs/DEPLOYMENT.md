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
| `dist/` | Public site. `index.html`, hashed assets, permissive `robots.txt` | `nasek.om` |
| `dist-admin/` | Dashboard. `index.html`, hashed assets, `Disallow: /` | `admin.nasek.om` |

Either can be built alone with `npm run build:web` / `npm run build:admin`.

Both are static. No Node process, no server-side rendering, nothing to keep
running — every dynamic thing NASEK does goes to Supabase from the browser.

## Environment

Both builds read `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **at build
time**, not at runtime. Vite inlines them into the JavaScript, so changing a
key means rebuilding and redeploying — setting it on the host afterwards does
nothing.

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

Set the two Supabase variables on **both** projects.

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
