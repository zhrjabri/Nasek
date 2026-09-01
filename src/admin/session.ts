import type { User } from '@/types'
import { supabase, isSupabaseConfigured } from '@/services/supabase/client'
import { profileToUser, signOutRemote } from '@/services/auth/session'
import type { ProfileRow } from '@/services/supabase/schema'

/**
 * The administration session.
 *
 * This is the single check the whole dashboard rests on, so it is worth being
 * exact about what it does and does not prove.
 *
 * It asks Postgres two questions. `is_admin()` runs *inside the database*
 * against `auth.uid()`, which is derived from the JWT's signature — so its
 * answer cannot be influenced by anything this browser says. The profile query
 * then comes back through row-level security, which means a non-admin does not
 * receive a row saying "you are not an admin"; they receive their own row and
 * nothing else, and every admin-scoped table returns zero rows to them for the
 * rest of the session.
 *
 * That last part is what makes this different from every guard NASEK had
 * before. Turning this function's answer to `true` by hand — editing storage,
 * patching the bundle, calling it from a console — gets you a dashboard frame
 * drawn around empty tables, because the data was never the browser's to
 * withhold. The interface is not the security boundary any more.
 */

export type AdminGateReason = 'anonymous' | 'not_admin' | 'suspended' | 'unavailable'

export interface AdminSession {
  user: User | null
  reason: AdminGateReason | null
}

const DENIED = (reason: AdminGateReason): AdminSession => ({ user: null, reason })

/**
 * Whether this browser has passed the local passphrase gate.
 *
 * Only consulted when no backend is configured. Kept in `sessionStorage` rather
 * than `localStorage` deliberately: a fallback that is explicitly not a
 * security control should at least not outlive the tab it was granted in.
 */
const LOCAL_GATE_KEY = 'nasek.admin.local-gate'

export const markLocalGatePassed = () => {
  try {
    window.sessionStorage.setItem(LOCAL_GATE_KEY, '1')
  } catch {
    /* private mode — the gate simply has to be passed again */
  }
}

export const localGatePassed = () => {
  try {
    return window.sessionStorage.getItem(LOCAL_GATE_KEY) === '1'
  } catch {
    return false
  }
}

const clearLocalGate = () => {
  try {
    window.sessionStorage.removeItem(LOCAL_GATE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Resolve who, if anyone, is administering NASEK in this browser.
 *
 * Returns a reason rather than a bare null so the login screen can say
 * something true and useful — "this account is not an administrator" is a
 * different problem from "you are not signed in", and only one of them is
 * fixed by signing in again.
 */
export async function loadAdminSession(): Promise<AdminSession> {
  if (!supabase) {
    // No backend. There is nothing to authorise against, so the dashboard falls
    // back to the passphrase gate the prototype shipped with. It guards a
    // dashboard over this browser's own local data and claims nothing more.
    return localGatePassed() ? { user: null, reason: null } : DENIED('anonymous')
  }

  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session?.user?.id) return DENIED('anonymous')

  // Asked of the database, not of the row we are about to read. If this and the
  // profile below ever disagreed, the database's answer is the one that governs
  // what any subsequent query returns.
  const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin')
  if (rpcError) return DENIED('unavailable')
  if (!isAdmin) return DENIED('not_admin')

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.session.user.id)
    .maybeSingle()

  if (error || !data) return DENIED('unavailable')

  const row = data as ProfileRow
  if (row.suspended || row.removed) return DENIED('suspended')
  return { user: profileToUser(row), reason: null }
}

/** Sign out of the dashboard, by whichever route this browser got in. */
export async function endAdminSession(): Promise<void> {
  clearLocalGate()
  if (isSupabaseConfigured) await signOutRemote()
}
