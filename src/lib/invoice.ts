import type { Booking, Campaign, Lang, Provider } from '@/types'
import { toE164 } from '@/services/auth/phone'

/**
 * The NASEK invoice, and the WhatsApp message that carries it.
 *
 * NASEK does not take payment. A booking is a *request*: the customer creates
 * it here, NASEK issues an invoice number, and the customer sends that invoice
 * to the campaign owner over WhatsApp. The owner replies with their own payment
 * details, is paid directly, and marks the booking confirmed in their portal.
 *
 * This module is the whole of that document, and it is deliberately pure — no
 * React, no i18n context, no `window`. Every value on an invoice is a
 * commercial claim about real money between two real people, so the assembly of
 * it is something `verify:booking` can assert directly rather than something
 * that has to be believed because a page rendered without throwing.
 *
 * Two rules run through all of it:
 *
 *   1. Nothing is invented. Every field is read from a record — the booking
 *      row, the campaign, the provider — and a field with no record behind it
 *      comes back as `null` and prints as a dash. There is no placeholder name,
 *      no default phone number, no fallback price.
 *   2. Nothing is recomputed. The counts, the per-head price and the total come
 *      off the *booking*, which snapshotted them when it was created. An owner
 *      who re-prices their trip next month does not silently re-price an
 *      invoice somebody was handed today.
 */

export interface Invoice {
  /** `NSK-######` — the booking's own reference, reused. Never regenerated. */
  invoiceNumber: string
  customerName: string
  /** As stored on the booking. Never a placeholder; the booking cannot exist without one. */
  customerPhone: string
  campaignName: string
  tripReference: string
  /** ISO date of departure, unformatted — the caller decides the locale. */
  tripDate: string | null
  maleCount: number | null
  femaleCount: number | null
  totalPassengers: number
  /** Snapshotted per-head price. Null on a booking taken before the snapshot existed. */
  pricePerPerson: number | null
  totalAmount: number
  providerName: string
  /** Null when the company has no usable number — the WhatsApp action is then refused. */
  providerPhone: string | null
  /** ISO date the request was created. */
  bookingDate: string
  status: Booking['status']
}

/**
 * A short, stable code for a trip.
 *
 * NASEK has no human-readable campaign number and inventing a counter for one
 * would mean a new sequence, a new column and a new thing that can drift out of
 * step with the row it names. This is derived from the campaign's own id, so it
 * is stable for the life of the trip, identical everywhere it is printed, and
 * carries no information the address bar does not already show — every campaign
 * page is `/campaigns/<id>`. Truncated rather than printed whole because an
 * invoice read aloud over the phone should be readable aloud over the phone.
 */
export function tripReference(campaignId: string): string {
  const compact = campaignId.replace(/-/g, '').toUpperCase()
  return compact ? `T-${compact.slice(0, 6)}` : '—'
}

/**
 * The number WhatsApp wants: digits only, country code included, no `+`.
 *
 * `wa.me/96891234567`. Returns null rather than a guess when the stored value
 * cannot be read as a phone number — an invoice sent to a number derived from a
 * typo reaches a stranger, and the button is disabled instead.
 *
 * The stored value is never modified. This is a reading of it for one purpose.
 */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null
  const e164 = toE164(phone)
  return e164 ? e164.slice(1) : null
}

/** Assemble the invoice from the records that own each field. */
export function buildInvoice(
  booking: Booking,
  campaign: Campaign | undefined,
  provider: Provider | undefined,
  lang: Lang,
): Invoice {
  return {
    invoiceNumber: booking.reference,
    customerName: booking.contactName,
    customerPhone: booking.contactPhone,
    campaignName: campaign ? campaign.title[lang] || campaign.title.ar : '',
    tripReference: campaign ? tripReference(campaign.id) : tripReference(booking.campaignId),
    tripDate: campaign?.departureDate ?? null,
    maleCount: booking.maleCount ?? null,
    femaleCount: booking.femaleCount ?? null,
    totalPassengers: booking.travellersCount,
    pricePerPerson: booking.pricePerPerson ?? null,
    totalAmount: booking.totalPrice,
    providerName: provider ? provider.name[lang] || provider.name.ar : '',
    providerPhone: provider?.phone?.trim() ? provider.phone : null,
    bookingDate: booking.bookingDate,
    status: booking.status,
  }
}

// --------------------------------------------------------------- formatting

/** What a missing value prints as. Never a zero, never an invented default. */
const DASH = '—'

/**
 * Latin digits in both languages, matching the rest of NASEK.
 *
 * `i18n/index.tsx` requests `ar-OM-u-nu-latn` everywhere for the same reason:
 * an invoice number, a phone number and a price are read back to somebody, and
 * Arabic-Indic digits in a WhatsApp message pasted into a bank transfer are a
 * transcription error waiting to happen.
 */
function amount(value: number | null): string {
  if (value == null) return DASH
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
}

function count(value: number | null): string {
  return value == null ? DASH : String(value)
}

function tripDay(iso: string | null, lang: Lang): string {
  if (!iso) return DASH
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return DASH
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/** The provider's number as a person reads it, or a dash. */
function contactNumber(phone: string | null): string {
  if (!phone) return DASH
  const e164 = toE164(phone)
  return e164 ?? phone
}

/**
 * The message itself, in the language the interface is currently in.
 *
 * The two templates are fixed wording agreed for NASEK and are reproduced here
 * exactly. Neither of them says NASEK has been paid, and neither of them offers
 * a way to pay NASEK: the closing line of each states plainly that the request
 * was *created* through the platform, which is the whole of NASEK's part in it.
 */
export function invoiceMessage(invoice: Invoice, lang: Lang): string {
  const passengers = String(invoice.totalPassengers)

  if (lang === 'ar') {
    return [
      'فاتورة حجز ناسِك',
      '',
      `رقم الفاتورة: ${invoice.invoiceNumber}`,
      `اسم العميل: ${invoice.customerName || DASH}`,
      `رقم العميل: ${contactNumber(invoice.customerPhone)}`,
      '',
      `الحملة: ${invoice.campaignName || DASH}`,
      `الرحلة رقم: ${invoice.tripReference}`,
      `تاريخ الرحلة: ${tripDay(invoice.tripDate, 'ar')}`,
      '',
      'عدد المسافرين:',
      `ذكور: ${count(invoice.maleCount)}`,
      `إناث: ${count(invoice.femaleCount)}`,
      `الإجمالي: ${passengers}`,
      '',
      `السعر للفرد: ${amount(invoice.pricePerPerson)} ر.ع`,
      `الإجمالي: ${amount(invoice.totalAmount)} ر.ع`,
      '',
      `صاحب الحملة: ${invoice.providerName || DASH}`,
      `رقم التواصل: ${contactNumber(invoice.providerPhone)}`,
      '',
      'يرجى إرسال بيانات الدفع لإتمام الحجز.',
      '',
      'تم إنشاء الطلب عبر منصة ناسِك.',
    ].join('\n')
  }

  return [
    'NASEK Booking Invoice',
    '',
    `Invoice No.: ${invoice.invoiceNumber}`,
    `Customer: ${invoice.customerName || DASH}`,
    `Customer Phone: ${contactNumber(invoice.customerPhone)}`,
    '',
    `Campaign: ${invoice.campaignName || DASH}`,
    `Trip No.: ${invoice.tripReference}`,
    `Trip Date: ${tripDay(invoice.tripDate, 'en')}`,
    '',
    'Passengers:',
    `Male: ${count(invoice.maleCount)}`,
    `Female: ${count(invoice.femaleCount)}`,
    `Total: ${passengers}`,
    '',
    `Price per person: OMR ${amount(invoice.pricePerPerson)}`,
    `Total: OMR ${amount(invoice.totalAmount)}`,
    '',
    `Campaign Owner: ${invoice.providerName || DASH}`,
    `Contact Number: ${contactNumber(invoice.providerPhone)}`,
    '',
    'Please send the payment details to complete the booking.',
    '',
    'This booking request was created through NASEK.',
  ].join('\n')
}

/**
 * The deep link, or null when there is nobody to send it to.
 *
 * Null is the load-bearing case. A company with no usable phone number must not
 * produce a `wa.me` link to *somewhere* — an invoice carrying a real customer's
 * name, number and trip, delivered to whoever happens to own the number a
 * fallback invented. The caller disables the button and says so instead.
 *
 * `encodeURIComponent` rather than `URLSearchParams`, which encodes a space as
 * `+`; WhatsApp renders that literally and every space in a twenty-line invoice
 * becomes a plus sign.
 */
export function invoiceWhatsappUrl(invoice: Invoice, lang: Lang): string | null {
  const digits = whatsappDigits(invoice.providerPhone)
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(invoiceMessage(invoice, lang))}`
}
