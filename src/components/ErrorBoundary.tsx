import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui'

/**
 * A wall around one part of a screen.
 *
 * React's rule is unforgiving and correct: an error thrown during render that
 * nothing catches unmounts the whole tree. There is no partial recovery,
 * because React cannot know which half of a half-built tree is still true. The
 * consequence in a browser is a white page — not an error page, not a stack, a
 * blank document — and NASEK has now shipped that twice from two unrelated
 * causes, once from a router hook called in an application with no router and
 * once from a form.
 *
 * The portals had no boundary anywhere, so every one of those was fatal to
 * everything. That is the thing being fixed here, and it is worth being exact
 * about what it is *not*:
 *
 *   * It does not make a crash acceptable. A boundary that swallows an error
 *     and shows a friendly shrug is worse than the white page, because the
 *     white page at least gets reported. So this prints the error and its
 *     component stack to the console, and shows the error's own message on the
 *     screen where the person who hit it can read it back to us.
 *   * It does not belong at the root. Wrapping the whole application in one
 *     boundary reproduces the failure it prevents, just with nicer wallpaper.
 *     These go around the pieces that can fail independently — a lazy screen,
 *     a modal — so the navigation, the sign-out button and the rest of the
 *     dashboard survive a broken form.
 *
 * `reset` re-mounts the children with fresh state. That genuinely fixes the
 * transient cases — a render that raced a snapshot, a chunk that failed to
 * arrive — and for the rest the owner is one reload away from where they were.
 */

interface Props {
  children: ReactNode
  /**
   * Why this boundary exists, for the console. Not shown to anybody: the
   * screen shows the error's own message, which is the useful half.
   */
  where: string
}

interface State {
  error: Error | null
}

class Boundary extends Component<Props & { fallback: (error: Error, reset: () => void) => ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Loudly, and with the component stack, because a boundary that reports
    // nothing turns a findable bug into a rumour.
    console.error(`[nasek] ${this.props.where} threw:`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, () => this.setState({ error: null }))
    }
    return this.props.children
  }
}

export function ErrorBoundary({ children, where }: Props) {
  const { t } = useI18n()

  return (
    <Boundary
      where={where}
      fallback={(error, reset) => (
        <div
          role="alert"
          className="rounded-[3px] border border-danger-border bg-danger-surface p-5 text-danger-fg"
        >
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t('error.title')}</p>
              <p className="mt-1 text-xs leading-relaxed">{t('error.body')}</p>
              {/*
                The error's own words, and `dir="ltr"` because they are English
                and a stack pasted into a right-to-left paragraph is unreadable.
              */}
              <p
                dir="ltr"
                className="mt-2.5 overflow-x-auto rounded-[3px] bg-ivory-50/70 px-2.5 py-2 text-start font-mono text-2xs text-ink-700"
              >
                {error.message || String(error)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={reset}>
                  <RotateCcw className="size-3.5" />
                  {t('error.retry')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  {t('error.reload')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </Boundary>
  )
}
