import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { useI18n } from '@/i18n'
import { authApi } from '@/services/api/auth'
import { verifyAdminPassphrase } from '@/services/api/adminAccess'
import { useStore } from '@/store/AppStore'
import { AuthShell } from '@/pages/AuthPages'
import { Button, Field, Input } from '@/components/ui'

/**
 * The administration gate.
 *
 * Now part of the site rather than hidden behind it: the Log In page offers it
 * alongside customer and campaign owner, and it wears the same shell as those
 * two so it reads as the third door of one entrance, not a separate building.
 *
 * The passphrase is what protects the dashboard — being easy to find and being
 * easy to enter are different things. The unlisted address still works for
 * anyone who bookmarked it, but it is no longer the only way in.
 */
function Gate() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user, dispatch } = useStore()
  const [phrase, setPhrase] = useState('')
  const [reveal, setReveal] = useState(false)
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
    <AuthShell
      title={t('admin.gateTitle')}
      subtitle={t('admin.gateSubtitle')}
      footer={
        <>
          {t('admin.gateOther')}{' '}
          <Link to="/signin" className="font-semibold text-nasek-700 hover:underline">
            {t('nav.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('admin.gatePassphrase')} required error={error}>
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                type={reveal ? 'text' : 'password'}
                dir="ltr"
                autoFocus
                autoComplete="off"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={t(reveal ? 'auth.hidePassword' : 'auth.showPassword')}
                className="absolute top-1/2 end-2 -translate-y-1/2 rounded-[3px] p-1.5 text-ink-400 transition-colors hover:text-ink-700"
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>

        <Button type="submit" size="lg" block loading={busy}>
          {busy ? t('admin.gateChecking') : t('admin.gateEnter')}
        </Button>
      </form>

      <p className="mt-5 flex items-start gap-2 border-t border-ivory-300 pt-4 text-[11.5px] leading-relaxed text-ink-400">
        <Lock className="mt-px size-3.5 shrink-0" />
        {t('admin.gateNote')}
      </p>
    </AuthShell>
  )
}

/*
 * Exported as the default, and named neutrally, on purpose. A named export is
 * referenced by name at the import site, and that name survives minification
 * as a plain string in the built file.
 */
export default Gate
