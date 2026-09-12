import type { Booking, Campaign, User } from '@/types'
import { ApiError, request } from './client'

/** NASEK's mediation fee, per the original business plan. */
export const NASEK_FEE_RATE = 0.02

/**
 * What a campaign owner owes NASEK on business the platform brought them.
 *
 * This changed meaning when NASEK stopped pretending to take payment, and the
 * distinction matters enough to state.
 *
 * `book_campaign` used to store `price × travellers × 1.02`, and the booking
 * page showed the customer a "NASEK service fee (2%)" line on their bill. That
 * cannot survive a workflow where the customer pays the campaign owner directly
 * over WhatsApp: the owner is handed the whole of the invoice total, so a fee
 * folded into it is a fee the customer pays the owner on NASEK's behalf, with
 * nothing anywhere to pass it back.
 *
 * So the total is now what it says — `price × travellers`, the sum the traveller
 * owes the owner — and the mediation fee is levied on the owner, computed as 2%
 * of *confirmed* booking value. It sits on top of the figure rather than inside
 * it, which is why this is a plain multiplication and not the `r/(1+r)` that
 * extracted it from an inclusive total.
 *
 * Rounded to three places, matching `numeric(10,3)` on the column it derives from.
 */
export function mediationFee(confirmedValue: number) {
  return Math.round(confirmedValue * NASEK_FEE_RATE * 1000) / 1000
}

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
