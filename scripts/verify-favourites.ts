/*
 * Can a signed-in person actually save a trip?
 *
 * For four months they could not. The bookmark on every campaign card and every
 * campaign page came back "تعذّر الحفظ الآن" for every account on the customer
 * site, and the reason was one word in `setSaved`:
 *
 *   supabase.from('saved_campaigns').upsert({ user_id, campaign_id })
 *
 * PostgREST sends `.upsert()` as `INSERT ... ON CONFLICT DO UPDATE`, and
 * Postgres requires the UPDATE privilege for that statement whether or not a
 * row actually conflicts. `20260901000200_rls_policies.sql` grants
 * `authenticated` exactly `select, insert, delete` on that table — correctly,
 * because a saved row has no mutable column — so every save, first or
 * hundredth, was refused before row-level security was ever consulted:
 *
 *   42501  permission denied for table saved_campaigns
 *
 * That is a defect no unit test with a stubbed query builder can see. The logic
 * was right; the SQL the builder produced was not. So this harness runs the
 * real `setSaved` through the real `@supabase/supabase-js` query builder into a
 * stand-in PostgREST that enforces the same grants the migration does, and
 * fails if the request on the wire is anything but a plain insert.
 *
 * The stand-in also lets the two cases that need a second write be tested at
 * all: saving a trip that is already saved, and unsaving one that is not.
 * Neither can be checked against the live project without leaving rows in
 * somebody's account.
 *
 * What is deliberately NOT here: whether the policy itself is right. That is a
 * fact about the database, so `verify:backend` asks the database.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { setSaved } from '@/services/data/catalogue'
import { emptyState, reducer, type Action, type PersistedState } from '@/store/AppStore'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

// ------------------------------------------------------------ the stand-in

const CUSTOMER = '11111111-1111-4111-8111-111111111111'
const PROVIDER = '22222222-2222-4222-8222-222222222222'
const STRANGER = '33333333-3333-4333-8333-333333333333'
const TRIP = 'fbecb671-c409-4c13-acfb-8f02bcc75a27'

interface Seen {
  method: string
  path: string
  prefer: string
  body: string
}

/** Rows the stand-in holds, keyed the way the real primary key is. */
const rows = new Set<string>()
const seen: Seen[] = []

/**
 * PostgREST, as far as `setSaved` can tell, with this project's grants.
 *
 * The one rule that matters is the first: an upsert is refused exactly as the
 * live project refuses it, with the status and the SQLSTATE the live project
 * returns. Without that rule this harness would pass on the broken code, which
 * is the only way it could be worth writing.
 */
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const path = req.url ?? ''
    const prefer = String(req.headers['prefer'] ?? '')
    seen.push({ method: req.method ?? '', path, prefer, body })

    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
    }

    if (!path.startsWith('/rest/v1/saved_campaigns')) return send(404, {})

    // `authenticated` holds INSERT and DELETE here and no UPDATE, so
    // `resolution=merge-duplicates` — which needs UPDATE — is denied.
    if (prefer.includes('merge-duplicates')) {
      return send(403, {
        code: '42501',
        message: 'permission denied for table saved_campaigns',
        details: null,
        hint: 'Grant the required privileges to the current role with: GRANT SELECT, INSERT, UPDATE ON public.saved_campaigns TO authenticated;',
      })
    }

    if (req.method === 'POST') {
      const row = JSON.parse(body) as { user_id: string; campaign_id: string }
      const key = `${row.user_id}:${row.campaign_id}`
      if (rows.has(key)) {
        return send(409, {
          code: '23505',
          message: 'duplicate key value violates unique constraint "saved_campaigns_pkey"',
          details: `Key (user_id, campaign_id)=(${row.user_id}, ${row.campaign_id}) already exists.`,
          hint: null,
        })
      }
      rows.add(key)
      return send(201, null)
    }

    if (req.method === 'DELETE') {
      // The real thing scopes by the filters in the query string, and so does
      // this: a delete that named somebody else's user_id would match no row.
      const url = new URL(path, 'http://x')
      const user = (url.searchParams.get('user_id') ?? '').replace(/^eq\./, '')
      const trip = (url.searchParams.get('campaign_id') ?? '').replace(/^eq\./, '')
      rows.delete(`${user}:${trip}`)
      return send(204, null)
    }

    send(405, {})
  })
})

/** A real client, pointed at the stand-in, believing it is signed in as `id`. */
function clientFor(id: string, port: number) {
  const client = createClient(`http://127.0.0.1:${port}`, 'stand-in-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  client.auth.getSession = (async () => ({
    data: { session: { user: { id } } },
    error: null,
  })) as unknown as SupabaseClient['auth']['getSession']
  return client as unknown as Parameters<typeof setSaved>[2]
}

async function run() {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const customer = clientFor(CUSTOMER, port)

  // ------------------------------------------------ 1. the first save works
  console.log(`\n--- Saving a trip ${'-'.repeat(38)}\n`)
  {
    const ok = await setSaved(TRIP, true, customer)
    check('a signed-in customer can save a campaign', ok)
    check('and the row is there afterwards', rows.has(`${CUSTOMER}:${TRIP}`))
  }

  /*
   * The check the bug was invisible to.
   *
   * Every other assertion in this file passes on `.upsert()` too — against a
   * stand-in that allowed it, the logic behaved identically. This one reads the
   * request that actually went out, because that is where the defect lived.
   */
  {
    const post = seen.find((r) => r.method === 'POST')
    check(
      'the save goes out as a plain insert, not an upsert',
      !!post && !post.prefer.includes('merge-duplicates'),
      post ? `Prefer: ${post.prefer || '(none)'}` : 'no POST was made',
    )
    check(
      'nothing in the save asks Postgres for a privilege the grants withhold',
      !seen.some((r) => r.prefer.includes('merge-duplicates')),
    )
  }

  // ----------------------------------------------------- 2. unsaving works
  {
    const ok = await setSaved(TRIP, false, customer)
    check('the same customer can unsave it', ok)
    check('and the row is gone', !rows.has(`${CUSTOMER}:${TRIP}`))
  }

  // ------------------------------------- 3. saving twice is not a failure
  console.log(`\n--- Saving the same trip twice ${'-'.repeat(25)}\n`)
  {
    const first = await setSaved(TRIP, true, customer)
    const second = await setSaved(TRIP, true, customer)
    check('a repeated save is reported as success, not as an error', first && second)
    check(
      'and leaves exactly one row, because the primary key says so',
      [...rows].filter((k) => k === `${CUSTOMER}:${TRIP}`).length === 1,
    )
    const duplicate = seen.filter((r) => r.method === 'POST').length
    check('both presses really did reach the server', duplicate >= 2, `${duplicate} POSTs`)
  }

  // ------------------------------------- unsaving twice is not a failure
  {
    await setSaved(TRIP, false, customer)
    const again = await setSaved(TRIP, false, customer)
    check('unsaving something already gone is not an error either', again)
  }

  /*
   * ------------------------------------------------------ 4. the owner rule
   *
   * A campaign owner is a customer too. NASEK's product rule is that the same
   * person may run a company in the Owner Portal and book a trip for their own
   * family on nasek.vercel.app, and the bookmark has to work for them there.
   *
   * Nothing in `setSaved` or in the `saved_own` policy looks at a role — both
   * ask only whether the row belongs to the caller — so this passes for the
   * same reason the customer case does. It is asserted anyway, because "hide
   * the button for providers" was a tempting way to make the original bug go
   * quiet, and this is the check that would fail if anyone took it.
   */
  console.log(`\n--- A campaign owner, using the customer site ${'-'.repeat(10)}\n`)
  {
    const provider = clientFor(PROVIDER, port)
    const ok = await setSaved(TRIP, true, provider)
    check('a provider-role account can save a campaign as a customer', ok)
    check('under their own id, not the company’s', rows.has(`${PROVIDER}:${TRIP}`))
    check('and can unsave it again', await setSaved(TRIP, false, provider))
  }

  /*
   * -------------------------------------------------- 5. somebody else's list
   *
   * The write is addressed with `auth.uid()` and never with an id from the
   * page, so a caller cannot even ask to touch another person's row: the delete
   * carries their own user_id in the filter and matches nothing. The database
   * enforces this as well — `saved_own` has `user_id = auth.uid()` in both
   * USING and WITH CHECK — and `verify:backend` is where that half is asked of
   * the real project. This half is about the client never trying.
   */
  console.log(`\n--- Somebody else's saved trips ${'-'.repeat(24)}\n`)
  {
    await setSaved(TRIP, true, clientFor(STRANGER, port))
    const before = rows.has(`${STRANGER}:${TRIP}`)
    seen.length = 0
    await setSaved(TRIP, false, customer)
    const addressed = seen.every((r) => !r.path.includes(STRANGER))
    check('one customer’s unsave never names another customer’s id', addressed)
    check('and leaves the stranger’s saved trip untouched', before && rows.has(`${STRANGER}:${TRIP}`))
  }

  /*
   * ------------------------------------------------ 6. what the heart shows
   *
   * The reducer, on its own, because the second half of this defect was in the
   * store rather than in the request. `toggleSaved` read the list and inverted
   * it, so two quick presses — both reading "not saved", because neither write
   * had answered yet — sent two saves and applied two flips, and the heart
   * ended up empty over a row that was saved. An action that states the value
   * it wants cannot do that, and re-applying it is a no-op.
   */
  console.log(`\n--- What the bookmark shows ${'-'.repeat(28)}\n`)
  {
    const base: PersistedState = { ...emptyState, savedIds: [] }
    const apply = (state: PersistedState, ...actions: Action[]) =>
      actions.reduce((s, a) => reducer(s, a), state)

    const on = apply(base, { type: 'setSaved', id: TRIP, saved: true })
    check('saving fills the heart', on.savedIds.includes(TRIP))

    const twice = apply(on, { type: 'setSaved', id: TRIP, saved: true })
    check('saving again changes nothing', twice.savedIds.filter((i) => i === TRIP).length === 1)
    check('and does not even make a new state object', twice === on)

    const off = apply(twice, { type: 'setSaved', id: TRIP, saved: false })
    check('unsaving empties it', !off.savedIds.includes(TRIP))
    check('unsaving again is still empty', !apply(off, { type: 'setSaved', id: TRIP, saved: false }).savedIds.includes(TRIP))

    // The old shape, expressed as the sequence that broke it: two presses that
    // both believed the trip was unsaved. Stating the value survives it.
    const racy = apply(base,
      { type: 'setSaved', id: TRIP, saved: true },
      { type: 'setSaved', id: TRIP, saved: true },
    )
    check('two racing saves leave the trip saved, not flipped back off', racy.savedIds.includes(TRIP))
  }

  server.close()
  console.log(`\n${failures === 0 ? 'All favourites checks passed.' : `${failures} check(s) failed.`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void run()
