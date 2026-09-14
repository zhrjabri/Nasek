/*
 * Does the database enforce the booking, seat, review, permit and admin rules —
 * for someone calling the REST API directly, not only for someone using a screen?
 *
 * Every migration in `supabase/migrations` is applied to a real Postgres
 * (PGlite, see `scripts/db/supabase-stub.mjs`), and each check acts as a
 * particular person the way PostgREST would: the `authenticated` role, with a
 * JWT whose `sub` is that person. RLS, grants, triggers and SECURITY DEFINER are
 * the engine's own, so a refusal here is the refusal the project gives.
 *
 * It runs twice.
 *
 *   1. Against every migration. Each rule has to hold, and the legitimate path
 *      beside it has to keep working — a lock that also locks out the owner is
 *      not a fix.
 *   2. Against the schema as it stood before 20260913000200_security_hardening.
 *      The same attempts have to SUCCEED there. That is what proves each check
 *      can fail at all: a check that passes against the holes it describes is
 *      testing nothing.
 *
 *   npm run verify:database
 *
 * No network, no Supabase project, no credentials. Nothing here can touch
 * production.
 */
import fs from 'node:fs'
import path from 'node:path'
import { as, boot, migrationFiles, root } from './db/supabase-stub.mjs'

const HARDENING = '20260913000200_security_hardening.sql'

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}
const head = (title) => console.log(`\n-- ${title}`)

/** The error message of a refused attempt, or null when it went through. */
async function attempt(fn) {
  try {
    await fn()
    return null
  } catch (error) {
    return String(error.message ?? error)
  }
}

const day = (offset) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

const ID = {
  customer: '00000000-0000-4000-8000-000000000001',
  stranger: '00000000-0000-4000-8000-000000000002',
  owner: '00000000-0000-4000-8000-000000000003',
  rival: '00000000-0000-4000-8000-000000000004',
  admin: '00000000-0000-4000-8000-000000000005',
  company: '00000000-0000-4000-8000-0000000000c1',
  rivalCompany: '00000000-0000-4000-8000-0000000000c2',
  trip: '00000000-0000-4000-8000-0000000000f1',
  rivalTrip: '00000000-0000-4000-8000-0000000000f2',
  pastTrip: '00000000-0000-4000-8000-0000000000f3',
}
const APPROVED_PERMIT = `${ID.owner}/approved-permit.jpg`
const OWNER_PHONE = '+96890000001'

/** People, two verified companies, a future trip each and one that has returned. */
async function seed(db) {
  for (const [key, email] of [
    ['customer', 'customer@example.test'],
    ['stranger', 'stranger@example.test'],
    ['owner', 'owner@example.test'],
    ['rival', 'rival@example.test'],
    ['admin', 'admin@example.test'],
  ]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ID[key], email])
  }
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [ID.admin])

  const company = `insert into public.providers
      (id, owner_id, name_ar, name_en, wilayah_id, governorate, verification, phone, licence_path)
    values ($1, $2, $3, $3, 'muscat', 'Muscat', 'verified', $4, $5)`
  await db.query(company, [ID.company, ID.owner, 'Company', OWNER_PHONE, APPROVED_PERMIT])
  await db.query(company, [ID.rivalCompany, ID.rival, 'Rival', '+96890000002', null])

  /*
   * Seeded the way every trip on the live project exists today: created before
   * 20260914000100, so with no departure location and a value in the retired
   * `excluded_services`. The departure rule is switched off for the seed only —
   * it is exactly the state that rule must never break — and every check below
   * that confirms, cancels or reviews on these trips is therefore also a check
   * that an old trip keeps working.
   */
  await db.exec('alter table public.campaigns disable trigger campaigns_departure_rules')
  const trip = `insert into public.campaigns
      (id, provider_id, type, title_ar, price, travel_method, wilayah_id,
       departure_date, return_date, seats_total, seats_available, excluded_services)
    values ($1, $2, 'umrah', $3, 150, 'land', 'muscat', $4, $5, 10, 10, '{meals}')`
  await db.query(trip, [ID.trip, ID.company, 'Trip', day(60), day(70)])
  await db.query(trip, [ID.rivalTrip, ID.rivalCompany, 'Rival trip', day(60), day(70)])
  await db.query(trip, [ID.pastTrip, ID.company, 'Returned trip', day(-20), day(-10)])
  await db.exec('alter table public.campaigns enable trigger campaigns_departure_rules')

  await db.query(
    `insert into storage.objects (bucket_id, name, owner) values ('provider-licences', $1, $2)`,
    [APPROVED_PERMIT, ID.owner],
  )
}

const campaign = async (db, id) =>
  (await db.query(`select * from public.campaigns where id = $1`, [id])).rows[0]

const book = (db, userId, tripId, travellers = 2) =>
  as(
    db,
    userId,
    async (q) =>
      (
        await q(
          `select * from public.book_campaign($1, $2, 0, 'Traveller', '+96891234567', 'traveller@example.test')`,
          [tripId, travellers],
        )
      )[0],
    { keep: true },
  )

const confirm = (db, ownerId, bookingId) =>
  as(db, ownerId, (q) => q(`select * from public.set_booking_status($1, 'confirmed')`, [bookingId]), {
    keep: true,
  })

const cancel = (db, userId, bookingId) =>
  as(db, userId, (q) => q(`select * from public.cancel_booking($1)`, [bookingId]), { keep: true })

const directBooking = (db, userId, status) =>
  as(db, userId, (q) =>
    q(
      `insert into public.bookings
         (reference, user_id, campaign_id, travellers_count, contact_name, contact_phone,
          contact_email, total_price, status)
       values ('NSK-FORGED', $1, $2, 9, 'x', '+96899999999', 'x@example.test', 0.001, $3)
       returning id`,
      [userId, ID.trip, status],
    ),
  )

// =============================================================================
// 1. every migration applied
// =============================================================================

console.log(`Applying ${migrationFiles().length} migrations to PGlite…`)
const db = await boot()
await seed(db)

head('S1. a booking is created by book_campaign and by nothing else')

check(
  'a customer cannot INSERT a booking directly',
  (await attempt(() => directBooking(db, ID.customer, 'pending'))) !== null,
)
const forgedConfirmed = await attempt(() => directBooking(db, ID.customer, 'confirmed'))
check('a customer cannot create a CONFIRMED booking directly', forgedConfirmed !== null, forgedConfirmed ?? 'it was accepted')
check(
  'and no forged row exists afterwards',
  (await db.query(`select count(*)::int n from public.bookings where reference = 'NSK-FORGED'`)).rows[0].n === 0,
)

const pending = await book(db, ID.customer, ID.trip, 2)
const travellerInsert = await attempt(() =>
  as(db, ID.customer, (q) =>
    q(`insert into public.travellers (booking_id, name) values ($1, 'Forged') returning id`, [pending.id]),
  ),
)
check('a customer cannot INSERT a traveller directly', travellerInsert !== null, travellerInsert ?? 'it was accepted')

check('book_campaign still creates a booking', Boolean(pending?.id) && pending.reference.startsWith('NSK-'))
check('…as a pending request', pending?.status === 'pending')
check('…priced by the database, not the caller', Number(pending?.total_price) === 300)
check('…without taking any seats', (await campaign(db, ID.trip)).seats_available === 10)
check('…and the customer can read it back', (
  await as(db, ID.customer, (q) => q(`select id from public.bookings where id = $1`, [pending.id]))
).length === 1)

head('S6. the company phone number, for a booking that is not cancelled')

const contact = (userId, bookingId) =>
  as(db, userId, async (q) => (await q(`select public.booking_provider_contact($1) as phone`, [bookingId]))[0].phone)

check('a pending booking can still retrieve the company phone (WhatsApp step)', (await contact(ID.customer, pending.id)) === OWNER_PHONE)
check(
  'another customer cannot retrieve it for someone else’s booking',
  (await attempt(() => contact(ID.stranger, pending.id))) !== null,
)

head('S2. seats move with confirmations and cancellations, never with a form')

await confirm(db, ID.owner, pending.id)
check('confirmation deducts the seats', (await campaign(db, ID.trip)).seats_available === 8)
await confirm(db, ID.owner, pending.id)
check('confirming the same booking again deducts nothing more', (await campaign(db, ID.trip)).seats_available === 8)
check('a confirmed booking can still retrieve the company phone', (await contact(ID.customer, pending.id)) === OWNER_PHONE)

const ownerSave = await as(
  db,
  ID.owner,
  (q) =>
    q(
      `update public.campaigns
          set seats_available = 10, title_ar = 'Renamed', bookings_count = 99, rating = 5, review_count = 42
        where id = $1
        returning seats_available, title_ar, bookings_count, rating, review_count`,
      [ID.trip],
    ),
  { keep: true },
)
check('an owner saving the trip cannot overwrite seats_available', ownerSave[0]?.seats_available === 8, JSON.stringify(ownerSave[0]))
check('…while the rest of the save still applies', ownerSave[0]?.title_ar === 'Renamed')
check(
  '…and cannot set bookings_count, rating or review_count either',
  ownerSave[0]?.bookings_count === 1 && Number(ownerSave[0]?.rating) === 0 && ownerSave[0]?.review_count === 0,
  JSON.stringify(ownerSave[0]),
)

const grown = await as(
  db,
  ID.owner,
  (q) => q(`update public.campaigns set seats_total = 12 where id = $1 returning seats_total, seats_available`, [ID.trip]),
  { keep: true },
)
check('adding two seats to the total adds two available', grown[0]?.seats_available === 10 && grown[0]?.seats_total === 12)
const shrunk = await attempt(() =>
  as(db, ID.owner, (q) => q(`update public.campaigns set seats_total = 1 where id = $1`, [ID.trip])),
)
check('a total below the seats already confirmed is refused', shrunk !== null && /already confirmed/.test(shrunk), shrunk ?? 'accepted')

const adminSeats = await as(
  db,
  ID.admin,
  (q) => q(`update public.campaigns set seats_available = 12 where id = $1 returning seats_available`, [ID.trip]),
  { amr: [{ method: 'otp' }] },
)
check('an administrator cannot write seats_available directly either', adminSeats[0]?.seats_available === 10)

const ownNew = await as(db, ID.owner, (q) =>
  q(
    `insert into public.campaigns
       (provider_id, type, title_ar, price, travel_method, wilayah_id, departure_date, return_date,
        seats_total, seats_available, bookings_count, rating, review_count, departure_location)
     values ($1, 'umrah', 'New', 100, 'land', 'muscat', $2, $3, 20, 3, 50, 5, 9, 'Muscat')
     returning seats_available, bookings_count, rating, review_count, status`,
    [ID.company, day(40), day(50)],
  ),
)
check(
  'an owner publishing a new trip starts with every seat available and no counters',
  ownNew[0]?.seats_available === 20 && ownNew[0]?.bookings_count === 0 &&
    Number(ownNew[0]?.rating) === 0 && ownNew[0]?.review_count === 0 && ownNew[0]?.status === 'active',
  JSON.stringify(ownNew[0]),
)

await cancel(db, ID.customer, pending.id)
check('cancelling a confirmed booking restores its seats', (await campaign(db, ID.trip)).seats_available === 12)
check('a cancelled booking cannot retrieve the company phone', (await attempt(() => contact(ID.customer, pending.id))) !== null)

head('S4 + S3. reviews come from travellers, stay put, and move the stars')

const review = (userId, campaignId, providerId, rating = 5) =>
  as(
    db,
    userId,
    async (q) =>
      (
        await q(
          `insert into public.reviews (user_id, campaign_id, provider_id, rating, comment_ar, reply_ar)
           values ($1, $2, $3, $4, 'good', 'forged owner reply')
           returning campaign_id, provider_id, reply_ar`,
          [userId, campaignId, providerId, rating],
        )
      )[0],
    { keep: true },
  )

const noBooking = await attempt(() => review(ID.stranger, ID.pastTrip, ID.company))
check('a review requires a real booking', noBooking !== null, noBooking ?? 'accepted')

const unpaid = await book(db, ID.stranger, ID.pastTrip, 1)
const unpaidReview = await attempt(() => review(ID.stranger, ID.pastTrip, ID.company))
check('a pending, unpaid booking cannot review', unpaid?.status === 'pending' && unpaidReview !== null, unpaidReview ?? 'accepted')

const futurePaid = await book(db, ID.stranger, ID.trip, 1)
await confirm(db, ID.owner, futurePaid.id)
check(
  'a confirmed booking on a trip that has not returned cannot review yet',
  (await attempt(() => review(ID.stranger, ID.trip, ID.company))) !== null,
)

const travelled = await book(db, ID.customer, ID.pastTrip, 1)
await confirm(db, ID.owner, travelled.id)
const written = await review(ID.customer, ID.pastTrip, ID.rivalCompany, 5)
check('a confirmed booking on a returned trip can review', written?.campaign_id === ID.pastTrip)
check('…counted against the trip’s own company, whatever the request said', written?.provider_id === ID.company, written?.provider_id)
check('…and without a reply written in the owner’s name', written?.reply_ar === null)

const stars = await campaign(db, ID.pastTrip)
check('the trip’s rating and review_count are recalculated from reviews', Number(stars.rating) === 5 && stars.review_count === 1, `${stars.rating} / ${stars.review_count}`)

const moved = await as(
  db,
  ID.customer,
  (q) =>
    q(
      `update public.reviews set campaign_id = $1, provider_id = $2, rating = 3
        where user_id = $3 returning campaign_id, provider_id, rating`,
      [ID.rivalTrip, ID.rivalCompany, ID.customer],
    ),
  { keep: true },
)
check('a review cannot be moved to another campaign', moved[0]?.campaign_id === ID.pastTrip, moved[0]?.campaign_id)
check('…or to another company', moved[0]?.provider_id === ID.company)
check('…while the author can still change the rating', moved[0]?.rating === 3)
check('…and the trip’s stars follow the change', Number((await campaign(db, ID.pastTrip)).rating) === 3)
check('…leaving the other trip untouched', (await campaign(db, ID.rivalTrip)).review_count === 0)

const adminMove = await as(
  db,
  ID.admin,
  (q) => q(`update public.reviews set campaign_id = $1 where user_id = $2 returning campaign_id`, [ID.rivalTrip, ID.customer]),
  { amr: [{ method: 'otp' }] },
)
check('not even an administrator can move a review', adminMove[0]?.campaign_id === ID.pastTrip)

const ownerRating = await as(db, ID.owner, (q) =>
  q(`update public.campaigns set rating = 5, review_count = 100 where id = $1 returning rating, review_count`, [ID.pastTrip]),
)
check('an owner cannot write their trip’s rating', Number(ownerRating[0]?.rating) === 3 && ownerRating[0]?.review_count === 1)

head('S5. an approved permit is not the owner’s to overwrite')

const replaced = await as(db, ID.owner, (q) =>
  q(`update storage.objects set metadata = '{"swapped":true}' where bucket_id = 'provider-licences' and name = $1 returning id`, [APPROVED_PERMIT]),
)
check('an owner cannot replace the approved permit file', replaced.length === 0)
const deleted = await as(db, ID.owner, (q) =>
  q(`delete from storage.objects where bucket_id = 'provider-licences' and name = $1 returning id`, [APPROVED_PERMIT]),
)
check('an owner cannot delete the approved permit file', deleted.length === 0)
check(
  'the approved file is still there, unchanged',
  (await db.query(`select metadata from storage.objects where name = $1`, [APPROVED_PERMIT])).rows[0]?.metadata === null,
)
const overwrite = await attempt(() =>
  as(db, ID.owner, (q) =>
    q(`insert into storage.objects (bucket_id, name, owner) values ('provider-licences', $1, $2)`, [APPROVED_PERMIT, ID.owner]),
  ),
)
check('…and cannot upload over it under the same name', overwrite !== null)

const NEW_PERMIT = `${ID.owner}/renewed-permit.jpg`
const uploaded = await as(
  db,
  ID.owner,
  (q) =>
    q(`insert into storage.objects (bucket_id, name, owner) values ('provider-licences', $1, $2) returning name`, [NEW_PERMIT, ID.owner]),
  { keep: true },
)
check('the valid workflow: an owner can upload a new permit file', uploaded[0]?.name === NEW_PERMIT)
check(
  '…and read their own files',
  (await as(db, ID.owner, (q) => q(`select name from storage.objects where bucket_id = 'provider-licences'`))).length === 2,
)
check(
  '…but not into another owner’s folder',
  (await attempt(() =>
    as(db, ID.owner, (q) =>
      q(`insert into storage.objects (bucket_id, name, owner) values ('provider-licences', $1, $2)`, [`${ID.rival}/x.jpg`, ID.owner]),
    ),
  )) !== null,
)

const submitted = await as(
  db,
  ID.owner,
  (q) =>
    q(
      `select public.submit_provider_profile(
         p_tagline => '', p_description => '', p_wilayah_id => 'muscat', p_governorate => 'Muscat',
         p_address => null, p_phone => $1, p_email => 'owner@example.test', p_experience_years => 3,
         p_name => 'Company', p_commercial_registration => null, p_permit_number => null,
         p_permit_expiry => null, p_licence_path => $2, p_licence_file_name => 'renewed-permit.jpg',
         p_licence_mime => 'image/jpeg')`,
      [OWNER_PHONE, NEW_PERMIT],
    ),
  { keep: true },
)
const change = (
  await db.query(`select id, status from public.provider_profile_changes where provider_id = $1 order by 1 desc limit 1`, [ID.company])
).rows[0]
check('…submitting it queues a change for review', Boolean(submitted) && change?.status === 'pending', JSON.stringify(change))
check(
  '…without replacing the approved permit yet',
  (await db.query(`select licence_path from public.providers where id = $1`, [ID.company])).rows[0].licence_path === APPROVED_PERMIT,
)
await as(db, ID.admin, (q) => q(`select public.review_provider_changes($1, true, null)`, [change.id]), {
  keep: true,
  amr: [{ method: 'otp' }],
})
check(
  '…and an administrator approving it makes it the permit',
  (await db.query(`select licence_path from public.providers where id = $1`, [ID.company])).rows[0].licence_path === NEW_PERMIT,
)
check(
  'an administrator can still read and delete permit files',
  (await as(
    db,
    ID.admin,
    (q) => q(`delete from storage.objects where bucket_id = 'provider-licences' and name = $1 returning id`, [APPROVED_PERMIT]),
    { amr: [{ method: 'otp' }] },
  )).length === 1,
)

head('D. departure location and office number (20260914000100)')

const DEPARTURE = '20260914000100_campaign_departure_location_and_office.sql'
const PLACE = 'مواقف جامع السلطان قابوس الأكبر – البوابة الجنوبية، مسقط'
const newTrip = (userId, departure, office, extra = {}) =>
  as(
    db,
    userId,
    (q) =>
      q(
        `insert into public.campaigns
           (provider_id, type, title_ar, price, travel_method, wilayah_id,
            departure_date, return_date, seats_total, seats_available, departure_location, office_number)
         values ($1, 'umrah', 'New trip', 150, 'land', 'muscat', $2, $3, 10, 10, $4, $5)
         returning id, departure_location, office_number`,
        [ID.company, day(90), day(100), departure, office],
      ),
    { amr: userId === ID.admin ? [{ method: 'otp' }] : undefined, ...extra },
  )

const legacyTrip = await campaign(db, ID.trip)
check('an existing trip has no departure location (precondition)', legacyTrip.departure_location === '' && legacyTrip.office_number === '')
check('…and it was confirmed, cancelled and reviewed on above without the rule getting in the way', legacyTrip.bookings_count >= 1, JSON.stringify({ bookings: legacyTrip.bookings_count }))
const legacyEdit = await as(
  db,
  ID.owner,
  (q) => q(`update public.campaigns set title_ar = 'Old trip, edited' where id = $1 returning title_ar, departure_location`, [ID.trip]),
)
check('an owner can still edit an existing trip that has no departure location', legacyEdit[0]?.title_ar === 'Old trip, edited')

const blankInsert = await attempt(() => newTrip(ID.owner, '', ''))
check('a new trip with no departure location is refused', blankInsert !== null && /departure location is required/.test(blankInsert), blankInsert ?? 'accepted')
const spaceInsert = await attempt(() => newTrip(ID.owner, '   \n\t ', ''))
check('…and one that is only whitespace', spaceInsert !== null && /departure location is required/.test(spaceInsert), spaceInsert ?? 'accepted')
const adminBlank = await attempt(() => newTrip(ID.admin, ' ', ''))
check('…by an administrator too', adminBlank !== null, adminBlank ?? 'accepted')

const created = await newTrip(ID.owner, `  ${PLACE}\nبجانب المدخل  `, '  مكتب 5 - الدور الثاني ', { keep: true })
check('a new trip with a departure location is accepted', created.length === 1)
check('…stored trimmed, line break kept', created[0]?.departure_location === `${PLACE}\nبجانب المدخل`, JSON.stringify(created[0]?.departure_location))
check('an office number with letters and symbols is stored, trimmed', created[0]?.office_number === 'مكتب 5 - الدور الثاني', JSON.stringify(created[0]?.office_number))
const noOffice = await newTrip(ID.owner, PLACE, '')
check('the office number is optional', noOffice[0]?.office_number === '')
const officeOmitted = await as(db, ID.owner, (q) =>
  q(
    `insert into public.campaigns
       (provider_id, type, title_ar, price, travel_method, wilayah_id, departure_date, return_date,
        seats_total, seats_available, departure_location)
     values ($1, 'umrah', 'No office column', 150, 'land', 'muscat', $2, $3, 10, 10, $4)
     returning office_number`,
    [ID.company, day(90), day(100), PLACE],
  ),
)
check('…even when the column is left out entirely', officeOmitted[0]?.office_number === '')

const createdId = created[0]?.id
const cleared = await attempt(() =>
  as(db, ID.owner, (q) => q(`update public.campaigns set departure_location = '' where id = $1`, [createdId])),
)
check('a departure location, once set, cannot be cleared', cleared !== null, cleared ?? 'accepted')
const whitened = await attempt(() =>
  as(db, ID.owner, (q) => q(`update public.campaigns set departure_location = '    ' where id = $1`, [createdId])),
)
check('…nor replaced with whitespace', whitened !== null, whitened ?? 'accepted')
const relocated = await as(db, ID.owner, (q) =>
  q(`update public.campaigns set departure_location = ' Muscat bus station ', office_number = '' where id = $1 returning departure_location, office_number`, [createdId]),
)
check('…but can be changed to another place, and the office number removed', relocated[0]?.departure_location === 'Muscat bus station' && relocated[0]?.office_number === '')

const tooLong = await attempt(() => newTrip(ID.owner, 'x'.repeat(1001), ''))
check('a departure location over 1000 characters is refused', tooLong !== null, tooLong ?? 'accepted')
const officeTooLong = await attempt(() => newTrip(ID.owner, PLACE, 'x'.repeat(101)))
check('an office number over 100 characters is refused', officeTooLong !== null, officeTooLong ?? 'accepted')

const seatsOnOld = await as(
  db,
  ID.owner,
  (q) => q(`update public.campaigns set seats_total = seats_total + 1 where id = $1 returning seats_total`, [ID.trip]),
)
check('an old trip still accepts a seat change with its departure location blank', seatsOnOld.length === 1)
check(
  'the retired excluded_services column is kept, with its data',
  JSON.stringify((await campaign(db, ID.trip)).excluded_services) === '["meals"]',
  JSON.stringify((await campaign(db, ID.trip)).excluded_services),
)
const anonReads = await as(db, null, (q) =>
  q(`select departure_location, office_number from public.campaigns where id = $1`, [createdId]),
)
check('a signed-out visitor can read both new columns on a live trip', anonReads.length === 1 && anonReads[0].departure_location === created[0]?.departure_location && anonReads[0].office_number === 'مكتب 5 - الدور الثاني', JSON.stringify(anonReads))

const departureReport = (() => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', DEPARTURE), 'utf8').replace(/\r\n/g, '\n')
  return sql.slice(sql.lastIndexOf('\nselect\n') + 1)
})()
const departureRow = (await db.query(departureReport)).rows[0]
check(
  "the departure migration's closing report row is all true",
  Object.values(departureRow).length === 4 && Object.values(departureRow).every((v) => v === true),
  JSON.stringify(departureRow),
)

head('what the SQL Editor shows after the migration runs')

/*
 * The migration ends with a read-only SELECT over the catalog, and that row is
 * what someone pasting the file into the SQL Editor sees. Run here against both
 * schemas: every column true after, every column false before — so the row
 * cannot report success for a migration that did not apply.
 */
const REPORT = (() => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', HARDENING), 'utf8').replace(/\r\n/g, '\n')
  return sql.slice(sql.lastIndexOf('\nselect\n') + 1)
})()
const reportAfter = (await db.query(REPORT)).rows[0]
check(
  'the closing report row is all true',
  Object.values(reportAfter).length === 10 && Object.values(reportAfter).every((v) => v === true),
  Object.entries(reportAfter).filter(([, v]) => v !== true).map(([k]) => k).join(', '),
)

head('A1. the administration dashboard has one door')

const isAdmin = (userId, amr) =>
  as(db, userId, async (q) => (await q(`select public.is_admin() as yes`))[0].yes, { amr })

check('an administrator signed in through the access code (a one-time token) is an administrator', (await isAdmin(ID.admin, [{ method: 'otp' }])) === true)
check('…including with an authenticator code on top', (await isAdmin(ID.admin, [{ method: 'totp' }, { method: 'otp' }])) === true)
check('the same account signed in with a PASSWORD is not an administrator', (await isAdmin(ID.admin, [{ method: 'password' }])) === false)
check('…not even with an authenticator code on top', (await isAdmin(ID.admin, [{ method: 'totp' }, { method: 'password' }])) === false)
check('a session with no sign-in method recorded is judged by the profile, as before', (await isAdmin(ID.admin, undefined)) === true)
check('a customer is not an administrator', (await isAdmin(ID.customer, [{ method: 'otp' }])) === false)
const passwordAdminAct = await attempt(() =>
  as(db, ID.admin, (q) => q(`select public.set_campaign_status($1, 'rejected', 'test')`, [ID.rivalTrip]), {
    amr: [{ method: 'password' }],
  }),
)
check('a password session cannot use an administrator function', passwordAdminAct !== null, passwordAdminAct ?? 'accepted')

// ------------------------------------------------ the dashboard, from source

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const security = read('src/admin/tabs/SecurityTab.tsx')
check('the admin Security tab has no password panel', !/PasswordPanel|setPassword|type="password"/.test(security))
check(
  'the admin dictionaries have no password strings',
  !/'admin\.password/.test(read('src/i18n/adminEn.ts')) && !/'admin\.password/.test(read('src/i18n/adminAr.ts')),
)
const adminFiles = fs
  .readdirSync(path.join(root, 'src/admin'), { recursive: true })
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => [f, read(path.join('src/admin', f))])
const passwordCallers = adminFiles
  .filter(([, text]) => /signInWithPassword|PasswordSignIn|\bsetPassword\(|updateUser\(\s*\{\s*password/.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
  .map(([f]) => f)
check('no admin screen signs in with, or sets, a password', passwordCallers.length === 0, passwordCallers.join(', '))

const accessCode = read('src/admin/accessCode.ts')
const login = read('src/admin/LoginPage.tsx')
const gate = read('supabase/functions/admin-access/index.ts')
check('the access code is still posted to the admin-access function', /functions\/v1\/admin-access/.test(accessCode))
check('…and redeemed as a magic-link token with verifyOtp', /verifyOtp\([\s\S]{0,80}token_hash[\s\S]{0,80}type:\s*'magiclink'/.test(accessCode))
check('…from the admin login screen', /redeemAccessCode\(code\)/.test(login))
check('the function still compares the code in constant time', /function constantTimeEqual/.test(gate) && /constantTimeEqual\(/.test(gate.split('function constantTimeEqual')[1]))
check('…still rate-limits failures', /MAX_FAILURES/.test(gate) && /admin_access_attempts/.test(gate))
check('…and still issues a magic link rather than a password', /generateLink\(\{\s*type:\s*'magiclink'/.test(gate))

// =============================================================================
// 2. the schema before the hardening migration: the holes must reproduce
// =============================================================================

console.log(`\nApplying the ${migrationFiles().length - 1} migrations before ${HARDENING}…`)
const before = await boot({ exclude: [HARDENING] })
await seed(before)

head('before the fix, each attempt above succeeds — so each check can fail')

check('BEFORE: a customer could INSERT a confirmed booking directly', (await attempt(() => directBooking(before, ID.customer, 'confirmed'))) === null)

const oldPending = await book(before, ID.customer, ID.trip, 2)
await confirm(before, ID.owner, oldPending.id)
const oldSave = await as(before, ID.owner, (q) =>
  q(`update public.campaigns set seats_available = 10 where id = $1 returning seats_available`, [ID.trip]),
)
check('BEFORE: an owner saving the trip could overwrite seats_available', oldSave[0]?.seats_available === 10)

const oldUnpaid = await book(before, ID.stranger, ID.pastTrip, 1)
check(
  'BEFORE: a pending, unpaid booking could review',
  oldUnpaid.status === 'pending' &&
    (await attempt(() =>
      as(before, ID.stranger, (q) =>
        q(`insert into public.reviews (user_id, campaign_id, provider_id, rating) values ($1, $2, $3, 5)`, [ID.stranger, ID.pastTrip, ID.company]),
      ),
    )) === null,
)

const oldTravelled = await book(before, ID.customer, ID.pastTrip, 1)
await confirm(before, ID.owner, oldTravelled.id)
await as(
  before,
  ID.customer,
  (q) => q(`insert into public.reviews (user_id, campaign_id, provider_id, rating) values ($1, $2, $3, 5)`, [ID.customer, ID.pastTrip, ID.company]),
  { keep: true },
)
check('BEFORE: the trip’s rating did not move when a review was written', Number((await campaign(before, ID.pastTrip)).rating) === 0)
const oldMoved = await as(before, ID.customer, (q) =>
  q(`update public.reviews set campaign_id = $1 where user_id = $2 returning campaign_id`, [ID.rivalTrip, ID.customer]),
)
check('BEFORE: a review could be moved to another campaign', oldMoved[0]?.campaign_id === ID.rivalTrip)

const oldDeleted = await as(before, ID.owner, (q) =>
  q(`delete from storage.objects where bucket_id = 'provider-licences' and name = $1 returning id`, [APPROVED_PERMIT]),
)
check('BEFORE: an owner could delete the approved permit file', oldDeleted.length === 1)

await cancel(before, ID.customer, oldPending.id)
check(
  'BEFORE: a cancelled booking still retrieved the company phone',
  (await as(before, ID.customer, async (q) => (await q(`select public.booking_provider_contact($1) as p`, [oldPending.id]))[0].p)) === OWNER_PHONE,
)
check(
  'BEFORE: a password session was an administrator',
  (await as(before, ID.admin, async (q) => (await q(`select public.is_admin() as yes`))[0].yes, { amr: [{ method: 'password' }] })) === true,
)

const reportBefore = (await before.query(REPORT)).rows[0]
check(
  'BEFORE: the same report row is all false',
  Object.values(reportBefore).every((v) => v === false),
  Object.entries(reportBefore).filter(([, v]) => v !== false).map(([k]) => k).join(', '),
)

console.log(failures ? `\n${failures} database check(s) FAILED.` : '\nAll database security checks passed.')
process.exit(failures ? 1 : 0)
