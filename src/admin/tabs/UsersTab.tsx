import { useMemo, useState } from 'react'
import { BadgeCheck, Ban, Building2, RotateCcw, Trash2, UserCog, Users } from 'lucide-react'
import type { Role } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { wilayahName } from '@/data/geo'

import { type DirectoryUser } from '@/data/users'
import { setProfileModeration } from '@/services/data/catalogue'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { useStore } from '@/store/AppStore'
import { Badge, Button, EmptyState, Modal } from '@/components/ui'
import { BodyRow, DetailRow, HeadRow, IconAction, Kpi, TableShell, Th, Toolbar, useCountLabel } from './shared'

type Filter = 'all' | Role | 'suspended' | 'removed'

/**
 * What to call an account, for all three roles rather than two.
 *
 * This was written inline as `role === 'provider' ? Owner : Customer`, in the
 * table and again in the detail dialog, and `Role` has three members. An
 * administrator's own row — and every colleague's, since `profiles_read_self`
 * hands an administrator the whole directory — was therefore labelled
 * "Customer" on the one screen whose job is to say who somebody is. The role
 * filter above never agreed with it either: "Customers" excluded those rows,
 * because that test is on the role and this one was not.
 */
const ROLE_LABEL: Record<Role, MessageKey> = {
  customer: 'admin.roleCustomer',
  provider: 'admin.roleOwner',
  admin: 'admin.roleAdmin',
}

const roleTone = (role: Role): 'gold' | 'green' | 'neutral' =>
  role === 'provider' ? 'gold' : role === 'admin' ? 'green' : 'neutral'

/**
 * Account management.
 *
 * Suspending is the everyday action and is reversible; removing hides the
 * account and is also reversible, because customers are reconstructed from
 * booking history and erasing a person outright would erase the bookings the
 * revenue figures are built from.
 */
export function UsersTab({ directory }: { directory: DirectoryUser[] }) {
  const { t, lang, money, n, date } = useI18n()
  const { dispatch, toast, suspendedUserIds, removedUserIds } = useStore()
  const { reload } = useSnapshotLoader()
  const countLabel = useCountLabel()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [account, setAccount] = useState<DirectoryUser | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const localSuspended = useMemo(() => new Set(suspendedUserIds), [suspendedUserIds])
  const localRemoved = useMemo(() => new Set(removedUserIds), [removedUserIds])

  /*
   * The row's own column wins wherever there is one.
   *
   * `suspendedUserIds` records decisions taken in *this* browser and nothing
   * else, so reading status out of it meant an account barred by a colleague —
   * or by this same administrator last week — was drawn as active, and the
   * "suspend" button offered again on someone already suspended.
   */
  const suspended = { has: (id: string) => localSuspended.has(id) }
  const removed = { has: (id: string) => localRemoved.has(id) }
  const isSuspendedRow = (u: DirectoryUser) => u.suspended ?? suspended.has(u.id)
  const isRemovedRow = (u: DirectoryUser) => u.removed ?? removed.has(u.id)

  /**
   * Write the decision, then reflect it — and say so when the write is refused.
   *
   * Every one of these was `void setProfileModeration(...)`: the promise was
   * dropped, the toast fired regardless, and the store recorded a change the
   * database may well have rejected. For campaign owners it *always* rejected
   * it, because the id being sent was one this dashboard had invented.
   */
  const moderate = async (
    u: DirectoryUser,
    patch: { suspended?: boolean; removed?: boolean },
    done: () => void,
  ) => {
    if (!u.isAccount) {
      toast(t('admin.userNotAnAccount'), 'warning')
      return
    }
    setBusy(u.id)
    const ok = await setProfileModeration(u.id, patch)
    setBusy(null)
    /*
     * With no backend there is nothing that could have refused, so the store is
     * the decision.
     *
     * `setProfileModeration` returns `false` when no client was ever
     * constructed — "the write did not happen", which is true and is what every
     * other caller wants to know. Read as a refusal it made this control report
     * failure and record nothing on a clone with no `.env`, which is a
     * supported way to run NASEK and the way its own approval queue is
     * demonstrated. `setProviderVerification` and `setCampaignStatus` already
     * take this branch explicitly, and this is the same argument.
     */
    if (isSupabaseConfigured && !ok) {
      toast(t('admin.userModerationFailed'), 'warning')
      return
    }
    done()
    await reload()
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return directory.filter((u) => {
      // "Removed" is its own view, so removed accounts stay out of every
      // other one — otherwise a decision the admin already made keeps
      // reappearing in the list they work from.
      const isRemoved = isRemovedRow(u)
      if (filter === 'removed') {
        if (!isRemoved) return false
      } else if (isRemoved) {
        return false
      } else if (filter === 'suspended') {
        if (!isSuspendedRow(u)) return false
      } else if (filter !== 'all' && u.role !== filter) {
        return false
      }

      if (!needle) return true
      return (
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        u.phone.includes(needle)
      )
    })
  }, [directory, filter, query, suspended, removed])

  const counts = useMemo(
    () => ({
      total: directory.filter((u) => !isRemovedRow(u)).length,
      customers: directory.filter((u) => u.role === 'customer' && !isRemovedRow(u)).length,
      owners: directory.filter((u) => u.role === 'provider' && !isRemovedRow(u)).length,
      suspended: directory.filter((u) => isSuspendedRow(u) && !isRemovedRow(u)).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [directory, localSuspended, localRemoved],
  )

  return (
    <section className="space-y-5">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('admin.usersTotal')} value={n(counts.total)} icon={<Users className="size-4" />} />
        <Kpi label={t('admin.usersCustomers')} value={n(counts.customers)} icon={<Users className="size-4" />} />
        <Kpi label={t('admin.usersOwners')} value={n(counts.owners)} icon={<Building2 className="size-4" />} />
        <Kpi
          label={t('admin.usersSuspended')}
          value={n(counts.suspended)}
          icon={<Ban className="size-4" />}
          tone={counts.suspended > 0 ? 'alert' : undefined}
        />
      </ul>

      <Toolbar<Filter>
        query={query}
        onQuery={setQuery}
        placeholder={t('admin.userSearch')}
        filter={filter}
        onFilter={setFilter}
        filterLabel={t('admin.userFilter')}
        count={countLabel(visible.length, counts.total)}
        options={[
          { value: 'all', label: t('admin.userAll') },
          { value: 'customer', label: t('admin.roleCustomer') },
          { value: 'provider', label: t('admin.roleOwner') },
          { value: 'suspended', label: t('admin.userSuspended') },
          { value: 'removed', label: t('admin.userRemoved') },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<UserCog className="size-5" />}
          title={directory.length === 0 ? t('admin.noAccounts') : t('admin.noUsers')}
          body={directory.length === 0 ? t('admin.noAccountsBody') : t('admin.noUsersBody')}
        />
      ) : (
        <TableShell>
          <table className="w-full min-w-4xl text-sm">
            <thead>
              <HeadRow>
                <Th>{t('admin.userAccount')}</Th>
                <Th>{t('admin.userRole')}</Th>
                <Th>{t('common.wilayah')}</Th>
                <Th>{t('admin.userJoined')}</Th>
                <Th>{t('admin.kpiBookings')}</Th>
                <Th>{t('admin.userSpend')}</Th>
                <Th>{t('common.status')}</Th>
                <Th end>{t('admin.userActions')}</Th>
              </HeadRow>
            </thead>
            <tbody>
              {visible.map((u) => {
                const isSuspended = isSuspendedRow(u)
                const isRemoved = isRemovedRow(u)
                return (
                  <BodyRow key={u.id} dim={isRemoved}>
                    <td className="p-3.5">
                      <button
                        type="button"
                        onClick={() => setAccount(u)}
                        className="flex items-center gap-2.5 text-start"
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-[3px] text-xs font-bold text-white"
                          style={{ background: u.avatarColor }}
                          aria-hidden
                        >
                          {u.name.trim().charAt(0)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink-800 hover:text-nasek-800">
                            {u.name}
                          </span>
                          <span className="block truncate text-2xs text-ink-400" dir="ltr">
                            {u.email}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="p-3.5">
                      <Badge tone={roleTone(u.role)}>{t(ROLE_LABEL[u.role])}</Badge>
                    </td>
                    <td className="p-3.5 text-ink-600">{wilayahName(u.wilayahId, lang)}</td>
                    <td className="p-3.5 text-ink-500">{date(u.joinedAt)}</td>
                    <td className="nums p-3.5 text-ink-600">{n(u.bookings)}</td>
                    <td className="nums p-3.5 font-semibold text-ink-800">{money(u.spend)}</td>
                    <td className="p-3.5">
                      <Badge tone={isRemoved ? 'red' : isSuspended ? 'amber' : 'green'}>
                        {t(
                          isRemoved
                            ? 'admin.userRemoved'
                            : isSuspended
                              ? 'admin.userSuspended'
                              : 'admin.userActive',
                        )}
                      </Badge>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {!u.isAccount ? (
                          /* A company with no readable owner account. There is
                             nothing here to suspend, and offering the button
                             anyway is what made this screen report success on an
                             action that reached no row. */
                          <span className="text-2xs text-ink-400">
                            {t('admin.userNotAnAccount')}
                          </span>
                        ) : isRemoved ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === u.id}
                            onClick={() =>
                              void moderate(u, { removed: false }, () => {
                                dispatch({ type: 'restoreUser', userId: u.id })
                                toast(t('admin.userRestoredToast', { name: u.name }))
                              })
                            }
                          >
                            <RotateCcw className="size-3.5" />
                            {t('admin.userRestore')}
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={busy === u.id}
                              onClick={() =>
                                void moderate(u, { suspended: !isSuspended }, () => {
                                  dispatch({
                                    type: 'setUserSuspended',
                                    userId: u.id,
                                    suspended: !isSuspended,
                                  })
                                  toast(
                                    isSuspended
                                      ? t('admin.userReactivatedToast', { name: u.name })
                                      : t('admin.userSuspendedToast', { name: u.name }),
                                    isSuspended ? 'success' : 'warning',
                                  )
                                })
                              }
                            >
                              {isSuspended ? (
                                <BadgeCheck className="size-3.5" />
                              ) : (
                                <Ban className="size-3.5" />
                              )}
                              {t(isSuspended ? 'admin.userReactivate' : 'admin.userSuspend')}
                            </Button>
                            <IconAction
                              icon={<Trash2 className="size-3.5" />}
                              label={t('admin.userRemove')}
                              danger
                              onClick={() =>
                                /* Recorded as a flag, never a DELETE: the
                                   bookings and revenue history are
                                   reconstructed from these rows. */
                                void moderate(u, { removed: true }, () => {
                                  dispatch({ type: 'removeUser', userId: u.id })
                                  toast(t('admin.userRemovedToast', { name: u.name }), 'warning')
                                })
                              }
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </BodyRow>
                )
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      <p className="text-2xs leading-relaxed text-ink-400">{t('admin.userNote')}</p>

      <Modal
        open={!!account}
        onClose={() => setAccount(null)}
        title={account?.name ?? t('admin.userAccount')}
      >
        {account && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-[3px] text-lg font-bold text-white"
                style={{ background: account.avatarColor }}
                aria-hidden
              >
                {account.name.trim().charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-md font-bold text-ink-900">{account.name}</p>
                <Badge tone={roleTone(account.role)}>{t(ROLE_LABEL[account.role])}</Badge>
              </div>
            </div>

            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <DetailRow label={t('common.email')} value={account.email} ltr />
              <DetailRow label={t('common.phone')} value={account.phone} ltr />
              <DetailRow label={t('common.wilayah')} value={wilayahName(account.wilayahId, lang)} />
              <DetailRow label={t('admin.userJoined')} value={date(account.joinedAt)} />
              <DetailRow label={t('admin.kpiBookings')} value={n(account.bookings)} />
              <DetailRow label={t('admin.userSpend')} value={money(account.spend)} />
            </dl>

            {account.providerId && (
              <p className="rounded-[3px] border border-nasek-200 bg-nasek-50/60 p-3.5 text-xs leading-relaxed text-ink-600">
                {t('admin.userOwnerNote')}
              </p>
            )}
          </div>
        )}
      </Modal>
    </section>
  )
}
