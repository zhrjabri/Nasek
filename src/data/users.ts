import type { Booking, Provider, Role, User } from '@/types'

/**
 * A person as the administration screen needs to see them.
 *
 * Wider than `User` — that type describes whoever is signed in right now,
 * which is one person and carries no history. Managing accounts means seeing
 * what each one has actually done on the platform, so this adds the counts the
 * admin decides on: how many trips they have booked and what they have spent.
 */
export interface DirectoryUser {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  wilayahId: string
  /** ISO date the account first appears in the platform's history. */
  joinedAt: string
  bookings: number
  spend: number
  /** Set for campaign owners — links the account to the company it runs. */
  providerId?: string
  avatarColor: string
}

const AVATAR_COLORS = ['#1c5e4c', '#23765e', '#a8842c', '#10402f', '#856422']

/** Stable colour per account, so a face does not change between renders. */
function colorFor(id: string): string {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

/**
 * Assemble the account directory.
 *
 * Three sources, because there is no single user table in this prototype and
 * each source knows about accounts the others miss:
 *
 *   - `providers` covers campaign owners, including one who registered
 *     minutes ago and has not sold anything yet.
 *   - `registered` covers customers who signed up, who would otherwise be
 *     invisible until their first booking.
 *   - `bookings` covers everyone who has ever booked, which is the only
 *     record of a customer from before the account list existed, and is what
 *     supplies the trip counts and spend for all of them.
 *
 * Overlaps are merged by id rather than listed twice.
 */
export function buildDirectory(
  providers: Provider[],
  bookings: Booking[],
  registered: User[] = [],
): DirectoryUser[] {
  const rows = new Map<string, DirectoryUser>()

  for (const provider of providers) {
    const id = `owner-${provider.id}`
    rows.set(id, {
      id,
      // The company is what the admin recognises an owner by.
      name: provider.name.en || provider.name.ar,
      email: provider.email,
      phone: provider.phone,
      role: 'provider',
      wilayahId: provider.wilayahId,
      joinedAt: provider.joinedAt,
      bookings: 0,
      spend: 0,
      providerId: provider.id,
      avatarColor: provider.brandColor,
    })
  }

  for (const user of registered) {
    // An owner's account is already represented by their company row above;
    // listing the same person twice would only invite contradictory actions.
    if (user.role !== 'customer') continue
    rows.set(user.id, {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: 'customer',
      wilayahId: user.wilayahId,
      joinedAt: user.createdAt,
      bookings: 0,
      spend: 0,
      avatarColor: user.avatarColor || colorFor(user.id),
    })
  }

  // Newest first, so the first booking seen for an unknown id carries the
  // freshest contact details and every later one only adds to the totals.
  const newestFirst = [...bookings].sort((a, b) => b.bookingDate.localeCompare(a.bookingDate))

  for (const booking of newestFirst) {
    // Cancelled trips still say the person exists, but they did not spend.
    const spend = booking.status === 'cancelled' ? 0 : booking.totalPrice
    const existing = rows.get(booking.userId)

    if (existing) {
      existing.bookings += 1
      existing.spend += spend
      // A booking older than the date already recorded moves the join date
      // back: the account must have existed by then.
      if (booking.bookingDate < existing.joinedAt) existing.joinedAt = booking.bookingDate
      continue
    }

    rows.set(booking.userId, {
      id: booking.userId,
      name: booking.contactName,
      email: booking.contactEmail,
      phone: booking.contactPhone,
      role: 'customer',
      // The seeded history tucks the traveller's wilayah into `notes`.
      wilayahId: booking.notes ?? 'muscat',
      joinedAt: booking.bookingDate,
      bookings: 1,
      spend,
      avatarColor: colorFor(booking.userId),
    })
  }

  return [...rows.values()].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
}
