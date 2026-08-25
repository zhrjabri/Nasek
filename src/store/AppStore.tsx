import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react'
import type {
  Booking,
  Campaign,
  Notification,
  User,
  VerificationStatus,
} from '@/types'
import { DEMO_CUSTOMER_BOOKINGS, DEMO_NOTIFICATIONS } from '@/data/seed'
import { storage } from '@/services/api/client'

const KEY = 'nasek.state.v1'
export const MAX_COMPARE = 3

interface PersistedState {
  user: User | null
  savedIds: string[]
  compareIds: string[]
  bookings: Booking[]
  notifications: Notification[]
  /** Campaigns created by a provider during this session. */
  providerCampaigns: Campaign[]
  /** Campaign ids the provider deleted (hidden from listings). */
  hiddenCampaignIds: string[]
  /** Verification decisions made by the admin during this session. */
  verificationOverrides: Record<string, VerificationStatus>
}

type Action =
  | { type: 'signIn'; user: User }
  | { type: 'signOut' }
  | { type: 'updateProfile'; patch: Partial<User> }
  | { type: 'toggleSaved'; id: string }
  | { type: 'toggleCompare'; id: string }
  | { type: 'clearCompare' }
  | { type: 'addBooking'; booking: Booking }
  | { type: 'cancelBooking'; id: string }
  | { type: 'readNotification'; id: string }
  | { type: 'readAllNotifications' }
  | { type: 'pushNotification'; notification: Notification }
  | { type: 'upsertCampaign'; campaign: Campaign }
  | { type: 'deleteCampaign'; id: string }
  | { type: 'setVerification'; providerId: string; status: VerificationStatus }
  | { type: 'hydrate'; state: PersistedState }

const emptyState: PersistedState = {
  user: null,
  savedIds: [],
  compareIds: [],
  bookings: [],
  notifications: [],
  providerCampaigns: [],
  hiddenCampaignIds: [],
  verificationOverrides: {},
}

function reducer(state: PersistedState, action: Action): PersistedState {
  switch (action.type) {
    case 'hydrate':
      return action.state

    case 'signIn': {
      // The demo customer arrives with a history so the dashboard isn't blank.
      const isDemoCustomer = action.user.id === 'u1'
      return {
        ...state,
        user: action.user,
        bookings: isDemoCustomer && state.bookings.length === 0
          ? DEMO_CUSTOMER_BOOKINGS
          : state.bookings,
        notifications:
          isDemoCustomer && state.notifications.length === 0
            ? DEMO_NOTIFICATIONS
            : state.notifications,
      }
    }

    case 'signOut':
      return { ...emptyState, verificationOverrides: state.verificationOverrides }

    case 'updateProfile':
      return state.user ? { ...state, user: { ...state.user, ...action.patch } } : state

    case 'toggleSaved':
      return {
        ...state,
        savedIds: state.savedIds.includes(action.id)
          ? state.savedIds.filter((id) => id !== action.id)
          : [...state.savedIds, action.id],
      }

    case 'toggleCompare': {
      if (state.compareIds.includes(action.id)) {
        return { ...state, compareIds: state.compareIds.filter((id) => id !== action.id) }
      }
      if (state.compareIds.length >= MAX_COMPARE) return state
      return { ...state, compareIds: [...state.compareIds, action.id] }
    }

    case 'clearCompare':
      return { ...state, compareIds: [] }

    case 'addBooking':
      return { ...state, bookings: [action.booking, ...state.bookings] }

    case 'cancelBooking':
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id ? { ...b, status: 'cancelled' as const } : b,
        ),
      }

    case 'readNotification':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, read: true } : n,
        ),
      }

    case 'readAllNotifications':
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      }

    case 'pushNotification':
      return { ...state, notifications: [action.notification, ...state.notifications] }

    case 'upsertCampaign': {
      const exists = state.providerCampaigns.some((c) => c.id === action.campaign.id)
      return {
        ...state,
        providerCampaigns: exists
          ? state.providerCampaigns.map((c) =>
              c.id === action.campaign.id ? action.campaign : c,
            )
          : [action.campaign, ...state.providerCampaigns],
        hiddenCampaignIds: state.hiddenCampaignIds.filter((id) => id !== action.campaign.id),
      }
    }

    case 'deleteCampaign':
      return {
        ...state,
        providerCampaigns: state.providerCampaigns.filter((c) => c.id !== action.id),
        hiddenCampaignIds: state.hiddenCampaignIds.includes(action.id)
          ? state.hiddenCampaignIds
          : [...state.hiddenCampaignIds, action.id],
      }

    case 'setVerification':
      return {
        ...state,
        verificationOverrides: {
          ...state.verificationOverrides,
          [action.providerId]: action.status,
        },
      }

    default:
      return state
  }
}

// ------------------------------------------------------------------- toasts

export interface Toast {
  id: number
  message: string
  tone: 'success' | 'info' | 'warning'
}

interface AppStoreValue extends PersistedState {
  dispatch: (action: Action) => void
  isSaved: (id: string) => boolean
  isComparing: (id: string) => boolean
  unreadCount: number
  toasts: Toast[]
  toast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
}

const AppStoreContext = createContext<AppStoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, emptyState)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Restore on mount, then persist on every change. Sessions survive a reload,
  // which matters when someone is walking a stakeholder through the flow.
  useEffect(() => {
    dispatch({ type: 'hydrate', state: storage.read<PersistedState>(KEY, emptyState) })
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) storage.write(KEY, state)
  }, [state, hydrated])

  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((cur) => [...cur, { id, message, tone }])
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 3600)
  }, [])

  const dismissToast = useCallback(
    (id: number) => setToasts((cur) => cur.filter((t) => t.id !== id)),
    [],
  )

  const value = useMemo<AppStoreValue>(
    () => ({
      ...state,
      dispatch,
      isSaved: (id) => state.savedIds.includes(id),
      isComparing: (id) => state.compareIds.includes(id),
      unreadCount: state.notifications.filter((n) => !n.read).length,
      toasts,
      toast,
      dismissToast,
    }),
    [state, toasts, toast, dismissToast],
  )

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useStore must be used inside <AppStoreProvider>')
  return ctx
}
