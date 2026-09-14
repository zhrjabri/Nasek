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

/**
 * Where a campaign owner stands with NASEK.
 *
 * `verified` is the approved state and keeps its original name because it is
 * the word on the badge a pilgrim sees. `rejected` and `suspended` were added
 * once refusal needed to be distinguishable from "not looked at yet" —
 * `pending` was doing both jobs, and an owner could not tell which one they
 * were in. `unverified` is legacy: nothing writes it, and everything treats it
 * exactly as `pending`.
 */
export type VerificationStatus =
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'suspended'
  | 'unverified'

/**
 * Waiting on a decision from NASEK — the verification queue, exactly.
 *
 * Not the same as "not approved", which is what every count in the admin
 * dashboard used to mean by it. A refused application and a suspended company
 * are also not approved, and neither is waiting for anything: counting them as
 * pending meant the queue badge never reached zero and stopped being read.
 */
export const isPendingProvider = (status: VerificationStatus) =>
  status === 'pending' || status === 'unverified'

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'

/**
 * Where a campaign stands with NASEK.
 *
 * The counterpart of `VerificationStatus`, and it exists for the same reason:
 * approving the *company* was never the same question as approving the trip.
 * An approved owner can still put a price, a hotel and a departure date in
 * front of the public, and until this existed nothing stood between the form
 * and the catalogue.
 *
 *   pending_approval  submitted, invisible to customers, in the admin queue
 *   active            approved; in the public catalogue
 *   rejected          refused, with a reason the owner can read and answer
 *
 * Not the owner's to set. `guard_campaign_moderation` reverts it on insert and
 * update alike, and a material edit to a live trip returns it to the queue —
 * so this field describes what the database decided, never what a form asked
 * for.
 */
export type CampaignStatus = 'pending_approval' | 'active' | 'rejected'

/** Service tags a campaign can include. Kept as a closed union so filters,
 *  campaign detail and the AI layer all speak the same vocabulary. */
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
  /**
   * Whether `name` is something the person actually gave us.
   *
   * A pilgrim registers with an address and nothing else, so `name` is
   * initially derived from that address — good enough to greet somebody by,
   * and not good enough to write onto a booking or to prefill a form as
   * though they had typed it. Anything that asks a person to confirm their
   * own name checks this first; everything that merely *displays* one does
   * not have to care.
   */
  nameIsPlaceholder?: boolean
  email: string
  phone: string
  role: Role
  /** Wilayah id — see `data/geo.ts`. */
  wilayahId: string
  avatarColor: string
  /** Set for role === 'provider' */
  providerId?: string
  createdAt: string
  /**
   * Moderation, as the database records it.
   *
   * Optional because the offline prototype has no row to read them from and
   * keeps the same decisions in its own store instead. Where a row does exist
   * these are the authority: an account suspended from another browser, or by
   * another administrator, is suspended here too — which the local-only lists
   * could never say.
   *
   * Nobody is signed in while either is true; `loadSession` refuses the session
   * outright. They are carried so the administration directory can *show* a
   * barred account and offer to restore it.
   */
  suspended?: boolean
  removed?: boolean
  /**
   * The account holder's own nationality.
   *
   * On the profile because a returning pilgrim should not retype it on every
   * booking; *also* on each `Traveller` because a booking may be for family of
   * another nationality, and the booking is the record that has to be right.
   * The profile prefills the form; it never overrides it.
   */
  nationality?: string
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
  /** Monogram shown when the company has no logo. */
  initials: string
  brandColor: string
  /**
   * The company's own logo, as an object path in the public `campaign-images`
   * bucket — never a URL, and never the image itself.
   *
   * One logo per company, not one per trip: every campaign this company runs
   * draws it. Undefined means the company has not uploaded one, and every
   * surface falls back to the `initials` monogram above rather than to a
   * stand-in image. See `20260911000100`.
   */
  logoPath?: string
  /** Business model: provider's plan on NASEK. */
  plan: 'basic' | 'plus' | 'premium'
  joinedAt: string
  /**
   * The permit/licence the owner uploaded at registration, as a data URL.
   * Downscaled before it is stored — see `lib/imageFile.ts` — because the
   * whole store is persisted to localStorage and a raw phone photo would
   * blow the quota on its own.
   */
  licenceImage?: string
  /** Original file name, shown to the admin next to the image. */
  licenceFileName?: string
  /**
   * Object path in the private `provider-licences` bucket.
   *
   * Not a URL, and deliberately: the bucket is private, so the only way to see
   * the file is a signed URL minted per view and valid for minutes. Storing a
   * URL would mean storing one that stops working.
   */
  licencePath?: string
  /**
   * The MIME type of the uploaded permit.
   *
   * Carried because the review dialog has to choose between an `<img>` and an
   * embedded PDF viewer. Guessing from the file extension is how an official
   * licence submitted as a PDF renders as a broken image icon on the one screen
   * where somebody has to read it.
   */
  licenceMime?: string
  /** An administrator's reason for refusing or suspending. Shown to the owner. */
  rejectionReason?: string
  /** When the current application entered the queue. Resets on resubmission. */
  submittedAt?: string

  // ------------------------------------------------ the rest of the application
  /*
   * Everything below is what an administrator actually verifies *with*, and
   * none of it reaches the public catalogue. `providers_public` carries the
   * governorate and stops there: the address, the registration number, the
   * permit number and its expiry are how NASEK checked the company, and
   * publishing them would hand a forger the whole template.
   *
   * All optional, because companies registered before these fields existed have
   * none of them. The registration form is what makes them required going
   * forward; the admin queue is what shows an older row as incomplete.
   */
  /**
   * Governorate, and it is not optional.
   *
   * `not null` in the database as of 20260913000100, non-blank besides, and
   * required by every form that writes a company. Typing it as required is
   * what stops a screen carrying a fallback for a company that cannot exist.
   *
   * `address` used to sit on this line and is gone. The column is still in the
   * database and still holds what two companies typed into it — deleting real
   * data to tidy a form would be a loss — but nothing in NASEK collects it,
   * writes it or shows it any more. Governorate and wilayah are the location of
   * record. See `20260913000100`.
   */
  governorate: string
  commercialRegistration?: string
  /** The number printed on the operating permit, to check against the scan. */
  permitNumber?: string
  /** ISO date. An expired permit is flagged in the queue, never auto-refused. */
  permitExpiry?: string
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
  /**
   * Taken down by an administrator.
   *
   * A real column, and it has to reach the client: the screen holding the
   * "restore" button cannot draw a takedown it was never told about. It used to
   * be absent from this type entirely, so the admin dashboard read moderation
   * out of a local override map instead — which meant a trip suspended from
   * another browser, or in a previous session, showed as live here and the
   * suspended count never left zero.
   *
   * Distinct from `deleted`, which is the owner withdrawing their own trip. An
   * owner must not be able to undo a takedown by republishing.
   */
  suspended: boolean
  /** Withdrawn by its owner. Filtered out of every list, kept for the bookings. */
  deleted: boolean

  /**
   * Where this trip stands with NASEK.
   *
   * Distinct from `suspended` in the way "not yet published" is distinct from
   * "taken down": a pending campaign has never been public, and a suspended one
   * was. Both are invisible to a pilgrim; only one of them is the owner's cue
   * to wait rather than to ask what went wrong.
   */
  status: CampaignStatus
  /** Why an administrator refused it. Shown to the owner, word for word. */
  rejectionReason?: string
  /** When it last entered the review queue. Reset by a material edit. */
  submittedAt?: string
  /** When an administrator last decided. Absent until one has. */
  reviewedAt?: string

  // --------------------------------------------------------- what is on offer
  /** Last day a pilgrim may register. Never after `departureDate`. */
  registrationDeadline?: string
  /*
   * `excludedServices` ("not included in the price") stood here. It was
   * retired in 20260914000100: no screen asks for it or shows it. The
   * `excluded_services` column is kept with its data and simply not read.
   */
  /**
   * Where the trip leaves from, in the owner's own words — a car park, a gate,
   * a landmark. Required for new trips; trips created before 20260914000100
   * may still have none, and every reader must cope with ''.
   */
  departureLocation: string
  /** The company's office number for this trip, free text. '' when not given. */
  officeNumber: string
  /**
   * Object paths in the public `campaign-images` bucket — never URLs.
   *
   * A path is the durable thing: it survives a project moving domain, and it is
   * what a storage policy is written about. `campaignImageUrl()` turns one into
   * a URL at the moment of rendering.
   */
  images: string[]
  /**
   * What the price includes, typed by the owner — one entry per line of the
   * form's text area. This is what a pilgrim reads.
   *
   * `services` (the fixed keys the Campaigns filter and Smart Match match on)
   * is no longer chosen in the form. A trip created before that change may have
   * keys and no text; `includedServiceLines` shows the keys' labels then, so an
   * older trip never loses its list.
   */
  includedServices: string[]
  /**
   * Who a pilgrim rings about this specific trip. Falls back to the company.
   *
   * A list, because a trip routinely has more than one person on it — the
   * organiser and the group leader, or one number for Muscat and another for
   * Salalah — and the form used to have room for exactly one.
   */
  contactPersons: ContactPerson[]
  /**
   * The single contact this replaces.
   *
   * Kept, and still read wherever `contactPersons` is empty, because campaigns
   * created before the change carry their contact here and there is no reason
   * to make them lose it. Nothing writes these any more.
   *
   * @deprecated Prefer `contactPersons`.
   */
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  /**
   * Terms and conditions, as the owner wrote them.
   *
   * No longer asked for. Kept because campaigns written before the form
   * dropped it still have terms worth showing, and deleting somebody's text to
   * tidy a form is not a trade worth making.
   */
  terms: Bilingual
}

/** A person a pilgrim can ring about a trip. No email: it was asked for, and never used. */
export interface ContactPerson {
  name: string
  phone: string
}

export interface Review {
  id: string
  userId: string
  /**
   * Whoever wrote it, as they are shown.
   *
   * Empty when the reviewer never gave a name; the interface substitutes a
   * neutral label rather than showing a blank byline or inventing one from
   * their email address.
   */
  userName: string
  campaignId: string
  providerId: string
  rating: number
  comment: Bilingual
  date: string
  /**
   * The campaign owner's public answer, where they have given one.
   *
   * Written only by the owner of the campaign under review — enforced by
   * `guard_review_columns`, which also stops them touching the rating or the
   * comment. Empty means unanswered, which is the ordinary case.
   */
  reply: Bilingual
  /** When the reply was written. Absent until there is one. */
  repliedAt?: string
  /**
   * Taken down by an administrator.
   *
   * A real column, carried for the same reason `Campaign.suspended` is: the
   * screen with the "show again" button cannot draw a takedown it was never
   * told about, and reading it out of a local list meant only the browser that
   * made the decision honoured it.
   */
  hidden: boolean
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
  /**
   * The passenger split, as the customer chose it.
   *
   * Optional, and the option is the honest part: bookings taken before the
   * manual-payment workflow have no split recorded, and the column is NULL for
   * them rather than zero. A screen showing `0 male, 0 female` for a booking of
   * three people would be stating something false about a real record, so every
   * reader prints a dash instead. See `20260910000100`.
   */
  maleCount?: number
  femaleCount?: number
  /**
   * Per-head price at the moment of booking — not the campaign's price now.
   *
   * An owner may re-price a trip; an invoice already issued must not change.
   * Undefined for bookings that predate the snapshot, where the only honest
   * answer is that NASEK did not record it.
   */
  pricePerPerson?: number
  contactName: string
  contactPhone: string
  contactEmail: string
  /** What the customer owes the campaign owner: pricePerPerson × travellersCount. */
  totalPrice: number
  status: BookingStatus
  bookingDate: string
  /**
   * When the campaign owner recorded payment — and therefore when the seats
   * actually left the trip.
   *
   * Undefined until then, and undefined forever on a booking that is cancelled
   * or expires unpaid. Not the same thing as `bookingDate`, which is when the
   * request was made: under the manual-payment workflow those can be days
   * apart, and the gap between them is precisely the period in which the seats
   * were *not* held. See `20260913000100`.
   */
  confirmedAt?: string
  notes?: string
}

/**
 * Which of the three applications a notification belongs in.
 *
 * Not the same question as `userId`, and conflating them is what put "تم
 * اعتماد حملتك" in a Customer Dashboard. One profile is one person, and that
 * person may be both a pilgrim and a company owner; `userId` says whose row it
 * is, and this says which of their two inboxes it belongs to.
 */
export type NotificationAudience = 'customer' | 'owner' | 'admin'

export interface Notification {
  id: string
  userId: string
  title: Bilingual
  body: Bilingual
  date: string
  read: boolean
  kind: 'booking' | 'trip' | 'availability' | 'system'
  audience: NotificationAudience
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
