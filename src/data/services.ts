import type { Bilingual, ServiceKey } from '@/types'

/** The closed vocabulary of campaign services, shared by filters,
 *  campaign detail and the AI layer. */
export const SERVICES: Record<ServiceKey, { label: Bilingual; icon: string }> = {
  hotel_makkah: { label: { ar: 'سكن في مكة', en: 'Makkah accommodation' }, icon: 'BedDouble' },
  hotel_madinah: { label: { ar: 'سكن في المدينة', en: 'Madinah accommodation' }, icon: 'Building2' },
  meals: { label: { ar: 'وجبات', en: 'Meals included' }, icon: 'UtensilsCrossed' },
  transport: { label: { ar: 'مواصلات داخلية', en: 'Internal transport' }, icon: 'Bus' },
  guide: { label: { ar: 'مرشد ديني', en: 'Religious guide' }, icon: 'BookOpen' },
  visa: { label: { ar: 'إجراءات التأشيرة', en: 'Visa processing' }, icon: 'FileCheck2' },
  ziyarat: { label: { ar: 'جولات الزيارة', en: 'Ziyarat tours' }, icon: 'Landmark' },
  wheelchair: { label: { ar: 'خدمة كراسي متحركة', en: 'Wheelchair support' }, icon: 'Accessibility' },
  women_group: { label: { ar: 'مجموعة نسائية', en: 'Women-only group' }, icon: 'Users' },
  medical: { label: { ar: 'مرافقة طبية', en: 'Medical support' }, icon: 'HeartPulse' },
  luggage: { label: { ar: 'خدمة الأمتعة', en: 'Luggage handling' }, icon: 'Luggage' },
  sim_card: { label: { ar: 'شريحة اتصال', en: 'Local SIM card' }, icon: 'Smartphone' },
}

export const SERVICE_KEYS = Object.keys(SERVICES) as ServiceKey[]

export const serviceLabel = (key: ServiceKey, lang: 'ar' | 'en') =>
  SERVICES[key]?.label[lang] ?? key

// ------------------------------------------------ what a trip includes, as text

/**
 * The longest "included services" text the owner's form accepts. Generous: a
 * full list with a line of detail each.
 */
export const INCLUDED_SERVICES_MAX_LENGTH = 4000

const comparable = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

/** The owner's text area, as stored: one entry per non-blank line, trimmed. */
export function parseIncludedServices(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * What a pilgrim reads under "Included services", one line each.
 *
 * The owner's typed lines, preceded by the label of any fixed service key the
 * trip still carries that the typed lines do not already say. For a trip
 * created since the form became free text there are no keys and this is just
 * what the owner wrote. For an older trip it is exactly the list it always
 * showed — keys first, then the extras — and once its owner saves it in the new
 * form the keys' labels are part of the text, so nothing appears twice.
 */
export function includedServiceLines(
  campaign: { services: ServiceKey[]; includedServices: string[] },
  lang: 'ar' | 'en',
): string[] {
  const typed = campaign.includedServices.map((line) => line.trim()).filter(Boolean)
  const said = new Set(typed.map(comparable))
  const legacy = campaign.services
    .filter((key) => SERVICES[key])
    .filter((key) => !said.has(comparable(SERVICES[key].label.ar)) && !said.has(comparable(SERVICES[key].label.en)))
    .map((key) => serviceLabel(key, lang))
  return [...legacy, ...typed]
}

/**
 * The fixed keys an edited trip keeps.
 *
 * The form no longer offers the keys, but the Campaigns filter and Smart Match
 * still match on them. A key survives an edit only while its label is still one
 * of the owner's lines — delete "Meals included" from the text and the trip
 * stops matching the meals filter too, rather than claiming a service its own
 * page no longer lists. A new trip has none.
 */
export function servicesStillListed(keys: ServiceKey[], lines: string[]): ServiceKey[] {
  const said = new Set(lines.map(comparable))
  return keys.filter(
    (key) =>
      SERVICES[key] &&
      (said.has(comparable(SERVICES[key].label.ar)) || said.has(comparable(SERVICES[key].label.en))),
  )
}
