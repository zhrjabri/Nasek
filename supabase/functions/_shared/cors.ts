/**
 * Cross-origin headers for the NASEK Edge Functions.
 *
 * Both functions are called from a browser on a different origin to the
 * Supabase project, so a preflight has to be answered before anything else can
 * happen.
 *
 * `ALLOWED_ORIGINS` is a comma-separated secret rather than a hard-coded list,
 * because the two callers are deployments this repository does not know the
 * addresses of — the administration host, and (for the mail drain) whatever is
 * running the schedule. Left unset it falls back to `*`, which is the right
 * default here and worth being precise about why: these functions authenticate
 * on what is *in* the request (an access code, a service-role JWT, a cron
 * secret), never on where it came from. An origin allow-list is defence in
 * depth against a hostile page in a logged-in browser; it is not the control
 * that keeps anybody out, and treating it as one is how people end up
 * comfortable with a weak code.
 */

const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? ''
  const allow =
    configured.length === 0 ? '*' : configured.includes(origin) ? origin : configured[0]

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}

export function preflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}
