import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Bilingual, Lang } from '@/types'
import { en, type PublicMessageKey } from './en'
import { ar } from './ar'
// Type-only, and that is the whole trick. TypeScript erases this import, so the
// administration strings are named in the key union without a single one of
// them being bundled into the public site. `src/admin/main.tsx` supplies the
// values at runtime through the `extra` prop below.
import type { AdminMessageKey } from './adminEn'

/**
 * Every key either application can name.
 *
 * The public site can resolve only the public half; ask it for an
 * administration key and `t` falls back to returning the key itself, which is
 * the same thing it has always done for a missing translation. Nothing in
 * `src/pages/` or `src/components/` asks for one.
 */
export type MessageKey = PublicMessageKey | AdminMessageKey

/** A dictionary that need not be complete — what `extra` supplies. */
export type PartialDict = Partial<Record<MessageKey, string>>

const BASE: Record<Lang, Record<PublicMessageKey, string>> = { en, ar }

const STORAGE_KEY = 'nasek.lang'

interface I18nValue {
  lang: Lang
  dir: 'rtl' | 'ltr'
  isRtl: boolean
  setLang: (lang: Lang) => void
  toggleLang: () => void
  /** Translate a key, substituting `{placeholders}`. */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  /** Pick the right side of a bilingual data field. */
  bl: (value: Bilingual | undefined) => string
  /** Format a number using the active locale's digits. */
  n: (value: number, options?: Intl.NumberFormatOptions) => string
  /** Format a price with the OMR unit in the active language. */
  money: (value: number, opts?: { decimals?: boolean }) => string
  /** Format an ISO date as a readable, localised date. */
  date: (iso: string, options?: Intl.DateTimeFormatOptions) => string
  /** Short date range, e.g. "12–20 Mar 2027". */
  dateRange: (fromIso: string, toIso: string) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function initialLang(): Lang {
  if (typeof window === 'undefined') return 'ar'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'ar' || stored === 'en') return stored
  // Arabic is the primary language; only default to English for non-Arabic browsers.
  return navigator.language?.startsWith('ar') === false ? 'en' : 'ar'
}

export function I18nProvider({
  extra,
  children,
}: {
  /**
   * Additional strings for this application, merged over the shared ones.
   *
   * The administration dashboard passes its own dictionaries here. Merging at
   * runtime rather than importing at module scope is what keeps them out of the
   * public build — a static import would put them in both.
   */
  extra?: Partial<Record<Lang, PartialDict>>
  children: ReactNode
}) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = dir
    window.localStorage.setItem(STORAGE_KEY, lang)
  }, [lang, dir])

  const setLang = useCallback((next: Lang) => setLangState(next), [])
  const toggleLang = useCallback(
    () => setLangState((cur) => (cur === 'ar' ? 'en' : 'ar')),
    [],
  )

  const value = useMemo<I18nValue>(() => {
    const dict: Partial<Record<MessageKey, string>> = extra?.[lang]
      ? { ...BASE[lang], ...extra[lang] }
      : BASE[lang]
    const locale = lang === 'ar' ? 'ar-OM' : 'en-GB'

    const t: I18nValue['t'] = (key, vars) => {
      // English is the fallback for a missing Arabic string; the key itself is
      // the fallback for a string this application does not carry at all.
      let out: string =
        dict[key] ?? extra?.en?.[key] ?? (en as Record<string, string>)[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.replaceAll(`{${k}}`, String(v))
        }
      }
      return out
    }

    const n: I18nValue['n'] = (value, options) =>
      new Intl.NumberFormat(locale === 'ar-OM' ? 'ar-OM-u-nu-latn' : locale, options).format(value)

    return {
      lang,
      dir,
      isRtl: dir === 'rtl',
      setLang,
      toggleLang,
      t,
      bl: (value) => (value ? value[lang] : ''),
      n,
      money: (value, opts) => {
        const num = n(value, {
          minimumFractionDigits: opts?.decimals ? 3 : 0,
          maximumFractionDigits: opts?.decimals ? 3 : 0,
        })
        return lang === 'ar' ? `${num} ر.ع` : `OMR ${num}`
      },
      date: (iso, options) =>
        new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          ...options,
        }).format(new Date(iso)),
      dateRange: (fromIso, toIso) => {
        const from = new Date(fromIso)
        const to = new Date(toIso)
        const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
          new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', opts).format(d)
        const sameMonth =
          from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
        return sameMonth
          ? `${fmt(from, { day: 'numeric' })}–${fmt(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
          : `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
      },
    }
  }, [lang, dir, setLang, toggleLang, extra])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

