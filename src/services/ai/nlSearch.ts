import type { Lang, SearchFilters, ServiceKey } from '@/types'
import { PRICE_CEILING, PRICE_FLOOR } from '@/data/campaigns'
import { wilayahName } from '@/data/geo'
import { serviceLabel } from '@/data/services'
import {
  INTENT_WORDS,
  METHOD_WORDS,
  MONTH_WORDS,
  SEASON_WORDS,
  SERVICE_WORDS,
  TYPE_WORDS,
  findBoundedWord,
  findWilayat,
  findWord,
  prepare,
} from './lexicon'
import type { NLSearchResult, ParsedFacet } from './types'

/**
 * Natural-language → filters.
 *
 * This is a real parser, not a canned response: it reads Arabic (including
 * Omani dialect forms like "أبغى") and English, handles Arabic-Indic digits,
 * and reports what it extracted with the evidence that produced it — so the
 * user can see and correct every inference before results load.
 *
 * A hosted model would replace this with a structured-output call; the shape
 * it returns (`NLSearchResult`) is designed to be exactly what such a call
 * would produce, so a hosted provider could implement `AIProvider` without the
 * UI changing.
 */
export function parseNaturalQuery(raw: string, lang: Lang): NLSearchResult {
  const text = prepare(raw)
  const filters: Partial<SearchFilters> = {}
  const facets: ParsedFacet[] = []
  const L = (ar: string, en: string) => (lang === 'ar' ? ar : en)

  if (!text) return { filters, facets, empty: true }

  // ------------------------------------------------------------- trip type
  const hajjHit = findWord(text, TYPE_WORDS.hajj)
  const umrahHit = findWord(text, TYPE_WORDS.umrah)
  if (umrahHit && !hajjHit) {
    filters.type = 'umrah'
    facets.push({
      field: 'type',
      label: L('عمرة', 'Umrah'),
      evidence: umrahHit,
      confidence: 1,
    })
  } else if (hajjHit && !umrahHit) {
    filters.type = 'hajj'
    facets.push({ field: 'type', label: L('حج', 'Hajj'), evidence: hajjHit, confidence: 1 })
  }

  // --------------------------------------------------------------- wilayah
  const { ids: wilayahIds, evidence: wilayahEvidence } = findWilayat(text)
  if (wilayahIds.length) {
    filters.wilayahIds = wilayahIds
    facets.push({
      field: 'wilayahIds',
      label:
        wilayahIds.length === 1
          ? L(`المغادرة من ${wilayahName(wilayahIds[0], 'ar')}`, `Departing from ${wilayahName(wilayahIds[0], 'en')}`)
          : L(`${wilayahIds.length} ولايات`, `${wilayahIds.length} wilayat`),
      evidence: wilayahEvidence,
      confidence: 0.95,
    })
  }

  // ---------------------------------------------------------------- budget
  const budget = extractBudget(text)
  if (budget) {
    filters.priceMax = budget.max
    if (budget.min != null) filters.priceMin = budget.min
    facets.push({
      field: 'priceMax',
      label:
        budget.min != null
          ? L(`بين ${budget.min} و${budget.max} ريال`, `Between ${budget.min} and ${budget.max} OMR`)
          : L(`حتى ${budget.max} ريال`, `Up to ${budget.max} OMR`),
      evidence: budget.evidence,
      confidence: budget.confidence,
    })
  } else if (findWord(text, INTENT_WORDS.cheap)) {
    // "cheapest" has no number, but it is a budget signal: cap at the
    // cheaper third of the catalogue rather than inventing a figure.
    const cap = Math.round(PRICE_FLOOR + (PRICE_CEILING - PRICE_FLOOR) * 0.25)
    filters.priceMax = cap
    facets.push({
      field: 'priceMax',
      label: L(`الخيارات الاقتصادية (حتى ${cap} ريال)`, `Budget options (up to ${cap} OMR)`),
      evidence: findWord(text, INTENT_WORDS.cheap) ?? '',
      confidence: 0.55,
    })
  }

  // --------------------------------------------------------- travel method
  const airHit = findWord(text, METHOD_WORDS.air)
  const landHit = findWord(text, METHOD_WORDS.land)
  if (airHit && !landHit) {
    filters.travelMethod = 'air'
    facets.push({ field: 'travelMethod', label: L('مسار جوي', 'By air'), evidence: airHit, confidence: 0.9 })
  } else if (landHit && !airHit) {
    filters.travelMethod = 'land'
    facets.push({ field: 'travelMethod', label: L('مسار بري', 'By land'), evidence: landHit, confidence: 0.9 })
  }

  // ------------------------------------------------------------ travellers
  const travellers = extractTravellers(text)
  if (travellers) {
    filters.travellers = travellers.count
    filters.minSeats = travellers.count
    facets.push({
      field: 'travellers',
      label: L(`${travellers.count} مسافرين`, `${travellers.count} travellers`),
      evidence: travellers.evidence,
      confidence: travellers.confidence,
    })
  }

  // ------------------------------------------------------------------ date
  const window = extractDateWindow(text)
  if (window) {
    filters.dateFrom = window.from
    filters.dateTo = window.to
    facets.push({
      field: 'dateRange',
      label: L(window.labelAr, window.labelEn),
      evidence: window.evidence,
      confidence: window.confidence,
    })
  }

  // -------------------------------------------------------------- services
  const services: ServiceKey[] = []
  let serviceEvidence = ''
  for (const [key, words] of Object.entries(SERVICE_WORDS) as [ServiceKey, string[]][]) {
    const hit = findWord(text, words)
    if (hit) {
      services.push(key)
      serviceEvidence ||= hit
    }
  }
  if (services.length) {
    // Cap at three so one chatty sentence doesn't filter everything away.
    filters.services = services.slice(0, 3)
    facets.push({
      field: 'services',
      label: filters.services.map((s) => serviceLabel(s, lang)).join('، '),
      evidence: serviceEvidence,
      confidence: 0.7,
    })
  }

  // ------------------------------------------------------- quality signals
  if (findWord(text, INTENT_WORDS.best)) {
    filters.minRating = 4.5
    facets.push({
      field: 'minRating',
      label: L('تقييم 4.5 فأعلى', 'Rated 4.5+'),
      evidence: findWord(text, INTENT_WORDS.best) ?? '',
      confidence: 0.65,
    })
  }

  return { filters, facets, empty: facets.length === 0 }
}

// ---------------------------------------------------------------- helpers

/** Numbers followed/preceded by a currency or budget word. */
function extractBudget(text: string): {
  min: number | null
  max: number
  evidence: string
  confidence: number
} | null {
  // "between 300 and 500", "من 300 إلى 500"
  const range = text.match(/(\d{2,5})\s*(?:-|to|الى|و|and)\s*(\d{2,5})/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (a > 20 && b > a && b < 20000) {
      return { min: a, max: b, evidence: range[0], confidence: 0.85 }
    }
  }

  const CURRENCY = /(?:ر\.?ع|ريال|ريالات|omr|rial|rials|ro)/
  const UNDER = /(?:اقل من|تحت|دون|في حدود|بحدود|حوالي|ميزانيتي|ميزانيه|بميزانيه|under|below|less than|max|maximum|budget of|up to|around|about|within)/

  // A number sitting next to a currency word, in either order.
  const candidates = [
    new RegExp(`(\\d{2,5})\\s*${CURRENCY.source}`),
    new RegExp(`${CURRENCY.source}\\s*(\\d{2,5})`),
    new RegExp(`${UNDER.source}\\s*(\\d{2,5})`),
    new RegExp(`(\\d{2,5})\\s*${UNDER.source}`),
  ]
  for (const re of candidates) {
    const m = text.match(re)
    if (m) {
      const value = Number(m[1])
      // Reject values that are obviously a year or a traveller count.
      if (value >= 40 && value <= 20000 && !/^20\d\d$/.test(m[1])) {
        return { min: null, max: value, evidence: m[0], confidence: 0.9 }
      }
    }
  }
  return null
}

const PEOPLE_WORDS = /(?:اشخاص|شخص|افراد|فرد|نفر|معتمرين|حجاج|مسافرين|بالغين|people|persons|adults|travellers|travelers|pax)/

/** "for 2 people", "لشخصين", "عائلة من 5" */
function extractTravellers(text: string): { count: number; evidence: string; confidence: number } | null {
  const dual = text.match(/(?:لشخصين|شخصين|اثنين|نفرين|زوجين|for two|two people|couple)/)
  if (dual) return { count: 2, evidence: dual[0], confidence: 0.9 }

  const patterns = [
    new RegExp(`(\\d{1,2})\\s*${PEOPLE_WORDS.source}`),
    new RegExp(`${PEOPLE_WORDS.source}\\s*(\\d{1,2})`),
    /(?:for|ل)\s*(\d{1,2})\s*(?:people|persons|اشخاص|افراد)/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const n = Number(m[1])
      if (n >= 1 && n <= 20) return { count: n, evidence: m[0], confidence: 0.9 }
    }
  }

  const alone = text.match(/(?:لوحدي|بروحي|شخص واحد|by myself|alone|just me|solo)/)
  if (alone) return { count: 1, evidence: alone[0], confidence: 0.85 }

  return null
}

/** Turn a month or season word into a concrete date window. */
function extractDateWindow(text: string): {
  from: string
  to: string
  labelAr: string
  labelEn: string
  evidence: string
  confidence: number
} | null {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  // --- explicit month --------------------------------------------------
  for (const { month, words } of MONTH_WORDS) {
    // Bounded matching: "اب" (August) is a substring of far too many words.
    const hit = findBoundedWord(text, words)
    if (!hit) continue
    // Pick the next occurrence of that month, honouring an explicit year.
    const yearMatch = text.match(/\b(20\d\d)\b/)
    let year = yearMatch ? Number(yearMatch[1]) : today.getFullYear()
    if (!yearMatch && month < today.getMonth()) year += 1
    const from = new Date(Date.UTC(year, month, 1))
    const to = new Date(Date.UTC(year, month + 1, 0))
    const nameAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][month]
    const nameEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month]
    return {
      from: iso(from),
      to: iso(to),
      labelAr: `${nameAr} ${year}`,
      labelEn: `${nameEn} ${year}`,
      evidence: hit,
      confidence: 0.95,
    }
  }

  // --- seasons ---------------------------------------------------------
  const ramadanHit = findWord(text, SEASON_WORDS.ramadan)
  if (ramadanHit) {
    // Ramadan 1448 ≈ 18 Feb – 19 Mar 2027 for this prototype's calendar.
    return {
      from: '2027-02-15',
      to: '2027-03-22',
      labelAr: 'رمضان 1448',
      labelEn: 'Ramadan 1448',
      evidence: ramadanHit,
      confidence: 0.85,
    }
  }
  const hajjHit = findWord(text, SEASON_WORDS.hajj_season)
  if (hajjHit) {
    return {
      from: '2027-04-25',
      to: '2027-06-05',
      labelAr: 'موسم الحج 1448',
      labelEn: 'Hajj season 1448',
      evidence: hajjHit,
      confidence: 0.85,
    }
  }
  const soonHit = findWord(text, SEASON_WORDS.soon)
  if (soonHit) {
    const to = new Date(today)
    to.setMonth(to.getMonth() + 3)
    return {
      from: iso(today),
      to: iso(to),
      labelAr: 'خلال الأشهر الثلاثة القادمة',
      labelEn: 'In the next three months',
      evidence: soonHit,
      confidence: 0.7,
    }
  }
  return null
}

/** Example queries offered under the smart search box. */
export const EXAMPLE_QUERIES: Record<Lang, string[]> = {
  ar: [
    'أبغى عمرة من مسقط لشخصين بأقل من ٥٠٠ ريال في ديسمبر',
    'أرخص عمرة برية من صحار',
    'حج من نزوى مع مرافقة طبية',
    'عمرة في رمضان قريبة من الحرم',
  ],
  en: [
    'I want an Umrah trip from Muscat for 2 people under 500 OMR in December',
    'Cheapest land Umrah from Sohar',
    'Hajj from Nizwa with medical support',
    'Umrah in Ramadan close to the Haram',
  ],
}
