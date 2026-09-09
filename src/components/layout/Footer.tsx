import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone, ShieldCheck } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { Logo } from '@/components/brand/Logo'

/*
 * The footer's link columns — customers only.
 *
 * There used to be a third, "For campaign owners", carrying the portal, its
 * registration and its sign-in. All three are gone from this bundle: the portal
 * is a separate application on a separate host, and a pilgrim reading this
 * footer should not learn that it exists. An owner reaches it at the address
 * NASEK gave them when their account was created.
 */
const COLUMNS: { title: MessageKey; links: { to: string; key: MessageKey }[] }[] = [
  {
    title: 'footer.explore',
    links: [
      { to: '/campaigns', key: 'nav.campaigns' },
      { to: '/smart-match', key: 'nav.smartMatch' },
      { to: '/map', key: 'nav.map' },
    ],
  },
  {
    title: 'footer.company',
    links: [
      { to: '/about', key: 'nav.about' },
      { to: '/giving', key: 'nav.giving' },
      { to: '/about#contact', key: 'footer.contact' },
    ],
  },
]

export function Footer() {
  const { t } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-24 border-t-2 border-gold-500/50 bg-nasek-950 text-ivory-200">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo tone="ivory" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ivory-200/60">
              {t('footer.about')}
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ivory-200/60">
              <li className="flex items-center gap-2.5">
                <MapPin className="size-4 shrink-0 text-gold-400/70" />
                <span>{t('footer.madeIn')} — Muscat, Oman</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-gold-400/70" />
                <a href="mailto:hello@nasek.om" className="hover:text-ivory-50">
                  hello@nasek.om
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-gold-400/70" />
                <span className="nums">+968 2400 0000</span>
              </li>
            </ul>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={t(col.title)}>
              {/* `h2`, not `h3`. These are the footer's own top-level sections,
                  and on a page whose only other heading is the `h1` — sign-in,
                  Smart Match — an `h3` here made the document jump two levels
                  with nothing in between, which is what a screen reader reads
                  out as a missing section. */}
              <h2 className="text-2xs font-bold uppercase tracking-[0.22em] text-gold-400/90">
                {t(col.title)}
              </h2>
              <span className="mt-2.5 block h-px w-8 bg-gold-500/50" aria-hidden />
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.to + link.key}>
                    <Link
                      to={link.to}
                      className="text-sm text-ivory-200/70 transition-colors hover:text-ivory-50"
                    >
                      {t(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* The honesty notice sits above the copyright, not buried under it. */}
        <div className="framed-dark mt-12 flex items-start gap-3 bg-ivory-50/5 p-5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold-400/80" />
          <p className="text-sm leading-relaxed text-ivory-200/60">{t('trust.disclaimer')}</p>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-gold-500/25 pt-6 text-xs text-ivory-200/45 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('footer.rights', { year })}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="rounded-[2px] border border-gold-400/30 px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.12em] text-gold-400/80">
              {t('footer.prototype')}
            </span>
            <Link to="/about#privacy" className="hover:text-ivory-50">
              {t('trust.privacy')}
            </Link>
            <Link to="/about#terms" className="hover:text-ivory-50">
              {t('trust.terms')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
