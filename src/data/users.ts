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
  /**
   * Moderation as the database records it, where there is a row to record it.
   *
   * Undefined for a row assembled from a company or a booking rather than read
   * from `profiles` — the offline prototype, and the handful of historical
   * customers who exist only in the booking ledger. The screen falls back to
   * this session's own decisions for those.
   */
  suspended?: boolean
  removed?: boolean
  /**
   * False when this row is a stand-in rather than an account.
   *
   * A company with no readable owner profile still has to appear in the
   * directory, but it cannot be suspended — there is no account to suspend, and
   * the id here is invented. The screen uses this to stop offering an action
   * that would quietly do nothing, which is what it did before.
   */
  isAccount: boolean
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
 * Three sources, because no one of them knows about every account:
 *
 *   - `registered` is the authority wherever it reaches. Against a database it
 *     is `profiles` as the policies handed it over — every account on the
 *     platform for an administrator — so each row carries the id the account
 *     actually has.
 *   - `providers` covers a company whose owner profile is not readable, which
 *     is every company in the offline prototype and none of them for an
 *     administrator.
 *   - `bookings` covers customers known only by having booked, and supplies the
 *     trip counts and spend for everybody.
 *
 * Overlaps are merged by id rather than listed twice.
 *
 * WHY THE ORDER MATTERS
 *
 * Companies used to come first and to invent their own key — `owner-<uuid>` —
 * and the account row that followed was skipped outright for anyone who was not
 * a customer. So a campaign owner appeared in this table under an id that
 * belonged to no account, and the suspend and remove buttons sent that id to
 * `profiles`, where it matched nothing. The dashboard reported success and
 * changed nothing, for every campaign owner on the platform.
 *
 * Real accounts are therefore laid down first and keyed by their real id; a
 * company only contributes a row of its own when no account claimed it.
 */
export function buildDirectory(
  providers: Provider[],
  bookings: Booking[],
  registered: User[] = [],
): DirectoryUser[] {
  const rows = new Map<string, DirectoryUser>()
  const companies = new Map(providers.map((p) => [p.id, p]))
  /** Companies already represented by an account, so they are not listed twice. */
  const claimed = new Set<string>()

  for (const user of registered) {
    const company = user.providerId ? companies.get(user.providerId) : undefined
    if (company) claimed.add(company.id)
    rows.set(user.id, {
      id: user.id,
      // A campaign owner is recognised by their company, not by the name on the
      // account — that is what an administrator is looking at the row to find.
      name: company ? company.name.en || company.name.ar : user.name,
      email: user.email || company?.email || '',
      phone: user.phone || company?.phone || '',
      role: user.role,
      wilayahId: user.wilayahId,
      joinedAt: user.createdAt,
      bookings: 0,
      spend: 0,
      providerId: company?.id,
      avatarColor: company?.brandColor || user.avatarColor || colorFor(user.id),
      suspended: user.suspended,
      removed: user.removed,
      isAccount: true,
    })
  }

  for (const provider of providers) {
    if (claimed.has(provider.id)) continue
    const id = `owner-${provider.id}`
    rows.set(id, {
      id,
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
      // Not an account: the id above is this function's invention, and there is
      // no profile row behind it to moderate.
      isAccount: false,
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
      // `booking.userId` is a real account id, so this row can be moderated
      // even though no profile was readable to describe it.
      isAccount: true,
    })
  }

  return [...rows.values()].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
}
