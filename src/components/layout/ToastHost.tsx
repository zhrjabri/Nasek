import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useStore } from '@/store/AppStore'
import { cx } from '@/components/ui'
import { useI18n } from '@/i18n'

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
}

const TONES = {
  success: 'border-nasek-200 bg-ivory-50 text-nasek-900',
  info: 'border-ivory-300 bg-ivory-50 text-ink-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
}

export function ToastHost() {
  const { toasts, dismissToast } = useStore()
  const { t } = useI18n()

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-100 flex flex-col items-center gap-2 px-4 sm:bottom-6"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone]
        return (
          <div
            key={toast.id}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[3px] border px-4 py-3 shadow-lift animate-pop',
              TONES[toast.tone],
            )}
          >
            <Icon className="size-[18px] shrink-0" strokeWidth={2.2} />
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label={t('common.close')}
              className="rounded-md p-1 opacity-50 transition-opacity hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
