# NASEK data model

The TypeScript shapes in `src/types.ts` are written to map directly onto a
relational schema. This is the design that schema was built from. The
authoritative definition is `supabase/migrations/`, applied in order; where the
two disagree, the migrations win.

Bilingual fields (`{ ar, en }` in TypeScript) become two columns, `*_ar` and
`*_en`. Money is `numeric(10,3)`, because the Omani Rial has three decimal places.

**NASEK charges nothing.** There is no mediation fee, no commission and no
subscription. A booking is a request; the customer pays the campaign owner
directly, and the owner records in NASEK that they have been paid.

---

## users

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `name` | text | |
| `email` | citext unique | |
| `phone` | text | E.164 |
| — | — | No password column. Credentials live in Supabase Auth, never in public tables. |
| `role` | enum | `customer` \| `provider` \| `admin` |
| `wilayah_id` | text fk → wilayat | Drives "campaigns near me" |
| `provider_id` | uuid fk → providers, null | Set only for `role = 'provider'` |
| `created_at` | timestamptz | |

## providers

The campaign owner. One provider, many campaigns.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `name_ar`, `name_en` | text | |
| `tagline_ar`, `tagline_en` | text | |
| `description_ar`, `description_en` | text | |
| `wilayah_id` | text fk → wilayat | |
| `verification` | enum | `verified` \| `pending` \| `unverified` |
| `experience_years` | int | Called out in the original plan |
| `rating` | numeric(2,1) | Denormalised from `reviews` |
| `review_count` | int | Denormalised |
| `phone`, `email` | text | |
| `plan` | enum | `basic` \| `plus` \| `premium`. A retained column from an earlier design; nothing is billed against it |
| `joined_at` | date | |

Verification needs an audit trail in production: who verified, when, against
which documents. The prototype only stores the resulting flag.

## campaigns

One trip with a fixed departure. A provider running the same programme in
March and April publishes two rows.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `provider_id` | uuid fk → providers | |
| `type` | enum | `hajj` \| `umrah` |
| `title_ar`, `title_en` | text | |
| `description_ar`, `description_en` | text | |
| `price` | numeric(10,3) | Per traveller, OMR |
| `wilayah_id` | text fk → wilayat | Departure point |
| `travel_method` | enum | `air` \| `land` |
| `departure_date`, `return_date` | date | |
| `seats_total` | int | |
| `seats_available` | int | See the concurrency note below |
| `services` | text[] | Constrained to the `ServiceKey` vocabulary |
| `hotel_makkah_*`, `hotel_madinah_*` | text | |
| `haram_distance_m` | int | A real differentiator for pilgrims |
| `rating`, `review_count` | numeric / int | Denormalised |
| `featured` | bool | Editorial placement |
| `bookings_count` | int | Drives "most popular" |

Indexes that matter: `(type, departure_date)`, `(wilayah_id)`, `(price)`,
and a GIN index on `services` for the "must include" filter.

## bookings

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `reference` | text unique | `NSK-######`, shown to the customer |
| `user_id` | uuid fk → users | |
| `campaign_id` | uuid fk → campaigns | |
| `travellers_count` | int | |
| `contact_name`, `contact_phone`, `contact_email` | text | |
| `total_price` | numeric(10,3) | Price per traveller × travellers, captured at booking time. No fee is added |
| `status` | enum | `pending` \| `confirmed` \| `completed` \| `cancelled` |
| `booking_date` | date | |

**Seats.** A pending booking reserves nothing. Seats come off `seats_available`
only when the campaign owner confirms payment (`set_booking_status`), inside a
transaction that locks the campaign row and re-checks what is left, so the last
seat cannot be sold twice. Cancelling a confirmed booking (`cancel_booking`)
puts its seats back. Nothing else writes `seats_available`: bookings are created
only through `book_campaign`, and an owner saving a trip cannot set it. Changing
`seats_total` moves `seats_available` by the same amount.

## travellers

Split out of `bookings` because the original NASEK registration flow collects
full details per companion, and non-Omani residents need more of them.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `booking_id` | uuid fk → bookings | |
| `name` | text | |
| `nationality` | text | |
| `gender` | enum | |
| `civil_id` | text | **Personal data — encrypt at rest** |
| `passport_no` | text | **Personal data — encrypt at rest** |
| `residence_no` | text null | Non-Omani residents |
| `sponsor_name` | text null | Non-Omani residents |

Document images (passport scan, residence card, sponsor card, white-background
photo) belong in object storage with signed, short-lived URLs — never in the
database and never publicly addressable.

## reviews

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `user_id` | uuid fk → users | |
| `campaign_id` | uuid fk → campaigns | |
| `provider_id` | uuid fk → providers | Denormalised for provider-level rollups |
| `rating` | int | 1–5 |
| `comment_ar`, `comment_en` | text | Usually only one is populated |
| `created_at` | timestamptz | |

Integrity rule the database enforces: a review requires a `confirmed` or
`completed` booking by the same user on the same campaign, on a trip that has
already returned. A pending, unpaid request does not qualify. Once written, a
review stays on its campaign and company; only its rating and comment can
change. Unique on `(user_id, campaign_id)`.

## notifications

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `user_id` | uuid fk → users | |
| `kind` | enum | `booking` \| `trip` \| `availability` \| `system` |
| `title_ar`, `title_en`, `body_ar`, `body_en` | text | |
| `read` | bool | |
| `created_at` | timestamptz | |

## wilayat

A small reference table (id, `name_ar`, `name_en`, `governorate_ar`,
`governorate_en`, `lat`, `lng`). The prototype ships it as a constant with real
decimal-degree coordinates; Smart Match ranks departure points by great-circle
distance from them. Production would add a road-distance matrix, because Oman's
mountains mean straight-line distance understates the journey from, say, Nizwa
to the Batinah coast.

---

## Money

There are no revenue tables, and none are planned: NASEK takes no fee, no
commission and no subscription, and it does not hold or move anyone's money.
The owner and admin dashboards report booking value, meaning what customers
have paid owners directly, as counted from confirmed bookings. It is never
NASEK income.
