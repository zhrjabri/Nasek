import type { Role, User } from '@/types'
import { supabase } from '@/services/supabase/client'
import type { ProfileRow } from '@/services/supabase/schema'

/**
 * Who is signed in, according to the server.
 *
 * Every function here asks Postgres rather than reading local state, and that
 * is the entire point. The prototype's `user` object lived in localStorage,
 * which meant `user.role === 'admin'` was a question the visitor answered about
 * themselves. Here the role arrives on a row that row-level security decided to
 * return, keyed to a JWT the browser cannot mint. Editing stored state now
 * changes what the interface draws for a moment and nothing about what the
 * database will hand over.
 */

const AVATAR_COLORS = ['#1c5e4c', '#23765e', '#a8842c', '#10402f', '#856422']

/** A stable colour per account, so a person's monogram does not change on reload. */
function colourFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/**
 * A name to greet someone by when they have not given one.
 *
 * Passwordless sign-in asks for one identifier and nothing else, so a
 * first-time pilgrim reaches the dashboard before NASEK knows what to call
 * them. Using the local part of their address is better than "User" and is
 * replaced the moment they save a profile.
 */
export function fallbackName(row: Pick<ProfileRow, 'name' | 'email' | 'phone'>): string {
  if (row.name.trim()) return row.name.trim()
  if (row.email) return row.email.split('@')[0]
  if (row.phone) return row.phone
  return ''
}

export function profileToUser(row: ProfileRow): User {
  return {
    id: row.id,
    name: fallbackName(row),
    email: row.email ?? '',
    phone: row.phone ?? '',
    role: row.role as Role,
    wilayahId: row.wilayah_id ?? 'muscat',
    avatarColor: row.avatar_color || colourFor(row.id),
    providerId: row.provider_id ?? undefined,
    createdAt: row.created_at.slice(0, 10),
  }
}

export interface SessionState {
  user: User | null
  /** Set when the account exists but an administrator has barred it. */
  blocked: 'suspended' | 'removed' | null
}

const EMPTY: SessionState = { user: null, blocked: null }

/**
 * Read the current session and the profile behind it.
 *
 * The profile query is not a formality on top of the token. It is where
 * suspension is enforced: a suspended account still holds a perfectly valid
 * JWT — revoking one is not something Supabase does mid-flight — so the check
 * that keeps a barred person out has to happen against a row, on every load.
 */
export async function loadSession(): Promise<SessionState> {
  if (!supabase) return EMPTY

  const { data: auth } = await supabase.auth.getSession()
  const id = auth.session?.user?.id
  if (!id) return EMPTY

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  // No row is not an error worth surfacing: the sign-up trigger runs a moment
  // after the auth user is created, so the very first load of a brand-new
  // account can legitimately arrive early.
  if (error || !data) return EMPTY

  const row = data as ProfileRow
  if (row.removed) return { user: null, blocked: 'removed' }
  if (row.suspended) return { user: null, blocked: 'suspended' }
  return { user: profileToUser(row), blocked: null }
}

/**
 * The session, waiting briefly for the profile to catch up.
 *
 * `on_auth_user_created` fires after the auth user is inserted, so for a few
 * hundred milliseconds after a first-ever sign-in there is a valid session and
 * no profile to go with it. Reading once and giving up would send a brand-new
 * pilgrim back to the login screen they just completed — the worst possible
 * moment to look broken. Retrying a handful of times costs nothing to everyone
 * else, because they hit on the first attempt.
 */
export async function loadSessionSettled(attempts = 6, gapMs = 250): Promise<SessionState> {
  if (!supabase) return EMPTY
  for (let i = 0; i < attempts; i++) {
    const state = await loadSession()
    if (state.user || state.blocked) return state
    // No point waiting for a profile if there is no session behind it.
    const { data } = await supabase!.auth.getSession()
    if (!data.session) return EMPTY
    await new Promise((r) => setTimeout(r, gapMs))
  }
  return EMPTY
}

/**
 * Save the parts of a profile a person owns.
 *
 * `role`, `suspended`, `removed` and `provider_id` are absent from this list on
 * purpose, and the database would revert them anyway — see
 * `guard_profile_privileges` in the RLS migration. Two layers saying the same
 * thing is not redundancy here: the trigger is what makes it true, and this
 * list is what makes it obvious.
 */
export async function saveProfile(patch: Partial<User>): Promise<User | null> {
  if (!supabase) return null
  const { data: auth } = await supabase.auth.getSession()
  const id = auth.session?.user?.id
  if (!id) return null

  // Typed against the row rather than a loose record, so a column renamed in a
  // migration fails here at compile time instead of silently updating nothing.
  const update: Partial<Pick<ProfileRow, 'name' | 'phone' | 'wilayah_id' | 'avatar_color'>> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.phone !== undefined) update.phone = patch.phone
  if (patch.wilayahId !== undefined) update.wilayah_id = patch.wilayahId
  if (patch.avatarColor !== undefined) update.avatar_color = patch.avatarColor
  if (!Object.keys(update).length) return null

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  return error || !data ? null : profileToUser(data as ProfileRow)
}

/** End the session everywhere this browser holds it. */
export async function signOutRemote(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}

/**
 * Subscribe to sign-in and sign-out happening elsewhere — another tab, a token
 * that could not be refreshed, an administrator revoking access.
 */
export function onAuthChange(handler: () => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange(() => handler())
  return () => data.subscription.unsubscribe()
}
