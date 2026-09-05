/**
 * NASEK — draining the outbox.
 *
 * `public.email_outbox` is filled inside the transaction that takes a decision:
 * a company approved, a campaign refused. Nothing in Postgres can send an
 * email, and nothing should try — a decision must not fail because a mail
 * provider was down, and a message must not go out for a decision that rolled
 * back. So the queue is written there and drained here.
 *
 * This function is safe to call as often as you like. It claims a batch by
 * moving rows to `sending` before it does any network work, so two concurrent
 * runs cannot send the same message twice, and a run that dies mid-flight
 * leaves rows it can recognise and retry rather than rows it has silently
 * eaten.
 *
 * DELIVERY
 *
 * Resend, over HTTPS, because an Edge Function has no SMTP socket and Resend's
 * API is one POST. `RESEND_API_KEY` and `EMAIL_FROM` are secrets of this
 * function and appear nowhere else — not in the database, not in any `VITE_`
 * variable, not in the bundle.
 *
 * With no key configured the function is a no-op that says so. That is the
 * deliberate shape of the whole feature: NASEK works with no mail
 * infrastructure at all. The decisions still commit, the owner still sees them
 * in their portal as in-app notifications, and the queue simply waits for
 * somebody to open a Resend account.
 *
 * WHO MAY CALL IT
 *
 * An administrator with a real session, or a scheduler holding `CRON_SECRET`.
 * Not the public: this sends mail on NASEK's domain, and an open endpoint that
 * sends mail is a spam relay with extra steps.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'
import { json, preflight } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'NASEK <no-reply@nasek.om>'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
/** Where a message tells an owner to go. Used only to build a link in the body. */
const OWNER_PORTAL_URL = (Deno.env.get('NASEK_OWNER_PORTAL_URL') ?? '').trim()

/** How many to take in one run. Small enough that a timeout loses little. */
const BATCH = 20
/** Give up on a row after this many tries, so a bad address is not retried for ever. */
const MAX_ATTEMPTS = 5

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface OutboxRow {
  id: number
  to_email: string
  template: string
  subject_ar: string
  subject_en: string
  body_ar: string
  body_en: string
  payload: Record<string, unknown>
  attempts: number
}

/**
 * Is this request allowed to make NASEK send mail?
 *
 * Two doors. A scheduler presents `x-cron-secret`; a person presents the
 * bearer token of a signed-in session, which is checked against `is_admin()` in
 * Postgres rather than believed. Note that the second one runs the RPC as *that
 * user*, not as the service role — the whole point is to ask the database about
 * the caller, and asking as the service role would answer about the service
 * role.
 */
async function authorised(request: Request): Promise<boolean> {
  const cron = request.headers.get('x-cron-secret')
  if (CRON_SECRET && cron && cron === CRON_SECRET) return true

  const auth = request.headers.get('authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) return false

  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await asCaller.rpc('is_admin')
  return !error && data === true
}

/**
 * One message, both languages.
 *
 * NASEK is Arabic-first and bilingual everywhere else, and an email is the one
 * place there is no language switch to offer — the recipient reads whatever
 * arrives. So both go, Arabic first, in one message, rather than NASEK guessing
 * from a column it does not have.
 */
function render(row: OutboxRow): { subject: string; html: string; text: string } {
  const link = OWNER_PORTAL_URL
    ? `\n\n${OWNER_PORTAL_URL}`
    : ''

  const text = `${row.body_ar}\n\n— — —\n\n${row.body_en}${link}`

  const linkHtml = OWNER_PORTAL_URL
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(OWNER_PORTAL_URL)}" style="background:#1c5e4c;color:#fdfcf7;padding:11px 20px;border-radius:3px;text-decoration:none;font-weight:700;display:inline-block">بوابة أصحاب الحملات · Campaign Owner Portal</a></p>`
    : ''

  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ea;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:#fdfcf7;border:1px solid #eae5d8;border-radius:3px;padding:28px">
      <p style="margin:0 0 20px;font-weight:800;letter-spacing:.08em;color:#1c5e4c">NASEK · ناسِك</p>
      <div dir="rtl" style="text-align:right;color:#22251f;line-height:1.8;font-size:15px">
        <p style="margin:0 0 6px;font-weight:700">${escapeHtml(row.subject_ar)}</p>
        <p style="margin:0">${escapeHtml(row.body_ar)}</p>
      </div>
      <hr style="border:none;border-top:1px solid #eae5d8;margin:24px 0">
      <div dir="ltr" style="text-align:left;color:#22251f;line-height:1.7;font-size:15px">
        <p style="margin:0 0 6px;font-weight:700">${escapeHtml(row.subject_en)}</p>
        <p style="margin:0">${escapeHtml(row.body_en)}</p>
      </div>
      ${linkHtml}
    </div>
  </div>
</body></html>`

  return { subject: `${row.subject_ar} · ${row.subject_en}`, html, text }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function deliver(row: OutboxRow): Promise<{ ok: true } | { ok: false; error: string }> {
  const { subject, html, text } = render(row)

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [row.to_email], subject, html, text }),
  })

  if (response.ok) return { ok: true }
  const detail = await response.text().catch(() => '')
  return { ok: false, error: `${response.status} ${detail}`.slice(0, 500) }
}

Deno.serve(async (request) => {
  const pre = preflight(request)
  if (pre) return pre

  if (request.method !== 'POST') {
    return json(request, { ok: false, error: 'method_not_allowed' }, 405)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(request, { ok: false, error: 'not_configured' }, 500)
  }
  if (!(await authorised(request))) {
    return json(request, { ok: false, error: 'forbidden' }, 403)
  }
  if (!RESEND_API_KEY) {
    /*
     * Not an error, and the status says so.
     *
     * A project with no mail provider is a supported state — every decision
     * still reaches its owner through the in-app notification written beside
     * the queued row. Answering 500 here would make a scheduled call look like
     * an outage on a system that is working as designed.
     */
    return json(request, { ok: true, sent: 0, skipped: 'no_email_provider' }, 200)
  }

  /*
   * Claim before sending.
   *
   * `status = 'queued'` in the WHERE clause is what makes this atomic enough:
   * two concurrent runs race on the same rows and exactly one of them wins the
   * update, so the loser's batch comes back empty rather than sending a second
   * copy of somebody's approval.
   */
  const { data: candidates, error: readError } = await admin
    .from('email_outbox')
    .select('id')
    .eq('status', 'queued')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (readError) return json(request, { ok: false, error: 'read_failed' }, 500)
  if (!candidates?.length) return json(request, { ok: true, sent: 0 }, 200)

  const ids = candidates.map((row) => row.id)
  const { data: claimed, error: claimError } = await admin
    .from('email_outbox')
    .update({ status: 'sending' })
    .in('id', ids)
    .eq('status', 'queued')
    .select('*')

  if (claimError) return json(request, { ok: false, error: 'claim_failed' }, 500)

  let sent = 0
  let failed = 0

  for (const row of (claimed ?? []) as OutboxRow[]) {
    const outcome = await deliver(row)
    if (outcome.ok) {
      sent += 1
      await admin
        .from('email_outbox')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          attempts: row.attempts + 1,
          last_error: null,
        })
        .eq('id', row.id)
    } else {
      failed += 1
      const attempts = row.attempts + 1
      await admin
        .from('email_outbox')
        .update({
          // Back to `queued` while there are tries left, so the next run picks
          // it up; `failed` once there are not, so it stops consuming a slot in
          // every batch for ever.
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
          attempts,
          last_error: outcome.error,
        })
        .eq('id', row.id)
    }
  }

  return json(request, { ok: true, sent, failed }, 200)
})
