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
