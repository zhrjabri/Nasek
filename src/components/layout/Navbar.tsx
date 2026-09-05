import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Bookmark,
  ChevronDown,
  Globe,
  LogOut,
  Menu,
  Ticket,
  User as UserIcon,
  X,
} from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { signOutRemote } from '@/services/auth/session'
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
  const [scrollY, setScrollY] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMobileOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // A route change scrolls to the top, which fires the listener above — but a
  // frame later. Reading the position directly on navigation stops the bar
  // rendering one frame of its scrolled self at the top of a new page.
  useEffect(() => setScrollY(window.scrollY), [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const scrolled = scrollY > 8

  /*
   * Over the home page's photograph, this bar has no ground of its own.
   *
   * The home page opens with a full-bleed image of the Haram that runs up
   * underneath here, and an opaque parchment strip across the top of it cut
   * the page in half before anybody had read a word. Transparent while it is
   * over the picture, parchment from the moment it is not.
   *
   * The threshold is 120px rather than the 8px that decides `scrolled`,
   * because these are different questions: `scrolled` asks "has this moved at
   * all", which is when the bar should gain its blur and its rule; this asks
   * "is there still photograph behind me", and a nudge of the wheel does not
   * change the answer.
   *
   * The mobile drawer is the one exception. It opens as a parchment panel
   * hanging off the bottom of this bar, and a transparent header above an
   * opaque drawer looks like a rendering fault.
   */
  const overHero = location.pathname === '/' && scrollY < 120 && !mobileOpen

  return (
    <header
      className={cx(
        'sticky top-0 z-50 border-b transition-colors duration-300',
        overHero
          ? 'on-dark border-transparent bg-transparent'
          : scrolled
            ? 'border-gold-300/60 bg-ivory-100/95 backdrop-blur-md'
            : 'border-ivory-300 bg-ivory-100',
      )}
    >
      <nav
        className="mx-auto flex h-17 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8"
        aria-label={t('common.menu')}
      >
        <Link to="/" className="shrink-0 rounded-[3px]" aria-label={t('common.appName')}>
          <Logo size="sm" showWordmark tone={overHero ? 'ivory' : 'green'} />
        </Link>

        {/* -------------------------------------------------- desktop links */}
        <ul className="mx-auto hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  cx(
                    'relative rounded-[2px] px-3.5 py-2 text-base font-semibold tracking-wide transition-colors',
                    overHero
                      ? isActive
                        ? 'text-ivory-50'
                        : 'text-ivory-100/80 hover:bg-ivory-50/12 hover:text-ivory-50'
                      : isActive
                        ? 'text-nasek-800'
                        : 'text-ink-500 hover:bg-ivory-200/70 hover:text-ink-800',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {t(link.key)}
                    {isActive && (
                      <span
                        className={cx(
                          'absolute inset-x-3 -bottom-[9px] h-px',
                          overHero ? 'bg-gold-300' : 'bg-gold-500',
                        )}
                      />
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
            className={cx(
              'flex items-center gap-1.5 rounded-[3px] px-2.5 py-2 text-sm font-semibold transition-colors',
              overHero
                ? 'text-ivory-100/85 hover:bg-ivory-50/12 hover:text-ivory-50'
                : 'text-ink-600 hover:bg-ivory-200 hover:text-ink-900',
            )}
            aria-label={t('common.language')}
          >
            <Globe className="size-4" strokeWidth={2} />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>

          {/* Saved and notifications live on the customer dashboard, which is
              the only dashboard this application has. The role branch that used
              to be here went with the three-application split: everyone signed
              in here is a customer while they are here. */}
          {user && (
            <>
              <IconLink
                to="/dashboard?tab=saved"
                label={t('nav.saved')}
                count={savedIds.length}
                icon={<Bookmark className="size-[18px]" strokeWidth={2} />}
                className={cx('hidden sm:inline-flex', overHero && 'text-ivory-100/85 hover:bg-ivory-50/12 hover:text-ivory-50')}
              />
              <IconLink
                to="/dashboard?tab=notifications"
                label={t('nav.notifications')}
                count={unreadCount}
                tone="gold"
                icon={<Bell className="size-[18px]" strokeWidth={2} />}
                className={cx('hidden sm:inline-flex', overHero && 'text-ivory-100/85 hover:bg-ivory-50/12 hover:text-ivory-50')}
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
                className={cx(
                  'flex items-center gap-2 rounded-[3px] border ps-1.5 pe-2.5 py-1.5 transition-colors',
                  overHero
                    ? 'border-ivory-50/30 bg-ivory-50/10 backdrop-blur-sm hover:border-gold-300'
                    : 'border-ivory-400 bg-ivory-50 hover:border-nasek-600',
                )}
              >
                <span
                  className="flex size-7 items-center justify-center rounded-[2px] text-xs font-bold text-ivory-50"
                  style={{ background: user.avatarColor }}
                  aria-hidden
                >
                  {user.name.trim().charAt(0)}
                </span>
                <span
                  className={cx(
                    'hidden max-w-28 truncate text-sm font-semibold sm:block',
                    overHero ? 'text-ivory-50' : 'text-ink-700',
                  )}
                >
                  {user.name.split(' ')[0]}
                </span>
                <ChevronDown className={cx('size-3.5', overHero ? 'text-ivory-100/70' : 'text-ink-400')} />
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
                  {/*
                    The account menu, in the order somebody actually uses it.

                    "My details" first because it is the one thing here that is
                    *about* them; bookings, saved trips and notifications after,
                    because those are things they came to look at. Every entry
                    points at a tab of the same page, so the menu is a shortcut
                    rather than a second navigation with its own idea of where
                    anything lives.

                    No role branch any more. This site has one kind of signed-in
                    person — a customer — and the two others have applications
                    of their own; a campaign owner who books a trip here is a
                    customer while they do it.
                  */}
                  <MenuItem to="/dashboard?tab=profile" icon={<UserIcon className="size-4" />}>
                    {t('account.title')}
                  </MenuItem>
                  <MenuItem to="/dashboard?tab=bookings" icon={<Ticket className="size-4" />}>
                    {t('nav.myBookings')}
                  </MenuItem>
                  <MenuItem to="/dashboard?tab=saved" icon={<Bookmark className="size-4" />}>
                    {t('nav.saved')}
                  </MenuItem>
                  <MenuItem to="/dashboard?tab=notifications" icon={<Bell className="size-4" />}>
                    {t('nav.notifications')}
                  </MenuItem>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      // Clear the server session first. Dispatching locally
                      // first would leave a window in which the interface says
                      // signed out while the token is still live, and a reload
                      // in that window would sign the person straight back in.
                      await signOutRemote()
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
              {/*
                One control, and it is the only authentication this site has.

                There is no "create account" beside it and no link to either of
                the other two NASEK applications. Signing in for the first time
                creates the account, so a second button would be a second name
                for the same operation; and a pilgrim has no business being
                shown a Campaign Owner Portal they cannot use — the portal is a
                separate application on a separate host, and this bundle does
                not know its address.

                Glass rather than gold over the photograph: gold is spent on the
                hero's own primary button eighty pixels below, and two of them in
                one eyeful is what turns an accent into a theme.
              */}
              <Button
                size="sm"
                className={
                  overHero
                    ? 'border-ivory-50/35 bg-ivory-50/12 text-ivory-50 backdrop-blur-sm hover:bg-ivory-50/22'
                    : undefined
                }
                onClick={() => navigate('/signin')}
              >
                {t('nav.signIn')}
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className={cx(
              'rounded-[3px] p-2 transition-colors lg:hidden',
              overHero
                ? 'text-ivory-50 hover:bg-ivory-50/12'
                : 'text-ink-600 hover:bg-ivory-200',
            )}
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
                      'block rounded-[3px] px-3 py-3 text-md font-semibold transition-colors',
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
                  <MobileLink to="/dashboard?tab=profile">{t('account.title')}</MobileLink>
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
              <li className="mt-2 border-t border-ivory-300 pt-3">
                <Button block onClick={() => navigate('/signin')}>
                  {t('nav.signIn')}
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
      className="flex items-center gap-2 rounded-[3px] px-3 py-3 text-md font-semibold text-ink-600 transition-colors hover:bg-ivory-200"
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
          className="absolute -end-0.5 -top-0.5 min-w-4 justify-center px-1 py-0.5 text-2xs"
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
