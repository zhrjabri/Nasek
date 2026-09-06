import { Bell, BellOff, CheckCheck } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { markAllNotificationsRead, markNotificationRead } from '@/services/data/catalogue'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { Button, Card, EmptyState, cx } from '@/components/ui'

/**
 * What NASEK has told this owner.
 *
 * The reason this exists rather than relying on email: every decision in the
 * platform writes one of these rows inside the same transaction that takes the
 * decision — see `notify_user` in `20260904000100_email_outbox.sql` — while the
 * email goes into a queue that something outside the database has to drain.
 *
 * That makes the portal, not the inbox, the place a decision is authoritatively
 * communicated. A project with no mail provider configured is a supported
 * state, and in it this panel is the *only* place an approval or a refusal
 * arrives. It has to be good enough to be that.
 *
 * Reads the store rather than fetching: `useRemoteData` already loads
 * notifications into the snapshot every screen shares, and a second query here
 * would be a second answer to the same question.
 */
export function NotificationsPanel() {
  const { t, date } = useI18n()
  const { user, notifications, dispatch } = useStore()

  /*
   * This owner's rows, and this application's audience.
   *
   * The snapshot query already asks for `audience = 'owner'`, so the second
   * test is redundant against a configured backend and deliberately kept: with
   * no backend the store is filled from local state rather than from a query,
   * and "the portal shows only owner notifications" should be a property of the
   * portal rather than of one code path into it.
   */
  const mine = notifications.filter(
    (entry) => entry.audience === 'owner' && (!user || entry.userId === user.id),
  )
  const unread = mine.filter((entry) => !entry.read).length

  if (mine.length === 0) {
    return (
      <EmptyState
        icon={<BellOff className="size-5" />}
        title={t('owner.notificationsEmpty')}
        body={t('owner.notificationsEmptyBody')}
      />
    )
  }

  return (
    <section className="space-y-4">
      {unread > 0 && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              // Optimistic locally, written through where there is a database.
              // A read receipt that fails is not worth blocking the interface
              // on, and the next snapshot corrects it either way.
              dispatch({ type: 'readAllNotifications' })
              if (isSupabaseConfigured) await markAllNotificationsRead()
            }}
          >
            <CheckCheck className="size-3.5" />
            {t('owner.markAllRead')}
          </Button>
        </div>
      )}

      <ul className="space-y-2.5">
        {mine.map((entry) => (
          <li key={entry.id}>
            <Card
              className={cx(
                'flex items-start gap-3.5 p-4 transition-colors',
                entry.read ? 'opacity-70' : 'border-nasek-300/70 bg-nasek-50/30',
              )}
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[3px] bg-ivory-200 text-nasek-700">
                <Bell className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <NotificationText entry={entry} />
                <p className="mt-1.5 text-2xs text-ink-400">{date(entry.date)}</p>
              </div>
              {!entry.read && (
                <button
                  type="button"
                  onClick={async () => {
                    dispatch({ type: 'readNotification', id: entry.id })
                    if (isSupabaseConfigured) await markNotificationRead(entry.id)
                  }}
                  className="shrink-0 rounded-[3px] px-2 py-1 text-2xs font-bold text-nasek-700 transition-colors hover:bg-nasek-50"
                >
                  {t('owner.markRead')}
                </button>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Title and body, in the reader's language.
 *
 * The body is often empty — a refusal writes the administrator's reason into
 * it, and an approval has nothing to add beyond its own title — so it renders
 * conditionally rather than leaving a blank line where a sentence should be.
 */
function NotificationText({
  entry,
}: {
  entry: { title: { ar: string; en: string }; body: { ar: string; en: string } }
}) {
  const { bl } = useI18n()
  const body = bl(entry.body)
  return (
    <>
      <p className="text-sm font-bold text-ink-900">{bl(entry.title)}</p>
      {body && <p className="mt-1 text-sm leading-relaxed text-ink-600">{body}</p>}
    </>
  )
}
