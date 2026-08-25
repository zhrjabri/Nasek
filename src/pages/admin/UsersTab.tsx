import { useMemo, useState } from 'react'
import { BadgeCheck, Ban, Building2, RotateCcw, Trash2, UserCog, Users } from 'lucide-react'
import type { Provider, Role, User } from '@/types'
import { useI18n } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { SEED_BOOKINGS } from '@/data/seed'
import { buildDirectory, type DirectoryUser } from '@/data/users'
import { useStore } from '@/store/AppStore'
import { Badge, Button, EmptyState, Modal } from '@/components/ui'
import { BodyRow, DetailRow, HeadRow, IconAction, Kpi, TableShell, Th, Toolbar, useCountLabel } from './shared'

type Filter = 'all' | Role | 'suspended' | 'removed'

/**
 * Account management.
 *
 * Suspending is the everyday action and is reversible; removing hides the
 * account and is also reversible, because customers are reconstructed from
 * booking history and erasing a person outright would erase the bookings the
 * revenue figures are built from.
 */
export function UsersTab({
  providers,
  sessionUsers,
}: {
  providers: Provider[]
  sessionUsers: User[]
}) {
  const { t, lang, money, n, date } = useI18n()
  const { dispatch, toast, suspendedUserIds, removedUserIds } = useStore()
  const countLabel = useCountLabel()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [account, setAccount] = useState<DirectoryUser | null>(null)

  const suspended = useMemo(() => new Set(suspendedUserIds), [suspendedUserIds])
  const removed = useMemo(() => new Set(removedUserIds), [removedUserIds])

  const directory = useMemo(
    () => buildDirectory(providers, SEED_BOOKINGS, sessionUsers),
    [providers, sessionUsers],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return directory.filter((u) => {
      // "Removed" is its own view, so removed accounts stay out of every
      // other one — otherwise a decision the admin already made keeps
      // reappearing in the list they work from.
      const isRemoved = removed.has(u.id)
      if (filter === 'removed') {
        if (!isRemoved) return false
      } else if (isRemoved) {
        return false
      } else if (filter === 'suspended') {
        if (!suspended.has(u.id)) return false
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
      total: directory.filter((u) => !removed.has(u.id)).length,
      customers: directory.filter((u) => u.role === 'customer' && !removed.has(u.id)).length,
      owners: directory.filter((u) => u.role === 'provider' && !removed.has(u.id)).length,
      suspended: directory.filter((u) => suspended.has(u.id) && !removed.has(u.id)).length,
    }),
    [directory, suspended, removed],
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
          <table className="w-full min-w-4xl text-[13.5px]">
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
                const isSuspended = suspended.has(u.id)
                const isRemoved = removed.has(u.id)
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
                          <span className="block truncate text-[11.5px] text-ink-400" dir="ltr">
                            {u.email}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="p-3.5">
                      <Badge tone={u.role === 'provider' ? 'gold' : 'neutral'}>
                        {t(u.role === 'provider' ? 'admin.roleOwner' : 'admin.roleCustomer')}
                      </Badge>
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
                        {isRemoved ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              dispatch({ type: 'restoreUser', userId: u.id })
                              toast(t('admin.userRestoredToast', { name: u.name }))
                            }}
                          >
                            <RotateCcw className="size-3.5" />
                            {t('admin.userRestore')}
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
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
                              }}
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
                              onClick={() => {
                                dispatch({ type: 'removeUser', userId: u.id })
                                toast(t('admin.userRemovedToast', { name: u.name }), 'warning')
                              }}
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

      <p className="text-[11.5px] leading-relaxed text-ink-400">{t('admin.userNote')}</p>

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
                <p className="truncate text-[15px] font-bold text-ink-900">{account.name}</p>
                <Badge tone={account.role === 'provider' ? 'gold' : 'neutral'}>
                  {t(account.role === 'provider' ? 'admin.roleOwner' : 'admin.roleCustomer')}
                </Badge>
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
              <p className="rounded-[3px] border border-nasek-200 bg-nasek-50/60 p-3.5 text-[12.5px] leading-relaxed text-ink-600">
                {t('admin.userOwnerNote')}
              </p>
            )}
          </div>
        )}
      </Modal>
    </section>
  )
}
