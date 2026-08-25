import type { Wilayah } from '@/types'
import { projectPoint } from './omanOutline'

/**
 * Omani wilayat covered by the NASEK prototype.
 *
 * `lat`/`lng` are real decimal-degree coordinates. The map projects them with
 * `projectPoint` — the same transform that produced the coastline in
 * `omanOutline.ts` — so a marker is on the map exactly where the wilayah is on
 * the ground, and distances between them are genuine.
 */
export const WILAYAT: Wilayah[] = [
  // --- محافظة مسقط -----------------------------------------------------
  { id: 'muscat', name: { ar: 'مسقط', en: 'Muscat' }, governorate: { ar: 'محافظة مسقط', en: 'Muscat Governorate' }, lat: 23.6139, lng: 58.5922 },
  { id: 'seeb', name: { ar: 'السيب', en: 'Seeb' }, governorate: { ar: 'محافظة مسقط', en: 'Muscat Governorate' }, lat: 23.6703, lng: 58.1891 },
  { id: 'bawshar', name: { ar: 'بوشر', en: 'Bawshar' }, governorate: { ar: 'محافظة مسقط', en: 'Muscat Governorate' }, lat: 23.5859, lng: 58.4 },
  { id: 'muttrah', name: { ar: 'مطرح', en: 'Muttrah' }, governorate: { ar: 'محافظة مسقط', en: 'Muscat Governorate' }, lat: 23.615, lng: 58.5636 },
  { id: 'amerat', name: { ar: 'العامرات', en: 'Al Amerat' }, governorate: { ar: 'محافظة مسقط', en: 'Muscat Governorate' }, lat: 23.5333, lng: 58.4972 },

  // --- محافظة شمال الباطنة ---------------------------------------------
  { id: 'sohar', name: { ar: 'صحار', en: 'Sohar' }, governorate: { ar: 'شمال الباطنة', en: 'North Al Batinah' }, lat: 24.3417, lng: 56.7089 },
  { id: 'shinas', name: { ar: 'شناص', en: 'Shinas' }, governorate: { ar: 'شمال الباطنة', en: 'North Al Batinah' }, lat: 24.7419, lng: 56.4664 },
  { id: 'saham', name: { ar: 'صحم', en: 'Saham' }, governorate: { ar: 'شمال الباطنة', en: 'North Al Batinah' }, lat: 24.1722, lng: 56.8886 },
  { id: 'suwaiq', name: { ar: 'السويق', en: 'Al Suwaiq' }, governorate: { ar: 'شمال الباطنة', en: 'North Al Batinah' }, lat: 23.8492, lng: 57.4383 },

  // --- محافظة جنوب الباطنة ---------------------------------------------
  { id: 'barka', name: { ar: 'بركاء', en: 'Barka' }, governorate: { ar: 'جنوب الباطنة', en: 'South Al Batinah' }, lat: 23.7069, lng: 57.8892 },
  { id: 'rustaq', name: { ar: 'الرستاق', en: 'Al Rustaq' }, governorate: { ar: 'جنوب الباطنة', en: 'South Al Batinah' }, lat: 23.3908, lng: 57.4245 },
  { id: 'nakhal', name: { ar: 'نخل', en: 'Nakhal' }, governorate: { ar: 'جنوب الباطنة', en: 'South Al Batinah' }, lat: 23.3961, lng: 57.8231 },

  // --- محافظة الداخلية / الظاهرة ----------------------------------------
  { id: 'nizwa', name: { ar: 'نزوى', en: 'Nizwa' }, governorate: { ar: 'محافظة الداخلية', en: 'Ad Dakhiliyah' }, lat: 22.9333, lng: 57.5333 },
  { id: 'bahla', name: { ar: 'بهلاء', en: 'Bahla' }, governorate: { ar: 'محافظة الداخلية', en: 'Ad Dakhiliyah' }, lat: 22.9667, lng: 57.3 },
  { id: 'samail', name: { ar: 'سمائل', en: 'Samail' }, governorate: { ar: 'محافظة الداخلية', en: 'Ad Dakhiliyah' }, lat: 23.3, lng: 57.9667 },
  { id: 'ibri', name: { ar: 'عبري', en: 'Ibri' }, governorate: { ar: 'محافظة الظاهرة', en: 'Ad Dhahirah' }, lat: 23.2258, lng: 56.5158 },

  // --- محافظتا شمال وجنوب الشرقية ---------------------------------------
  { id: 'ibra', name: { ar: 'إبراء', en: 'Ibra' }, governorate: { ar: 'شمال الشرقية', en: 'North Ash Sharqiyah' }, lat: 22.6906, lng: 58.5334 },
  { id: 'sur', name: { ar: 'صور', en: 'Sur' }, governorate: { ar: 'جنوب الشرقية', en: 'South Ash Sharqiyah' }, lat: 22.5667, lng: 59.5289 },

  // --- محافظة ظفار ------------------------------------------------------
  { id: 'salalah', name: { ar: 'صلالة', en: 'Salalah' }, governorate: { ar: 'محافظة ظفار', en: 'Dhofar' }, lat: 17.0197, lng: 54.0897 },
  { id: 'thumrait', name: { ar: 'ثمريت', en: 'Thumrait' }, governorate: { ar: 'محافظة ظفار', en: 'Dhofar' }, lat: 17.6667, lng: 54.0333 },

  // --- محافظة مسندم ----------------------------------------------------
  { id: 'khasab', name: { ar: 'خصب', en: 'Khasab' }, governorate: { ar: 'محافظة مسندم', en: 'Musandam' }, lat: 26.1794, lng: 56.2437 },

  // --- محافظة الوسطى ---------------------------------------------------
  { id: 'haima', name: { ar: 'هيما', en: 'Haima' }, governorate: { ar: 'محافظة الوسطى', en: 'Al Wusta' }, lat: 19.9591, lng: 56.2769 },
]

export const wilayahById = (id: string): Wilayah | undefined =>
  WILAYAT.find((w) => w.id === id)

export const wilayahName = (id: string, lang: 'ar' | 'en'): string =>
  wilayahById(id)?.name[lang] ?? id

/** A wilayah's position in the map's viewBox space. */
export function wilayahPoint(wilayah: Wilayah): { x: number; y: number } {
  return projectPoint(wilayah.lat, wilayah.lng)
}

/** Wilayat grouped by governorate, for the filter panel's collapsible list. */
export function wilayatByGovernorate(lang: 'ar' | 'en') {
  const groups = new Map<string, Wilayah[]>()
  for (const w of WILAYAT) {
    const key = w.governorate[lang]
    const list = groups.get(key)
    if (list) list.push(w)
    else groups.set(key, [w])
  }
  return [...groups.entries()]
}

const EARTH_RADIUS_KM = 6371
const toRad = (deg: number) => (deg * Math.PI) / 180

/**
 * Great-circle distance between two wilayat, in kilometres.
 *
 * Used by Smart Match to score "how close does this campaign depart from me".
 * It is straight-line, not driving distance — Oman's mountains mean the road
 * can be considerably longer — but it ranks departure points correctly, which
 * is all the score needs.
 */
export function approxDistanceKm(aId: string, bId: string): number {
  const a = wilayahById(aId)
  const b = wilayahById(bId)
  if (!a || !b) return 400

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))))
}
