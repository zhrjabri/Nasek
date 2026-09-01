/**
 * The database, as TypeScript sees it.
 *
 * Every row shape below is a `type` and not an `interface`, which looks like a
 * style choice and is not. Supabase constrains its schema generic to
 * `Record<string, unknown>`; TypeScript gives a type alias an implicit index
 * signature and an interface none, so declaring these as interfaces silently
 * fails that constraint. The client then falls back to `any` for the schema and
 * every `.insert()` and `.update()` argument resolves to `never` — a wall of
 * errors whose message says nothing about the actual cause.
 *
 * Hand-written to match `supabase/migrations/`, rather than generated, for one
 * reason: it is the only place the two halves of NASEK meet, and a mismatch
 * here is a runtime error in production rather than a red squiggle. Keeping it
 * by hand means changing a column forces a decision about the code that reads
 * it. If the schema grows past what one person can hold in their head, replace
 * this file with `supabase gen types typescript` — the shape is identical.
 *
 * Column names are snake_case because Postgres is; the mapping to the camelCase
 * domain types in `src/types.ts` happens in `mappers.ts` and nowhere else, so
 * no component ever has to know which convention it is holding.
 */

export type UserRole = 'customer' | 'provider' | 'admin'
export type CampaignTypeRow = 'hajj' | 'umrah'
export type TravelMethodRow = 'air' | 'land'
export type VerificationStatusRow = 'verified' | 'pending' | 'unverified'
export type BookingStatusRow = 'pending' | 'confirmed' | 'completed' | 'cancelled'
export type ProviderPlanRow = 'basic' | 'plus' | 'premium'
export type NotificationKindRow = 'booking' | 'trip' | 'availability' | 'system'

export type WilayahRow = {
  id: string
  name_ar: string
  name_en: string
  governorate_ar: string
  governorate_en: string
  lat: number
  lng: number
}

export type ProfileRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: UserRole
  wilayah_id: string | null
  avatar_color: string
  provider_id: string | null
  suspended: boolean
  removed: boolean
  created_at: string
}

export type ProviderRow = {
  id: string
  owner_id: string | null
  name_ar: string
  name_en: string
  tagline_ar: string
  tagline_en: string
  description_ar: string
  description_en: string
  wilayah_id: string | null
  verification: VerificationStatusRow
  experience_years: number
  rating: number
  review_count: number
  phone: string | null
  email: string | null
  initials: string
  brand_color: string
  plan: ProviderPlanRow
  joined_at: string
  licence_image: string | null
  licence_file_name: string | null
  verified_by: string | null
  verified_at: string | null
  created_at: string
}

/**
 * What the public site is allowed to see of a campaign owner.
 *
 * The permit scan and the private phone number are absent by construction —
 * this is a view, and the columns simply are not in it. That is a stronger
 * guarantee than remembering to omit them from a select list.
 */
export type ProviderPublicRow = Omit<
  ProviderRow,
  | 'owner_id'
  | 'phone'
  | 'email'
  | 'licence_image'
  | 'licence_file_name'
  | 'verified_by'
  | 'verified_at'
  | 'created_at'
>

export type CampaignRow = {
  id: string
  provider_id: string
  type: CampaignTypeRow
  title_ar: string
  title_en: string
  description_ar: string
  description_en: string
  price: number
  wilayah_id: string | null
  travel_method: TravelMethodRow
  departure_date: string
  return_date: string
  seats_total: number
  seats_available: number
  services: string[]
  hotel_makkah_ar: string
  hotel_makkah_en: string
  hotel_madinah_ar: string
  hotel_madinah_en: string
  haram_distance_m: number
  rating: number
  review_count: number
  featured: boolean
  bookings_count: number
  suspended: boolean
  deleted: boolean
  created_at: string
}

export type BookingRow = {
  id: string
  reference: string
  user_id: string
  campaign_id: string
  travellers_count: number
  contact_name: string
  contact_phone: string
  contact_email: string
  total_price: number
  status: BookingStatusRow
  booking_date: string
  notes: string | null
  created_at: string
}

export type TravellerRow = {
  id: string
  booking_id: string
  name: string
  nationality: string
  gender: 'male' | 'female' | null
  civil_id: string | null
  passport_no: string | null
  residence_no: string | null
  sponsor_name: string | null
}

export type ReviewRow = {
  id: string
  user_id: string
  campaign_id: string
  provider_id: string
  rating: number
  comment_ar: string
  comment_en: string
  hidden: boolean
  created_at: string
}

export type NotificationRow = {
  id: string
  user_id: string
  kind: NotificationKindRow
  title_ar: string
  title_en: string
  body_ar: string
  body_en: string
  read: boolean
  created_at: string
}

export type SavedCampaignRow = {
  user_id: string
  campaign_id: string
  created_at: string
}

export type AdminAuditRow = {
  id: number
  actor_id: string | null
  action: string
  entity: string
  entity_id: string
  detail: Record<string, unknown>
  created_at: string
}

/** Insert shapes: server-defaulted columns are optional, never required. */
type Insertable<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>

type Table<Row, Ins = Row> = {
  Row: Row
  Insert: Ins
  Update: Partial<Ins>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      wilayat: Table<WilayahRow>
      profiles: Table<ProfileRow, Insertable<ProfileRow, 'created_at' | 'avatar_color' | 'role' | 'suspended' | 'removed' | 'name'>>
      providers: Table<ProviderRow, Insertable<ProviderRow, 'id' | 'created_at' | 'joined_at' | 'verification' | 'rating' | 'review_count' | 'plan' | 'initials' | 'brand_color' | 'experience_years' | 'verified_by' | 'verified_at' | 'tagline_ar' | 'tagline_en' | 'description_ar' | 'description_en'>>
      campaigns: Table<CampaignRow, Insertable<CampaignRow, 'id' | 'created_at' | 'rating' | 'review_count' | 'featured' | 'bookings_count' | 'suspended' | 'deleted' | 'services' | 'description_ar' | 'description_en' | 'hotel_makkah_ar' | 'hotel_makkah_en' | 'hotel_madinah_ar' | 'hotel_madinah_en' | 'haram_distance_m'>>
      bookings: Table<BookingRow, Insertable<BookingRow, 'id' | 'created_at' | 'booking_date' | 'status' | 'notes'>>
      travellers: Table<TravellerRow, Insertable<TravellerRow, 'id' | 'nationality'>>
      reviews: Table<ReviewRow, Insertable<ReviewRow, 'id' | 'created_at' | 'hidden' | 'comment_ar' | 'comment_en'>>
      notifications: Table<NotificationRow, Insertable<NotificationRow, 'id' | 'created_at' | 'read' | 'kind' | 'body_ar' | 'body_en'>>
      saved_campaigns: Table<SavedCampaignRow, Insertable<SavedCampaignRow, 'created_at'>>
      admin_audit: Table<AdminAuditRow, Insertable<AdminAuditRow, 'id' | 'created_at' | 'detail' | 'actor_id'>>
    }
    Views: {
      providers_public: { Row: ProviderPublicRow; Relationships: [] }
    }
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      owns_provider: { Args: { target: string }; Returns: boolean }
      owns_campaign: { Args: { target: string }; Returns: boolean }
      register_provider: {
        Args: {
          p_name_ar: string
          p_name_en: string
          p_tagline?: string
          p_wilayah_id?: string | null
          p_experience_years?: number
          p_phone?: string | null
          p_email?: string | null
          p_initials?: string
          p_brand_color?: string
          p_licence_image?: string | null
          p_licence_file_name?: string | null
        }
        Returns: ProviderRow
      }
      book_campaign: {
        Args: {
          p_campaign_id: string
          p_travellers: never
          p_contact_name: string
          p_contact_phone: string
          p_contact_email: string
          p_notes?: string | null
        }
        Returns: BookingRow
      }
      cancel_booking: { Args: { p_booking_id: string }; Returns: BookingRow }
    }
    Enums: {
      user_role: UserRole
      campaign_type: CampaignTypeRow
      travel_method: TravelMethodRow
      verification_status: VerificationStatusRow
      booking_status: BookingStatusRow
      provider_plan: ProviderPlanRow
      notification_kind: NotificationKindRow
    }
    CompositeTypes: Record<string, never>
  }
}
