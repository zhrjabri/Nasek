import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { availableOAuthProviders, startOAuth } from '@/services/auth/oauth'
import { Button, Spinner } from '@/components/ui'

/**
 * Continue with Google.
 *
 * Renders nothing at all when the project has no Google provider configured,
 * which is the important part. An OAuth button for a provider that is not
 * enabled does not fail politely — the browser leaves NASEK, Supabase answers
 * "provider is not enabled", and the person comes back to an error page having
 * done nothing wrong. A missing button is a far better outcome than a broken
 * one, and the email code below it works either way.
 *
 * The check is a single unauthenticated request to the project's own settings
 * endpoint, cached for the page load. Enabling Google in the Supabase dashboard
 * therefore makes this appear with no rebuild and no flag in this repository to
 * fall out of step with the project.
 */
export function GoogleButton({ label }: { label?: string }) {
  const { t } = useI18n()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void availableOAuthProviders().then((providers) => {
      if (live) setAvailable(providers.includes('google'))
    })
    return () => {
      live = false
    }
  }, [])

  // `null` is "still asking". Reserving space for a button that may not appear
  // would leave a gap on every sign-in screen for the sake of one that mostly
  // will; the settings request resolves in well under the time it takes to
  // read the heading.
  if (available !== true) return null

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        block
        disabled={busy}
        onClick={async () => {
          setError(null)
          setBusy(true)
          const outcome = await startOAuth('google')
          // On success the browser is already navigating away, so this only
          // ever runs when nothing happened — and then the button has to come
          // back, or it sits spinning for ever on a page that is not leaving.
          if (!outcome.ok) {
            setBusy(false)
            setError(t('auth.googleFailed'))
          }
        }}
      >
        {busy ? <Spinner className="size-4" /> : <GoogleMark />}
        {label ?? t('auth.continueGoogle')}
      </Button>

      {error && (
        <p role="alert" className="text-center text-xs font-medium text-danger-fg">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-ivory-300" />
        <span className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-400">
          {t('auth.or')}
        </span>
        <span className="h-px flex-1 bg-ivory-300" />
      </div>
    </div>
  )
}

/**
 * Google's mark, inline.
 *
 * Inline rather than fetched from a CDN because NASEK's brand guidance is that
 * nothing on a sign-in screen should come from a third-party host — a blocked
 * request there produces a button with a missing image on the one page where
 * trust is being asked for.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
