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
export type VerificationStatusRow =
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'suspended'
  | 'unverified'
export type BookingStatusRow = 'pending' | 'confirmed' | 'completed' | 'cancelled'
export type CampaignStatusRow = 'pending_approval' | 'active' | 'rejected'
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
  /**
   * The account holder's own nationality, for prefilling a booking.
   *
   * Travellers on a booking keep theirs separately: a person may book for
   * family of another nationality, and the booking is where that matters.
   */
  nationality: string | null
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
  licence_path: string | null
  licence_mime: string | null
  rejection_reason: string | null
  submitted_at: string | null
  verified_by: string | null
  verified_at: string | null
  created_at: string
  // Added by 20260904000200. Nullable throughout: rows registered before that
  // migration have none of them, and the form — not the column — is what makes
  // them required from now on.
  governorate: string | null
  address: string | null
  commercial_registration: string | null
  permit_number: string | null
  permit_expiry: string | null
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
  | 'licence_path'
  | 'licence_mime'
  | 'rejection_reason'
  | 'submitted_at'
  | 'verified_by'
  | 'verified_at'
  | 'created_at'
  // The verification evidence. `governorate` stays — a pilgrim comparing
  // companies has a legitimate interest in where one operates from — and the
  // rest is what NASEK checked the company *with*.
  | 'address'
  | 'commercial_registration'
  | 'permit_number'
  | 'permit_expiry'
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
  // Added by 20260904000300 — approval, and the rest of what a trip offers.
  status: CampaignStatusRow
  rejection_reason: string | null
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  registration_deadline: string | null
  /** Free text, in Arabic. Additional to `services`, which holds the filterable keys. */
  included_services: string[]
  /** `[{ name, phone }]`. Shape enforced by `campaigns_contact_persons_shape`. */
  contact_persons: { name: string; phone: string }[]
  excluded_services: string[]
  /** Object paths in the `campaign-images` bucket. Never URLs. */
  images: string[]
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  terms_ar: string
  terms_en: string
}

export type BookingRow = {
  id: string
  reference: string
  user_id: string
  campaign_id: string
  travellers_count: number
  /** Null for bookings taken before 20260910000100 added the split. */
  male_count: number | null
  female_count: number | null
  /** Null for bookings taken before the per-head price was snapshotted. */
  price_per_person: number | null
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
  reply_ar: string | null
  reply_en: string | null
  replied_at: string | null
}

/**
 * A review as the public view serves it: the same columns plus the author's
 * display name, which lives on `profiles` and is unreachable from here.
 *
 * `user_name` is null when the reviewer never gave a name — the interface says
 * "A pilgrim" rather than deriving something from their email address.
 */
export type ReviewPublicRow = ReviewRow & { user_name: string | null }

/** An expression of interest in NASEK Giving. Write-only to everyone but an admin. */
export type GivingInterestRow = {
  id: string
  email: string
  user_id: string | null
  created_at: string
}

export type NotificationAudienceRow = 'customer' | 'owner' | 'admin'

export type NotificationRow = {
  id: string
  user_id: string
  kind: NotificationKindRow
  audience: NotificationAudienceRow
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

/**
 * A queued message, as `20260904000100_email_outbox.sql` stores it.
 *
 * Read-only from the client, and only by an administrator: the queue is written
 * by definer functions inside a decision's transaction and drained by the
 * `send-emails` Edge Function under the service role. The dashboard reads it to
 * answer one question — did the approval mail actually go out — which was
 * previously unanswerable from anywhere.
 */
export type EmailOutboxRow = {
  id: number
  to_email: string
  template: string
  subject_ar: string
  subject_en: string
  body_ar: string
  body_en: string
  payload: Record<string, unknown>
  status: 'queued' | 'sending' | 'sent' | 'failed'
  attempts: number
  last_error: string | null
  created_at: string
  sent_at: string | null
}

/**
 * A change to a company's verification-sensitive details, awaiting review.
 *
 * `proposed` holds only the columns that actually differ from the live row, as
 * `{ column: value }` — a diff rather than a second copy of the company, which
 * is also what an administrator wants to look at.
 */
export type ProviderProfileChangeRow = {
  id: string
  provider_id: string
  submitted_by: string | null
  status: 'pending' | 'approved' | 'rejected' | 'superseded'
  proposed: Record<string, string | null>
  licence_path: string | null
  licence_file_name: string | null
  licence_mime: string | null
  rejection_reason: string | null
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
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
      profiles: Table<ProfileRow, Insertable<ProfileRow, 'created_at' | 'avatar_color' | 'role' | 'suspended' | 'removed' | 'name' | 'nationality'>>
      providers: Table<ProviderRow, Insertable<ProviderRow, 'id' | 'created_at' | 'joined_at' | 'verification' | 'rating' | 'review_count' | 'plan' | 'initials' | 'brand_color' | 'experience_years' | 'verified_by' | 'verified_at' | 'tagline_ar' | 'tagline_en' | 'description_ar' | 'description_en' | 'governorate' | 'address' | 'commercial_registration' | 'permit_number' | 'permit_expiry' | 'licence_mime'>>
      campaigns: Table<CampaignRow, Insertable<CampaignRow, 'id' | 'created_at' | 'rating' | 'review_count' | 'featured' | 'bookings_count' | 'suspended' | 'deleted' | 'services' | 'description_ar' | 'description_en' | 'hotel_makkah_ar' | 'hotel_makkah_en' | 'hotel_madinah_ar' | 'hotel_madinah_en' | 'haram_distance_m' | 'status' | 'rejection_reason' | 'submitted_at' | 'reviewed_by' | 'reviewed_at' | 'registration_deadline' | 'excluded_services' | 'included_services' | 'contact_persons' | 'images' | 'contact_name' | 'contact_phone' | 'contact_email' | 'terms_ar' | 'terms_en'>>
      // Written only by `book_campaign`; the insert shape is kept accurate so
      // that a hand-written insert would still have to name the same columns.
      bookings: Table<BookingRow, Insertable<BookingRow, 'id' | 'created_at' | 'booking_date' | 'status' | 'notes' | 'male_count' | 'female_count' | 'price_per_person'>>
      travellers: Table<TravellerRow, Insertable<TravellerRow, 'id' | 'nationality'>>
      reviews: Table<ReviewRow, Insertable<ReviewRow, 'id' | 'created_at' | 'hidden' | 'comment_ar' | 'comment_en' | 'reply_ar' | 'reply_en' | 'replied_at'>>
      notifications: Table<NotificationRow, Insertable<NotificationRow, 'id' | 'created_at' | 'read' | 'kind' | 'body_ar' | 'body_en'>>
      saved_campaigns: Table<SavedCampaignRow, Insertable<SavedCampaignRow, 'created_at'>>
      admin_audit: Table<AdminAuditRow, Insertable<AdminAuditRow, 'id' | 'created_at' | 'detail' | 'actor_id'>>
      giving_interest: Table<GivingInterestRow, Insertable<GivingInterestRow, 'id' | 'created_at' | 'user_id'>>
      // No insert shape worth naming: there is no write policy on this table at
      // all, by design. Every statement a client sends against it fails,
      // including an administrator's.
      email_outbox: Table<EmailOutboxRow>
      // Read-only from every client. Both directions go through
      // `submit_provider_profile` and `review_provider_changes`, which is what
      // stops an owner writing themselves an `approved` row.
      provider_profile_changes: Table<ProviderProfileChangeRow>
    }
    Views: {
      providers_public: { Row: ProviderPublicRow; Relationships: [] }
      reviews_public: { Row: ReviewPublicRow; Relationships: [] }
    }
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      owns_provider: { Args: { target: string }; Returns: boolean }
      owns_campaign: { Args: { target: string }; Returns: boolean }
      provider_approved: { Args: { target: string }; Returns: boolean }
      register_provider: {
        Args: {
          p_name_ar: string
          p_name_en: string
          p_tagline?: string
          p_description?: string
          p_wilayah_id?: string | null
          p_governorate?: string | null
          p_address?: string | null
          p_experience_years?: number
          p_phone?: string | null
          p_email?: string | null
          p_initials?: string
          p_brand_color?: string
          p_commercial_registration?: string | null
          p_permit_number?: string | null
          p_permit_expiry?: string | null
          p_licence_image?: string | null
          p_licence_file_name?: string | null
          p_licence_path?: string | null
          p_licence_mime?: string | null
        }
        Returns: ProviderRow
      }
      /** A refused application, corrected and pushed back into the queue. */
      resubmit_provider: {
        Args: {
          p_name_ar: string
          p_name_en: string
          p_tagline?: string
          p_description?: string
          p_wilayah_id?: string | null
          p_governorate?: string | null
          p_address?: string | null
          p_experience_years?: number
          p_phone?: string | null
          p_email?: string | null
          p_commercial_registration?: string | null
          p_permit_number?: string | null
          p_permit_expiry?: string | null
          p_licence_image?: string | null
          p_licence_file_name?: string | null
          p_licence_path?: string | null
          p_licence_mime?: string | null
        }
        Returns: ProviderRow
      }
      /**
       * An owner saving their company profile.
       *
       * Applies the marketing fields immediately and, for an already-approved
       * company, queues any change to the verification evidence for review.
       * Returns `{ review_required, change_id? }`.
       */
      submit_provider_profile: {
        Args: {
          p_tagline?: string | null
          p_description?: string | null
          p_wilayah_id?: string | null
          p_governorate?: string | null
          p_address?: string | null
          p_phone?: string | null
          p_email?: string | null
          p_experience_years?: number | null
          p_name?: string | null
          p_commercial_registration?: string | null
          p_permit_number?: string | null
          p_permit_expiry?: string | null
          p_licence_path?: string | null
          p_licence_file_name?: string | null
          p_licence_mime?: string | null
        }
        Returns: { review_required: boolean; change_id?: string }
      }
      /** An administrator's decision on such a change. */
      review_provider_changes: {
        Args: { p_change_id: string; p_approve: boolean; p_reason?: string | null }
        Returns: ProviderProfileChangeRow
      }
      /**
       * An administrator's decision on a trip.
       *
       * The campaign counterpart of `set_provider_status`, and an RPC for the
       * same reason: the status, the reason, the audit entry and the message to
       * the owner have to land in one transaction or not at all.
       */
      set_campaign_status: {
        Args: {
          p_campaign_id: string
          p_status: CampaignStatusRow
          p_reason?: string | null
        }
        Returns: CampaignRow
      }
      /** An administrator's decision, with the reason attached to the same row. */
      set_provider_status: {
        Args: {
          p_provider_id: string
          p_status: VerificationStatusRow
          p_reason?: string | null
        }
        Returns: ProviderRow
      }
      /**
       * Creates a booking *request*, status 'pending'.
       *
       * No price and no total in the arguments, and that is the contract rather
       * than an omission: the function reads the price off the campaign row it
       * has locked. `p_travellers` went with the traveller-details step the
       * manual-payment workflow removed — see `20260910000100`.
       */
      book_campaign: {
        Args: {
          p_campaign_id: string
          p_male_count: number
          p_female_count: number
          p_contact_name: string
          p_contact_phone: string
          p_contact_email: string
          p_notes?: string | null
        }
        Returns: BookingRow
      }
      /**
       * The campaign owner records that they have been paid.
       *
       * Owner or administrator only, and 'pending' -> 'confirmed' only; the
       * server refuses anything else. Cancelling goes through `cancel_booking`,
       * which also returns the seats.
       */
      set_booking_status: {
        Args: { p_booking_id: string; p_status: BookingStatusRow }
        Returns: BookingRow
      }
      cancel_booking: { Args: { p_booking_id: string }; Returns: BookingRow }
      /** Advances the caller's own past-dated bookings; returns how many moved. */
      complete_past_bookings: { Args: Record<string, never>; Returns: number }
    }
    Enums: {
      user_role: UserRole
      campaign_type: CampaignTypeRow
      travel_method: TravelMethodRow
      verification_status: VerificationStatusRow
      booking_status: BookingStatusRow
      campaign_status: CampaignStatusRow
      provider_plan: ProviderPlanRow
      notification_kind: NotificationKindRow
    }
    CompositeTypes: Record<string, never>
  }
}
