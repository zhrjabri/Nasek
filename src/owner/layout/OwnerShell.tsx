import { Building2, Globe, LogOut } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useStore } from '@/store/AppStore'
import { signOutRemote } from '@/services/auth/session'
import { Logo } from '@/components/brand/Logo'
import { Card, cx } from '@/components/ui'

/**
 * The chrome of the Campaign Owner Portal.
 *
 * A header of its own rather than the public site's `Navbar`, and that is the
 * point rather than duplication. The public bar carries Campaigns, Smart Match,
 * the map, NASEK Giving, a saved-trips counter and a sign-in button — none of
 * which mean anything to somebody managing seat inventory, and all of which
 * would put the pilgrims' site one click away from the portal's own navigation.
 *
 * What is deliberately absent: any link back into the customer site's
 * authenticated area, and any mention of administration. The three applications
 * share a database and a design system; they share no navigation at all.
 */
export function OwnerShell({ children }: { children: React.ReactNode }) {
  const { t, lang, toggleLang } = useI18n()
  const { user, dispatch } = useStore()

  return (
    <div className="flex min-h-dvh flex-col bg-ivory-100">
      <a
        href="#owner-main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-100 focus:rounded-[3px] focus:bg-nasek-900 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-ivory-50"
      >
        {t('common.skipToContent')}
      </a>

      <header className="sticky top-0 z-50 border-b border-gold-500/30 bg-nasek-950">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Logo tone="ivory" />
          {/* Named on every screen. An owner who has three NASEK tabs open
              should be able to tell which one this is without reading the
              content. */}
          <span className="hidden items-center gap-1.5 rounded-[2px] border border-gold-400/40 px-2.5 py-1 text-2xs font-bold uppercase tracking-[0.14em] text-gold-300/90 sm:inline-flex">
            <Building2 className="size-3.5" />
            {t('owner.portal')}
          </span>

          <div className="ms-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleLang}
              className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-bold text-ivory-200/70 transition-colors hover:bg-ivory-50/10 hover:text-ivory-50"
            >
              <Globe className="size-3.5" />
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>

            {user && (
              <button
                type="button"
                onClick={async () => {
                  await signOutRemote()
                  dispatch({ type: 'signOut' })
                }}
                className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-bold text-ivory-200/70 transition-colors hover:bg-ivory-50/10 hover:text-ivory-50"
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">{t('owner.signOut')}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div id="owner-main" className="flex-1">
        {children}
      </div>

      <footer className="border-t border-ivory-300 bg-ivory-50 py-6">
        <p className="mx-auto max-w-7xl px-4 text-2xs text-ink-400 sm:px-6 lg:px-8">
          {t('common.appName')} · {t('owner.portal')}
        </p>
      </footer>
    </div>
  )
}

/**
 * The portal's signed-out screens: sign in, reset, set a password.
 *
 * Deliberately not the public site's `AuthShell`. That one lives in
 * `src/pages/AuthPages.tsx`, and importing it here would drag the pilgrims'
 * sign-in screen — and the rest of that module's graph — into this bundle, for
 * a card and a heading.
 */
export function OwnerAuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const { t, lang, toggleLang } = useI18n()

  return (
    <div className={cx('flex min-h-dvh flex-col bg-ivory-100')}>
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={toggleLang}
          className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-bold text-ink-500 transition-colors hover:bg-ivory-200 hover:text-ink-900"
        >
          <Globe className="size-3.5" />
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
      </div>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <div className="mb-8 text-center">
          <Logo size="lg" />
          <p className="mt-5 inline-flex items-center gap-2 rounded-[3px] border border-nasek-200 bg-nasek-50/60 px-3 py-1.5 text-2xs font-bold uppercase tracking-[0.14em] text-nasek-800">
            <Building2 className="size-3.5" />
            {t('owner.portal')}
          </p>
          <h1 className="display mt-5 text-3xl text-ink-900 sm:text-4xl">{title}</h1>
          <p className="mt-2.5 text-md text-ink-500">{subtitle}</p>
        </div>

        <Card className="p-6 sm:p-7">{children}</Card>

        {footer && <div className="mt-6 text-center text-sm text-ink-500">{footer}</div>}
      </main>
    </div>
  )
}
