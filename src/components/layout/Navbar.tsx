import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Bookmark,
  ChevronDown,
  Globe,
  LayoutGrid,
  LogOut,
  Menu,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { Badge, Button, cx } from '@/components/ui'
import { Logo } from '@/components/brand/Logo'

const LINKS: { to: string; key: MessageKey }[] = [
  { to: '/campaigns', key: 'nav.campaigns' },
  { to: '/smart-match', key: 'nav.smartMatch' },
  { to: '/map', key: 'nav.map' },
  { to: '/giving', key: 'nav.giving' },
  { to: '/about', key: 'nav.about' },
]

export function Navbar() {
  const { t, lang, toggleLang } = useI18n()
  const { user, savedIds, unreadCount, dispatch } = useStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMobileOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const dashboardPath =
    user?.role === 'provider' ? '/provider' : user?.role === 'admin' ? '/admin' : '/dashboard'

  return (
    <header
      className={cx(
        'sticky top-0 z-50 border-b transition-colors duration-300',
        scrolled
          ? 'border-gold-300/60 bg-ivory-100/95 backdrop-blur-md'
          : 'border-ivory-300 bg-ivory-100',
      )}
    >
      <nav
        className="mx-auto flex h-17 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8"
        aria-label={t('common.menu')}
      >
        <Link to="/" className="shrink-0 rounded-[3px]" aria-label={t('common.appName')}>
          <Logo size="sm" showWordmark />
        </Link>

        {/* -------------------------------------------------- desktop links */}
        <ul className="mx-auto hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  cx(
                    'relative rounded-[2px] px-3.5 py-2 text-[14px] font-semibold tracking-wide transition-colors',
                    isActive
                      ? 'text-nasek-800'
                      : 'text-ink-500 hover:bg-ivory-200/70 hover:text-ink-800',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {t(link.key)}
                    {isActive && (
                      <span className="absolute inset-x-3 -bottom-[9px] h-px bg-gold-500" />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ms-auto flex items-center gap-1 lg:ms-0">
          {/* ------------------------------------------------ language */}
          <button
            type="button"
            onClick={toggleLang}
            className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-2 text-[13px] font-semibold text-ink-600 transition-colors hover:bg-ivory-200 hover:text-ink-900"
            aria-label={t('common.language')}
          >
            <Globe className="size-4" strokeWidth={2} />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>

          {/* Saved and notifications live on the customer dashboard, so a
              provider or admin would only be bounced by the role guard. */}
          {user?.role === 'customer' && (
            <>
              <IconLink
                to="/dashboard?tab=saved"
                label={t('nav.saved')}
                count={savedIds.length}
                icon={<Bookmark className="size-[18px]" strokeWidth={2} />}
                className="hidden sm:inline-flex"
              />
              <IconLink
                to="/dashboard?tab=notifications"
                label={t('nav.notifications')}
                count={unreadCount}
                tone="gold"
                icon={<Bell className="size-[18px]" strokeWidth={2} />}
                className="hidden sm:inline-flex"
              />
            </>
          )}

          {/* ------------------------------------------------ account */}
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-[3px] border border-ivory-400 bg-ivory-50 ps-1.5 pe-2.5 py-1.5 transition-colors hover:border-nasek-600"
              >
                <span
                  className="flex size-7 items-center justify-center rounded-[2px] text-[12px] font-bold text-ivory-50"
                  style={{ background: user.avatarColor }}
                  aria-hidden
                >
                  {user.name.trim().charAt(0)}
                </span>
                <span className="hidden max-w-28 truncate text-[13px] font-semibold text-ink-700 sm:block">
                  {user.name.split(' ')[0]}
                </span>
                <ChevronDown className="size-3.5 text-ink-400" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute end-0 mt-2 w-60 overflow-hidden rounded-[3px] border border-gold-300 bg-ivory-50 shadow-lift animate-pop"
                >
                  <div className="border-b border-ivory-300 bg-ivory-100 px-4 py-3">
                    <p className="truncate text-sm font-bold text-ink-900">{user.name}</p>
                    <p className="truncate text-xs text-ink-400">{user.email}</p>
                  </div>
                  {/* Administration is part of the site for the one account
                      that has it, rather than a page reached only by typing
                      an address. The item renders inside the signed-in menu
                      and only for that role, so it stays invisible to
                      everyone else exactly as before. */}
                  {user.role === 'admin' ? (
                    <MenuItem to="/admin" icon={<ShieldCheck className="size-4" />} accent>
                      {t('nav.administration')}
                    </MenuItem>
                  ) : (
                    <MenuItem to={dashboardPath} icon={<LayoutGrid className="size-4" />}>
                      {t('nav.dashboard')}
                    </MenuItem>
                  )}
                  {user.role === 'customer' && (
                    <>
                      <MenuItem to="/dashboard?tab=bookings" icon={<UserIcon className="size-4" />}>
                        {t('nav.myBookings')}
                      </MenuItem>
                      <MenuItem to="/dashboard?tab=saved" icon={<Bookmark className="size-4" />}>
                        {t('nav.saved')}
                      </MenuItem>
                    </>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      dispatch({ type: 'signOut' })
                      navigate('/')
                    }}
                    className="flex w-full items-center gap-2.5 border-t border-ivory-300 px-4 py-2.5 text-start text-sm font-medium text-ink-600 transition-colors hover:bg-ivory-100 hover:text-ink-900"
                  >
                    <LogOut className="size-4" />
                    {t('nav.signOut')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/signin')}
              >
                {t('nav.signIn')}
              </Button>
              <Button size="sm" onClick={() => navigate('/signup')}>
                {t('nav.signUp')}
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-[3px] p-2 text-ink-600 transition-colors hover:bg-ivory-200 lg:hidden"
            aria-expanded={mobileOpen}
            aria-label={t('common.menu')}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {/* --------------------------------------------------- mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-ivory-300 bg-ivory-100 lg:hidden animate-rise">
          <ul className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    cx(
                      'block rounded-[3px] px-3 py-3 text-[15px] font-semibold transition-colors',
                      isActive ? 'bg-nasek-50 text-nasek-900' : 'text-ink-600 hover:bg-ivory-200',
                    )
                  }
                >
                  {t(link.key)}
                </NavLink>
              </li>
            ))}
            {/* Saved and notifications are icon-only on desktop and hidden
                outright on a narrow screen — on a phone this drawer is the
                only way to reach them. */}
            {user && (
              <>
                <li className="mt-2 border-t border-ivory-300 pt-2">
                  <MobileLink to={dashboardPath}>
                    {t(user.role === 'admin' ? 'nav.administration' : 'nav.dashboard')}
                  </MobileLink>
                </li>
                {user.role === 'customer' && (
                  <>
                    <li>
                      <MobileLink to="/dashboard?tab=bookings">{t('nav.myBookings')}</MobileLink>
                    </li>
                    <li>
                      <MobileLink to="/dashboard?tab=saved" count={savedIds.length}>
                        {t('nav.saved')}
                      </MobileLink>
                    </li>
                    <li>
                      <MobileLink to="/dashboard?tab=notifications" count={unreadCount}>
                        {t('nav.notifications')}
                      </MobileLink>
                    </li>
                  </>
                )}
              </>
            )}
            {!user && (
              <li className="mt-2 flex gap-2 border-t border-ivory-300 pt-3">
                <Button variant="secondary" block onClick={() => navigate('/signin')}>
                  {t('nav.signIn')}
                </Button>
                <Button block onClick={() => navigate('/signup')}>
                  {t('nav.signUp')}
                </Button>
              </li>
            )}
          </ul>
        </div>
      )}
    </header>
  )
}

function MobileLink({
  to,
  count,
  children,
}: {
  to: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-[3px] px-3 py-3 text-[15px] font-semibold text-ink-600 transition-colors hover:bg-ivory-200"
    >
      {children}
      {count != null && count > 0 && (
        <Badge tone="green" className="ms-auto">
          <span className="nums">{count}</span>
        </Badge>
      )}
    </Link>
  )
}

function IconLink({
  to,
  label,
  icon,
  count,
  tone = 'green',
  className,
}: {
  to: string
  label: string
  icon: React.ReactNode
  count: number
  tone?: 'green' | 'gold'
  className?: string
}) {
  return (
    <Link
      to={to}
      aria-label={`${label}${count ? ` (${count})` : ''}`}
      className={cx(
        'relative rounded-[3px] p-2 text-ink-600 transition-colors hover:bg-ivory-200 hover:text-ink-900',
        className,
      )}
    >
      {icon}
      {count > 0 && (
        <Badge
          tone={tone === 'gold' ? 'gold' : 'solid'}
          className="absolute -end-0.5 -top-0.5 min-w-4 justify-center px-1 py-0.5 text-[10px]"
        >
          <span className="nums">{count}</span>
        </Badge>
      )}
    </Link>
  )
}

function MenuItem({
  to,
  icon,
  accent,
  children,
}: {
  to: string
  icon: React.ReactNode
  /** Marks the one item that runs the platform rather than a personal page. */
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      className={cx(
        'flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors',
        accent
          ? 'bg-nasek-50/60 font-bold text-nasek-900 hover:bg-nasek-100'
          : 'text-ink-600 hover:bg-ivory-100 hover:text-ink-900',
      )}
    >
      {icon}
      {children}
    </Link>
  )
}
