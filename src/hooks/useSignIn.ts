import { useCallback } from 'react'
import type { Role, User, VerificationStatus } from '@/types'
import type { MessageKey } from '@/i18n'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { loadSessionSettled, saveProfile } from '@/services/auth/session'
import { normaliseTarget, type OtpTarget } from '@/services/auth/otp'
import { normaliseEmail, normalisePhone } from '@/services/api/credentials'
import { useStore } from '@/store/AppStore'

/**
 * Turning a verified code into a signed-in person.
 *
 * `OtpFlow` proves someone can receive mail at an address or a message on a
 * handset, and stops there deliberately — it has no idea what an account is.
 * This hook is the other half: it works out who that identifier belongs to,
 * applies whatever the sign-up form collected, and puts them in the store.
 *
 * Two implementations, one signature, because NASEK has to keep running with no
 * backend configured. With Supabase, the account is a row and the session is a
 * signed token. Without it, the account is an entry in this browser's own state
 * — which is exactly what the prototype always was, minus the password nobody
 * wanted to invent.
 */

export interface SignInOutcome {
  user?: User
  /** Set instead of `user` when the identifier resolves to a barred account. */
  error?: MessageKey
}

const AVATAR_COLORS = ['#1c5e4c', '#23765e', '#a8842c', '#10402f', '#856422']

/**
 * The details a registration form gathered before the code was sent.
 *
 * All optional, and for customer registration all absent: a pilgrim types an
 * address and nothing else, so there is nothing to apply. What remains is what
 * the campaign-owner form genuinely collects about the person registering, and
 * it is applied to their profile once the code has proved the address.
 *
 * `role` used to be here and is gone. It was documented as ignored — the
 * database reverts it, and becoming a campaign owner runs through
 * `register_provider` — so an optional field that nothing read and nothing
 * could honour was an invitation to try asserting a role from a sign-up form.
 */
export interface SignUpDetails {
  name?: string
  phone?: string
  wilayahId?: string
}

export function useCompleteSignIn() {
  const { dispatch, sessionUsers, suspendedUserIds, removedUserIds } = useStore()

  return useCallback(
    async (target: OtpTarget, details: SignUpDetails = {}): Promise<SignInOutcome> => {
      const identifier = normaliseTarget(target)
      if (!identifier) return { error: 'auth.errInvalidTarget' }

      // ------------------------------------------------------- with a backend
      if (isSupabaseConfigured) {
        // The profile row is created by a database trigger a beat after the
        // auth user, so this waits rather than reading once and giving up.
        const session = await loadSessionSettled()
        if (session.blocked === 'suspended') return { error: 'auth.blockedSuspended' }
        if (session.blocked === 'removed') return { error: 'auth.blockedRemoved' }
        if (!session.user) return { error: 'auth.sessionFailed' }

        // Anything the form collected is written now. `role` is not among the
        // fields `saveProfile` will send, and the database would revert it in
        // any case — registering as a campaign owner is a separate, guarded
        // step, not a value a sign-up form gets to assert about itself.
        const patch: Partial<User> = {}
        if (details.name?.trim()) patch.name = details.name.trim()
        if (details.phone?.trim()) patch.phone = details.phone.trim()
        if (details.wilayahId) patch.wilayahId = details.wilayahId

        const saved = Object.keys(patch).length ? await saveProfile(patch) : null
        const user = saved ?? session.user
        dispatch({ type: 'registerUser', user })
        dispatch({ type: 'signIn', user })
        return { user }
      }

      // ---------------------------------------------------- without a backend
      const key =
        target.channel === 'email' ? normaliseEmail(identifier) : normalisePhone(identifier)

      const existing = sessionUsers.find((u) =>
        target.channel === 'email'
          ? normaliseEmail(u.email) === key
          : normalisePhone(u.phone) === key,
      )

      if (existing) {
        // The administrator's decisions are enforced on the way in, not merely
        // displayed in the dashboard — suspending an account has to keep it out.
        if (removedUserIds.includes(existing.id)) return { error: 'auth.blockedRemoved' }
        if (suspendedUserIds.includes(existing.id)) return { error: 'auth.blockedSuspended' }

        const merged: User = {
          ...existing,
          name: details.name?.trim() || existing.name,
          nameIsPlaceholder: details.name?.trim()
            ? false
            : (existing.nameIsPlaceholder ?? false),
          phone: details.phone?.trim() || existing.phone,
          wilayahId: details.wilayahId || existing.wilayahId,
        }
        dispatch({ type: 'signIn', user: merged })
        return { user: merged }
      }

      /*
       * No account yet, so this identifier creates one.
       *
       * That is the whole promise of passwordless sign-in and it is worth being
       * explicit about: there is no "no account found" dead end, because typing
       * your address *is* registering. A first-time pilgrim and a returning one
       * take the same three steps.
       */
      const id = `u${Math.floor(Math.random() * 90000) + 10000}`
      const user: User = {
        id,
        name: details.name?.trim() || defaultName(target, identifier),
        // A pilgrim registering with nothing but an address gets a greeting
        // derived from it, flagged as exactly that. See `User.nameIsPlaceholder`.
        nameIsPlaceholder: !details.name?.trim(),
        email: target.channel === 'email' ? identifier : '',
        phone: target.channel === 'phone' ? identifier : (details.phone?.trim() ?? ''),
        // Always. The one way to hold anything else is `registerProviderAccount`,
        // which replaces this user with the one the registration produced.
        role: 'customer',
        wilayahId: details.wilayahId ?? 'muscat',
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        createdAt: new Date().toISOString().slice(0, 10),
      }
      dispatch({ type: 'registerUser', user })
      dispatch({ type: 'signIn', user })
      return { user }
    },
    [dispatch, sessionUsers, suspendedUserIds, removedUserIds],
  )
}

/** Something to greet a new arrival by until they fill in a profile. */
function defaultName(target: OtpTarget, identifier: string) {
  return target.channel === 'email' ? identifier.split('@')[0] : identifier
}

/** Where each role lands after signing in on the public site. */
export const HOME_FOR: Record<Exclude<Role, 'admin'>, string> = {
  customer: '/dashboard',
  provider: '/provider',
}

/**
 * The page to open once someone is through.
 *
 * An administrator signing in *here* is signing in as a person, not as an
 * administrator: this application has no dashboard for them and no code to
 * build one from. They land where any pilgrim would.
 */
export const landingFor = (user: User) =>
  user.role === 'admin' ? '/dashboard' : HOME_FOR[user.role]

/**
 * Where a campaign owner belongs, given what NASEK has decided about their
 * company.
 *
 * Kept here — pure, with no React and no store — rather than inside the route
 * guard that uses it, because it is the one piece of the provider flow that is
 * worth asserting directly. `npm run verify:auth` walks every status through
 * it, including the legacy `unverified` that nothing writes any more and rows
 * still carry.
 *
 * `suspended` is absent from the return type on purpose: there is no route for
 * it. A suspended owner is shown a message in place of whichever page they
 * asked for, because sending them somewhere would imply there is somewhere to
 * go, and the only way out of a suspension is a person at NASEK.
 */
export function providerLanding(status: VerificationStatus): string | null {
  if (status === 'verified') return '/provider'
  if (status === 'rejected') return '/provider/review'
  if (status === 'suspended') return null
  return '/provider/pending'
}
