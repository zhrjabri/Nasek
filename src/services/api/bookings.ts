import type { Booking, Campaign, User } from '@/types'
import { ApiError, request } from './client'

/*
 * NASEK CHARGES NOTHING. There is no rate constant here on purpose.
 *
 * A rate constant and a fee function used to live at the top of this file, and
 * both are gone rather than set to zero. A rate of zero is a rate somebody can
 * change back by editing one number; no rate at all has to be reintroduced
 * deliberately, with a diff that says so. Their names are not written here
 * either, so a search of this repository for them comes back empty.
 *
 * The history, briefly, because three different things were true in turn and
 * the comments elsewhere in this repository still refer to them:
 *
 *   1. `book_campaign` stored the price with a percentage added, and the booking
 *      page showed the customer a platform charge as a line on their bill.
 *   2. 20260910000100 took it out of the traveller's total — the customer pays
 *      the campaign owner directly, so anything inside that figure is something
 *      the customer hands to the owner on NASEK's behalf — and left it as a
 *      percentage of confirmed business, owed by the owner.
 *   3. And now there is none. NASEK takes no percentage from the customer, from
 *      the owner, from the booking or from the invoice.
 *
 * What remains is `bookingTotal`, which is passengers × price and nothing else.
 */

/**
 * What the customer owes the campaign owner.
 *
 * The authoritative version of this lives in `book_campaign`, which reads the
 * price off the campaign row it has locked. This is the same arithmetic for the
 * screen the customer is looking at while they choose — it is never sent to the
 * server, and the server never trusts a total it did not compute.
 */
export function bookingTotal(pricePerPerson: number, passengers: number) {
  return Math.round(pricePerPerson * passengers * 1000) / 1000
}

export interface CreateBookingInput {
  user: User
  campaign: Campaign
  maleCount: number
  femaleCount: number
  contactName: string
  contactPhone: string
  contactEmail: string
}

let sequence = 240_500

export const bookingsApi = {
  /**
   * The offline prototype's booking path.
   *
   * Unreachable in production — `BookingPage` takes this branch only when no
   * Supabase client exists, and one always does in a deployed build. It is kept
   * so the repository runs with no backend, and it mirrors the real function's
   * rules rather than being a laxer version of them: passengers are counted the
   * same way, the status is 'pending' rather than 'confirmed', and the price
   * snapshot is written.
   */
  create: (input: CreateBookingInput) =>
    request<Booking>(() => {
      const travellersCount = input.maleCount + input.femaleCount
      if (travellersCount < 1) {
        throw new ApiError('A booking needs at least one passenger', 400)
      }
      if (travellersCount > input.campaign.seatsAvailable) {
        throw new ApiError('Not enough seats remain on this trip', 409)
      }
      sequence += 1
      return {
        id: `b${sequence}`,
        reference: `NSK-${String(sequence).padStart(6, '0')}`,
        userId: input.user.id,
        campaignId: input.campaign.id,
        travellers: [],
        travellersCount,
        maleCount: input.maleCount,
        femaleCount: input.femaleCount,
        pricePerPerson: input.campaign.price,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        totalPrice: bookingTotal(input.campaign.price, travellersCount),
        // Nothing has been paid. See `20260910000100`.
        status: 'pending',
        bookingDate: new Date().toISOString().slice(0, 10),
      }
    }, { latencyMs: 1600 }),

  cancel: (bookingId: string) =>
    request(() => bookingId, { latencyMs: 600 }),
}
