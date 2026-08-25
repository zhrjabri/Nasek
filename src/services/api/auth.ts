import type { Role, User } from '@/types'
import { request } from './client'

export interface SignUpInput {
  name: string
  email: string
  phone: string
  wilayahId: string
  role: Exclude<Role, 'admin'>
  companyName?: string
  experienceYears?: number
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
   * One-click role entry used by the "explore without signing up" panel.
   *
   * There are no seeded accounts to look up any more, so each press mints a
   * throwaway user for that role. `name` comes from the caller because only
   * the page knows which language to label it in.
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
        // A newly registered owner has no published campaigns yet; the
        // dashboard shows its empty state until they add their first trip.
        providerId: input.role === 'provider' ? `p-new-${id}` : undefined,
        createdAt: new Date().toISOString().slice(0, 10),
      }
    }, { latencyMs: 900 }),
}
