import type { Provider, Role, User } from '@/types'
import { request } from './client'

export interface SignUpInput {
  name: string
  email: string
  phone: string
  wilayahId: string
  role: Exclude<Role, 'admin'>
}

/** Everything the campaign-owner registration form collects. */
export interface ProviderSignUpInput {
  /** The person registering. */
  name: string
  email: string
  phone: string
  wilayahId: string
  companyName: string
  tagline: string
  experienceYears: number
  /** Downscaled permit image, produced by `lib/imageFile.ts`. */
  licenceImage: string
  licenceFileName: string
}

/** Registration hands back both records: the login and the company it owns. */
export interface ProviderSignUpResult {
  user: User
  provider: Provider
}

const AVATAR_COLORS = ['#1c5e4c', '#23765e', '#a8842c', '#10402f', '#856422']

/**
 * Mock authentication.
 *
 * Passwords are accepted but never checked or stored — there is no credential
 * handling in this prototype, deliberately. A production build would replace
 * this module with a real identity provider and httpOnly session cookies;
 * nothing outside this file assumes how a session is established.
 */
export const authApi = {
  /**
   * Mint a session for a role without checking credentials.
   *
   * The only caller left is the administration gate, which does its own
   * check — a passphrase — before calling this. Customers and campaign owners
   * no longer come through here: they sign in with an email or phone and a
   * password, verified in `credentials.ts`. `name` comes from the caller
   * because only the page knows which language to label it in.
   */
  signInAs: (role: Role, name: string) =>
    request<User>(() => {
      const id = `u${Math.floor(Math.random() * 90000) + 10000}`
      return {
        id,
        name,
        email: `${role}@nasek.local`,
        phone: '',
        role,
        wilayahId: 'muscat',
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        providerId: role === 'provider' ? `p-guest-${id}` : undefined,
        createdAt: new Date().toISOString().slice(0, 10),
      }
    }, { latencyMs: 350 }),

  /**
   * Campaign-owner registration.
   *
   * Creates the company alongside the login, so the owner shows up in the
   * admin's verification queue straight away rather than registering into
   * nothing. Verification starts `pending` — an admin decides from there.
   */
  registerProvider: (input: ProviderSignUpInput) =>
    request<ProviderSignUpResult>(() => {
      const id = `u${Math.floor(Math.random() * 90000) + 10000}`
      const providerId = `p-new-${id}`
      const today = new Date().toISOString().slice(0, 10)
      const initials = input.companyName.trim().charAt(0) || '?'

      return {
        user: {
          id,
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: 'provider',
          wilayahId: input.wilayahId,
          avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
          providerId,
          createdAt: today,
        },
        provider: {
          id: providerId,
          // One entry typed in one language: this prototype does not ask an
          // owner to write their own name twice.
          name: { ar: input.companyName, en: input.companyName },
          tagline: { ar: input.tagline, en: input.tagline },
          description: { ar: input.tagline, en: input.tagline },
          wilayahId: input.wilayahId,
          verification: 'pending',
          experienceYears: input.experienceYears,
          // No trips and no travellers yet, so nothing to average.
          rating: 0,
          reviewCount: 0,
          phone: input.phone,
          email: input.email,
          initials,
          brandColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
          plan: 'basic',
          joinedAt: today,
          licenceImage: input.licenceImage,
          licenceFileName: input.licenceFileName,
        },
      }
    }, { latencyMs: 900 }),

  signUp: (input: SignUpInput) =>
    request<User>(() => {
      const id = `u${Math.floor(Math.random() * 90000) + 10000}`
      return {
        id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        wilayahId: input.wilayahId,
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        createdAt: new Date().toISOString().slice(0, 10),
      }
    }, { latencyMs: 900 }),
}
