/**
 * Addresses on the *customer* site, built from inside the other two applications.
 *
 * NASEK is three applications on three origins, and that is the whole reason
 * this file exists. The owner portal and the administration dashboard both
 * offer to open a trip's public page, and both used a react-router `<Link>` to
 * do it — a control that means "somewhere else in *this* application". It is
 * not: `/campaigns/:id` is a route on the public site and on nothing else.
 *
 * In administration that produced a link that silently bounced back to the
 * overview, because the dashboard's catch-all matched it. In the owner portal
 * it was worse — the portal mounts no `Router` at all, deliberately, so that
 * nothing competes with Supabase for the URL fragment an invitation arrives
 * in, and rendering a `<Link>` there throws
 *
 *     Cannot destructure property 'basename' of React.useContext(...) as it is null
 *
 * on the spot. That is the error an owner met on "رحلاتي" the moment they had
 * one approved trip, and it is why this is an ordinary `href` to another
 * origin rather than a route.
 *
 * The origin comes from `VITE_SITE_URL`, the same variable the sign-in
 * redirects use, baked in at build time. There is deliberately no fallback to
 * the running origin: the running origin is the owner portal or the dashboard,
 * neither of which serves the customer site's routes, so a guess would be a
 * link that answers "not found". Unconfigured returns `null` and the caller
 * draws no link at all — the one honest answer available.
 */

/**
 * The whole decision, as a pure function, so it can be asserted directly.
 *
 * Split out for the same reason `resolveRedirectTarget` is: the harnesses build
 * with `--mode harness`, which blanks `VITE_SITE_URL` on purpose, so a check
 * written against the environment-reading wrapper would assert nothing at all.
 *
 * `path` is written the way the router writes it — `/campaigns/abc` — and the
 * `#` is added here, because the public site mounts a `HashRouter`: its
 * addresses are `https://…/#/campaigns/abc`, and the same URL without the hash
 * lands on the home page instead.
 */
export function customerRouteUrl(configured: string | undefined, path: string): string | null {
  const base = configured?.trim()
  if (!base) return null

  let url: URL
  try {
    url = new URL(base)
  } catch {
    // A malformed variable is a deployment mistake worth finding, and it must
    // not take a screen down on its way.
    return null
  }

  url.search = ''
  // A static host serves the same page at `/` and at `/index.html`; only one of
  // the two belongs in a link.
  url.pathname = url.pathname.replace(/index\.html$/, '')
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`
  url.hash = `#${path.startsWith('/') ? path : `/${path}`}`
  return url.toString()
}

/**
 * The deployed address of the customer site.
 *
 * Read once, at module scope, because Vite inlines it at build time — there is
 * nothing to re-evaluate. Only the owner portal and the administration bundle
 * this module; the customer site is already on that origin.
 */
const configuredSiteUrl: string | undefined = import.meta.env.VITE_SITE_URL

/** A route on the customer site as an absolute URL, or `null` if unconfigured. */
export const customerSiteUrl = (path: string): string | null =>
  customerRouteUrl(configuredSiteUrl, path)

/** Where a pilgrim reads this trip, or `null` if the public site is unconfigured. */
export const publicCampaignUrl = (id: string): string | null =>
  customerSiteUrl(`/campaigns/${encodeURIComponent(id)}`)
