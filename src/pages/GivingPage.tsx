import { useState } from 'react'
import { ClipboardCheck, HandHeart, HeartHandshake, Info, Send, Users } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { registerGivingInterest } from '@/services/data/catalogue'
import { Button, Card, Field, Input, cx } from '@/components/ui'

const STEPS: { title: MessageKey; body: MessageKey; icon: typeof HandHeart }[] = [
  { title: 'giving.h1.title', body: 'giving.h1.body', icon: HandHeart },
  { title: 'giving.h2.title', body: 'giving.h2.body', icon: ClipboardCheck },
  { title: 'giving.h3.title', body: 'giving.h3.body', icon: Users },
  { title: 'giving.h4.title', body: 'giving.h4.body', icon: HeartHandshake },
]

/**
 * NASEK Giving — presented as a planned programme.
 *
 * The original business plan includes funding trips for low-income families.
 * No donation system exists, so this page describes the intent and says
 * plainly that it cannot accept money. The only interactive element is an
 * expression of interest, which promises nothing but a future email.
 */
export function GivingPage() {
  const { t, n } = useI18n()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <main>
      {/* ------------------------------------------------------------ hero */}
      <section className="girih-gold relative overflow-hidden border-b border-gold-500/40 bg-nasek-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,rgba(201,169,97,0.18),transparent)]" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-[3px] bg-gold-400/15 text-gold-400">
            <HeartHandshake className="size-8" strokeWidth={1.6} />
          </span>
          <h1 className="display text-5xl text-ivory-50 sm:text-6xl">{t('giving.title')}</h1>
          <div className="rule-gold mx-auto my-6 w-24" />
          <p className="text-lg leading-relaxed text-ivory-200/75 sm:text-lg">
            {t('giving.subtitle')}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        {/* -------------------------------------------- the honest notice */}
        <Card className="flex items-start gap-4 border-gold-200 bg-gold-50 p-5">
          <Info className="mt-0.5 size-5 shrink-0 text-gold-700" />
          <div>
            <p className="text-base font-bold text-gold-900">{t('giving.plannedTitle')}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-gold-800">
              {t('giving.plannedBody')}
            </p>
          </div>
        </Card>

        <p className="mt-10 text-lg leading-[1.9] text-ink-600">{t('giving.body')}</p>

        {/* ------------------------------------------------------- how it works */}
        <h2 className="display mt-12 text-3xl text-ink-900">{t('giving.how')}</h2>
        <ol className="stagger mt-6 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className="surface flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
                  <step.icon className="size-[18px]" strokeWidth={2} />
                </span>
                <span className="nums text-xs font-bold text-gold-600">0{i + 1}</span>
              </div>
              <h3 className="text-lg font-bold text-ink-900">{t(step.title)}</h3>
              <p className="text-sm leading-relaxed text-ink-500">{t(step.body)}</p>
            </li>
          ))}
        </ol>

        {/* ------------------------------------------------------- targets */}
        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { value: n(30), label: t('giving.statTrips') },
            { value: n(4), label: t('giving.statPartners') },
            { value: n(95), label: t('giving.statCost') },
          ].map((stat) => (
            <li key={stat.label} className="rounded-[3px] border border-ivory-300 bg-ivory-50 p-5 text-center">
              <p className="nums display text-5xl text-nasek-900">{stat.value}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{stat.label}</p>
            </li>
          ))}
        </ul>

        {/* ------------------------------------------------------ interest */}
        <Card className="mt-12 p-7">
          <h2 className="display text-2xl text-ink-900">{t('giving.interest')}</h2>
          <p className="mt-2 text-base text-ink-500">{t('giving.interestNote')}</p>

          {sent ? (
            <p
              role="status"
              className={cx(
                'mt-5 flex items-center gap-2.5 rounded-[3px] border border-nasek-200 bg-nasek-50 px-4 py-3.5',
                'text-base font-semibold text-nasek-900',
              )}
            >
              <ClipboardCheck className="size-4" />
              {t('giving.interestThanks')}
            </p>
          ) : (
            <form
              className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!/^\S+@\S+\.\S+$/.test(email)) {
                  setError(t('auth.emailInvalid'))
                  return
                }
                setError('')
                /*
                 * The address is kept now, rather than thanked and discarded.
                 *
                 * The programme is planned rather than running and the page
                 * says so — but "we will tell you when it opens" is a promise,
                 * and it needs somewhere to keep the address in order to be one.
                 */
                setBusy(true)
                const ok = await registerGivingInterest(email)
                setBusy(false)
                if (!ok) {
                  setError(t('giving.interestFailed'))
                  return
                }
                setSent(true)
              }}
            >
              <Field label={t('common.email')} error={error} className="flex-1">
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" size="lg" loading={busy} className="shrink-0">
                <Send className="size-4 rtl:-scale-x-100" />
                {t('giving.interest')}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  )
}
