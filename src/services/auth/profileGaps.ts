import type { User } from '@/types'

/**
 * What a booking form has learned that the profile does not already know.
 *
 * NASEK registers a pilgrim on an address and nothing else, which moves the
 * question "what is your name?" to the first place it is actually load-bearing:
 * the booking form, where it goes on a manifest a campaign reads at an airport.
 * Once given, it should not be asked for again — so the booking writes it back.
 *
 * The rule is *gaps only*, and the restraint matters in both directions.
 *
 *   * A pilgrim whose name is still the address-derived placeholder gets the
 *     one they just typed. That is the payoff for not asking at registration:
 *     the detail is captured the first time it means something.
 *   * A profile that already carries a name is left alone. A booking's contact
 *     is not always the account holder — a son books for his mother, an office
 *     books for a group — and quietly renaming somebody's account to whoever
 *     travelled this time is a worse failure than an un-prefilled field. The
 *     dashboard's profile tab is where a person changes their own name on
 *     purpose.
 *
 * Kept pure, in its own module, so `npm run verify:auth` can assert it without
 * a browser: this is the one place that decides what a booking is allowed to
 * change about an account, and it should be provable rather than believed.
 */
export interface ContactDetails {
  name: string
  phone: string
  email: string
}

/**
 * The patch to apply, or null when the profile already knows everything the
 * form collected. Never includes `email`: the address is the account's
 * identifier, it came from the verified sign-in, and a contact address typed
 * into a booking is not a claim to have proved anything about a new one.
 */
export function contactDetailsToKeep(
  user: Pick<User, 'name' | 'phone' | 'nameIsPlaceholder'>,
  contact: ContactDetails,
): Partial<User> | null {
  const patch: Partial<User> = {}

  if ((user.nameIsPlaceholder || !user.name.trim()) && contact.name.trim()) {
    patch.name = contact.name.trim()
    patch.nameIsPlaceholder = false
  }
  if (!user.phone.trim() && contact.phone.trim()) {
    patch.phone = contact.phone.trim()
  }

  return Object.keys(patch).length ? patch : null
}
