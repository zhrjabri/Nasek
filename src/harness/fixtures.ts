/**
 * Mock data for the visual harness. Nothing here ships.
 *
 * The demo arrays in `src/data/` are empty — every trip on NASEK is one an
 * owner published — so a harness that wants to *see* a populated owner table
 * or an administration approval queue has to bring its own rows. These are
 * shaped by the real types in `src/types.ts`, so they go stale loudly rather
 * than quietly: add a required field and this file stops compiling.
 *
 * No Supabase, no service-role key, no production data, and no writes. The
 * harness builds with `--mode harness`, which blanks the connection entirely
 * (see `.env.harness`), so there is nothing for a write to reach even if a
 * button tried.
 */
import type {
  Booking,
  Campaign,
  ContactPerson,
  Provider,
  Review,
  User,
} from '@/types'

const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

const CONTACT: ContactPerson[] = [
  { name: 'سالم بن راشد', phone: '+968 9123 4567' },
]

export const PROVIDERS: Provider[] = [
  {
    id: 'p1',
    name: { ar: 'حملة الجابري', en: 'Al Jabri Campaign' },
    tagline: { ar: 'رفقة مطمئنة إلى بيت الله', en: 'A calm road to the House of God' },
    description: { ar: 'حملة عُمانية تعمل منذ عشر سنوات.', en: 'An Omani campaign, ten years running.' },
    wilayahId: 'muscat',
    governorate: 'Muscat Governorate',
    verification: 'verified',
    experienceYears: 10,
    rating: 4.7,
    reviewCount: 128,
    phone: '+968 2400 0000',
    email: 'aljabri@example.om',
    initials: 'ج',
    brandColor: '#244a3f',
    plan: 'premium',
    joinedAt: day(-900),
  },
  {
    id: 'p2',
    // The queue's reason for existing: an application waiting on a decision.
    name: { ar: 'حملة النهضة', en: 'Al Nahda Campaign' },
    tagline: { ar: 'خدمة تليق بالضيف', en: 'Service worthy of the guest' },
    description: { ar: 'طلب توثيق قيد المراجعة.', en: 'Verification pending review.' },
    wilayahId: 'sohar',
    governorate: 'North Al Batinah',
    verification: 'pending',
    experienceYears: 3,
    rating: 0,
    reviewCount: 0,
    phone: '+968 2400 1111',
    email: 'nahda@example.om',
    initials: 'ن',
    brandColor: '#37806a',
    plan: 'basic',
    joinedAt: day(-40),
  },
  {
    id: 'p3',
    // Suspended, so the harness can show `استعادة` next to `إيقاف`.
    name: { ar: 'حملة الوفاء', en: 'Al Wafa Campaign' },
    tagline: { ar: 'موقوفة مؤقتًا', en: 'Temporarily suspended' },
    description: { ar: 'أوقفت بعد شكاوى.', en: 'Suspended after complaints.' },
    wilayahId: 'nizwa',
    governorate: 'Ad Dakhiliyah',
    verification: 'suspended',
    experienceYears: 6,
    rating: 3.1,
    reviewCount: 22,
    phone: '+968 2400 2222',
    email: 'wafa@example.om',
    initials: 'و',
    brandColor: '#96762f',
    plan: 'plus',
    joinedAt: day(-500),
  },
]

const baseCampaign = (over: Partial<Campaign> & Pick<Campaign, 'id' | 'status'>): Campaign => ({
  providerId: 'p1',
  type: 'umrah',
  title: { ar: 'عمرة رمضان — ١٤ ليلة', en: 'Ramadan Umrah — 14 nights' },
  description: { ar: 'رحلة مباشرة من مسقط مع إقامة قريبة من الحرم.', en: 'Direct from Muscat, close to the Haram.' },
  price: 420,
  wilayahId: 'muscat',
  travelMethod: 'air',
  departureDate: day(60),
  returnDate: day(74),
  seatsTotal: 40,
  seatsAvailable: 12,
  services: ['visa', 'transport', 'hotel_makkah'],
  hotelMakkah: { ar: 'فندق الصفوة', en: 'Al Safwa Hotel' },
  hotelMadinah: { ar: 'فندق الحرم', en: 'Haram Hotel' },
  haramDistanceM: 320,
  rating: 4.6,
  reviewCount: 31,
  featured: false,
  bookingsCount: 28,
  suspended: false,
  deleted: false,
  images: [],
  includedServices: ['تأشيرة العمرة', 'النقل من المطار وإليه', 'سكن قريب من الحرم'],
  departureLocation: 'مواقف جامع السلطان قابوس الأكبر – البوابة الجنوبية، مسقط',
  officeNumber: 'مكتب 5 - الدور الثاني',
  contactPersons: CONTACT,
  terms: { ar: 'يُسترد المبلغ حتى ٣٠ يومًا قبل السفر.', en: 'Refundable up to 30 days before travel.' },
  ...over,
})

export const CAMPAIGNS: Campaign[] = [
  baseCampaign({ id: 'c1', status: 'active', featured: true }),
  // The approval queue is the administration's whole reason for existing, so
  // the harness has to show one waiting on a decision.
  baseCampaign({
    id: 'c2',
    status: 'pending_approval',
    title: { ar: 'حج ١٤٤٧ — البر', en: 'Hajj 1447 — by land' },
    type: 'hajj',
    travelMethod: 'land',
    price: 1180,
    providerId: 'p2',
  }),
  baseCampaign({
    id: 'c3',
    status: 'rejected',
    title: { ar: 'عمرة شعبان — ٧ ليالٍ', en: 'Shaaban Umrah — 7 nights' },
    price: 260,
    providerId: 'p1',
  }),
  baseCampaign({
    id: 'c4',
    status: 'active',
    suspended: true,
    title: { ar: 'عمرة الصيف — ١٠ ليالٍ', en: 'Summer Umrah — 10 nights' },
    price: 330,
    providerId: 'p3',
  }),
]

export const OWNER: User = {
  id: 'owner-1',
  name: 'سالم الجابري',
  email: 'owner@example.om',
  phone: '+968 9123 4567',
  role: 'provider',
  wilayahId: 'muscat',
  avatarColor: '#244a3f',
  providerId: 'p1',
  createdAt: day(-900),
}

export const ADMIN: User = {
  id: 'admin-1',
  name: 'إدارة ناسِك',
  email: 'admin@example.om',
  phone: '+968 9000 0000',
  role: 'admin',
  wilayahId: 'muscat',
  avatarColor: '#0c241d',
  createdAt: day(-1200),
}

export const PILGRIM: User = {
  id: 'u9',
  name: 'أحمد البلوشي',
  email: 'ahmed@example.om',
  phone: '+968 9555 0000',
  role: 'customer',
  wilayahId: 'muscat',
  avatarColor: '#37806a',
  createdAt: day(-120),
}

const TRAVELLER = (name: string, gender: 'male' | 'female', civilId: string) => ({
  name,
  nationality: 'عُماني',
  gender,
  civilId,
  passportNo: 'P' + civilId,
})

export const BOOKINGS: Booking[] = [
  {
    id: 'b1',
    reference: 'NSK-4821',
    userId: 'u9',
    campaignId: 'c1',
    travellers: [TRAVELLER('أحمد البلوشي', 'male', '1234567')],
    travellersCount: 1,
    contactName: 'أحمد البلوشي',
    contactPhone: '+968 9555 0000',
    contactEmail: 'ahmed@example.om',
    totalPrice: 420,
    status: 'confirmed',
    bookingDate: day(-10),
  },
  {
    id: 'b2',
    reference: 'NSK-4822',
    userId: 'u9',
    campaignId: 'c1',
    travellers: [
      TRAVELLER('مريم البلوشية', 'female', '7654321'),
      TRAVELLER('خالد البلوشي', 'male', '7654322'),
    ],
    travellersCount: 2,
    contactName: 'مريم البلوشية',
    contactPhone: '+968 9555 1111',
    contactEmail: 'maryam@example.om',
    totalPrice: 840,
    status: 'pending',
    bookingDate: day(-3),
  },
]

export const REVIEWS: Review[] = [
  {
    id: 'r1',
    campaignId: 'c1',
    userId: 'u9',
    userName: 'أحمد البلوشي',
    rating: 5,
    comment: { ar: 'تنظيم ممتاز وقرب من الحرم.', en: 'Excellent organisation, close to the Haram.' },
    date: day(-20),
    providerId: 'p1',
    reply: { ar: '', en: '' },
    hidden: false,
  },
]

export const SNAPSHOT = {
  providers: PROVIDERS,
  campaigns: CAMPAIGNS,
  bookings: BOOKINGS,
  reviews: REVIEWS,
  notifications: [],
  savedIds: [],
  profiles: [OWNER, ADMIN, PILGRIM],
}
