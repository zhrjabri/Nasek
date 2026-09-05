import type {
  Booking,
  Campaign,
  Notification,
  Provider,
  Review,
  ServiceKey,
  Traveller,
} from '@/types'
import type {
  BookingRow,
  CampaignRow,
  NotificationRow,
  ProviderPublicRow,
  ProviderRow,
  ReviewRow,
  TravellerRow,
} from '@/services/supabase/schema'

/**
 * Postgres rows in, domain objects out.
 *
 * The one place in NASEK where snake_case meets camelCase and `name_ar` /
 * `name_en` become `{ ar, en }`. Keeping it to a single file means no component
 * ever has to know which convention it is holding, and a column rename has one
 * place to be dealt with rather than forty.
 *
 * Every mapper is total: it accepts a row and returns a domain object, with
 * nulls resolved to the empty values the interface already knows how to render.
 * A missing wilayah must not blank a whole campaign card.
 */

export function toProvider(row: ProviderRow | ProviderPublicRow): Provider {
  // The public view omits the private columns entirely, so they are read
  // defensively rather than assumed — this same function serves both.
  const full = row as Partial<ProviderRow>
  return {
    id: row.id,
    name: { ar: row.name_ar, en: row.name_en },
    tagline: { ar: row.tagline_ar, en: row.tagline_en },
    description: { ar: row.description_ar, en: row.description_en },
    wilayahId: row.wilayah_id ?? 'muscat',
    verification: row.verification,
    experienceYears: row.experience_years,
    rating: Number(row.rating) || 0,
    reviewCount: row.review_count,
    phone: full.phone ?? '',
    email: full.email ?? '',
    initials: row.initials,
    brandColor: row.brand_color,
    plan: row.plan,
    joinedAt: row.joined_at,
    licenceImage: full.licence_image ?? undefined,
    licenceFileName: full.licence_file_name ?? undefined,
    licencePath: full.licence_path ?? undefined,
    licenceMime: full.licence_mime ?? undefined,
    rejectionReason: full.rejection_reason ?? undefined,
    submittedAt: full.submitted_at ?? undefined,
    // `governorate` is on both the table and the public view; the rest is only
    // ever on the table, so `full` is doing real work for four of these five.
    governorate: row.governorate ?? undefined,
    address: full.address ?? undefined,
    commercialRegistration: full.commercial_registration ?? undefined,
    permitNumber: full.permit_number ?? undefined,
    permitExpiry: full.permit_expiry ?? undefined,
  }
}

export function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    providerId: row.provider_id,
    type: row.type,
    title: { ar: row.title_ar, en: row.title_en },
    description: { ar: row.description_ar, en: row.description_en },
    // numeric(10,3) arrives as a string from PostgREST; Number() is what keeps
    // arithmetic in the price filters and the fee calculation from silently
    // becoming string concatenation.
    price: Number(row.price) || 0,
    wilayahId: row.wilayah_id ?? 'muscat',
    travelMethod: row.travel_method,
    departureDate: row.departure_date,
    returnDate: row.return_date,
    seatsTotal: row.seats_total,
    seatsAvailable: row.seats_available,
    services: (row.services ?? []) as ServiceKey[],
    hotelMakkah: { ar: row.hotel_makkah_ar, en: row.hotel_makkah_en },
    hotelMadinah: { ar: row.hotel_madinah_ar, en: row.hotel_madinah_en },
    haramDistanceM: row.haram_distance_m,
    rating: Number(row.rating) || 0,
    reviewCount: row.review_count,
    featured: row.featured,
    bookingsCount: row.bookings_count,
    // Moderation state, carried through rather than dropped. `campaigns_read`
    // sends these rows to the owner and to an administrator precisely so both
    // can see what has been taken down; discarding the columns here is what
    // left the admin dashboard reading takedowns out of local state instead.
    suspended: row.suspended,
    deleted: row.deleted,
    /*
     * Approval state, defaulted rather than assumed.
     *
     * `?? 'active'` matters during the window between deploying this build and
     * applying `20260904000300`: the column does not exist yet, PostgREST omits
     * it, and a campaign whose status read `undefined` would vanish from the
     * public catalogue the moment `deriveCatalogue` filtered on it. Treating a
     * missing column as "live" keeps the site exactly as it was until the
     * migration lands, which is the direction this has to fail in.
     */
    status: row.status ?? 'active',
    rejectionReason: row.rejection_reason ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    registrationDeadline: row.registration_deadline ?? undefined,
    excludedServices: (row.excluded_services ?? []) as ServiceKey[],
    images: row.images ?? [],
    contactName: row.contact_name ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    contactEmail: row.contact_email ?? undefined,
    terms: { ar: row.terms_ar ?? '', en: row.terms_en ?? '' },
  }
}

/** The columns a campaign write sends. `id` is omitted so Postgres assigns it. */
export function fromCampaign(campaign: Campaign) {
  return {
    provider_id: campaign.providerId,
    type: campaign.type,
    title_ar: campaign.title.ar,
    title_en: campaign.title.en,
    description_ar: campaign.description.ar,
    description_en: campaign.description.en,
    price: campaign.price,
    wilayah_id: campaign.wilayahId,
    travel_method: campaign.travelMethod,
    departure_date: campaign.departureDate,
    return_date: campaign.returnDate,
    seats_total: campaign.seatsTotal,
    seats_available: campaign.seatsAvailable,
    services: campaign.services,
    hotel_makkah_ar: campaign.hotelMakkah.ar,
    hotel_makkah_en: campaign.hotelMakkah.en,
    hotel_madinah_ar: campaign.hotelMadinah.ar,
    hotel_madinah_en: campaign.hotelMadinah.en,
    haram_distance_m: campaign.haramDistanceM,
    registration_deadline: campaign.registrationDeadline || null,
    excluded_services: campaign.excludedServices,
    images: campaign.images,
    contact_name: campaign.contactName || null,
    contact_phone: campaign.contactPhone || null,
    contact_email: campaign.contactEmail || null,
    terms_ar: campaign.terms.ar,
    terms_en: campaign.terms.en,
    // `featured` and `suspended` are absent on purpose: both are the
    // administrator's to set, and the trigger in the RLS migration would revert
    // an owner's attempt anyway. Sending them would be a lie about who decides.
    //
    // `status` is absent for the same reason and it is the important one.
    // `guard_campaign_moderation` forces every insert to `pending_approval` and
    // reverts every owner update of it, so sending a status here could never
    // work — but sending one would suggest to the next reader that it might,
    // and that is the misreading this whole migration exists to prevent.
  }
}

export function toTraveller(row: TravellerRow): Traveller {
  return {
    name: row.name,
    nationality: row.nationality,
    gender: row.gender ?? 'male',
    civilId: row.civil_id ?? '',
    passportNo: row.passport_no ?? '',
    residenceNo: row.residence_no ?? undefined,
    sponsorName: row.sponsor_name ?? undefined,
  }
}

export function toBooking(row: BookingRow, travellers: TravellerRow[] = []): Booking {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    campaignId: row.campaign_id,
    travellers: travellers.map(toTraveller),
    travellersCount: row.travellers_count,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    totalPrice: Number(row.total_price) || 0,
    status: row.status,
    bookingDate: row.booking_date,
    notes: row.notes ?? undefined,
  }
}

/**
 * `user_name` comes from `reviews_public`, which joins the author's profile.
 *
 * The parameter has always accepted it; nothing ever supplied it, because the
 * snapshot read the `reviews` table and no such column is on it. Every byline
 * on the site was therefore an empty string. See
 * `20260903000100_reviews_public.sql`.
 */
export function toReview(row: ReviewRow & { user_name?: string | null }): Review {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name ?? '',
    campaignId: row.campaign_id,
    providerId: row.provider_id,
    rating: row.rating,
    comment: { ar: row.comment_ar, en: row.comment_en },
    date: row.created_at.slice(0, 10),
    reply: { ar: row.reply_ar ?? '', en: row.reply_en ?? '' },
    repliedAt: row.replied_at ?? undefined,
    hidden: row.hidden,
  }
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    title: { ar: row.title_ar, en: row.title_en },
    body: { ar: row.body_ar, en: row.body_en },
    date: row.created_at.slice(0, 10),
    read: row.read,
    kind: row.kind,
  }
}
