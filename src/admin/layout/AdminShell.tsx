import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Building2,
  Globe,
  LayoutGrid,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  ShieldCheck,
  Ticket,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { cx } from '@/components/ui'
import { endAdminSession } from '@/admin/session'

/**
 * The administration frame.
 *
 * The public site and this dashboard are two different jobs, so they get two
 * different shapes. A pilgrim moves through the site — home, listing, trip,
 * booking — and a horizontal bar suits a journey. An admin does not travel;
 * they sit in one place and switch between six views of the same platform,
 * several times a minute. A sidebar keeps every destination on screen at once
 * and keeps the one they are in visible while they work, which a row of tabs
 * that scrolls sideways on a laptop cannot.
 */

export interface AdminSection {
  to: string
  key: MessageKey
  icon: typeof LayoutGrid
  /** Which group of the sidebar this belongs under. */
  group: 'platform' | 'people' | 'catalogue'
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { to: '/overview', key: 'admin.overview', icon: LayoutGrid, group: 'platform' },
  { to: '/users', key: 'admin.users', icon: UserCog, group: 'people' },
  { to: '/owners', key: 'admin.providers', icon: Building2, group: 'people' },
  { to: '/campaigns', key: 'admin.campaigns', icon: Ticket, group: 'catalogue' },
  { to: '/bookings', key: 'admin.bookings', icon: Users, group: 'catalogue' },
  { to: '/reviews', key: 'admin.reviews', icon: MessageSquare, group: 'catalogue' },
]

const GROUP_LABEL: Record<AdminSection['group'], MessageKey> = {
  platform: 'admin.groupPlatform',
  people: 'admin.groupPeople',
  catalogue: 'admin.groupCatalogue',
}

const GROUP_ORDER: AdminSection['group'][] = ['platform', 'people', 'catalogue']

export function AdminShell({
  badges,
  children,
}: {
  /** Counts that put a marker on a section, so waiting work is visible from any of them. */
  badges: Partial<Record<string, number>>
  children: React.ReactNode
}) {
  const { t, n, lang, toggleLang } = useI18n()
  const { user, dispatch } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // A destination chosen on a phone should close the drawer that offered it.
  useEffect(() => setDrawerOpen(false), [location.pathname])

  // Escape closes the drawer — the same reflex that closes any overlay.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const current = ADMIN_SECTIONS.find((s) => location.pathname.startsWith(s.to))

  const signOut = async () => {
    await endAdminSession()
    dispatch({ type: 'signOut' })
    navigate('/', { replace: true })
  }

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={t('admin.navLabel')}>
      {GROUP_ORDER.map((group) => (
        <div key={group} className="mb-5 last:mb-0">
          <p className="px-3 pb-2 text-2xs font-bold uppercase tracking-[0.14em] text-ivory-50/40">
            {t(GROUP_LABEL[group])}
          </p>
          <ul className="space-y-0.5">
            {ADMIN_SECTIONS.filter((s) => s.group === group).map((section) => {
              const badge = badges[section.to] ?? 0
              return (
                <li key={section.to}>
                  <NavLink
                    to={section.to}
                    className={({ isActive }) =>
                      cx(
                        'group relative flex items-center gap-3 rounded-[3px] px-3 py-2.5 text-sm font-semibold transition-colors',
                        isActive
                          ? 'bg-ivory-50/12 text-ivory-50'
                          : 'text-ivory-50/60 hover:bg-ivory-50/6 hover:text-ivory-50/90',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* The active marker sits on the inline-start edge, so it
                            lands on the correct side in both directions. */}
                        <span
                          aria-hidden
                          className={cx(
                            'absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-gold-400 transition-opacity',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <section.icon className="size-4 shrink-0" strokeWidth={2} />
                        <span className="flex-1 truncate">{t(section.key)}</span>
                        {badge > 0 && (
                          <span className="nums rounded-full bg-gold-500 px-1.5 py-0.5 text-2xs font-bold text-nasek-900">
                            {n(badge)}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )

  const identity = (
    <div className="border-t border-ivory-50/10 p-3">
      {user && (
        <div className="mb-2 flex items-center gap-2.5 rounded-[3px] px-2 py-2">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-[2px] text-xs font-bold text-ivory-50"
            style={{ background: user.avatarColor }}
            aria-hidden
          >
            {user.name.trim().charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-ivory-50">{user.name}</p>
            <p className="truncate text-2xs text-ivory-50/45" dir="ltr">
              {user.email}
            </p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={signOut}
        className="flex w-full items-center gap-2.5 rounded-[3px] px-3 py-2.5 text-start text-sm font-semibold text-ivory-50/60 transition-colors hover:bg-ivory-50/8 hover:text-ivory-50"
      >
        <LogOut className="size-4" />
        {t('nav.signOut')}
      </button>
    </div>
  )

  const brand = (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-ivory-50/10 px-5">
      <span className="flex size-9 items-center justify-center rounded-[3px] bg-gold-500 text-nasek-900">
        <ShieldCheck className="size-[18px]" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-base font-bold leading-tight text-ivory-50">
          {t('common.appName')}
        </p>
        <p className="truncate text-2xs font-semibold uppercase tracking-[0.12em] text-gold-400">
          {t('admin.badge')}
        </p>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh bg-ivory-100">
      {/* ------------------------------------------------- desktop sidebar */}
      <aside className="on-dark sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-nasek-900 lg:flex">
        {brand}
        {nav}
        {identity}
      </aside>

      {/* --------------------------------------------------- mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-100 lg:hidden">
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]"
          />
          <div className="on-dark animate-rise absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-nasek-900 shadow-lift">
            <div className="relative">
              {brand}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t('common.close')}
                className="absolute top-1/2 end-3 -translate-y-1/2 rounded-[3px] p-2 text-ivory-50/60 transition-colors hover:bg-ivory-50/10 hover:text-ivory-50"
              >
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {identity}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-ivory-300 bg-ivory-100/95 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('admin.navLabel')}
            aria-expanded={drawerOpen}
            className="rounded-[3px] p-2 text-ink-600 transition-colors hover:bg-ivory-200 lg:hidden"
          >
            <PanelLeftClose className="size-5 rtl:rotate-180" />
          </button>

          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-ink-900 sm:text-xl">
            {current ? t(current.key) : t('admin.title')}
          </h1>

          <button
            type="button"
            onClick={toggleLang}
            className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-2 text-sm font-semibold text-ink-600 transition-colors hover:bg-ivory-200 hover:text-ink-900"
            aria-label={t('common.language')}
          >
            <Globe className="size-4" strokeWidth={2} />
            <span className="hidden sm:inline">{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
