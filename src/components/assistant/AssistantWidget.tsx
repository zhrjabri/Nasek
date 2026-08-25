import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Info, MessageCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { defaultSuggestions, getAI, type AssistantMessage } from '@/services/ai'
import { useCatalogue } from '@/hooks/useCatalogue'
import { LogoMark } from '@/components/brand/Logo'
import { cx } from '@/components/ui'

let idSeq = 0
const nextId = () => `m${++idSeq}`

/**
 * NASEK Assistant.
 *
 * A floating panel rather than a full page: people ask questions *while*
 * looking at campaigns, and pulling them away from the listing to ask would
 * defeat the purpose. Answers cite real campaigns from the live catalogue and
 * link straight to them.
 */
export function AssistantWidget() {
  const { t, lang, bl, money } = useI18n()
  const { getCampaign } = useCatalogue()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Seed the greeting in the active language, and re-seed if the user
  // switches language before saying anything.
  useEffect(() => {
    if (messages.length === 0 || (messages.length === 1 && messages[0].role === 'assistant')) {
      setMessages([
        {
          id: 'greeting',
          role: 'assistant',
          text: t('assistant.greeting'),
          suggestions: defaultSuggestions(lang),
        },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  // The booking flow needs the full screen; the launcher would sit on the CTA.
  const hidden = location.pathname.startsWith('/booking')

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setInput('')
    setBusy(true)
    setMessages((cur) => [...cur, { id: nextId(), role: 'user', text: trimmed }])

    try {
      const reply = await getAI().ask(trimmed, messages, lang)
      setMessages((cur) => [...cur, { id: nextId(), role: 'assistant', ...reply }])
    } catch {
      setMessages((cur) => [
        ...cur,
        { id: nextId(), role: 'assistant', text: t('state.errorBody') },
      ])
    } finally {
      setBusy(false)
    }
  }

  const reset = () =>
    setMessages([
      {
        id: 'greeting',
        role: 'assistant',
        text: t('assistant.greeting'),
        suggestions: defaultSuggestions(lang),
      },
    ])

  if (hidden) return null

  return (
    <>
      {/* ------------------------------------------------------- launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('assistant.open')}
          className="group fixed bottom-5 end-5 z-70 flex items-center gap-2.5 rounded-[3px] bg-nasek-900 py-3 ps-3 pe-4 text-ivory-50 shadow-deep transition-all duration-300 hover:bg-nasek-800 hover:shadow-lift sm:bottom-7 sm:end-7"
        >
          <span className="relative flex size-8 items-center justify-center rounded-[3px] bg-ivory-50/10">
            <MessageCircle className="size-4" strokeWidth={2.2} />
            <span className="absolute -end-0.5 -top-0.5 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold-400 opacity-70" />
              <span className="relative inline-flex size-2.5 rounded-full bg-gold-400" />
            </span>
          </span>
          <span className="hidden text-[13px] font-semibold sm:block">{t('assistant.name')}</span>
        </button>
      )}

      {/* ---------------------------------------------------------- panel */}
      {open && (
        <div
          role="dialog"
          aria-label={t('assistant.name')}
          className="fixed inset-x-0 bottom-0 z-80 flex h-[86dvh] flex-col overflow-hidden rounded-t-[3px] border border-ivory-300 bg-ivory-50 shadow-deep animate-pop sm:inset-x-auto sm:bottom-7 sm:end-7 sm:h-[620px] sm:w-[410px] sm:rounded-[3px]"
        >
          {/* header */}
          <header className="girih-gold flex items-center gap-3 border-b border-gold-500/40 bg-nasek-900 px-4 py-3.5 text-ivory-50">
            <LogoMark className="h-8 w-auto" tone="gold" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t('assistant.name')}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-ivory-200/60">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                {t('common.appName')}
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              aria-label={t('assistant.clear')}
              title={t('assistant.clear')}
              className="rounded-[3px] p-2 text-ivory-200/60 transition-colors hover:bg-ivory-50/10 hover:text-ivory-50"
            >
              <RotateCcw className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('assistant.close')}
              className="rounded-[3px] p-2 text-ivory-200/60 transition-colors hover:bg-ivory-50/10 hover:text-ivory-50"
            >
              <X className="size-4" />
            </button>
          </header>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-ivory-100 p-4">
            {messages.map((message) => (
              <div key={message.id}>
                <div
                  className={cx(
                    'max-w-[88%] rounded-[3px] px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-line',
                    message.role === 'user'
                      ? 'ms-auto bg-nasek-900 text-ivory-50'
                      : 'me-auto border border-ivory-300 bg-ivory-50 text-ink-700 shadow-soft',
                  )}
                >
                  {message.text}
                </div>

                {/* campaigns the assistant is pointing at */}
                {message.campaignIds && message.campaignIds.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {message.campaignIds.map((id) => {
                      const campaign = getCampaign(id)
                      if (!campaign) return null
                      return (
                        <li key={id}>
                          <Link
                            to={`/campaigns/${id}`}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 rounded-[3px] border border-ivory-300 bg-ivory-50 p-2.5 transition-all hover:border-nasek-300 hover:shadow-soft"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
                              <Sparkles className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-bold text-ink-900">
                                {bl(campaign.title)}
                              </span>
                              <span className="nums block text-[11px] text-ink-400">
                                {money(campaign.price)} · {campaign.seatsAvailable}{' '}
                                {t('common.seats')}
                              </span>
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {/* follow-up chips */}
                {message.role === 'assistant' &&
                  message.suggestions &&
                  message.id === messages[messages.length - 1]?.id &&
                  !busy && (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {message.suggestions.map((s) => (
                        <li key={s}>
                          <button
                            type="button"
                            onClick={() => void send(s)}
                            className="rounded-full border border-nasek-200 bg-ivory-50 px-3 py-1.5 text-[11.5px] font-medium text-nasek-800 transition-colors hover:bg-nasek-50"
                          >
                            {s}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            ))}

            {busy && (
              <div className="me-auto flex w-fit items-center gap-1.5 rounded-[3px] border border-ivory-300 bg-ivory-50 px-4 py-3 shadow-soft">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 rounded-full bg-nasek-500"
                    style={{ animation: `nasek-dot 1.2s ${i * 0.15}s ease-in-out infinite` }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* the guardrail is part of the UI, not a footnote */}
          <div className="flex items-start gap-2 border-t border-ivory-300 bg-gold-50/60 px-4 py-2.5">
            <Info className="mt-px size-3.5 shrink-0 text-gold-700" />
            <p className="text-[10.5px] leading-relaxed text-gold-800">
              {t('assistant.disclaimer')}
            </p>
          </div>

          {/* composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
            className="flex items-center gap-2 border-t border-ivory-300 bg-ivory-50 p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('assistant.placeholder')}
              aria-label={t('assistant.placeholder')}
              className="h-11 flex-1 rounded-[3px] border border-ivory-300 bg-ivory-50 px-3.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-nasek-600 focus:bg-ivory-50 focus:outline-none focus:ring-2 focus:ring-nasek-600/15"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              aria-label={t('assistant.send')}
              className="flex size-11 shrink-0 items-center justify-center rounded-[3px] bg-nasek-900 text-ivory-50 transition-colors hover:bg-nasek-800 disabled:opacity-40"
            >
              <Send className="size-4 rtl:-scale-x-100" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
