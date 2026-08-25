import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Compass,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import type { CampaignType, ServiceKey, TravelMethod } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { PRICE_CEILING } from '@/data/campaigns'
import { SERVICE_KEYS, serviceLabel } from '@/data/services'
import { getAI, type MatchResult, type SmartMatchInput } from '@/services/ai'
import type { SeasonKey } from '@/services/ai/types'
import { useCatalogue } from '@/hooks/useCatalogue'
import { tripDays } from '@/lib/trip'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  ProgressBar,
  Rating,
  ScoreRing,
  Select,
  cx,
} from '@/components/ui'

const TOTAL_STEPS = 7
const MAX_SERVICES = 4

const emptyInput: SmartMatchInput = {
  type: 'any',
  wilayahId: null,
  budget: null,
  season: 'any',
  travelMethod: 'any',
  services: [],
  travellers: 2,
}

type Phase = 'intro' | 'questions' | 'thinking' | 'results'

export function SmartMatchPage() {
  const { t, lang, isRtl, n } = useI18n()
  const { campaigns, providers } = useCatalogue()

  /* The budget slider ends where the dearest trip does, not at a number fixed
     before any trip existed — otherwise a pilgrim who can afford the most
     expensive Hajj on the site has no way to say so. */
  const budgetCeiling = useMemo(
    () => Math.max(PRICE_CEILING, Math.ceil(campaigns.reduce((m, c) => Math.max(m, c.price), 0) / 100) * 100),
    [campaigns],
  )
  const [phase, setPhase] = useState<Phase>('intro')
  const [step, setStep] = useState(1)
  const [input, setInput] = useState<SmartMatchInput>(emptyInput)
  const [results, setResults] = useState<MatchResult[]>([])

  const Back = isRtl ? ArrowRight : ArrowLeft
  const Next = isRtl ? ArrowLeft : ArrowRight

  const patch = (p: Partial<SmartMatchInput>) => setInput((cur) => ({ ...cur, ...p }))

  const run = async (payload: SmartMatchInput) => {
    setPhase('thinking')
    const matched = await getAI().smartMatch(payload, lang, campaigns, providers)
    setResults(matched)
    setPhase('results')
  }

  const restart = () => {
    setInput(emptyInput)
    setStep(1)
    setResults([])
    setPhase('intro')
  }

  /** Loosen the two most restrictive answers and try again. */
  const relax = () => {
    const relaxed: SmartMatchInput = {
      ...input,
      travelMethod: 'any',
      season: 'any',
      budget: input.budget ? Math.round(input.budget * 1.5) : null,
    }
    setInput(relaxed)
    void run(relaxed)
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
      {phase === 'intro' && (
        <Intro onStart={() => setPhase('questions')} />
      )}

      {phase === 'questions' && (
        <div className="animate-rise">
          {/* -------------------------------------------------- progress */}
          <div className="mb-8">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[12px] font-bold uppercase tracking-wider text-nasek-700">
                {t('smart.step', { n: n(step), total: n(TOTAL_STEPS) })}
              </p>
              <button
                type="button"
                onClick={restart}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-400 hover:text-ink-700"
              >
                <RotateCcw className="size-3.5" />
                {t('smart.restart')}
              </button>
            </div>
            <ProgressBar value={step} max={TOTAL_STEPS} label={t('smart.title')} />
          </div>

          <Card className="p-6 sm:p-8">
            <Question
              budgetCeiling={budgetCeiling}
              step={step}
              input={input}
              patch={patch}
            />

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-ivory-300 pt-6">
              <Button
                variant="ghost"
                onClick={() => (step === 1 ? setPhase('intro') : setStep((s) => s - 1))}
              >
                <Back className="size-4" />
                {t('common.back')}
              </Button>

              <div className="flex items-center gap-2">
                {step < TOTAL_STEPS ? (
                  <>
                    <Button variant="ghost" onClick={() => setStep((s) => s + 1)}>
                      {t('common.skip')}
                    </Button>
                    <Button onClick={() => setStep((s) => s + 1)} size="lg">
                      {t('common.next')}
                      <Next className="size-4" />
                    </Button>
                  </>
                ) : (
                  <Button variant="gold" size="lg" onClick={() => void run(input)}>
                    <Sparkles className="size-4" />
                    {t('smart.start')}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Every question has a sensible default, so none of them has to be
              answered. Saying so — and offering the exit — turns a seven-screen
              form into as many screens as the person actually cares about. */}
          {step < TOTAL_STEPS && (
            <p className="mt-4 text-center text-[12.5px] leading-relaxed text-ink-400">
              {t('smart.answeredNote')}{' '}
              <button
                type="button"
                onClick={() => void run(input)}
                className="font-semibold text-nasek-700 underline-offset-2 hover:underline"
              >
                {t('smart.showMatchesNow')}
              </button>
            </p>
          )}
        </div>
      )}

      {phase === 'thinking' && <Thinking />}

      {phase === 'results' && (
        <Results
          results={results}
          input={input}
          onRestart={restart}
          onRelax={relax}
        />
      )}
    </main>
  )
}

// -------------------------------------------------------------------- intro

function Intro({ onStart }: { onStart: () => void }) {
  const { t } = useI18n()
  return (
    <div className="text-center animate-rise">
      <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-[3px] bg-nasek-900 text-gold-400">
        <Compass className="size-8" strokeWidth={1.6} />
      </span>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-600">
        {t('smart.navTitle')}
      </p>
      <h1 className="display text-[32px] text-ink-900 sm:text-[42px]">{t('smart.title')}</h1>
      <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-ink-500">
        {t('smart.subtitle')}
      </p>
      <Button size="lg" className="mt-8" onClick={onStart}>
        <Sparkles className="size-4" />
        {t('smart.start')}
      </Button>

      <ul className="mx-auto mt-12 grid max-w-2xl gap-3 sm:grid-cols-3">
        {(['smart.q1', 'smart.q3', 'smart.q6'] as MessageKey[]).map((key, i) => (
          <li key={key} className="surface p-4 text-start">
            <span className="nums text-[11px] font-bold text-gold-600">0{i + 1}</span>
            <p className="mt-1.5 text-[13px] font-semibold text-ink-700">{t(key)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ----------------------------------------------------------------- question

function Question({
  step,
  input,
  patch,
  budgetCeiling,
}: {
  step: number
  input: SmartMatchInput
  patch: (p: Partial<SmartMatchInput>) => void
  /** Top of the budget slider — follows the catalogue, see the page above. */
  budgetCeiling: number
}) {
  const { t, lang, n, money } = useI18n()

  const heading = (title: MessageKey, hint: MessageKey) => (
    <div className="mb-6">
      <h2 className="display text-[24px] text-ink-900 sm:text-[28px]">{t(title)}</h2>
      <p className="mt-2 text-[14px] text-ink-500">{t(hint)}</p>
    </div>
  )

  switch (step) {
    case 1:
      return (
        <div key={step} className="animate-fade">
          {heading('smart.q1', 'smart.q1hint')}
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                { value: 'umrah', label: t('common.umrah') },
                { value: 'hajj', label: t('common.hajj') },
                { value: 'any', label: t('smart.noPreference') },
              ] as { value: CampaignType | 'any'; label: string }[]
            ).map((opt) => (
              <BigOption
                key={opt.value}
                selected={input.type === opt.value}
                onClick={() => patch({ type: opt.value })}
                label={opt.label}
              />
            ))}
          </div>
        </div>
      )

    case 2:
      return (
        <div key={step} className="animate-fade">
          {heading('smart.q2', 'smart.q2hint')}
          <Select
            value={input.wilayahId ?? ''}
            onChange={(e) => patch({ wilayahId: e.target.value || null })}
            aria-label={t('smart.q2')}
            className="h-13 text-[15px]"
          >
            <option value="">{t('smart.noPreference')}</option>
            {WILAYAT.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name[lang]} — {w.governorate[lang]}
              </option>
            ))}
          </Select>
          <div className="mt-4 flex flex-wrap gap-2">
            {['muscat', 'sohar', 'nizwa', 'salalah', 'sur'].map((id) => {
              const w = WILAYAT.find((x) => x.id === id)!
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => patch({ wilayahId: id })}
                  className={cx(
                    'rounded-[3px] border px-3.5 py-2 text-[13px] font-semibold transition-colors',
                    input.wilayahId === id
                      ? 'border-nasek-700 bg-nasek-800 text-ivory-50'
                      : 'border-ivory-300 bg-ivory-50 text-ink-600 hover:border-nasek-300',
                  )}
                >
                  {w.name[lang]}
                </button>
              )
            })}
          </div>
        </div>
      )

    case 3:
      return (
        <div key={step} className="animate-fade">
          {heading('smart.q3', 'smart.q3hint')}
          <p className="nums display text-center text-[40px] text-nasek-900">
            {input.budget == null ? t('smart.noPreference') : money(input.budget)}
          </p>
          <input
            type="range"
            className="nasek-range mt-6"
            min={80}
            max={budgetCeiling}
            step={20}
            value={input.budget ?? 500}
            aria-label={t('smart.q3')}
            onChange={(e) => patch({ budget: Number(e.target.value) })}
          />
          <div className="mt-2 flex justify-between text-[11px] text-ink-400">
            <span className="nums">{money(80)}</span>
            <span className="nums">{money(budgetCeiling)}</span>
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {[150, 400, 800, 2000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => patch({ budget: v })}
                className={cx(
                  'rounded-[3px] border px-3.5 py-2 text-[13px] font-semibold transition-colors',
                  input.budget === v
                    ? 'border-nasek-700 bg-nasek-800 text-ivory-50'
                    : 'border-ivory-300 bg-ivory-50 text-ink-600 hover:border-nasek-300',
                )}
              >
                {t('smart.upTo', { n: n(v) })}
              </button>
            ))}
            <button
              type="button"
              onClick={() => patch({ budget: null })}
              className={cx(
                'rounded-[3px] border px-3.5 py-2 text-[13px] font-semibold transition-colors',
                input.budget == null
                  ? 'border-nasek-700 bg-nasek-800 text-ivory-50'
                  : 'border-ivory-300 bg-ivory-50 text-ink-600 hover:border-nasek-300',
              )}
            >
              {t('smart.noPreference')}
            </button>
          </div>
        </div>
      )

    case 4:
      return (
        <div key={step} className="animate-fade">
          {heading('smart.q4', 'smart.q4hint')}
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { value: 'soon', ar: 'في أقرب وقت', en: 'As soon as possible' },
                { value: 'winter', ar: 'شتاء 2026/2027', en: 'Winter 2026/27' },
                { value: 'ramadan', ar: 'رمضان 1448', en: 'Ramadan 1448' },
                { value: 'hajj_season', ar: 'موسم الحج 1448', en: 'Hajj season 1448' },
                { value: 'spring', ar: 'ربيع 2027', en: 'Spring 2027' },
                { value: 'any', ar: 'أي وقت', en: 'Any time' },
              ] as { value: SeasonKey; ar: string; en: string }[]
            ).map((opt) => (
              <BigOption
                key={opt.value}
                selected={input.season === opt.value}
                onClick={() => patch({ season: opt.value })}
                label={lang === 'ar' ? opt.ar : opt.en}
              />
            ))}
          </div>
        </div>
      )

    case 5:
      return (
        <div key={step} className="animate-fade">
          {heading('smart.q5', 'smart.q5hint')}
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                { value: 'land', label: t('common.land') },
                { value: 'air', label: t('common.air') },
                { value: 'any', label: t('smart.noPreference') },
              ] as { value: TravelMethod | 'any'; label: string }[]
            ).map((opt) => (
              <BigOption
                key={opt.value}
                selected={input.travelMethod === opt.value}
                onClick={() => patch({ travelMethod: opt.value })}
                label={opt.label}
              />
            ))}
          </div>
        </div>
      )

    case 6: {
      const full = input.services.length >= MAX_SERVICES
      return (
        <div key={step} className="animate-fade">
          {heading('smart.q6', 'smart.q6hint')}
          <ul className="flex flex-wrap gap-2">
            {SERVICE_KEYS.map((s) => {
              const selected = input.services.includes(s)
              return (
                <li key={s}>
                  <button
                    type="button"
                    disabled={!selected && full}
                    onClick={() =>
                      patch({
                        services: selected
                          ? input.services.filter((x) => x !== s)
                          : [...input.services, s],
                      })
                    }
                    className={cx(
                      'flex items-center gap-2 rounded-[3px] border px-3.5 py-2.5 text-[13px] font-semibold transition-all',
                      selected
                        ? 'border-nasek-700 bg-nasek-800 text-ivory-50'
                        : full
                          ? 'cursor-not-allowed border-ivory-300 bg-ivory-100 text-ink-400'
                          : 'border-ivory-300 bg-ivory-50 text-ink-600 hover:border-nasek-300 hover:bg-nasek-50',
                    )}
                  >
                    {selected && <Check className="size-3.5" strokeWidth={3} />}
                    {serviceLabel(s as ServiceKey, lang)}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 nums text-[12px] text-ink-400">
            {n(input.services.length)} / {n(MAX_SERVICES)}
          </p>
        </div>
      )
    }

    case 7:
      return (
        <div key={step} className="animate-fade">
          {heading('smart.q7', 'smart.q7hint')}
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => patch({ travellers: Math.max(1, input.travellers - 1) })}
              aria-label={t('common.previous')}
              className="flex size-12 items-center justify-center rounded-[3px] border border-ivory-300 bg-ivory-50 text-ink-600 transition-colors hover:border-nasek-400 hover:text-nasek-800"
            >
              <Minus className="size-5" />
            </button>
            <span className="nums display w-20 text-center text-[48px] text-nasek-900">
              {n(input.travellers)}
            </span>
            <button
              type="button"
              onClick={() => patch({ travellers: Math.min(15, input.travellers + 1) })}
              aria-label={t('common.next')}
              className="flex size-12 items-center justify-center rounded-[3px] border border-ivory-300 bg-ivory-50 text-ink-600 transition-colors hover:border-nasek-400 hover:text-nasek-800"
            >
              <Plus className="size-5" />
            </button>
          </div>
        </div>
      )

    default:
      return null
  }
}

function BigOption({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'flex items-center justify-between gap-3 rounded-[3px] border p-4 text-start transition-all duration-200',
        selected
          ? 'border-nasek-700 bg-nasek-900 text-ivory-50 shadow-lift'
          : 'border-ivory-300 bg-ivory-50 text-ink-700 hover:-translate-y-0.5 hover:border-nasek-300 hover:shadow-soft',
      )}
    >
      <span className="text-[15px] font-semibold">{label}</span>
      <span
        className={cx(
          'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-gold-400 bg-gold-400 text-nasek-950' : 'border-ivory-400',
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3.5} />}
      </span>
    </button>
  )
}

// ------------------------------------------------------------------ thinking

function Thinking() {
  const { t } = useI18n()
  const steps: MessageKey[] = [
    'smart.analysingStep1',
    'smart.analysingStep2',
    'smart.analysingStep3',
  ]
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActive((a) => Math.min(steps.length - 1, a + 1)), 450)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center py-20 text-center animate-fade">
      <span className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-nasek-100" style={{ animation: 'nasek-pulse-ring 2s ease-out infinite' }} />
        <span className="relative flex size-16 items-center justify-center rounded-[3px] bg-nasek-900 text-gold-400">
          <Sparkles className="size-7" />
        </span>
      </span>
      <h2 className="display mt-6 text-[24px] text-ink-900">{t('smart.analysing')}</h2>
      <ul className="mt-6 space-y-2.5">
        {steps.map((key, i) => (
          <li
            key={key}
            className={cx(
              'flex items-center gap-2.5 text-[14px] transition-all duration-300',
              i <= active ? 'text-ink-700' : 'text-ink-400 opacity-50',
            )}
          >
            <span
              className={cx(
                'flex size-5 items-center justify-center rounded-full border transition-colors',
                i < active
                  ? 'border-nasek-600 bg-nasek-600 text-white'
                  : i === active
                    ? 'border-nasek-600'
                    : 'border-ivory-400',
              )}
            >
              {i < active && <Check className="size-3" strokeWidth={3.5} />}
            </span>
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------ results

function Results({
  results,
  input,
  onRestart,
  onRelax,
}: {
  results: MatchResult[]
  input: SmartMatchInput
  onRestart: () => void
  onRelax: () => void
}) {
  const { t, lang, bl, money, n, dateRange } = useI18n()
  const { getProvider } = useCatalogue()

  if (results.length === 0) {
    return (
      <div className="animate-rise">
        <EmptyState
          icon={<Compass className="size-5" />}
          title={t('smart.noMatches')}
          body={t('smart.noMatchesHint')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={onRelax}>{t('smart.relax')}</Button>
              <Button variant="secondary" onClick={onRestart}>
                {t('smart.restart')}
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="animate-rise">
      <header className="mb-8 text-center">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-600">
          {t('smart.navTitle')}
        </p>
        <h1 className="display text-[30px] text-ink-900 sm:text-[38px]">
          {t('smart.resultsTitle')}
        </h1>
        <p className="mt-3 text-[15px] text-ink-500">{t('smart.resultsSubtitle')}</p>
      </header>

      {/* what we searched for — so the ranking is legible */}
      <ul className="mb-8 flex flex-wrap justify-center gap-2">
        {input.type !== 'any' && (
          <Chip>{t(input.type === 'hajj' ? 'common.hajj' : 'common.umrah')}</Chip>
        )}
        {input.wilayahId && (
          <Chip>{WILAYAT.find((w) => w.id === input.wilayahId)?.name[lang]}</Chip>
        )}
        {input.budget && <Chip>{t('smart.upTo', { n: n(input.budget) })}</Chip>}
        {input.travelMethod !== 'any' && (
          <Chip>{t(input.travelMethod === 'air' ? 'common.air' : 'common.land')}</Chip>
        )}
        <Chip>
          {n(input.travellers)} {t('common.travellers')}
        </Chip>
        {input.services.map((s) => (
          <Chip key={s}>{serviceLabel(s, lang)}</Chip>
        ))}
      </ul>

      <ol className="space-y-4">
        {results.map((result, index) => {
          const c = result.campaign
          const provider = getProvider(c.providerId)
          return (
            <li key={c.id}>
              <Card
                className={cx(
                  'overflow-hidden transition-shadow hover:shadow-lift',
                  index === 0 && 'ring-2 ring-gold-300',
                )}
              >
                {index === 0 && (
                  <div className="flex items-center gap-2 bg-gold-400 px-5 py-2 text-[12px] font-bold text-nasek-950">
                    <Sparkles className="size-3.5" />
                    {t('smart.match', { n: n(result.score) })}
                  </div>
                )}

                <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
                  <div className="flex items-center gap-4 sm:flex-col sm:items-center">
                    <ScoreRing score={result.score} size={72} />
                    <span
                      className="flex size-10 items-center justify-center rounded-[3px] text-base font-bold text-white sm:size-9"
                      style={{ background: provider?.brandColor }}
                      aria-hidden
                    >
                      {provider?.initials}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={c.type === 'hajj' ? 'gold' : 'green'}>
                        {t(c.type === 'hajj' ? 'common.hajj' : 'common.umrah')}
                      </Badge>
                      {provider?.verification === 'verified' && (
                        <Badge tone="green">
                          <BadgeCheck className="size-3" />
                          {t('common.verified')}
                        </Badge>
                      )}
                    </div>

                    <Link
                      to={`/campaigns/${c.id}`}
                      className="mt-2 block text-[19px] font-bold leading-snug text-ink-900 hover:text-nasek-800"
                    >
                      {bl(c.title)}
                    </Link>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-500">
                      <Rating value={c.rating} count={c.reviewCount} size="sm" />
                      <span>{dateRange(c.departureDate, c.returnDate)}</span>
                      <span>{t('campaign.duration', { n: n(tripDays(c)) })}</span>
                    </div>

                    {/* the explanation — the reason to trust the number */}
                    <div className="mt-4 space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-nasek-700">
                        {t('smart.whyMatch')}
                      </p>
                      <ul className="space-y-1.5">
                        {result.reasons.map((reason) => (
                          <li key={reason} className="flex items-start gap-2 text-[13.5px] text-ink-600">
                            <Check className="mt-0.5 size-3.5 shrink-0 text-nasek-600" strokeWidth={3} />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {result.tradeoffs.length > 0 && (
                      <div className="mt-3.5 space-y-1.5 rounded-[3px] bg-gold-50/70 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gold-700">
                          {t('smart.tradeoff')}
                        </p>
                        <ul className="space-y-1">
                          {result.tradeoffs.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-[13px] text-gold-900">
                              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end justify-between gap-3 sm:w-36">
                    <div className="text-end">
                      <p className="nums text-[24px] font-bold leading-none text-nasek-900">
                        {money(c.price)}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-400">{t('common.perPerson')}</p>
                    </div>
                    <div className="flex w-full flex-col gap-2">
                      <LinkButton to={`/campaigns/${c.id}`} variant="secondary" size="sm" block>
                        {t('common.viewDetails')}
                      </LinkButton>
                      {c.seatsAvailable > 0 && (
                        <LinkButton to={`/booking/${c.id}`} size="sm" block>
                          {t('common.bookNow')}
                        </LinkButton>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          )
        })}
      </ol>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="secondary" onClick={onRestart}>
          <RotateCcw className="size-4" />
          {t('smart.restart')}
        </Button>
        <LinkButton to="/campaigns" variant="ghost">
          {t('compare.browse')}
        </LinkButton>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-full border border-ivory-300 bg-ivory-50 px-3 py-1.5 text-[12px] font-semibold text-ink-600">
      {children}
    </li>
  )
}
