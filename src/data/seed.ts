import type { Booking, BookingStatus, Notification } from '@/types'
import { CAMPAIGNS } from './campaigns'
import { WILAYAT } from './geo'

/**
 * Deterministic pseudo-random source.
 *
 * The provider and admin dashboards need a realistic volume of historical
 * bookings for their charts. Hand-writing 200 rows would be noise, and
 * `Math.random()` would make the charts jump on every reload — so we derive
 * them from a fixed seed instead. Same seed, same demo, every time.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST_NAMES = [
  'أحمد', 'محمد', 'سالم', 'خالد', 'يوسف', 'عبدالله', 'ناصر', 'سعيد', 'حمد', 'إبراهيم',
  'مريم', 'فاطمة', 'زينب', 'هدى', 'أمل', 'رقية', 'شيخة', 'بدرية', 'عائشة', 'نورة',
]
const LAST_NAMES = [
  'الحارثي', 'البلوشي', 'الرواحي', 'الكندي', 'الغافري', 'اللواتي', 'السيابي', 'المعمري',
  'الهنائي', 'الشحي', 'الجابري', 'التوبي', 'الفارسي', 'الرشيدي', 'البوسعيدي', 'العبري',
]

const pick = <T,>(rnd: () => number, arr: T[]): T => arr[Math.floor(rnd() * arr.length)]

/** Today, fixed at module load so the whole session agrees on "now". */
export const NOW = new Date()

function isoDaysAgo(days: number) {
  const d = new Date(NOW)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * ~240 historical bookings spread over the last 12 months, weighted towards
 * each campaign's popularity so the "most popular trips" chart is meaningful.
 */
function generateBookings(): Booking[] {
  const rnd = mulberry32(19_022_026)
  const out: Booking[] = []
  let n = 1000

  for (const campaign of CAMPAIGNS) {
    // Between 8 and 22 historical bookings per campaign, scaled by popularity.
    const count = 8 + Math.round((campaign.bookingsCount / 320) * 14)
    for (let i = 0; i < count; i++) {
      const travellers = 1 + Math.floor(rnd() * 4)
      const daysAgo = Math.floor(rnd() * 360)
      const departure = new Date(campaign.departureDate)
      const past = departure.getTime() < NOW.getTime()
      const roll = rnd()
      const status: BookingStatus = past
        ? roll < 0.9
          ? 'completed'
          : 'cancelled'
        : roll < 0.75
          ? 'confirmed'
          : roll < 0.92
            ? 'pending'
            : 'cancelled'

      const name = `${pick(rnd, FIRST_NAMES)} ${pick(rnd, LAST_NAMES)}`
      n += 1
      out.push({
        id: `b${n}`,
        reference: `NSK-${n}`,
        userId: `u${100 + Math.floor(rnd() * 180)}`,
        campaignId: campaign.id,
        travellers: [],
        travellersCount: travellers,
        contactName: name,
        contactPhone: `+968 9${Math.floor(1000000 + rnd() * 8999999)}`,
        contactEmail: `pilgrim${n}@example.com`,
        totalPrice: travellers * campaign.price,
        status,
        bookingDate: isoDaysAgo(daysAgo),
        notes: pick(rnd, WILAYAT).id,
      })
    }
  }
  return out.sort((a, b) => b.bookingDate.localeCompare(a.bookingDate))
}

/** Platform-wide historical bookings (all providers). Read-only demo history. */
export const SEED_BOOKINGS: Booking[] = generateBookings()

/**
 * The demo customer starts with no bookings: the two seeded ones referenced
 * sample campaigns that no longer exist.
 */
export const DEMO_CUSTOMER_BOOKINGS: Booking[] = []

export const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    userId: 'u1',
    kind: 'booking',
    title: { ar: 'تم تأكيد حجزك', en: 'Your booking is confirmed' },
    body: {
      ar: 'أكدت حملة نور الطريق حجزك رقم NSK-240118 لرحلة العمرة الجوية العائلية.',
      en: 'Nour Al Tareeq confirmed booking NSK-240118 for the Family Air Umrah trip.',
    },
    date: isoDaysAgo(22),
    read: false,
  },
  {
    id: 'n2',
    userId: 'u1',
    kind: 'availability',
    title: { ar: 'المقاعد على وشك النفاد', en: 'Seats are running out' },
    body: {
      ar: 'بقيت 3 مقاعد فقط في «عمرة العشر الأواخر من رمضان» التي حفظتها.',
      en: 'Only 3 seats remain in "Last Ten Nights of Ramadan Umrah", which you saved.',
    },
    date: isoDaysAgo(3),
    read: false,
  },
  {
    id: 'n3',
    userId: 'u1',
    kind: 'trip',
    title: { ar: 'اقترب موعد رحلتك', en: 'Your trip is approaching' },
    body: {
      ar: 'تنطلق رحلتك بعد أقل من شهر. تأكد من سريان جواز السفر لمدة 6 أشهر على الأقل.',
      en: 'Your trip departs in under a month. Make sure your passport is valid for at least 6 months.',
    },
    date: isoDaysAgo(1),
    read: true,
  },
]
