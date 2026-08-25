import type { ServiceKey } from '@/types'
import { WILAYAT } from '@/data/geo'

/**
 * Bilingual lexicon backing the natural-language search and the assistant.
 *
 * Everything here is deliberately data, not code: adding a dialect word or a
 * new service synonym is a one-line change, and the same tables are reused by
 * `nlSearch.ts` and `assistant.ts` so the two never disagree about what a
 * word means.
 */

/**
 * Strip Arabic diacritics, normalise alef/ya/ta-marbuta, fold case, and
 * replace punctuation with spaces.
 *
 * The punctuation step matters more than it looks: people end questions with
 * "?" or "؟", and without this a phrase match for "how do i book" silently
 * fails on "how do i book?" — the question mark sits where the word boundary
 * is expected.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[‎‏]/g, '')
    .replace(/[?!.,;:؟،؛"'`«»()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Convert Arabic-Indic and Eastern digits to ASCII so numbers can be parsed. */
export function latinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0)
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - base)
  })
}

export const prepare = (text: string) => normalise(latinDigits(text))

// ---------------------------------------------------------------- trip type

export const TYPE_WORDS = {
  umrah: ['عمره', 'عمرة', 'معتمر', 'umrah', 'umra', 'omra'],
  hajj: ['حج', 'حجه', 'حاج', 'حجاج', 'hajj', 'haj', 'hadj'],
} as const

// ------------------------------------------------------------ travel method

export const METHOD_WORDS = {
  land: ['بري', 'بريه', 'باص', 'حافله', 'باصات', 'بالسياره', 'سياره', 'land', 'bus', 'coach', 'road', 'drive', 'driving'],
  air: ['جوي', 'جويه', 'طيران', 'طياره', 'بالطياره', 'مطار', 'air', 'flight', 'fly', 'flying', 'plane', 'airplane'],
} as const

// ------------------------------------------------------------------ wilayat

/** Wilayah id → every spelling users might type, in both languages. */
export const WILAYAH_ALIASES: Record<string, string[]> = {
  muscat: ['مسقط', 'muscat', 'masqat'],
  seeb: ['السيب', 'سيب', 'seeb', 'as seeb', 'al seeb'],
  bawshar: ['بوشر', 'bawshar', 'bausher', 'bousher'],
  muttrah: ['مطرح', 'muttrah', 'mutrah', 'matrah'],
  amerat: ['العامرات', 'عامرات', 'amerat', 'al amerat'],
  sohar: ['صحار', 'sohar', 'suhar'],
  shinas: ['شناص', 'shinas'],
  saham: ['صحم', 'saham'],
  suwaiq: ['السويق', 'سويق', 'suwaiq', 'al suwaiq'],
  barka: ['بركاء', 'بركا', 'barka'],
  rustaq: ['الرستاق', 'رستاق', 'rustaq', 'al rustaq'],
  nakhal: ['نخل', 'nakhal', 'nakhl'],
  nizwa: ['نزوى', 'نزوي', 'nizwa', 'nizwah'],
  bahla: ['بهلاء', 'بهلا', 'bahla'],
  samail: ['سمائل', 'سمايل', 'samail', 'sumail'],
  ibri: ['عبري', 'ibri'],
  ibra: ['إبراء', 'ابرا', 'ibra'],
  sur: ['صور', 'sur', 'sour'],
  salalah: ['صلاله', 'صلالة', 'salalah', 'salala'],
  thumrait: ['ثمريت', 'thumrait'],
  khasab: ['خصب', 'khasab'],
  haima: ['هيما', 'haima', 'hayma'],
}

/** Governorate words that widen to several wilayat. */
export const REGION_ALIASES: Record<string, string[]> = {
  'الباطنه': ['sohar', 'shinas', 'saham', 'suwaiq', 'barka', 'rustaq', 'nakhal'],
  batinah: ['sohar', 'shinas', 'saham', 'suwaiq', 'barka', 'rustaq', 'nakhal'],
  'الداخليه': ['nizwa', 'bahla', 'samail'],
  dakhiliyah: ['nizwa', 'bahla', 'samail'],
  'الشرقيه': ['ibra', 'sur'],
  sharqiyah: ['ibra', 'sur'],
  'ظفار': ['salalah', 'thumrait'],
  dhofar: ['salalah', 'thumrait'],
  'مسندم': ['khasab'],
  musandam: ['khasab'],
}

// ------------------------------------------------------------------- months

/** Month index (0-based) → the names users type for it. */
export const MONTH_WORDS: { month: number; words: string[] }[] = [
  { month: 0, words: ['يناير', 'كانون الثاني', 'january', 'jan'] },
  { month: 1, words: ['فبراير', 'شباط', 'february', 'feb'] },
  { month: 2, words: ['مارس', 'اذار', 'march', 'mar'] },
  { month: 3, words: ['ابريل', 'نيسان', 'april', 'apr'] },
  { month: 4, words: ['مايو', 'ايار', 'may'] },
  { month: 5, words: ['يونيو', 'حزيران', 'june', 'jun'] },
  { month: 6, words: ['يوليو', 'تموز', 'july', 'jul'] },
  { month: 7, words: ['اغسطس', 'اب', 'august', 'aug'] },
  { month: 8, words: ['سبتمبر', 'ايلول', 'september', 'sep', 'sept'] },
  { month: 9, words: ['اكتوبر', 'تشرين الاول', 'october', 'oct'] },
  { month: 10, words: ['نوفمبر', 'تشرين الثاني', 'november', 'nov'] },
  { month: 11, words: ['ديسمبر', 'كانون الاول', 'december', 'dec'] },
]

/**
 * Seasons that aren't Gregorian months but are how pilgrims actually think.
 *
 * The "soon" entries are deliberately multi-word. A bare "قريب" would also
 * fire on "قريبة من الحرم" ("close to the Haram"), which is about distance,
 * not timing — and would silently narrow the search to the next three months.
 */
export const SEASON_WORDS = {
  ramadan: ['رمضان', 'رمضاني', 'العشر الاواخر', 'ramadan', 'ramadhan'],
  hajj_season: ['موسم الحج', 'ذو الحجه', 'hajj season'],
  soon: ['اقرب موعد', 'اقرب رحله', 'في اقرب وقت', 'باسرع وقت', 'soon', 'asap', 'earliest', 'next available'],
  winter: ['الشتاء', 'شتاء', 'winter'],
  spring: ['الربيع', 'ربيع', 'spring'],
} as const

// ----------------------------------------------------------------- services

export const SERVICE_WORDS: Record<ServiceKey, string[]> = {
  hotel_makkah: ['فندق', 'سكن', 'فندق مكه', 'سكن مكه', 'اقامه', 'hotel', 'accommodation', 'makkah hotel', 'stay'],
  hotel_madinah: ['المدينه', 'سكن المدينه', 'فندق المدينه', 'madinah', 'medina', 'madina'],
  meals: ['وجبات', 'اكل', 'طعام', 'افطار', 'مأكل', 'ماكل', 'meals', 'food', 'breakfast', 'catering'],
  transport: ['مواصلات', 'نقل', 'تنقل', 'باص داخلي', 'transport', 'transfers', 'transportation'],
  guide: ['مرشد', 'ارشاد', 'مطوف', 'شيخ', 'guide', 'religious guide', 'imam'],
  visa: ['تاشيره', 'فيزا', 'visa'],
  ziyarat: ['زياره', 'زيارات', 'جولات', 'المعالم', 'ziyarat', 'ziyara', 'tours', 'sightseeing'],
  wheelchair: ['كرسي متحرك', 'كراسي', 'عربه', 'wheelchair', 'accessible', 'disabled'],
  women_group: ['نسائيه', 'نساء', 'للنساء', 'مجموعه نسائيه', 'women', 'ladies', 'female group', 'women only'],
  medical: ['طبي', 'طبيه', 'مرافقه طبيه', 'ممرض', 'دكتور', 'صحي', 'medical', 'doctor', 'nurse', 'health'],
  luggage: ['امتعه', 'حقائب', 'شنط', 'luggage', 'baggage'],
  sim_card: ['شريحه', 'خط', 'انترنت', 'sim', 'sim card', 'data'],
}

// ------------------------------------------------------------------- extras

/** Words signalling "I want the cheapest" / "I want the best". */
export const INTENT_WORDS = {
  cheap: ['ارخص', 'رخيص', 'ارخص شي', 'اقتصادي', 'اقتصاديه', 'موفر', 'اقل سعر', 'بسيط', 'cheap', 'cheapest', 'budget', 'affordable', 'lowest price', 'economy'],
  best: ['افضل', 'احسن', 'اعلى تقييم', 'ممتاز', 'فخم', 'best', 'top', 'highest rated', 'premium', 'luxury'],
  near: ['قريب', 'اقرب', 'قريبه من الحرم', 'near', 'nearest', 'close to haram', 'closest'],
  soon: ['اقرب موعد', 'اقرب رحله', 'بسرعه', 'soonest', 'next trip'],
  family: ['عائله', 'عائلي', 'اسره', 'اطفال', 'family', 'children', 'kids'],
  elderly: ['كبار السن', 'والدي', 'والدتي', 'مسن', 'عجوز', 'elderly', 'parents', 'old', 'senior'],
} as const

/** Questions the assistant must decline, per §11 of the brief. */
export const RELIGIOUS_RULING_WORDS = [
  'حكم', 'فتوى', 'يجوز', 'حلال', 'حرام', 'واجب', 'سنه مؤكده', 'كفاره', 'دم',
  'اركان الحج', 'شروط الحج', 'ماذا افعل اذا', 'نسيت التلبيه', 'محظورات الاحرام',
  'fatwa', 'ruling', 'is it permissible', 'halal', 'haram', 'obligatory',
  'pillars of hajj', 'sin', 'expiation',
]

/** Any of `words` present in the prepared text? Returns the matched word. */
export function findWord(text: string, words: readonly string[]): string | null {
  for (const w of words) {
    const needle = normalise(w)
    if (!needle) continue
    // Latin words get word-boundary matching; Arabic relies on substring,
    // since Arabic clitics ("والعمرة", "بمسقط") defeat \b.
    if (/^[a-z\s]+$/.test(needle)) {
      if (new RegExp(`(^|\\s)${needle}(\\s|$)`).test(text)) return w
    } else if (text.includes(needle)) {
      return w
    }
  }
  return null
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Like `findWord`, but the term must start a token.
 *
 * Arabic writes its clitics as prefixes, so plain substring matching is
 * usually what you want ("بمسقط" should match "مسقط"). It breaks badly for
 * short terms: "اب" (August) is a substring of "أبغى" ("I want"), which turned
 * "أبغى عمرة … في ديسمبر" into a search for August. Month names are matched
 * with this instead — a token start, optionally after the definite article.
 */
export function findBoundedWord(text: string, words: readonly string[]): string | null {
  for (const w of words) {
    const needle = normalise(w)
    if (!needle) continue
    const re = new RegExp(`(?:^|[^\\p{L}])(?:ال)?${escapeRe(needle)}(?![\\p{L}])`, 'u')
    if (re.test(text)) return w
  }
  return null
}

/** All wilayah ids mentioned anywhere in the text. */
export function findWilayat(text: string): { ids: string[]; evidence: string } {
  const ids: string[] = []
  let evidence = ''
  for (const [id, aliases] of Object.entries(WILAYAH_ALIASES)) {
    const hit = findWord(text, aliases)
    if (hit && !ids.includes(id)) {
      ids.push(id)
      evidence ||= hit
    }
  }
  if (ids.length === 0) {
    for (const [region, members] of Object.entries(REGION_ALIASES)) {
      if (findWord(text, [region])) {
        for (const m of members) if (!ids.includes(m)) ids.push(m)
        evidence ||= region
        break
      }
    }
  }
  return { ids: ids.filter((id) => WILAYAT.some((w) => w.id === id)), evidence }
}
