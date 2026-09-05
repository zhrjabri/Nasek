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
  CampaignStatus,
  Notification,
  Provider,
  Review,
  User,
  VerificationStatus,
} from '@/types'
import type { RemoteSnapshot } from '@/services/data/catalogue'
import type { Credential, Lockout } from '@/services/api/credentials'
import { LOCKOUT_MS, MAX_ATTEMPTS } from '@/services/api/credentials'
import { DEMO_CUSTOMER_BOOKINGS, DEMO_NOTIFICATIONS } from '@/data/seed'
import { storage } from '@/services/api/client'

const KEY = 'nasek.state.v1'

export interface PersistedState {
  user: User | null
  savedIds: string[]
  bookings: Booking[]
  notifications: Notification[]
  /** Campaign owners who registered during this session. */
  sessionProviders: Provider[]
  /** Everyone who has registered an account, kept for the admin directory. */
  sessionUsers: User[]
  /** Campaigns created by a provider during this session. */
  providerCampaigns: Campaign[]
  /** Campaign ids the provider deleted (hidden from listings). */
  hiddenCampaignIds: string[]
  /** Verification decisions made by the admin during this session. */
  verificationOverrides: Record<string, VerificationStatus>
  /** Accounts the admin has suspended. */
  suspendedUserIds: string[]
  /** Accounts the admin has removed from the directory. */
  removedUserIds: string[]
  /** Campaigns the admin has taken down. Distinct from `hiddenCampaignIds`,
   *  which is an owner deleting their own trip: an owner must not be able to
   *  quietly undo a moderation decision by republishing. */
  campaignSuspensions: string[]
  /** The admin's featured decisions, laid over each campaign's own flag. */
  featureOverrides: Record<string, boolean>
  /**
   * The admin's approval decisions on trips, for the no-backend prototype.
   *
   * The exact counterpart of `verificationOverrides`, and it exists for the same
   * narrow reason: with a database, approval is a column an administrator wrote
   * and everyone reads, and this map is never consulted. Without one, the store
   * is the whole platform — so a clone with no setup still has a working
   * approval queue rather than a dashboard whose approve button does nothing.
   *
   * The two are never combined. `deriveCatalogue` reads the column when a
   * snapshot has landed and this only when one has not, because laying a
   * browser's stale opinion over a server row is how a campaign the platform
   * refused keeps showing as live on one laptop.
   */
  campaignStatusOverrides: Record<string, CampaignStatus>
  /** Reviews the admin has taken down. */
  hiddenReviewIds: string[]
  /** Hashed sign-in credentials, one per registered account. */
  credentials: Credential[]
  /** Failed sign-in attempts, keyed by the identifier that was tried. */
  lockouts: Record<string, Lockout>

  // ------------------------------------------------------------ from the server
  /*
   * The slices below are the database's, not this browser's.
   *
   * They are held in the same store so that every screen keeps reading one
   * place — `useCatalogue`, the dashboards and the admin tables did not have to
   * change — but they are deliberately excluded from what gets written to
   * localStorage. Persisting them would mean showing a stale catalogue on the
   * next load and, worse, showing rows to whoever opens the browser next rather
   * than to whoever the policies said could see them.
   */
  /**
   * True once the server has been asked who is signed in.
   *
   * Held in the store rather than returned from the hook because several route
   * guards need it and only one listener should exist. When each guard ran its
   * own copy, they raced each other over the same session.
   */
  authSettled: boolean
  /** True once a snapshot has been loaded, so the catalogue knows to prefer it. */
  remoteReady: boolean
  remoteProviders: Provider[]
  remoteCampaigns: Campaign[]
  reviews: Review[]
  /**
   * The account directory, as the policies handed it over.
   *
   * One row for a pilgrim, everyone for an administrator. Held apart from
   * `sessionUsers` — which is only ever "accounts registered in this browser" —
   * because the administration screen needs the platform's answer, not this
   * browser's recollection of it.
   */
  remoteProfiles: User[]
}

export type Action =
  | { type: 'signIn'; user: User }
  | { type: 'signOut' }
  | { type: 'updateProfile'; patch: Partial<User> }
  | { type: 'toggleSaved'; id: string }
  | { type: 'addBooking'; booking: Booking }
  | { type: 'cancelBooking'; id: string }
  | { type: 'readNotification'; id: string }
  | { type: 'readAllNotifications' }
  | { type: 'pushNotification'; notification: Notification }
  | { type: 'addProvider'; provider: Provider }
  | { type: 'registerUser'; user: User }
  | { type: 'upsertCampaign'; campaign: Campaign }
  | { type: 'deleteCampaign'; id: string }
  | { type: 'setVerification'; providerId: string; status: VerificationStatus }
  | { type: 'setUserSuspended'; userId: string; suspended: boolean }
  | { type: 'removeUser'; userId: string }
  | { type: 'restoreUser'; userId: string }
  | { type: 'setCampaignSuspended'; campaignId: string; suspended: boolean }
  | { type: 'setCampaignFeatured'; campaignId: string; featured: boolean }
  | { type: 'setCampaignStatus'; campaignId: string; status: CampaignStatus; reason?: string }
  | { type: 'setReviewHidden'; reviewId: string; hidden: boolean }
  | { type: 'addCredential'; credential: Credential }
  | { type: 'signInFailed'; key: string; now: number }
  | { type: 'signInSucceeded'; key: string }
  | { type: 'hydrate'; state: PersistedState }
  | { type: 'hydrateRemote'; snapshot: RemoteSnapshot }
  | { type: 'setAuthSettled'; settled: boolean }

export const emptyState: PersistedState = {
  user: null,
  savedIds: [],
  bookings: [],
  notifications: [],
  sessionProviders: [],
  sessionUsers: [],
  providerCampaigns: [],
  hiddenCampaignIds: [],
  verificationOverrides: {},
  suspendedUserIds: [],
  removedUserIds: [],
  campaignSuspensions: [],
  featureOverrides: {},
  campaignStatusOverrides: {},
  hiddenReviewIds: [],
  credentials: [],
  lockouts: {},
  authSettled: false,
  remoteReady: false,
  remoteProviders: [],
  remoteCampaigns: [],
  reviews: [],
  remoteProfiles: [],
}

export function reducer(state: PersistedState, action: Action): PersistedState {
  switch (action.type) {
    case 'hydrate':
      /*
       * Stored state is whatever shape the app had when it was last written,
       * which can predate any slice added since. Reading it back raw would
       * leave those slices undefined -- and code that spreads them would
       * throw on the first render, white-screening returning visitors. Start
       * from the empty shape and lay the stored values on top.
       */
      return { ...emptyState, ...action.state }

    case 'setAuthSettled':
      return state.authSettled === action.settled
        ? state
        : { ...state, authSettled: action.settled }

    case 'hydrateRemote':
      /*
       * The server's answer replaces this browser's guess wholesale.
       *
       * Merging would be worse than useless: a trip an administrator took down
       * is absent from the snapshot precisely because it should no longer be
       * visible, and merging would put it back. The personal slices are
       * replaced too, because row-level security already scoped them to this
       * account.
       */
      return {
        ...state,
        remoteReady: true,
        remoteProviders: action.snapshot.providers,
        remoteCampaigns: action.snapshot.campaigns,
        remoteProfiles: action.snapshot.profiles,
        bookings: action.snapshot.bookings,
        reviews: action.snapshot.reviews,
        notifications: action.snapshot.notifications,
        savedIds: action.snapshot.savedIds,
      }

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
      /*
       * Signing out clears the person, not the platform.
       *
       * Registered companies, published trips and the admin's verification
       * decisions belong to NASEK and have to outlive one login — otherwise
       * an owner who registers and then switches to the admin account to
       * watch it get verified would find their company gone. Only the
       * personal slices (profile, saved trips, bookings, notifications)
       * reset.
       */
      return {
        ...emptyState,
        sessionProviders: state.sessionProviders,
        sessionUsers: state.sessionUsers,
        providerCampaigns: state.providerCampaigns,
        hiddenCampaignIds: state.hiddenCampaignIds,
        verificationOverrides: state.verificationOverrides,
        suspendedUserIds: state.suspendedUserIds,
        removedUserIds: state.removedUserIds,
        campaignSuspensions: state.campaignSuspensions,
        featureOverrides: state.featureOverrides,
        campaignStatusOverrides: state.campaignStatusOverrides,
        hiddenReviewIds: state.hiddenReviewIds,
        credentials: state.credentials,
        lockouts: state.lockouts,
        // Everything below was fetched under the departing session's policies
        // and is not this browser's to keep.
        authSettled: true,
        remoteReady: false,
        remoteProviders: [],
        remoteCampaigns: [],
        remoteProfiles: [],
        reviews: [],
      }

    case 'updateProfile':
      return state.user ? { ...state, user: { ...state.user, ...action.patch } } : state

    case 'toggleSaved':
      return {
        ...state,
        savedIds: state.savedIds.includes(action.id)
          ? state.savedIds.filter((id) => id !== action.id)
          : [...state.savedIds, action.id],
      }

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

    case 'addProvider':
      return { ...state, sessionProviders: [...state.sessionProviders, action.provider] }

    case 'registerUser':
      /*
       * Registering is what creates an account; signing in as a guest does
       * not. Recording every guest press would bury the real registrations
       * under throwaway rows in the admin's directory.
       */
      return state.sessionUsers.some((u) => u.id === action.user.id)
        ? state
        : { ...state, sessionUsers: [...state.sessionUsers, action.user] }

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

    case 'setUserSuspended':
      return {
        ...state,
        suspendedUserIds: action.suspended
          ? state.suspendedUserIds.includes(action.userId)
            ? state.suspendedUserIds
            : [...state.suspendedUserIds, action.userId]
          : state.suspendedUserIds.filter((id) => id !== action.userId),
      }

    case 'removeUser':
      /*
       * Removal is recorded, not carried out: the account is hidden from the
       * directory and its id kept, so the decision survives a reload and can
       * be undone. Erasing the person outright would also erase the bookings
       * they are reconstructed from, which would silently rewrite the revenue
       * history the rest of the dashboard reports.
       */
      return {
        ...state,
        removedUserIds: state.removedUserIds.includes(action.userId)
          ? state.removedUserIds
          : [...state.removedUserIds, action.userId],
        suspendedUserIds: state.suspendedUserIds.filter((id) => id !== action.userId),
      }

    case 'restoreUser':
      return {
        ...state,
        removedUserIds: state.removedUserIds.filter((id) => id !== action.userId),
      }

    case 'setCampaignSuspended':
      return {
        ...state,
        campaignSuspensions: action.suspended
          ? state.campaignSuspensions.includes(action.campaignId)
            ? state.campaignSuspensions
            : [...state.campaignSuspensions, action.campaignId]
          : state.campaignSuspensions.filter((id) => id !== action.campaignId),
      }

    case 'setCampaignFeatured':
      return {
        ...state,
        featureOverrides: { ...state.featureOverrides, [action.campaignId]: action.featured },
      }

    /*
     * An approval decision, and the refusal reason that has to travel with it.
     *
     * Two writes, deliberately. The override map is what `deriveCatalogue`
     * consults for a trip that came from the seed catalogue; the copy on the
     * row is what the owner's own dashboard reads, and it is where the reason
     * has to live — a refusal kept in a second map beside the campaign is a
     * refusal that goes missing the moment the two fall out of step.
     *
     * Never reached when a database is configured. There, `set_campaign_status`
     * writes a column and everybody reads the same one.
     */
    case 'setCampaignStatus':
      return {
        ...state,
        campaignStatusOverrides: {
          ...state.campaignStatusOverrides,
          [action.campaignId]: action.status,
        },
        providerCampaigns: state.providerCampaigns.map((c) =>
          c.id === action.campaignId
            ? {
                ...c,
                status: action.status,
                rejectionReason:
                  action.status === 'rejected' ? (action.reason ?? c.rejectionReason) : undefined,
                reviewedAt: new Date().toISOString(),
              }
            : c,
        ),
      }

    case 'setReviewHidden':
      return {
        ...state,
        hiddenReviewIds: action.hidden
          ? state.hiddenReviewIds.includes(action.reviewId)
            ? state.hiddenReviewIds
            : [...state.hiddenReviewIds, action.reviewId]
          : state.hiddenReviewIds.filter((id) => id !== action.reviewId),
      }

    case 'addCredential':
      // Re-registering with the same address replaces the old password
      // rather than leaving two credentials that both open one account.
      return {
        ...state,
        credentials: [
          ...state.credentials.filter(
            (c) =>
              c.userId !== action.credential.userId &&
              c.emailKey !== action.credential.emailKey,
          ),
          action.credential,
        ],
      }

    case 'signInFailed': {
      const previous = state.lockouts[action.key]
      const fails = (previous?.fails ?? 0) + 1
      return {
        ...state,
        lockouts: {
          ...state.lockouts,
          [action.key]: {
            fails,
            // The lock is written into stored state, so closing the tab and
            // coming back does not hand out a fresh set of guesses.
            lockedUntil: fails >= MAX_ATTEMPTS ? action.now + LOCKOUT_MS : 0,
          },
        },
      }
    }

    case 'signInSucceeded': {
      if (!state.lockouts[action.key]) return state
      const { [action.key]: _cleared, ...rest } = state.lockouts
      return { ...state, lockouts: rest }
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
    if (!hydrated) return
    /*
     * Server-owned slices are stripped before writing.
     *
     * They would be stale on the next load, they would bloat the quota with a
     * whole catalogue, and — the reason that actually matters — they would
     * leave rows on disk that were fetched under one account's policies and
     * would be read back under whoever opens the browser next.
     */
    const {
      authSettled: _a,
      remoteReady: _r,
      remoteProviders: _p,
      remoteCampaigns: _c,
      remoteProfiles: _u,
      reviews: _v,
      ...persistable
    } = state
    storage.write(KEY, persistable)
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
