# NASEK data model

The TypeScript shapes in `src/types.ts` are written to map directly onto a
relational schema. This is that schema, as it would be built for production.

Bilingual fields (`{ ar, en }` in TypeScript) become two columns, `*_ar` and
`*_en`. Money is `numeric(10,3)` — the Omani Rial has three decimal places, and
the 2% mediation fee needs all of them.

---

## users

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `name` | text | |
| `email` | citext unique | |
| `phone` | text | E.164 |
| `password_hash` | text | Argon2id. **Never stored in the prototype.** |
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
| `plan` | enum | `basic` \| `plus` \| `premium` — the subscription tier |
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
| `total_price` | numeric(10,3) | Subtotal + 2% fee, captured at booking time |
| `status` | enum | `pending` \| `confirmed` \| `completed` \| `cancelled` |
| `booking_date` | date | |

**Seat concurrency.** `seats_available` must never be decremented from the
client. Booking has to be a single transaction that locks the campaign row,
re-checks availability, decrements, and inserts — otherwise two people book the
last seat at once. The prototype's `bookingsApi.create` checks availability but
runs in one browser tab, so it cannot demonstrate the race it is guarding
against.

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

Integrity rule the UI promises and the database must enforce: a review requires
a `completed` booking by the same user on the same campaign. Unique on
`(user_id, campaign_id)`.

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

## Revenue tables (not modelled in the prototype)

The business model — a monthly subscription plus a 2% mediation fee — is shown
in the provider and admin dashboards but computed on the fly. It needs real
tables before it can be billed against:

- **subscriptions** — provider, tier, period, amount, status
- **payouts** — provider, period, gross bookings, fee withheld, net transferred
- **promotions** — paid placement, with the position in `recommended` ranking it
  buys, disclosed as promoted in the UI
