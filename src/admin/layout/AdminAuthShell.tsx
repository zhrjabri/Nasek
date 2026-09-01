import { ShieldCheck } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Card } from '@/components/ui'

/**
 * The frame around the administration sign-in screen.
 *
 * Deliberately its own component rather than the public site's `AuthShell`.
 * The two look similar and could have shared one, but sharing would mean the
 * administration bundle importing a module out of `src/pages/`, and the
 * boundary between the two applications is worth more than the handful of
 * lines it saves — `npm run verify:isolation` checks that no such import
 * exists, and an exception "just for the shell" is how that check starts
 * failing for good reasons until someone deletes it.
 *
 * It also says something different. The public shell reassures; this one is
 * plainly a staff entrance, on the dark ground the dashboard's sidebar uses, so
 * anyone who arrives here by accident can see at once that they have.
 */
export function AdminAuthShell({
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
  const { t } = useI18n()

  return (
    <main className="on-dark relative flex min-h-dvh flex-col items-center justify-center bg-nasek-950 px-4 py-12">
      {/* The girih lattice, at the same restraint the rest of the system uses. */}
      <div className="girih pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-[3px] bg-gold-500 text-nasek-950">
            <ShieldCheck className="size-7" strokeWidth={2.2} />
          </span>
          <p className="mt-5 text-2xs font-bold uppercase tracking-[0.2em] text-gold-400">
            {t('common.appName')}
          </p>
          <h1 className="display mt-2 text-4xl leading-tight text-ivory-50 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-2.5 text-base leading-relaxed text-ivory-50/55">{subtitle}</p>
        </div>

        <Card className="p-6 sm:p-7">{children}</Card>

        {footer && (
          <div className="mt-6 text-center text-xs leading-relaxed text-ivory-50/45">
            {footer}
          </div>
        )}
      </div>
    </main>
  )
}
