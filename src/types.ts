/**
 * NASEK domain model.
 *
 * Every user-visible string that comes from data is bilingual (`Bilingual`),
 * so the language switch changes real content — not just the chrome.
 * These shapes map 1:1 onto the tables a real backend would expose
 * (see `docs/DATA-MODEL.md`).
 */

export type Lang = 'ar' | 'en'

export interface Bilingual {
  ar: string
  en: string
}

export type Role = 'customer' | 'provider' | 'admin'

/** Trip kind. The whole platform is organised around this split. */
export type CampaignType = 'hajj' | 'umrah'

/** Travel route — mirrors the original plan's "مسار جوي أو بري". */
export type TravelMethod = 'air' | 'land'

export type VerificationStatus = 'verified' | 'pending' | 'unverified'

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'

/** Service tags a campaign can include. Kept as a closed union so filters,
 *  comparison rows and the AI layer all speak the same vocabulary. */
export type ServiceKey =
  | 'hotel_makkah'
  | 'hotel_madinah'
  | 'meals'
  | 'transport'
  | 'guide'
  | 'visa'
  | 'ziyarat'
  | 'wheelchair'
  | 'women_group'
  | 'medical'
  | 'luggage'
  | 'sim_card'

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  /** Wilayah id — see `data/geo.ts`. */
  wilayahId: string
  avatarColor: string
  /** Set for role === 'provider' */
  providerId?: string
  createdAt: string
}

export interface Provider {
  id: string
  name: Bilingual
  /** Short marketing line shown on the campaign card. */
  tagline: Bilingual
  description: Bilingual
  wilayahId: string
  verification: VerificationStatus
  /** Years the campaign has been operating — the original plan calls this out. */
  experienceYears: number
  rating: number
  reviewCount: number
  phone: string
  email: string
  /** Monogram shown in place of a logo file. */
  initials: string
  brandColor: string
  /** Business model: provider's plan on NASEK. */
  plan: 'basic' | 'plus' | 'premium'
  joinedAt: string
}

export interface Campaign {
  id: string
  providerId: string
  type: CampaignType
  title: Bilingual
  description: Bilingual
  /** Price per traveller, in Omani Rial. */
  price: number
  /** Departure wilayah id. */
  wilayahId: string
  travelMethod: TravelMethod
  departureDate: string // ISO date
  returnDate: string // ISO date
  seatsTotal: number
  seatsAvailable: number
  services: ServiceKey[]
  hotelMakkah: Bilingual
  hotelMadinah: Bilingual
  /** Distance from the Haram in metres — a real differentiator for pilgrims. */
  haramDistanceM: number
  rating: number
  reviewCount: number
  featured: boolean
  bookingsCount: number
}

export interface Review {
  id: string
  userId: string
  userName: string
  campaignId: string
  providerId: string
  rating: number
  comment: Bilingual
  date: string
}

export interface Traveller {
  name: string
  nationality: string
  gender: 'male' | 'female'
  /** Civil ID / passport number — required by the original registration flow. */
  civilId: string
  passportNo: string
  /** Non-Omani travellers additionally need residence + sponsor details. */
  residenceNo?: string
  sponsorName?: string
}

export interface Booking {
  id: string
  reference: string
  userId: string
  campaignId: string
  travellers: Traveller[]
  travellersCount: number
  contactName: string
  contactPhone: string
  contactEmail: string
  totalPrice: number
  status: BookingStatus
  bookingDate: string
  notes?: string
}

export interface Notification {
  id: string
  userId: string
  title: Bilingual
  body: Bilingual
  date: string
  read: boolean
  kind: 'booking' | 'trip' | 'availability' | 'system'
}

export interface Wilayah {
  id: string
  name: Bilingual
  governorate: Bilingual
  /** Real geographic coordinates, in decimal degrees. */
  lat: number
  lng: number
}

/** Search state shared by the filter panel, the URL and the AI parser. */
export interface SearchFilters {
  query: string
  type: CampaignType | 'all'
  wilayahIds: string[]
  priceMin: number
  priceMax: number
  travelMethod: TravelMethod | 'all'
  dateFrom: string | null
  dateTo: string | null
  minRating: number
  minSeats: number
  services: ServiceKey[]
  travellers: number
}

export type SortKey =
  | 'recommended'
  | 'price_asc'
  | 'price_desc'
  | 'rating'
  | 'popular'
  | 'seats'
