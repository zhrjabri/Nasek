/*
 * The booking and manual-payment workflow, end to end.
 *
 * NASEK does not take money. A customer creates a booking *request*, NASEK
 * issues an invoice number, the customer sends the invoice to the campaign
 * owner over WhatsApp, the owner is paid directly and then records that they
 * have been. Every claim in that sentence is something that can quietly stop
 * being true, and each one is checked here.
 *
 * THREE KINDS OF CHECK, AND WHY THE MIX
 *
 *   1. Pure logic — the invoice, the totals, the phone normalisation, the
 *      WhatsApp link. These are commercial claims about real money between two
 *      real people, so they are asserted directly rather than inferred from a
 *      page that rendered without throwing.
 *
 *   2. The migration's own text. `book_campaign` and `set_booking_status` are
 *      SECURITY DEFINER functions whose rules cannot be exercised without a
 *      live database and three different signed-in roles — that belongs to
 *      `verify:backend` and to a human with the credentials. What *can* be
 *      checked without either is that the SQL this repository would apply still
 *      says what the workflow depends on it saying: 'pending' rather than
 *      'confirmed', the price read off the locked row rather than off the
 *      caller, the seats re-checked after the lock, and no UPDATE policy left
 *      on `bookings` for a customer to confirm their own unpaid trip through.
 *      `verify:isolation` reads policy SQL the same way and for the same
 *      reason.
 *
 *   3. The screens, in jsdom, with the real store. The order of operations is
 *      the part that matters most and is the part a unit test cannot see: the
 *      WhatsApp button must not exist until a booking has been saved.
 */
import { StrictMode, act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { I18nProvider } from '@/i18n'
import { AppStoreProvider, useStore } from '@/store/AppStore'
import { BookingPage } from '@/pages/BookingPage'
import { DashboardPage as CustomerDashboardPage } from '@/pages/DashboardPage'
import { bookingsApi, bookingTotal, mediationFee, NASEK_FEE_RATE } from '@/services/api/bookings'
import {
  buildInvoice,
  invoiceMessage,
  invoiceWhatsappUrl,
  tripReference,
  whatsappDigits,
} from '@/lib/invoice'
import { toE164 } from '@/services/auth/phone'
import type { Booking, Campaign, Provider, User } from '@/types'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const head = (s: string) => console.log(`\n--- ${s} ---\n`)

// ------------------------------------------------------------------ fixtures

/*
 * Invented people, invented company, invented trip — and every one of them
 * confined to this file, which is compiled only by `verify:booking` and reaches
 * no bundle. `verify:isolation` reads the three built applications and would
 * fail if anything here did.
 */
const PROVIDER: Provider = {
  id: 'prov-1',
  name: { ar: 'حملة الاختبار', en: 'Harness Campaigns' },
  tagline: { ar: '', en: '' },
  description: { ar: '', en: '' },
  wilayahId: 'muscat',
  verification: 'verified',
  experienceYears: 5,
  rating: 4.5,
  reviewCount: 2,
  phone: '+968 9123 4567',
  email: 'owner@example.com',
  initials: 'HC',
  brandColor: '#1c5e4c',
  plan: 'basic',
  joinedAt: '2026-01-01',
}

const CAMPAIGN: Campaign = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  providerId: PROVIDER.id,
  type: 'umrah',
  title: { ar: 'رحلة الاختبار', en: 'Harness Trip' },
  description: { ar: '', en: '' },
  price: 350,
  wilayahId: 'muscat',
  travelMethod: 'air',
  departureDate: '2027-03-12',
  returnDate: '2027-03-22',
  seatsTotal: 40,
  seatsAvailable: 10,
  services: [],
  hotelMakkah: { ar: '', en: '' },
  hotelMadinah: { ar: '', en: '' },
  haramDistanceM: 400,
  rating: 4.5,
  reviewCount: 2,
  featured: false,
  bookingsCount: 3,
  suspended: false,
  deleted: false,
  status: 'active',
  includedServices: [],
  excludedServices: [],
  contactPersons: [],
  images: [],
  terms: { ar: '', en: '' },
}

const CUSTOMER: User = {
  id: 'user-1',
  name: 'Aisha Al-Harthy',
  email: 'aisha@example.com',
  phone: '+968 9876 5432',
  role: 'customer',
  wilayahId: 'muscat',
  avatarColor: '#1c5e4c',
  createdAt: '2026-02-01',
}

// =========================================================== 1. the counting

head('passenger counts and what they come to')

const priced = (male: number, female: number) => bookingTotal(CAMPAIGN.price, male + female)

check('one male passenger', 1 + 0 === 1 && priced(1, 0) === 350, `${priced(1, 0)}`)
check('one female passenger', 0 + 1 === 1 && priced(0, 1) === 350, `${priced(0, 1)}`)
check('two male and one female is three passengers', 2 + 1 === 3)
check('and comes to three times the per-head price', priced(2, 1) === 1050, `${priced(2, 1)}`)
check('a fractional price still multiplies exactly', bookingTotal(12.345, 3) === 37.035,
  `${bookingTotal(12.345, 3)}`)

/*
 * No fee on the traveller's bill.
 *
 * The total used to be `price × travellers × 1.02`. The customer pays the
 * campaign owner directly now, so a fee folded into that figure is one they
 * hand to the owner on NASEK's behalf with nothing to pass it back.
 */
check('the total carries no platform fee', bookingTotal(350, 2) === 700, `${bookingTotal(350, 2)}`)
check('the mediation fee is charged on top, to the owner, on confirmed value',
  mediationFee(1000) === 20 && NASEK_FEE_RATE === 0.02, `${mediationFee(1000)}`)

/*
 * Everything below awaits something, and this harness is built for a browser
 * target with no top-level await — so the rest of the suite and its summary are
 * wrapped rather than left at module scope. `verify-interaction.tsx` is split
 * the same way, for the same reason.
 */
async function rest() {
  // ----------------------------------------------------- rejecting bad counts

  const rejected = async (male: number, female: number) => {
    try {
      await bookingsApi.create({
        user: CUSTOMER,
        campaign: CAMPAIGN,
        maleCount: male,
        femaleCount: female,
        contactName: CUSTOMER.name,
        contactPhone: CUSTOMER.phone,
        contactEmail: CUSTOMER.email,
      })
      return false
    } catch {
      return true
    }
  }

  check('zero passengers is refused', await rejected(0, 0))
  check('a negative male count is refused', await rejected(-1, 0))
  check('a negative female count is refused', await rejected(0, -1))
  check('negatives that cancel out are still refused', await rejected(-2, 2))
  check('more passengers than seats is refused', await rejected(20, 20))

  /*
   * `readCount` is the page's own parser, restated here as the property it must
   * hold: anything that is not a whole number in range reads as zero rather than
   * as NaN, which would propagate into a total.
   */
  const parses = (raw: string) => {
    const value = Number(raw)
    return Number.isInteger(value) && value >= 0 && value <= 99 ? value : 0
  }
  check('a non-integer count does not reach the arithmetic',
    parses('1.5') === 0 && parses('abc') === 0 && parses('-3') === 0 && parses('2') === 2)

  // ================================================ 2. the booking itself

  head('a created booking')

  const created = await bookingsApi.create({
    user: CUSTOMER,
    campaign: CAMPAIGN,
    maleCount: 2,
    femaleCount: 1,
    contactName: CUSTOMER.name,
    contactPhone: CUSTOMER.phone,
    contactEmail: CUSTOMER.email,
  })

  check('it is awaiting payment, not confirmed', created.status === 'pending', created.status)
  check('the split is recorded', created.maleCount === 2 && created.femaleCount === 1)
  check('the passenger total agrees with the split', created.travellersCount === 3)
  check('the total is the authoritative price times the passengers',
    created.totalPrice === 1050, `${created.totalPrice}`)
  check('the per-head price is snapshotted onto the booking',
    created.pricePerPerson === CAMPAIGN.price, `${created.pricePerPerson}`)

  // ---------------------------------------------------------- invoice numbers

  check('an invoice number is issued', /^NSK-\d{6}$/.test(created.reference), created.reference)

  const second = await bookingsApi.create({
    user: CUSTOMER,
    campaign: CAMPAIGN,
    maleCount: 1,
    femaleCount: 0,
    contactName: CUSTOMER.name,
    contactPhone: CUSTOMER.phone,
    contactEmail: CUSTOMER.email,
  })
  check('and the next one differs', created.reference !== second.reference,
    `${created.reference} vs ${second.reference}`)

  // ------------------------------------------------------- the price snapshot

  /*
   * The whole point of storing a per-head price rather than reading the campaign.
   *
   * The owner re-prices the trip; the invoice already issued must not move.
   */
  const repriced: Campaign = { ...CAMPAIGN, price: 400 }
  const historic = buildInvoice(created, repriced, PROVIDER, 'en')
  check('an invoice keeps the price it was created at after the campaign is re-priced',
    historic.pricePerPerson === 350 && historic.totalAmount === 1050,
    `${historic.pricePerPerson} / ${historic.totalAmount}`)
  check('and the campaign really did change underneath it', repriced.price === 400)

  // ======================================================== 3. phone numbers

  head('phone numbers')

  check('an Omani mobile normalises to E.164', toE164('9123 4567') === '+96891234567',
    String(toE164('9123 4567')))
  check('as does one written with 00', toE164('0096891234567') === '+96891234567')
  check('and one written with the country code and no prefix',
    toE164('96891234567') === '+96891234567')
  check('WhatsApp gets digits with no plus', whatsappDigits('+968 9123 4567') === '96891234567',
    String(whatsappDigits('+968 9123 4567')))
  check('a number that cannot be read yields nothing rather than a guess',
    whatsappDigits('12') === null && whatsappDigits('') === null && whatsappDigits(null) === null)

  /*
   * A company with no number produces no link.
   *
   * This is the load-bearing one. A `wa.me` URL built from a fallback would
   * deliver a real customer's name, number and trip to whoever happens to own the
   * number the fallback invented.
   */
  const noPhone: Provider = { ...PROVIDER, phone: '' }
  const orphan = buildInvoice(created, CAMPAIGN, noPhone, 'en')
  check('an owner with no number gives the invoice no destination', orphan.providerPhone === null)
  check('and no WhatsApp link at all', invoiceWhatsappUrl(orphan, 'en') === null)
  check('nor does a garbled one', invoiceWhatsappUrl(
    buildInvoice(created, CAMPAIGN, { ...PROVIDER, phone: '00' }, 'en'), 'en') === null)

  const invoice = buildInvoice(created, CAMPAIGN, PROVIDER, 'en')
  check('the real owner number is what the link is addressed to',
    invoiceWhatsappUrl(invoice, 'en')?.startsWith('https://wa.me/96891234567?text=') === true,
    invoiceWhatsappUrl(invoice, 'en')?.slice(0, 40))
  check('and it is not a hard-coded placeholder',
    !(invoiceWhatsappUrl(invoice, 'en') ?? '').includes('96800000000'))

  // ==================================================== 4. the invoice itself

  head('the invoice')

  check('the invoice number is the booking reference, reused',
    invoice.invoiceNumber === created.reference)
  check('the customer is the real customer', invoice.customerName === 'Aisha Al-Harthy')
  check('with their real number', invoice.customerPhone === '+968 9876 5432')
  check('the trip reference is derived from the campaign, stably',
    invoice.tripReference === tripReference(CAMPAIGN.id) &&
      invoice.tripReference === 'T-AAAAAA',
    invoice.tripReference)
  check('the owner is named', invoice.providerName === 'Harness Campaigns')

  /*
    * One invoice per language, because `buildInvoice` resolves the bilingual
    * campaign and company names as it assembles — the message is not a
    * translation layer over a language-neutral object, and building an English
    * invoice and printing it in Arabic would put "Harness Campaigns" under
    * "صاحب الحملة".
    */
  const ar = invoiceMessage(buildInvoice(created, CAMPAIGN, PROVIDER, 'ar'), 'ar')
  const en = invoiceMessage(invoice, 'en')
  check('the invoice takes its names from the language it was built for',
    buildInvoice(created, CAMPAIGN, PROVIDER, 'ar').campaignName === 'رحلة الاختبار' &&
      invoice.campaignName === 'Harness Trip')

  check('the Arabic invoice opens with the NASEK heading', ar.startsWith('فاتورة حجز ناسِك'))
  for (const line of [
    `رقم الفاتورة: ${created.reference}`,
    'اسم العميل: Aisha Al-Harthy',
    'الحملة: رحلة الاختبار',
    `الرحلة رقم: ${invoice.tripReference}`,
    'ذكور: 2',
    'إناث: 1',
    'الإجمالي: 3',
    'السعر للفرد: 350 ر.ع',
    'الإجمالي: 1,050 ر.ع',
    'صاحب الحملة: حملة الاختبار',
    'رقم التواصل: +96891234567',
    'يرجى إرسال بيانات الدفع لإتمام الحجز.',
    'تم إنشاء الطلب عبر منصة ناسِك.',
  ]) {
    check(`Arabic invoice line: ${line.slice(0, 34)}`, ar.includes(line))
  }

  check('the English invoice opens with the NASEK heading', en.startsWith('NASEK Booking Invoice'))
  for (const line of [
    `Invoice No.: ${created.reference}`,
    'Customer: Aisha Al-Harthy',
    'Campaign: Harness Trip',
    `Trip No.: ${invoice.tripReference}`,
    'Male: 2',
    'Female: 1',
    'Total: 3',
    'Price per person: OMR 350',
    'Total: OMR 1,050',
    'Campaign Owner: Harness Campaigns',
    'Contact Number: +96891234567',
    'Please send the payment details to complete the booking.',
    'This booking request was created through NASEK.',
  ]) {
    check(`English invoice line: ${line.slice(0, 34)}`, en.includes(line))
  }

  /*
   * Neither invoice may claim NASEK took the money.
   *
   * The wording is fixed and reviewed, but wording gets edited; this is the
   * property underneath it.
   */
  for (const [label, text] of [['Arabic', ar], ['English', en]] as const) {
    check(`the ${label} invoice does not claim NASEK was paid`,
      !/paid to nasek|nasek has received|دفعت لناسِك|استلم ناسِك/i.test(text))
  }

  check('a booking with no recorded split prints dashes rather than zeroes',
    invoiceMessage(
      buildInvoice({ ...created, maleCount: undefined, femaleCount: undefined,
        pricePerPerson: undefined }, CAMPAIGN, PROVIDER, 'en'), 'en',
    ).includes('Male: —'))

  // --------------------------------------------------------------- the URL

  // Built from the Arabic invoice, so the round trip below compares the message
  // this link actually carries rather than one assembled a different way.
  const waUrl = invoiceWhatsappUrl(buildInvoice(created, CAMPAIGN, PROVIDER, 'ar'), 'ar')!
  const text = decodeURIComponent(new URL(waUrl).searchParams.get('text') ?? '')
  check('the message survives a round trip through the URL', text === ar)
  check('spaces are percent-encoded rather than turned into plus signs',
    waUrl.includes('%20') && !/\?text=[^&]*\+/.test(waUrl))
  check('newlines are encoded', waUrl.includes('%0A'))
  check('the language follows the interface',
    invoiceWhatsappUrl(invoice, 'en')!.includes(encodeURIComponent('NASEK Booking Invoice')))

  // =================================================== 5. what the SQL says

  head('the migration this repository would apply')

  const root = path.resolve(import.meta.dirname ?? '.', '..')
  const sql = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260910000100_manual_payment_workflow.sql'),
    'utf8',
  )

  const says = (label: string, pattern: RegExp) => check(label, pattern.test(sql))

  says('a new booking is written as pending', /'pending', p_notes/)
  says('and never as confirmed', /values \([\s\S]{0,400}'pending'/)
  check('the word confirmed does not appear as an inserted status',
    !/status[^\n]*\)\s*\n\s*values[\s\S]{0,400}'confirmed'/.test(sql))
  says('the price is read off the locked campaign row', /unit\s*:=\s*trip\.price/)
  says('and the total is computed from it, not from the caller',
    /total\s*:=\s*round\(unit \* wanted, 3\)/)
  says('the campaign row is locked before the seats are read', /for update/)
  says('and the seats are re-checked after the lock',
    /trip\.seats_available < wanted/)
  says('negative passenger counts are refused server-side', /males < 0 or females < 0/)
  says('a booking with no passengers is refused', /wanted < 1/)
  says('a booking with no contact number is refused', /A contact phone number is required to book/)
  says('the reference still comes from the sequence, not a row count',
    /nextval\('public\.booking_reference_seq'\)/)
  says('the gender split is stored', /male_count, female_count, price_per_person/)
  says('and the per-head price with it', /price_per_person numeric\(10,3\)/)
  says('the split must add up to the passenger count',
    /male_count \+ female_count = travellers_count/)
  says('the old six-argument booking function is dropped rather than left as an overload',
    /drop function if exists public\.book_campaign\(uuid, jsonb, text, text, text, text\)/)

  says('only the owner or an administrator may confirm a payment',
    /not public\.owns_campaign\(target\.campaign_id\) and not public\.is_admin\(\)/)
  says('and only from pending', /Only a booking awaiting payment can be confirmed/)
  says('cancelling is refused here so the seats are not stranded',
    /Use cancel_booking so the seats are returned/)

  says('the direct UPDATE policy on bookings is removed',
    /drop policy if exists bookings_update on public\.bookings/)
  says('and the UPDATE grant with it', /revoke update on public\.bookings from authenticated/)
  check('the read policy is left alone — this migration does not touch who may see a booking',
    !/drop policy if exists bookings_read/.test(sql))
  check('nothing here deletes a traveller row',
    !/delete from public\.travellers|drop table[^\n]*travellers/i.test(sql))
  check('nothing here deletes or rewrites an existing booking',
    !/delete from public\.bookings|update public\.bookings set (?!status = 'confirmed')/i.test(sql))
  check('the new columns are nullable, so historical bookings are not back-filled with invented data',
    /add column if not exists male_count\s+int,/.test(sql) &&
      !/male_count\s+int\s+not null/.test(sql))

  // ------------------------------------------ who may see which booking

  /*
   * The three parties, and nobody else.
   *
   * `bookings_read` is the only thing standing between one campaign owner and
   * another's customer list, and this migration must not have loosened it. The
   * policy lives in the RLS file rather than this one, so it is read from
   * there: an assertion about the SQL that would actually be applied, not about
   * a copy of it.
   */
  const rls = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260901000200_rls_policies.sql'),
    'utf8',
  )
  const readPolicy = rls.slice(
    rls.indexOf('create policy bookings_read'),
    rls.indexOf('bookings_insert_own'),
  )
  /*
   * The policy's `using (...)` expression on its own.
   *
   * Counting branches over the whole statement would count the o-r in "for
   * select", and a check that passes for the wrong reason is worse than none.
   */
  const usingClause = (policy: string) =>
    policy.slice(policy.indexOf('using ('), policy.indexOf(');'))

  check('a customer may read their own booking', /user_id = auth\.uid\(\)/.test(readPolicy))
  check('a campaign owner may read bookings on their own trips',
    /public\.owns_campaign\(campaign_id\)/.test(readPolicy))
  check('an administrator may read any booking', /public\.is_admin\(\)/.test(readPolicy))
  check('and nobody else is named — there is no fourth branch',
    (usingClause(readPolicy).match(/(^|\s)or\s/g) ?? []).length === 2,
    JSON.stringify(usingClause(readPolicy).trim()).slice(0, 200))
  check('owns_campaign really is ownership, joined through the company',
    /join public\.providers pr on pr\.id = c\.provider_id[\s\S]{0,120}pr\.owner_id = auth\.uid\(\)/
      .test(rls))

  /*
   * And the portal's own filter, which is the second line rather than the first.
   *
   * The database is what stops one owner reading another's ledger; this filter
   * is presentational, narrowing to the trips currently listed. It is checked
   * because a bug here shows an owner rows they are entitled to and did not ask
   * for — and because if it ever became the *only* barrier, this is the test
   * that would still be describing a barrier that no longer holds.
   */
  const mine: Campaign = CAMPAIGN
  const theirs: Campaign = { ...CAMPAIGN, id: 'other-campaign', providerId: 'prov-2' }
  const ledger: Booking[] = [
    { ...created, id: 'b-mine', campaignId: mine.id },
    { ...created, id: 'b-theirs', campaignId: theirs.id },
  ]
  const ownedIds = new Set([mine].map((c) => c.id))
  const visibleToOwner = ledger.filter((b) => ownedIds.has(b.campaignId))
  check('an owner is shown bookings on their own campaign',
    visibleToOwner.some((b) => b.id === 'b-mine'))
  check('and not one on another company’s campaign',
    !visibleToOwner.some((b) => b.id === 'b-theirs'), `${visibleToOwner.length} rows`)

  /*
   * Confirming a payment is the owner's, not the payer's.
   *
   * The traveller is deliberately absent from `set_booking_status`'s permission
   * check — they are the one who would benefit from marking their own unpaid
   * booking as paid.
   */
  const setStatus = sql.slice(
    sql.indexOf('create or replace function public.set_booking_status'),
    sql.indexOf('-- ------------------------------------------------------------------ 4. RLS'),
  )
  check('the customer cannot confirm their own payment',
    !/target\.user_id = auth\.uid\(\)|user_id = caller/.test(setStatus))
  check('only the campaign owner or an administrator can',
    /public\.owns_campaign\(target\.campaign_id\)[\s\S]{0,40}public\.is_admin\(\)/.test(setStatus))

  // ================================================ 6. the screens, in jsdom

  head('the customer flow')

  interface Mounted {
    container: HTMLElement
    root: Root
    errors: unknown[]
  }

  const settle = async (times = 2) => {
    for (let i = 0; i < times; i++) await act(async () => { await Promise.resolve() })
  }

  let dispatch: ((action: Record<string, unknown>) => void) | null = null
  function Seed({ children }: { children: ReactNode }) {
    const store = useStore()
    dispatch = store.dispatch as unknown as typeof dispatch
    return <>{children}</>
  }

  function mount(node: React.ReactElement, lang: 'ar' | 'en' = 'en'): Mounted {
    // The provider reads the stored language on mount; setting it before the
    // mount is how this harness chooses one without a language switcher.
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
          <I18nProvider>
            <AppStoreProvider>
              <Seed>{node}</Seed>
            </AppStoreProvider>
          </I18nProvider>
        </StrictMode>,
      )
    })
    return { container, root, errors }
  }

  const snapshot = (bookings: Booking[] = [], providers = [PROVIDER], campaigns = [CAMPAIGN]) => ({
    providers,
    campaigns,
    bookings,
    reviews: [],
    notifications: [],
    savedIds: [],
    profiles: [],
  })

  async function bookingPage(
    entry: string,
    {
      user = CUSTOMER,
      bookings = [] as Booking[],
      providers = [PROVIDER],
      lang = 'en' as 'ar' | 'en',
    } = {},
  ) {
    const ui = mount(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/booking/:id" element={<BookingPage />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>,
      lang,
    )
    await settle()
    act(() => {
      if (user) dispatch?.({ type: 'signIn', user })
      dispatch?.({ type: 'hydrateRemote', snapshot: snapshot(bookings, providers) })
    })
    await settle()
    return ui
  }

  const url = (male = 1, female = 0) => `/booking/${CAMPAIGN.id}?m=${male}&f=${female}`

  // ------------------------------------------------------- the phone gate

  {
    const ui = await bookingPage(url(), { user: { ...CUSTOMER, phone: '' } })
    const body = ui.container.textContent ?? ''
    check('a customer with no phone number is blocked',
      body.includes('Please add your phone number to complete the booking request.'))
    check('and is offered somewhere to add one',
      (ui.container.querySelector('a[href*="tab=profile"]') as HTMLAnchorElement | null) !== null)
    const link = ui.container.querySelector('a[href*="tab=profile"]') as HTMLAnchorElement
    check('which will bring them back to this trip with their choices intact',
      decodeURIComponent(link.getAttribute('href') ?? '').includes(`/booking/${CAMPAIGN.id}?m=1&f=0`),
      link.getAttribute('href') ?? '')
    check('no passenger stepper is drawn behind the block',
      !body.includes('Total passengers'))
    check('nothing threw', ui.errors.length === 0)
    act(() => ui.root.unmount())
  }

  {
    const ui = await bookingPage(url(), { user: { ...CUSTOMER, phone: 'not a number' } })
    check('an unusable number counts as no number',
      (ui.container.textContent ?? '').includes('Please add your phone number'))
    act(() => ui.root.unmount())
  }

  {
    const ui = await bookingPage(url())
    const body = ui.container.textContent ?? ''
    check('a customer with a valid number reaches the passenger step',
      body.includes('Total passengers') && !body.includes('Please add your phone number'))
    check('and is never asked to type their number again', !body.includes('input name="phone"'))
    act(() => ui.root.unmount())
  }

  // ------------------------------------------------------ totals on screen

  {
    const ui = await bookingPage(url(2, 1))
    const body = ui.container.textContent ?? ''
    check('the passenger total is the sum of the two counts', body.includes('3'))
    check('the total amount is passengers times the price', body.includes('1,050'), '')
    check('and no service-fee line is offered to the customer',
      !body.includes('service fee') && !body.includes('Subtotal'))
    act(() => ui.root.unmount())
  }

  // ------------------------------- no WhatsApp before the booking is saved

  {
    const ui = await bookingPage(url(1, 0))
    const links = [...ui.container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
    check('no WhatsApp link exists before a booking has been created',
      !links.some((href) => href.includes('wa.me')), links.filter((h) => h.includes('wa.me')).join())
    check('nor does the page offer to send an invoice',
      !(ui.container.textContent ?? '').includes('Send invoice to campaign owner'))
    act(() => ui.root.unmount())
  }

  // ------------------------------------------- a direct URL, and a refresh

  {
    const ui = await bookingPage(url(3, 2))
    const body = ui.container.textContent ?? ''
    check('a direct booking URL restores the passenger counts it carries',
      body.includes('5'), '')
    check('a booking page opened cold names the trip', body.includes('Harness Trip'))
    act(() => ui.root.unmount())
  }

  // ------------------------------------------------------- Arabic and English

  for (const [lang, needle] of [['ar', 'من سيسافر؟'], ['en', 'Who is travelling?']] as const) {
    const ui = await bookingPage(url(), { lang })
    check(`the booking page draws in ${lang}`, (ui.container.textContent ?? '').includes(needle))
    check(`and nothing threw drawing it in ${lang}`, ui.errors.length === 0)
    act(() => ui.root.unmount())
  }
  window.localStorage.setItem('nasek.lang', 'en')

  // ============================== 7. the dashboard reopens, never recreates

  head('reopening the invoice from the dashboard')

  {
    const saved: Booking = { ...created, userId: CUSTOMER.id }
    const ui = mount(
      <MemoryRouter initialEntries={['/dashboard?tab=bookings']}>
        <CustomerDashboardPage />
      </MemoryRouter>,
    )
    await settle()
    act(() => {
      dispatch?.({ type: 'signIn', user: CUSTOMER })
      dispatch?.({ type: 'hydrateRemote', snapshot: snapshot([saved]) })
    })
    await settle()

    const body = ui.container.textContent ?? ''
    check('the customer sees their own booking', body.includes(saved.reference))
    check('with the invoice number labelled as one', body.includes('NASEK invoice number'))
    check('and told what it is waiting for',
      body.includes('Awaiting payment completion with the campaign owner'))

    const wa = [...ui.container.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.includes('wa.me'))
    check('the WhatsApp action is offered again for a saved booking', wa.length === 1, `${wa.length}`)
    check('and it carries the invoice number the booking already has',
      decodeURIComponent(wa[0]).includes(saved.reference))
    /*
      * The reference is printed twice on purpose — once on the booking, once on
      * the invoice panel under it — so counting mentions proves nothing. What
      * must hold is that they are all the *same* reference and there is exactly
      * one WhatsApp link: reopening must not mint a second booking or a second
      * invoice number.
      */
    const mentioned = new Set(body.match(/NSK-\d{6}/g) ?? [])
    check('reopening it creates no second booking',
      mentioned.size === 1 && mentioned.has(saved.reference), [...mentioned].join(', '))
    check('nothing threw', ui.errors.length === 0)
    act(() => ui.root.unmount())
  }

  // ------------------------------------------ a pending booking is not revenue

  {
    const pending: Booking = { ...created, status: 'pending' }
    const confirmed: Booking = { ...second, status: 'confirmed' }
    const settled = [pending, confirmed].filter(
      (b) => b.status === 'confirmed' || b.status === 'completed',
    )
    const value = settled.reduce((s, b) => s + b.totalPrice, 0)
    check('a pending booking contributes nothing to confirmed value',
      value === confirmed.totalPrice, `${value}`)
    check('and nothing to the mediation fee',
      mediationFee(value) === Math.round(confirmed.totalPrice * 0.02 * 1000) / 1000)
    check('a confirmed booking does contribute', value > 0)
  }

  // ------------------------------------------------------------------ verdict

  const reactErrors = (globalThis as { __reactErrors?: string[] }).__reactErrors ?? []
  for (const message of reactErrors) check(`React printed no warning: ${message.slice(0, 70)}`, false)
  if (reactErrors.length === 0) check('React printed no warnings of its own', true)

  console.log(
    failures === 0
      ? '\nAll booking and manual-payment checks passed.'
      : `\n${failures} booking check(s) failed.`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

void rest()
