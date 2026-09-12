import type { Booking, Campaign, Traveller, User } from '@/types'
import { ApiError, request } from './client'

/** NASEK's mediation fee, per the original business plan. */
export const NASEK_FEE_RATE = 0.02

export interface CreateBookingInput {
  user: User
  campaign: Campaign
  travellersCount: number
  travellers: Traveller[]
  contactName: string
  contactPhone: string
  contactEmail: string
}

/**
 * The mediation fee already inside a booking total.
 *
 * `book_campaign` stores `total_price = price × travellers × (1 + fee_rate)`,
 * so the fee is *part of* the total, not something to add on top of it. Both
 * dashboards used to report `total × 0.02`, which is the fee on a subtotal
 * that includes the fee — every mediation figure on the platform was two
 * percent of itself too large. The fee on a known total is `total × r/(1+r)`.
 *
 * Rounded to three places, matching `numeric(10,3)` on the column.
 */
export function mediationFee(total: number) {
  return Math.round(((total * NASEK_FEE_RATE) / (1 + NASEK_FEE_RATE)) * 1000) / 1000
}

export function priceBreakdown(campaign: Campaign, travellers: number) {
  const subtotal = campaign.price * travellers
  const fee = Math.round(subtotal * NASEK_FEE_RATE * 1000) / 1000
  return { subtotal, fee, total: Math.round((subtotal + fee) * 1000) / 1000 }
}

let sequence = 240_500

export const bookingsApi = {
  create: (input: CreateBookingInput) =>
    request<Booking>(() => {
      if (input.travellersCount > input.campaign.seatsAvailable) {
        throw new ApiError('Not enough seats remain on this trip', 409)
      }
      sequence += 1
      const { total } = priceBreakdown(input.campaign, input.travellersCount)
      return {
        id: `b${sequence}`,
        reference: `NSK-${sequence}`,
        userId: input.user.id,
        campaignId: input.campaign.id,
        travellers: input.travellers,
        travellersCount: input.travellersCount,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        totalPrice: total,
        status: 'confirmed',
        bookingDate: new Date().toISOString().slice(0, 10),
      }
    }, { latencyMs: 1600 }),

  cancel: (bookingId: string) =>
    request(() => bookingId, { latencyMs: 600 }),
}
