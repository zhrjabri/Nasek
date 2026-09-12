import type { Booking, Notification } from '@/types'

/**
 * What the offline prototype starts with: nothing.
 *
 * This file used to hold `SEED_BOOKINGS` — a mulberry32-seeded generator that
 * manufactured roughly 240 historical bookings with invented Omani names,
 * invented phone numbers and invented totals, "so the provider and admin
 * dashboards have a realistic volume of historical bookings for their charts".
 * Every figure those two dashboards drew was therefore a figure about a
 * platform that did not exist.
 *
 * It had already been cut off at the source — it derived its rows from
 * `CAMPAIGNS`, which is empty, so it had been producing an empty array and no
 * screen still imported it. The generator is deleted rather than left inert:
 * an empty array is a fact, a dormant fabricator of business history is an
 * invitation.
 *
 * Real bookings come from `bookings_read` in Postgres, through
 * `useRemoteData`. These two constants are only the offline fallback's
 * starting point, and the honest starting point is empty.
 */

/** The demo customer starts with no bookings. */
export const DEMO_CUSTOMER_BOOKINGS: Booking[] = []

/** And no notifications: all three announced trips from a catalogue that is gone. */
export const DEMO_NOTIFICATIONS: Notification[] = []
