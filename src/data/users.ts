import type { User } from '@/types'

/**
 * DEMO ACCOUNTS — the sign-in screen offers these as one-click logins so the
 * prototype can be explored from every role without a real auth backend.
 * Passwords are not checked anywhere; see `services/api/auth.ts`.
 */
export const DEMO_USERS: User[] = [
  {
    id: 'u1',
    name: 'الزهراء الجابرية',
    email: 'customer@nasek.demo',
    phone: '+968 9123 4567',
    role: 'customer',
    wilayahId: 'muscat',
    avatarColor: '#1c5e4c',
    createdAt: '2025-11-02',
  },
  {
    id: 'u2',
    name: 'سعيد الهنائي',
    email: 'provider@nasek.demo',
    phone: '+968 9887 6543',
    role: 'provider',
    wilayahId: 'muscat',
    avatarColor: '#a8842c',
    providerId: 'p1',
    createdAt: '2024-03-11',
  },
  {
    id: 'u3',
    name: 'إدارة ناسِك',
    email: 'admin@nasek.demo',
    phone: '+968 9000 0000',
    role: 'admin',
    wilayahId: 'muscat',
    avatarColor: '#10402f',
    createdAt: '2024-01-01',
  },
]

export const demoUserFor = (role: User['role']) =>
  DEMO_USERS.find((u) => u.role === role)!
