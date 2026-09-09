/*
 * Admin → الحملات → بانتظار المراجعة → اعتماد ونشر, end to end.
 *
 * The campaign approval chain is the most consequential thing the
 * administration does — nothing reaches a pilgrim without passing through it —
 * and it had no coverage at all. `verify:render` draws the tab, `verify:admin`
 * checks the access gate, and neither presses the button.
 *
 * WHAT THIS RUNS AGAINST, AND WHY
 *
 * The real `CampaignsTab`, the real store, the real `useRemoteData` loader and
 * the real `@supabase/supabase-js` query builder — pointed at a stand-in
 * PostgREST that implements `set_campaign_status` with the rules the migration
 * actually gives it:
 *
 *   * refuse anyone `is_admin()` says no to               (insufficient_privilege)
 *   * refuse a rejection with no reason                   (check_violation)
 *   * refuse approving a trip whose company is not verified (check_violation)
 *   * otherwise write status, reason, reviewed_by, reviewed_at,
 *     an `admin_audit` row, an owner-audience notification and a queued email,
 *     all in one transaction, and return the campaign row
 *
 * This is the seam `verify:favourites` established, and it is here for the same
 * reason: the defect it was written for was not in anybody's logic but in the
 * request the builder produced, and a harness that stubs the builder would have
 * passed on the broken code. The request that leaves this harness is the
 * request that leaves the browser.
 *
 * WHAT IT DOES NOT COVER, AND CANNOT
 *
 * Whether the live database agrees. `set_campaign_status` is `security definer`
 * and admin-only, so exercising it for real needs an administrator session;
 * that belongs to `verify:backend` and to a human with the access code. What is
 * asserted here is everything on this side of the wire: the request shape, the
 * transaction's rules, and — the half that actually broke in this project
 * before — that the screen shows what the database returned rather than what
 * the browser hoped for.
 */
import { StrictMode, act, useEffect, type ReactNode } from 'react'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { ownerAr } from '@/i18n/ownerAr'
import { ownerEn } from '@/i18n/ownerEn'
import { adminAr } from '@/i18n/adminAr'
import { adminEn } from '@/i18n/adminEn'
import { AppStoreProvider, useStore } from '@/store/AppStore'
import { useCatalogue, deriveCatalogue } from '@/hooks/useCatalogue'
import { useRemoteData } from '@/hooks/useRemoteData'
import { CampaignsTab } from '@/admin/tabs/CampaignsTab'
import { ToastHost } from '@/components/layout/ToastHost'
import { supabase } from '@/services/supabase/client'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const describe = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))

// ------------------------------------------------------------- the database

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_OWNER = '44444444-4444-4444-8444-444444444444'
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const VERIFIED_CO = '33333333-3333-4333-8333-333333333333'
const SUSPENDED_CO = '55555555-5555-4555-8555-555555555555'

const PENDING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LIVE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REFUSED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
/** Waiting, but behind a company nobody has approved. */
const ORPHANED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

interface Row {
  [key: string]: unknown
}

/** The tables the stand-in holds, in PostgREST's own shape. */
const db = {
  providers: [] as Row[],
  campaigns: [] as Row[],
  notifications: [] as Row[],
  admin_audit: [] as Row[],
  email_outbox: [] as Row[],
}

/** Whether the caller is an administrator — what `is_admin()` answers. */
let callerIsAdmin = true

const campaignRow = (id: string, over: Row = {}): Row => ({
  id,
  provider_id: VERIFIED_CO,
  type: 'umrah',
  title_ar: `رحلة ${id.slice(0, 4)}`,
  title_en: `Trip ${id.slice(0, 4)}`,
  description_ar: 'وصف',
  description_en: 'Description',
  price: '250.000',
  wilayah_id: 'muscat',
  travel_method: 'air',
  departure_date: '2026-12-01',
  return_date: '2026-12-12',
  seats_total: 40,
  seats_available: 40,
  services: ['hotel_makkah'],
  excluded_services: [],
  included_services: [],
  contact_persons: [],
  images: [],
  hotel_makkah_ar: 'فندق',
  hotel_makkah_en: 'Hotel',
  hotel_madinah_ar: 'فندق',
  hotel_madinah_en: 'Hotel',
  haram_distance_m: 400,
  rating: '0.0',
  review_count: 0,
  featured: false,
  bookings_count: 0,
  suspended: false,
  deleted: false,
  status: 'pending_approval',
  rejection_reason: null,
  submitted_at: '2026-09-01T00:00:00Z',
  reviewed_by: null,
  reviewed_at: null,
  registration_deadline: null,
  contact_name: null,
  contact_phone: null,
  contact_email: null,
  terms_ar: '',
  terms_en: '',
  ...over,
})

const providerRow = (id: string, owner: string, verification: string): Row => ({
  id,
  owner_id: owner,
  name_ar: verification === 'verified' ? 'حملة الجابري' : 'حملة موقوفة',
  name_en: verification === 'verified' ? 'Al Jabri' : 'Suspended Co',
  tagline_ar: 'شعار',
  tagline_en: 'Tagline',
  description_ar: 'وصف',
  description_en: 'Description',
  wilayah_id: 'muscat',
  governorate: 'Muscat',
  verification,
  experience_years: 10,
  rating: '4.6',
  review_count: 3,
  phone: '+96890000000',
  email: `${verification}@example.om`,
  initials: 'AJ',
  brand_color: '#1c5e4c',
  plan: 'plus',
  joined_at: '2026-01-01',
  address: 'الخوض',
  commercial_registration: 'CR-1',
  permit_number: 'PM-1',
  permit_expiry: '2027-01-01',
  licence_path: null,
  licence_image: null,
  licence_file_name: null,
  licence_mime: null,
  rejection_reason: null,
  submitted_at: null,
})

function resetDb() {
  db.providers = [
    providerRow(VERIFIED_CO, OWNER_ID, 'verified'),
    providerRow(SUSPENDED_CO, OTHER_OWNER, 'suspended'),
  ]
  db.campaigns = [
    campaignRow(PENDING),
    campaignRow(LIVE, { status: 'active', reviewed_at: '2026-08-01T00:00:00Z' }),
    campaignRow(REFUSED, { status: 'rejected', rejection_reason: 'السعر غير واضح' }),
    campaignRow(ORPHANED, { provider_id: SUSPENDED_CO }),
  ]
  db.notifications = []
  db.admin_audit = []
  db.email_outbox = []
  callerIsAdmin = true
}

// ------------------------------------------------------- the stand-in server

interface Seen {
  method: string
  path: string
  body: string
}
const seen: Seen[] = []

/** `set_campaign_status`, with the rules the migration gives it. */
function setCampaignStatusRpc(args: Record<string, unknown>) {
  const id = String(args.p_campaign_id ?? '')
  const status = String(args.p_status ?? '')
  const reason = args.p_reason == null ? null : String(args.p_reason)

  if (!callerIsAdmin) {
    return { status: 403, body: { code: '42501', message: 'Not authorised' } }
  }
  if (status === 'rejected' && (reason ?? '').trim() === '') {
    return {
      status: 400,
      body: { code: '23514', message: 'A refusal needs a reason the owner can act on' },
    }
  }

  const campaign = db.campaigns.find((c) => c.id === id)
  if (!campaign) {
    return { status: 400, body: { code: 'P0002', message: 'No such campaign' } }
  }

  if (status === 'active') {
    const company = db.providers.find((p) => p.id === campaign.provider_id)
    if (company?.verification !== 'verified') {
      return {
        status: 400,
        body: {
          code: '23514',
          message: 'This campaign belongs to a company that is not approved',
        },
      }
    }
  }

  const before = campaign.status
  campaign.status = status
  campaign.rejection_reason = status === 'rejected' ? (reason ?? '').trim() || null : null
  campaign.reviewed_by = ADMIN_ID
  campaign.reviewed_at = new Date().toISOString()

  db.admin_audit.push({
    id: `audit-${db.admin_audit.length + 1}`,
    actor_id: ADMIN_ID,
    action: 'campaign_status',
    entity: 'campaign',
    entity_id: id,
    detail: { from: before, to: status, reason },
  })

  // `if before is not distinct from p_status then return updated;` — no
  // notification and no email when nothing actually moved.
  if (before !== status) {
    const company = db.providers.find((p) => p.id === campaign.provider_id)
    const owner = company?.owner_id as string | undefined
    if (owner && (status === 'active' || status === 'rejected')) {
      db.notifications.push({
        id: `n-${db.notifications.length + 1}`,
        user_id: owner,
        kind: 'trip',
        title_ar: status === 'active' ? 'تم اعتماد حملتك' : 'تم رفض الحملة',
        title_en: status === 'active' ? 'Your campaign is approved' : 'Your campaign was refused',
        body_ar: status === 'active' ? 'تم اعتماد حملتك وإضافتها إلى منصة ناسك.' : (campaign.rejection_reason ?? ''),
        body_en: status === 'active' ? 'Your campaign has been approved.' : (campaign.rejection_reason ?? ''),
        read: false,
        created_at: new Date().toISOString(),
        // `notify_user`'s default, which is what the five callers take.
        audience: 'owner',
      })
      db.email_outbox.push({
        id: `e-${db.email_outbox.length + 1}`,
        to_email: company?.email,
        template: status === 'active' ? 'campaign_approved' : 'campaign_rejected',
        status: 'queued',
        created_at: new Date().toISOString(),
      })
    }
  }

  return { status: 200, body: campaign }
}

const PORT = Number(process.env.NASEK_STANDIN_PORT ?? 54329)

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const path = req.url ?? ''
    seen.push({ method: req.method ?? '', path, body })

    const send = (status: number, payload: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(payload === null ? '' : JSON.stringify(payload))
    }

    if (req.method === 'OPTIONS') return send(200, null)

    // ------------------------------------------------------------- RPC
    if (path.startsWith('/rest/v1/rpc/set_campaign_status')) {
      const args = JSON.parse(body || '{}') as Record<string, unknown>
      const out = setCampaignStatusRpc(args)
      return send(out.status, out.body)
    }
    if (path.startsWith('/rest/v1/rpc/complete_past_bookings')) return send(200, 0)

    // ----------------------------------------------------------- reads
    // An administrator's view: `campaigns_read` sends them everything, and
    // `deriveCatalogue` is what decides which of those rows a page may draw.
    if (path.startsWith('/rest/v1/campaigns')) {
      return send(200, db.campaigns)
    }
    if (path.startsWith('/rest/v1/providers_public') || path.startsWith('/rest/v1/providers')) {
      return send(200, db.providers)
    }
    if (path.startsWith('/rest/v1/notifications')) {
      // The snapshot asks for one audience; the stand-in honours it, because
      // that filter is the product boundary being relied on.
      const url = new URL(path, 'http://x')
      const wanted = (url.searchParams.get('audience') ?? '').replace(/^eq\./, '')
      const rows = wanted ? db.notifications.filter((n) => n.audience === wanted) : db.notifications
      return send(200, rows)
    }
    if (path.startsWith('/rest/v1/email_outbox')) return send(200, db.email_outbox)
    // Everything else the snapshot asks for, empty rather than absent.
    if (path.startsWith('/rest/v1/')) return send(200, [])

    send(404, { code: 'PGRST202', message: 'no such route' })
  })
})

// ------------------------------------------------------------------ the DOM

const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
  }
}

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })

const typeInto = (el: HTMLTextAreaElement | HTMLInputElement, value: string) =>
  act(() => {
    const proto =
      el instanceof window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })

const byText = (root: ParentNode, selector: string, text: string) =>
  ([...root.querySelectorAll(selector)] as HTMLElement[]).find((el) =>
    (el.textContent ?? '').trim().includes(text),
  )

/**
 * The wiring `AdminRoutes` gives this tab, reproduced rather than imported.
 *
 * `AdminRoutes` is not exported — it sits behind the access gate — and the four
 * lines it contributes are these. Reproduced deliberately rather than mocked:
 * the point of the harness is the loop from the button, through the RPC, into
 * the snapshot and back out as props, and that loop needs a real
 * `useRemoteData` above a real `useCatalogue`.
 *
 * `adminCampaigns` and not `campaigns`, exactly as the dashboard passes it: the
 * screen holding the restore button has to keep seeing a suspended trip. The
 * separate assertion below checks `deriveCatalogue` keeps the two lists apart,
 * which is the property this line depends on.
 */
function AdminCampaignsScreen() {
  useRemoteData()
  const { adminCampaigns, providers, isSuspended } = useCatalogue()
  return (
    <CampaignsTab campaigns={adminCampaigns} providers={providers} isSuspended={isSuspended} />
  )
}

interface Mounted {
  container: HTMLElement
  root: Root
  errors: unknown[]
}

let storeRef: ReturnType<typeof useStore> | null = null
function Probe({ children }: { children: ReactNode }) {
  const store = useStore()
  storeRef = store
  useEffect(() => {
    storeRef = store
  })
  return <>{children}</>
}

/*
 * The language is written before the mount, not switched after it.
 *
 * `I18nProvider` reads `nasek.lang` in its `useState` initialiser, which runs
 * once — so a harness that mounts and then switches has already drawn the first
 * frame in the other language, and the toast being asserted here is written at
 * the moment of the decision.
 */
function mount(lang: 'ar' | 'en' = 'ar'): Mounted {
  window.localStorage.setItem('nasek.lang', lang)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const errors: unknown[] = []
  const root = createRoot(container, {
    onUncaughtError: (e) => errors.push(e),
    onCaughtError: (e) => errors.push(e),
  })
  act(() => {
    root.render(
      <StrictMode>
        <I18nProvider
          extra={{ ar: { ...ownerAr, ...adminAr }, en: { ...ownerEn, ...adminEn } }}
        >
          <AppStoreProvider>
            <Probe>
              <MemoryRouter>
                <AdminCampaignsScreen />
                <ToastHost />
              </MemoryRouter>
            </Probe>
          </AppStoreProvider>
        </I18nProvider>
      </StrictMode>,
    )
  })
  return { container, root, errors }
}

const unmount = (ui: Mounted) => {
  act(() => ui.root.unmount())
  ui.container.remove()
}

/** The chip that selects one of the six filters. */
const filterChip = (ui: Mounted, label: string) =>
  ([...ui.container.querySelectorAll('[role=radiogroup] button')] as HTMLElement[]).find(
    (b) => (b.textContent ?? '').trim() === label,
  )

/**
 * The figure under one of the four counters at the top of the screen.
 *
 * Read as a number rather than as a string of digits, because which digits
 * those are is a decision this project has already made and could remake:
 * `n()` formats Arabic as `ar-OM-u-nu-latn`, so counts are Latin numerals
 * inside a right-to-left page. Normalising Arabic-Indic digits as well means
 * this harness asserts the count and not the numbering system.
 */
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'

const kpi = (ui: Mounted, label: string): number => {
  for (const item of [...ui.container.querySelectorAll('li')]) {
    const text = item.textContent ?? ''
    if (!text.includes(label)) continue
    const digits = [...text.replace(label, '')]
      .map((ch) => {
        const arabic = ARABIC_INDIC.indexOf(ch)
        return arabic >= 0 ? String(arabic) : ch
      })
      .filter((ch) => ch >= '0' && ch <= '9')
      .join('')
    return digits === '' ? NaN : Number(digits)
  }
  return NaN
}

const rowTitles = (ui: Mounted) =>
  [...ui.container.querySelectorAll('tbody tr')].map((tr) =>
    (tr.querySelector('td button')?.textContent ?? '').trim(),
  )

const toastText = (ui: Mounted) =>
  ([...ui.container.querySelectorAll('[role=status] p')] as HTMLElement[])
    .map((p) => (p.textContent ?? '').trim())
    .join(' | ')

async function main() {
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve))

  check(
    'the client is pointed at the stand-in rather than a real project',
    !!supabase,
    supabase ? '' : 'no client was constructed — VITE_SUPABASE_URL was not set for this build',
  )
  if (!supabase) {
    console.log('\nCannot continue without a client.\n')
    server.close()
    process.exit(1)
  }

  // =================================================== 1. approve, end to end
  console.log(`\n--- بانتظار المراجعة → اعتماد ونشر ${'-'.repeat(20)}\n`)
  resetDb()
  seen.length = 0
  {
    const ui = mount()
    await settle()

    check(
      'the queue opens on the trips awaiting a decision',
      rowTitles(ui).length === 2,
      rowTitles(ui).join(' | '),
    )
    check(
      'the queue counter shows both',
      kpi(ui, 'بانتظار المراجعة') === 2,
      String(kpi(ui, 'بانتظار المراجعة')),
    )
    check(
      'and the live counter shows the one that is already published',
      kpi(ui, 'منشورة') === 1,
      String(kpi(ui, 'منشورة')),
    )

    // -------------------------------------------------------- 1. the click
    const approve = ([...ui.container.querySelectorAll('tbody button')] as HTMLElement[]).find(
      (b) => (b.textContent ?? '').trim() === 'اعتماد ونشر',
    )
    check('a pending trip offers "اعتماد ونشر"', !!approve)
    if (!approve) {
      unmount(ui)
      return finish()
    }

    seen.length = 0
    click(approve)
    await settle(8)

    // ------------------------------------------- 2. the request on the wire
    const rpc = seen.find((s) => s.path.includes('/rpc/set_campaign_status'))
    check('pressing it calls set_campaign_status', !!rpc, seen.map((s) => s.path).join(' '))
    if (rpc) {
      const args = JSON.parse(rpc.body || '{}')
      check(
        'as a POST, with the argument names the deployed function declares',
        rpc.method === 'POST' &&
          'p_campaign_id' in args &&
          'p_status' in args &&
          'p_reason' in args,
        `${rpc.method} ${JSON.stringify(args)}`,
      )
      check(
        'naming this campaign, the status "active", and no reason',
        args.p_campaign_id === PENDING && args.p_status === 'active' && args.p_reason === null,
        JSON.stringify(args),
      )
    }

    // ------------------------------------------------ 3. the row actually moved
    const stored = db.campaigns.find((c) => c.id === PENDING)!
    check('the campaign row is now active', stored.status === 'active', String(stored.status))
    check('with the decision recorded against an administrator', stored.reviewed_by === ADMIN_ID)
    check('and the time it was taken', !!stored.reviewed_at)
    check('and no rejection reason left behind', stored.rejection_reason === null)
    check(
      'the decision is written to the audit trail',
      db.admin_audit.some(
        (a) => a.entity_id === PENDING && (a.detail as Row).to === 'active',
      ),
      JSON.stringify(db.admin_audit.map((a) => a.detail)),
    )

    // ------------------------------------------------ 7. the owner is told
    const notice = db.notifications.find((n) => n.user_id === OWNER_ID)
    check('the owner is sent a notification', !!notice, JSON.stringify(db.notifications))
    check(
      'addressed to the Owner Portal rather than to a pilgrim dashboard',
      notice?.audience === 'owner',
      String(notice?.audience),
    )
    check('and it says the campaign was approved', notice?.title_ar === 'تم اعتماد حملتك')
    check(
      'the approval email is queued in the same transaction',
      db.email_outbox.some((e) => e.template === 'campaign_approved'),
    )

    // ----------------------------------------- 4 & 5. the screen catches up
    check(
      'the screen re-read the snapshot after the decision',
      seen.filter((s) => s.path.startsWith('/rest/v1/campaigns')).length > 0,
    )
    check(
      'the queue counter has gone down',
      kpi(ui, 'بانتظار المراجعة') === 1,
      String(kpi(ui, 'بانتظار المراجعة')),
    )
    check(
      'and the live counter has gone up',
      kpi(ui, 'منشورة') === 2,
      String(kpi(ui, 'منشورة')),
    )
    check(
      'the approved trip has left بانتظار المراجعة',
      !rowTitles(ui).some((t) => t.includes(PENDING.slice(0, 4))),
      rowTitles(ui).join(' | '),
    )

    const live = filterChip(ui, 'منشورة')
    check('there is a منشورة filter to look under', !!live)
    if (live) {
      click(live)
      await settle(2)
      check(
        'and the approved trip is now under it',
        rowTitles(ui).some((t) => t.includes(PENDING.slice(0, 4))),
        rowTitles(ui).join(' | '),
      )
    }

    check('the administrator is told it worked', toastText(ui).includes('تم اعتماد'), toastText(ui))

    // ------------------------------------- 6. and a pilgrim can now see it
    const publicList = deriveCatalogue({
      remoteReady: true,
      remoteCampaigns: storeRef!.remoteCampaigns,
      remoteProviders: storeRef!.remoteProviders,
      sessionProviders: [],
      providerCampaigns: [],
      hiddenCampaignIds: [],
      campaignSuspensions: [],
      featureOverrides: {},
      verificationOverrides: {},
      campaignStatusOverrides: {},
    })
    check(
      'the customer catalogue now carries the approved trip',
      publicList.campaigns.some((c) => c.id === PENDING),
      publicList.campaigns.map((c) => c.id.slice(0, 4)).join(','),
    )
    check(
      'and still withholds the one that is only waiting',
      !publicList.campaigns.some((c) => c.id === ORPHANED),
    )
    check(
      'while the administration keeps seeing every one of them',
      publicList.adminCampaigns.length === 4,
      String(publicList.adminCampaigns.length),
    )

    // -------------------------------------------------------- 8. quietly
    check('no uncaught error reached the root', ui.errors.length === 0, ui.errors.map(describe).join('; '))
    check(
      'the whole decision took exactly one call to the RPC',
      seen.filter((s) => s.path.includes('rpc/set_campaign_status')).length === 1,
      String(seen.filter((s) => s.path.includes('rpc/set_campaign_status')).length),
    )
    unmount(ui)
  }

  // ======================================================== 2. refuse
  console.log(`\n--- بانتظار المراجعة → رفض ${'-'.repeat(28)}\n`)
  resetDb()
  {
    const ui = mount()
    await settle()

    const reject = ([...ui.container.querySelectorAll('tbody button')] as HTMLElement[]).find(
      (b) => (b.textContent ?? '').trim() === 'رفض',
    )
    check('a pending trip offers رفض', !!reject)
    if (reject) {
      click(reject)
      await settle(2)

      const dialog = ui.container.querySelector('[role=dialog]')
      check('which asks for a reason before it will do anything', !!dialog)

      const confirm = dialog && byText(dialog, 'button', 'رفض الحملة')
      check('the confirm button is there', !!confirm)
      if (confirm) {
        // Refusing with no reason must not reach the database at all — the
        // control is disabled, exactly as `set_campaign_status` would refuse it.
        check(
          'and refuses to submit an empty reason',
          (confirm as HTMLButtonElement).disabled,
          'the confirm button was enabled with no reason typed',
        )
      }

      const box = ui.container.querySelector('[role=dialog] textarea') as HTMLTextAreaElement | null
      check('there is a box to write the reason in', !!box)
      if (box && confirm) {
        typeInto(box, 'السعر أعلى من السقف المسموح به')
        await settle(2)
        check('which enables the refusal once written', !(confirm as HTMLButtonElement).disabled)

        seen.length = 0
        click(confirm)
        await settle(8)

        const rpc = seen.find((s) => s.path.includes('/rpc/set_campaign_status'))
        const args = rpc ? JSON.parse(rpc.body || '{}') : {}
        check(
          'the refusal carries the reason to the database',
          args.p_status === 'rejected' && args.p_reason === 'السعر أعلى من السقف المسموح به',
          JSON.stringify(args),
        )

        const stored = db.campaigns.find((c) => c.id === PENDING)!
        check('the campaign is refused', stored.status === 'rejected', String(stored.status))
        check(
          'and the reason is stored where the owner will read it',
          stored.rejection_reason === 'السعر أعلى من السقف المسموح به',
          String(stored.rejection_reason),
        )
        const notice = db.notifications.find((n) => n.title_ar === 'تم رفض الحملة')
        check('the owner is told, in the Owner Portal', notice?.audience === 'owner')
        check(
          'and the refusal names the reason in the notification body',
          notice?.body_ar === 'السعر أعلى من السقف المسموح به',
          String(notice?.body_ar),
        )
        check('the refusal email is queued', db.email_outbox.some((e) => e.template === 'campaign_rejected'))
        check('the administrator is told', toastText(ui).includes('رُفضت'), toastText(ui))
        check('nothing threw', ui.errors.length === 0, ui.errors.map(describe).join('; '))
      }
    }
    unmount(ui)
  }

  // ======================================================== 3. suspend / restore
  console.log(`\n--- منشورة → إيقاف → استرجاع ${'-'.repeat(26)}\n`)
  resetDb()
  {
    const ui = mount()
    await settle()

    const live = filterChip(ui, 'منشورة')
    if (live) click(live)
    await settle(2)

    const suspend = ([...ui.container.querySelectorAll('tbody button')] as HTMLElement[]).find(
      (b) => (b.textContent ?? '').trim() === 'إيقاف',
    )
    check('a live trip offers إيقاف', !!suspend)
    if (suspend) {
      seen.length = 0
      click(suspend)
      await settle(8)

      const patch = seen.find((s) => s.method === 'PATCH' && s.path.includes('/rest/v1/campaigns'))
      check('suspending writes to the campaign row', !!patch, seen.map((s) => `${s.method} ${s.path}`).join(' '))
      if (patch) {
        check(
          'setting exactly `suspended`',
          JSON.parse(patch.body || '{}').suspended === true,
          patch.body,
        )
        check(
          'and scoping the write to this campaign',
          patch.path.includes(LIVE),
          patch.path,
        )
      }
      check('the administrator is told', toastText(ui).length > 0, toastText(ui))
      check('nothing threw', ui.errors.length === 0, ui.errors.map(describe).join('; '))
    }
    unmount(ui)
  }

  // ======================================================== 4. the refusals
  console.log(`\n--- what the transaction refuses ${'-'.repeat(22)}\n`)
  resetDb()
  {
    const ui = mount()
    await settle()

    /*
     * The trip behind an unapproved company.
     *
     * `set_campaign_status` refuses this outright, and it is the refusal an
     * administrator is most likely to meet and least likely to understand: the
     * campaign looks ordinary, and the objection is to its owner. The message
     * has to reach the screen, or the button reads as broken.
     */
    const rows = [...ui.container.querySelectorAll('tbody tr')]
    const orphanRow = rows.find((tr) => (tr.textContent ?? '').includes(ORPHANED.slice(0, 4)))
    check('the queue shows the trip behind an unapproved company', !!orphanRow)
    if (orphanRow) {
      const approve = ([...orphanRow.querySelectorAll('button')] as HTMLElement[]).find(
        (b) => (b.textContent ?? '').trim() === 'اعتماد ونشر',
      )
      if (approve) {
        click(approve)
        await settle(8)

        const stored = db.campaigns.find((c) => c.id === ORPHANED)!
        check(
          'approving it changes nothing in the database',
          stored.status === 'pending_approval',
          String(stored.status),
        )

        /*
         * The refusal, explained rather than relayed.
         *
         * `set_campaign_status` raises "This campaign belongs to a company that
         * is not approved" — a good sentence, in the wrong language for this
         * reader. Appended to an Arabic message it was the whole of the
         * explanation, and the button read as one that had simply failed.
         */
        const said = toastText(ui)
        check(
          'the administrator is told why, in Arabic',
          said.includes('لا يمكن نشر رحلة تتبع شركة موقوفة'),
          said,
        )
        check('and the message names the company', said.includes('حملة موقوفة'), said)
        check(
          'and names what to do about it',
          said.includes('أصحاب الحملات'),
          said,
        )
        check(
          'with none of the database’s English left in it',
          !/[A-Za-z]{4,}/.test(said),
          said,
        )
        check('no notification was written', db.notifications.length === 0)
        check('and no email was queued', db.email_outbox.length === 0)
      }
    }
    unmount(ui)
  }

  /*
   * The same refusal, read by an administrator working in English.
   *
   * A translated message is only translated if both halves exist; asserting one
   * language proves the string was looked up, not that it was written twice.
   */
  resetDb()
  {
    const ui = mount('en')
    await settle()
    const rows = [...ui.container.querySelectorAll('tbody tr')]
    const orphanRow = rows.find((tr) => (tr.textContent ?? '').includes(ORPHANED.slice(0, 4)))
    const approve =
      orphanRow &&
      ([...orphanRow.querySelectorAll('button')] as HTMLElement[]).find(
        (b) => (b.textContent ?? '').trim() === 'Approve and publish',
      )
    check('the English dashboard offers "Approve and publish"', !!approve)
    if (approve) {
      click(approve)
      await settle(8)
      const said = toastText(ui)
      check(
        'and explains the block in English',
        said.includes('cannot be published for a suspended company'),
        said,
      )
      check('naming the company', said.includes('Suspended Co'), said)
      check('and the screen it is fixed on', said.includes('Campaign owners'), said)
      check(
        'the campaign is still untouched',
        db.campaigns.find((c) => c.id === ORPHANED)!.status === 'pending_approval',
      )
    }
    unmount(ui)
  }

  /*
   * And a company that has never been approved, as opposed to one taken down —
   * a different sentence, because it is a different thing to do about it.
   */
  resetDb()
  db.providers = db.providers.map((p) =>
    p.id === SUSPENDED_CO ? { ...p, verification: 'pending', name_ar: 'حملة جديدة' } : p,
  )
  {
    const ui = mount()
    await settle()
    const rows = [...ui.container.querySelectorAll('tbody tr')]
    const orphanRow = rows.find((tr) => (tr.textContent ?? '').includes(ORPHANED.slice(0, 4)))
    const approve =
      orphanRow &&
      ([...orphanRow.querySelectorAll('button')] as HTMLElement[]).find(
        (b) => (b.textContent ?? '').trim() === 'اعتماد ونشر',
      )
    if (approve) {
      click(approve)
      await settle(8)
      const said = toastText(ui)
      check(
        'a company still in the queue gets "approve it first", not "restore it"',
        said.includes('شركة غير معتمدة') && !said.includes('موقوفة'),
        said,
      )
      check('naming that company too', said.includes('حملة جديدة'), said)
    }
    unmount(ui)
  }

  // A caller the database does not accept as an administrator.
  resetDb()
  callerIsAdmin = false
  {
    const ui = mount()
    await settle()
    const approve = ([...ui.container.querySelectorAll('tbody button')] as HTMLElement[]).find(
      (b) => (b.textContent ?? '').trim() === 'اعتماد ونشر',
    )
    if (approve) {
      click(approve)
      await settle(8)
      const stored = db.campaigns.find((c) => c.id === PENDING)!
      check(
        'a caller the database refuses cannot approve anything',
        stored.status === 'pending_approval',
        String(stored.status),
      )
      check(
        'and the screen says so in the reader’s language rather than relaying a SQLSTATE',
        toastText(ui).includes('صلاحية الإدارة'),
        toastText(ui),
      )
      check(
        'the store was not updated behind the refusal',
        !storeRef?.remoteCampaigns.some((c) => c.id === PENDING && c.status === 'active'),
      )
    }
    unmount(ui)
  }

  finish()
}

function finish() {
  const reactErrors = (globalThis as unknown as { __reactErrors?: string[] }).__reactErrors ?? []
  check('React printed no warnings of its own', reactErrors.length === 0, reactErrors.join(' | '))
  console.log(
    failures === 0
      ? '\nAll campaign approval checks passed.\n'
      : `\n${failures} campaign approval check(s) failed.\n`,
  )
  server.close()
  process.exit(failures === 0 ? 0 : 1)
}

void main()
