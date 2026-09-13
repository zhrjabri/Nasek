import { supabaseAnonKey, supabaseUrl } from '@/services/supabase/client'

/**
 * Counting visits without learning who is visiting.
 *
 * NASEK wants to know how many people looked at the site and which campaigns
 * they opened. That is a legitimate question and it does not require knowing
 * anything about the person asking it, so nothing here touches an account. No
 * name, no email, no phone, no session token, no IP address, no user agent, no
 * referrer, no query string. The row that reaches the database is a path, a
 * bucket, an optional campaign id and one random number.
 *
 * The random number — `visitor_id` — exists so that "how many people" can be
 * answered at all. Without it the only available figure is page views, which
 * one person reloading a page ten times inflates tenfold. It is generated in
 * the browser by `crypto.randomUUID()`, stored in this origin's
 * `localStorage`, and joined to nothing: `site_visits` has no foreign key to
 * `profiles`, and `site_analytics()` returns counts, never rows. Clearing site
 * data makes a returning visitor a new one, which is the correct trade and the
 * point.
 *
 * It is deliberately *not* sent as an argument to the function. It travels in
 * an `x-nasek-visitor` request header instead, which keeps it out of anything
 * that logs a request body and makes it visible at the call site that this is
 * not account data being posted.
 */

const STORAGE_KEY = 'nasek.visitor'

/** A v4 UUID, from the platform where there is one and from `Math.random` otherwise. */
function newVisitorId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  /*
   * The fallback is for old Safari and for any context serving over plain
   * HTTP, where `crypto.randomUUID` is undefined. It is not cryptographically
   * strong and does not need to be: this value authorises nothing and protects
   * nothing. It only has to collide rarely enough that a visitor count is not
   * wrong.
   */
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * This browser's visitor id, minted on first call.
 *
 * Returns null when storage is unavailable — a private window with cookies
 * blocked, or an embedded browser. That is not an error state to recover from:
 * a visit with no id is simply not counted, because the alternative is
 * inventing an id per page load and reporting a fabricated visitor count. The
 * instruction was explicit that these figures must be real.
 */
export function visitorId(): string | null {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing && /^[0-9a-fA-F-]{36}$/.test(existing)) return existing
    const fresh = newVisitorId()
    window.localStorage.setItem(STORAGE_KEY, fresh)
    return fresh
  } catch {
    return null
  }
}

export type VisitKind = 'page' | 'campaign' | 'smart_match'

/**
 * A route, reduced to something that can be grouped.
 *
 * `/campaigns/9f3c…` is one campaign out of many and would fill a "top pages"
 * table with a hundred rows of one view each. Collapsing the id makes the
 * table about pages again; the campaign itself is counted separately, by id,
 * through the `campaign` bucket.
 *
 * The query string is dropped rather than trimmed. Filters and search terms
 * live there, and a search term is something a person typed.
 */
export function normalisePath(pathname: string): string {
  const path = (pathname.split('?')[0] || '/').replace(/\/+$/, '') || '/'
  return path
    .replace(/^\/campaigns\/[^/]+$/, '/campaigns/:id')
    .replace(/^\/booking\/[^/]+$/, '/booking/:id')
    .slice(0, 200)
}

/** Which bucket a path belongs to, so the dashboard can group without parsing. */
export function visitKind(pathname: string): VisitKind {
  const path = normalisePath(pathname)
  if (path === '/campaigns/:id') return 'campaign'
  if (path === '/smart-match') return 'smart_match'
  return 'page'
}

/**
 * Exactly what goes on the wire, as a value.
 *
 * Separated from the sending so it can be *read*. The promise this module makes
 * is about the contents of one request — a path, a bucket, an optional campaign
 * id, and a random browser id in a header — and a promise about a request is
 * only verifiable if the request can be inspected without being sent. The
 * harness asserts against this; `recordVisit` below posts it.
 *
 * Building it here also keeps the decisions in one place: the path is
 * normalised once, the campaign is dropped for anything that is not a campaign
 * page, and the header is the only route the visitor id has.
 */
export function visitRequest(
  base: string,
  anonKey: string,
  visitor: string,
  pathname: string,
  campaignId?: string | null,
): { url: string; headers: Record<string, string>; body: string } {
  const kind = visitKind(pathname)
  return {
    url: `${base}/rest/v1/rpc/record_visit`,
    headers: {
      'content-type': 'application/json',
      apikey: anonKey,
      /*
       * The anon key, even for a signed-in pilgrim.
       *
       * Their own token would put an account id in the request, and the
       * function has no use for it — sending it anyway would mean the server
       * *could* associate a visit with a person, which is the thing this is
       * built not to do.
       */
      authorization: `Bearer ${anonKey}`,
      'x-nasek-visitor': visitor,
      /* Nothing comes back, and asking for nothing keeps the response empty. */
      prefer: 'return=minimal',
    },
    body: JSON.stringify({
      p_path: normalisePath(pathname),
      p_kind: kind,
      p_campaign_id: kind === 'campaign' ? (campaignId ?? null) : null,
    }),
  }
}

/**
 * Post one visit, and never let it matter whether it worked.
 *
 * `fetch` rather than `supabase.rpc()`, for one reason: supabase-js has no way
 * to set a header on a single call, and `x-nasek-visitor` must not be attached
 * to every request the app makes. The URL and the anon key are already public
 * — they are compiled into this bundle — so calling the REST endpoint directly
 * grants nothing that the client does not already grant.
 *
 * No `Authorization` beyond the anon key even when someone is signed in. A
 * signed-in pilgrim's token would put their account id in the request, and the
 * function has no use for it; sending it anyway would mean the server *could*
 * associate a visit with a person, which is the thing this is built not to do.
 *
 * Every failure is swallowed. Analytics is not allowed to produce an error
 * toast, block a render or appear in the console of someone trying to book a
 * trip.
 */
export function recordVisit(pathname: string, campaignId?: string | null): void {
  if (!supabaseUrl || !supabaseAnonKey) return
  const visitor = visitorId()
  if (!visitor) return

  const { url, headers, body } = visitRequest(
    supabaseUrl,
    supabaseAnonKey,
    visitor,
    pathname,
    campaignId,
  )

  try {
    void fetch(url, {
      method: 'POST',
      headers,
      body,
      /* Survives the page being navigated away from mid-flight. */
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* No network, blocked by an extension, or `fetch` absent under a test DOM. */
  }
}
