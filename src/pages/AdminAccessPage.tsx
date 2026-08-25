import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { KeyRound, Lock } from 'lucide-react'
import { useI18n } from '@/i18n'
import { authApi } from '@/services/api/auth'
import { verifyAdminPassphrase } from '@/services/api/adminAccess'
import { useStore } from '@/store/AppStore'
import { Logo } from '@/components/brand/Logo'
import { Button, Card, Field, Input } from '@/components/ui'

/**
 * The administration gate.
 *
 * Reached only by typing the address: nothing in the navigation, the footer,
 * the sign-in page or the sitemap points here, so an ordinary visitor never
 * learns the page exists. Getting past it needs the passphrase.
 *
 * Kept off the shared `AuthShell` on purpose — that shell carries "create an
 * account" and "sign in instead" footers, which are meaningless here and would
 * only advertise a second way in.
 */
function Gate() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user, dispatch } = useStore()
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Already through the gate — no reason to ask twice.
  if (user?.role === 'admin') return <Navigate to="/admin" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phrase.trim()) {
      setError(t('admin.gateEmpty'))
      return
    }

    setBusy(true)
    setError('')
    const ok = await verifyAdminPassphrase(phrase)
    if (!ok) {
      setBusy(false)
      setPhrase('')
      setError(t('admin.gateWrong'))
      return
    }

    const admin = await authApi.signInAs('admin', t('auth.guestAdmin'))
    dispatch({ type: 'signIn', user: admin })
    setBusy(false)
    navigate('/admin', { replace: true })
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6 lg:py-24">
      <div className="mb-8 text-center">
        <Logo size="lg" />
        <div className="mt-7 inline-flex size-11 items-center justify-center rounded-[3px] bg-ink-900 text-ivory-50">
          <Lock className="size-5" />
        </div>
        <h1 className="display mt-5 text-[26px] text-ink-900 sm:text-[30px]">
          {t('admin.gateTitle')}
        </h1>
        <p className="mt-2.5 text-[14px] text-ink-500">{t('admin.gateSubtitle')}</p>
      </div>

      <Card className="p-6 sm:p-7">
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('admin.gatePassphrase')} required error={error}>
            {(p) => (
              <Input
                {...p}
                type="password"
                dir="ltr"
                autoFocus
                autoComplete="off"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
            )}
          </Field>

          <Button type="submit" size="lg" block loading={busy}>
            {busy ? t('admin.gateChecking') : t('admin.gateEnter')}
          </Button>
        </form>
      </Card>

      <p className="mt-6 flex items-start gap-2 rounded-[3px] border border-ivory-300 bg-ivory-50 p-3.5 text-[11.5px] leading-relaxed text-ink-400">
        <KeyRound className="mt-px size-3.5 shrink-0" />
        {t('admin.gateNote')}
      </p>
    </main>
  )
}

/*
 * Exported as the default, and named neutrally, on purpose. A named export is
 * referenced by name at the import site, and that name survives minification
 * as a plain string in the built file — so `m.AdminAccessPage` would have
 * printed "AdminAccessPage" into the bundle and given away in a word what
 * hashing the address was meant to conceal.
 */
export default Gate
