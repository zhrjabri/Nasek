import type { User } from '@/types'

/**
 * No seeded accounts. The sign-in screen's one-click role entry mints a fresh
 * throwaway user instead, so the dashboards stay explorable without a
 * fictional person sitting in the data. See `services/api/auth.ts`.
 */
export const DEMO_USERS: User[] = []
