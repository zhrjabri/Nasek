import { useState } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useI18n } from '@/i18n'
import { MIN_PASSWORD_LENGTH, passwordProblem, setPassword } from '@/services/auth/password'
import { Button, Field, Input, Notice } from '@/components/ui'
import { OwnerAuthShell } from './layout/OwnerShell'

/**
 * The last step of a password reset.
 *
 * An owner who has forgotten their password asks for a reset on the sign-in
 * screen; Supabase emails a link; the link lands here with a session already
 * established. This screen sets a new password, and from then on the owner
 * signs in the ordinary way.
 *
 * Owners an administrator creates do not come through here: the administrator
 * sets a temporary password when creating the account, and nothing is emailed.
 *
 * WHY A SESSION EXISTS BEFORE A NEW PASSWORD DOES
 *
 * That is what a recovery link *is* — proof of control of the address, redeemed
 * for a session, exactly as a magic link is. It is the same authority any
 * password reset rests on, which is why `updateUser({ password })` is allowed
 * to set one without asking for the old one: the link was the proof.
 *
 * The screen is reached only from a link. Nothing navigates here, and an owner
 * who signs in with their password never sees it — `OwnerApp` shows it only
 * when this page load carried a token.
 */
export function SetPasswordPage({ onDone }: { onDone: () => Promise<void> | void }) {
  const { t } = useI18n()
  const [password, setValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reveal, setReveal] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = passwordProblem(password, confirm)
    if (problem === 'short') {
      setErrors({ password: t('auth.passwordShort', { n: MIN_PASSWORD_LENGTH }) })
      return
    }
    if (problem === 'mismatch') {
      setErrors({ confirm: t('auth.passwordMismatch') })
      return
    }

    setErrors({})
    setFailure('')
    setBusy(true)
    const saved = await setPassword(password)
    setBusy(false)

    if (!saved.ok) {
      setFailure(t('owner.setPasswordFailed'))
      return
    }
    await onDone()
  }

  return (
    <OwnerAuthShell title={t('owner.setPasswordTitle')} subtitle={t('owner.setPasswordBody')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {failure && (
          <Notice tone="danger" live>
            {failure}
          </Notice>
        )}

        <Field
          label={t('auth.password')}
          hint={t('auth.passwordHint', { n: MIN_PASSWORD_LENGTH })}
          required
          error={errors.password}
        >
          {(p) => (
            // LTR as a whole, like the input inside it. In the Arabic page the
            // button's `end-2` otherwise resolves to the left while the input's
            // `pe-10` space is on the right, and the eye sat on the password.
            <div className="relative" dir="ltr">
              <Input
                {...p}
                type={reveal ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setValue(e.target.value)}
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

        <Field label={t('auth.confirmPassword')} required error={errors.confirm}>
          {(p) => (
            <Input
              {...p}
              type={reveal ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>

        <Button type="submit" size="lg" block loading={busy}>
          <ShieldCheck className="size-4" />
          {t('owner.setPasswordCta')}
        </Button>
      </form>
    </OwnerAuthShell>
  )
}
