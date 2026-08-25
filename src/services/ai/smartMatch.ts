import type { Campaign, Lang } from '@/types'
import { approxDistanceKm, wilayahName } from '@/data/geo'
import { providerById } from '@/data/providers'
import { serviceLabel } from '@/data/services'
import type { MatchResult, SeasonKey, SmartMatchInput } from './types'

/**
 * NASEK Smart Match — a transparent, weighted scoring engine.
 *
 * Each criterion earns a fraction of its weight, and every criterion that
 * scores well contributes a sentence to `reasons` while every criterion that
 * scores badly contributes one to `tradeoffs`. Showing the downsides is what
 * makes a "96% match" believable rather than decorative — and it means the
 * explanation is always derived from the same numbers as the score, so the
 * two can never contradict each other.
 *
 * Weights sum to 100.
 */
const WEIGHTS = {
  budget: 25,
  services: 20,
  location: 15,
  date: 15,
  method: 10,
  quality: 10,
  seats: 5,
} as const

/** Concrete date windows for each season option in the questionnaire. */
export const SEASON_WINDOWS: Record<Exclude<SeasonKey, 'any'>, { from: string; to: string }> = {
  soon: { from: isoToday(), to: isoMonthsFromNow(3) },
  ramadan: { from: '2027-02-15', to: '2027-03-22' },
  hajj_season: { from: '2027-04-25', to: '2027-06-05' },
  winter: { from: '2026-11-15', to: '2027-02-15' },
  spring: { from: '2027-03-01', to: '2027-05-31' },
}

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}
function isoMonthsFromNow(n: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

const DAY_MS = 86_400_000
function daysBetween(aIso: string, bIso: string) {
  return Math.round((new Date(aIso).getTime() - new Date(bIso).getTime()) / DAY_MS)
}

export function scoreCampaigns(
  input: SmartMatchInput,
  lang: Lang,
  pool: Campaign[],
): MatchResult[] {
  const L = (ar: string, en: string) => (lang === 'ar' ? ar : en)

  // Trip type is a hard requirement, not a preference — nobody looking for
  // Hajj wants an Umrah trip ranked 82%.
  const candidates = pool.filter((c) => input.type === 'any' || c.type === input.type)

  const results = candidates.map<MatchResult>((campaign) => {
    const provider = providerById(campaign.providerId)
    const reasons: string[] = []
    const tradeoffs: string[] = []
    const breakdown: MatchResult['breakdown'] = []

    const add = (key: keyof typeof WEIGHTS, label: string, earnedRatio: number) => {
      const weight = WEIGHTS[key]
      breakdown.push({ key, label, weight, earned: Math.round(weight * earnedRatio) })
      return weight * earnedRatio
    }

    let total = 0

    // ------------------------------------------------------------ budget
    {
      let ratio: number
      if (input.budget == null) {
        ratio = 0.8 // no stated budget — mildly prefer better value
      } else if (campaign.price <= input.budget) {
        // Comfortably inside budget scores full marks; right at the limit
        // still scores well. Being far under does not earn extra — a
        // suspiciously cheap trip isn't automatically a better match.
        const headroom = (input.budget - campaign.price) / input.budget
        ratio = headroom > 0.15 ? 1 : 0.9
        reasons.push(
          headroom > 0.25
            ? L(
                `ضمن ميزانيتك بفارق مريح — ${campaign.price} ريال مقابل ${input.budget} ريال.`,
                `Comfortably inside your budget — ${campaign.price} OMR against ${input.budget} OMR.`,
              )
            : L(
                `يقع ضمن ميزانيتك المحددة (${campaign.price} ريال).`,
                `Falls within your stated budget (${campaign.price} OMR).`,
              ),
        )
      } else {
        const over = (campaign.price - input.budget) / input.budget
        ratio = Math.max(0, 1 - over * 2.5)
        tradeoffs.push(
          L(
            `أعلى من ميزانيتك بـ ${Math.round(campaign.price - input.budget)} ريال.`,
            `${Math.round(campaign.price - input.budget)} OMR above your budget.`,
          ),
        )
      }
      total += add('budget', L('الميزانية', 'Budget'), ratio)
    }

    // ---------------------------------------------------------- services
    {
      if (input.services.length === 0) {
        total += add('services', L('الخدمات', 'Services'), 0.8)
      } else {
        const matched = input.services.filter((s) => campaign.services.includes(s))
        const missing = input.services.filter((s) => !campaign.services.includes(s))
        const ratio = matched.length / input.services.length
        if (matched.length) {
          reasons.push(
            ratio === 1
              ? L(
                  `يشمل كل ما طلبته: ${matched.map((s) => serviceLabel(s, 'ar')).join('، ')}.`,
                  `Includes everything you asked for: ${matched.map((s) => serviceLabel(s, 'en')).join(', ')}.`,
                )
              : L(
                  `يشمل ${matched.map((s) => serviceLabel(s, 'ar')).join('، ')}.`,
                  `Includes ${matched.map((s) => serviceLabel(s, 'en')).join(', ')}.`,
                ),
          )
        }
        if (missing.length) {
          tradeoffs.push(
            L(
              `لا يشمل ${missing.map((s) => serviceLabel(s, 'ar')).join('، ')}.`,
              `Does not include ${missing.map((s) => serviceLabel(s, 'en')).join(', ')}.`,
            ),
          )
        }
        total += add('services', L('الخدمات', 'Services'), ratio)
      }
    }

    // ---------------------------------------------------------- location
    {
      if (!input.wilayahId) {
        total += add('location', L('الموقع', 'Location'), 0.8)
      } else if (campaign.wilayahId === input.wilayahId) {
        reasons.push(
          L(
            `تنطلق من ${wilayahName(campaign.wilayahId, 'ar')} — ولايتك نفسها.`,
            `Departs from ${wilayahName(campaign.wilayahId, 'en')} — your own wilayah.`,
          ),
        )
        total += add('location', L('الموقع', 'Location'), 1)
      } else {
        const km = approxDistanceKm(input.wilayahId, campaign.wilayahId)
        const ratio = Math.max(0, 1 - km / 500)
        if (km <= 80) {
          reasons.push(
            L(
              `نقطة الانطلاق قريبة منك — ${wilayahName(campaign.wilayahId, 'ar')}.`,
              `Departs nearby, from ${wilayahName(campaign.wilayahId, 'en')}.`,
            ),
          )
        } else if (km > 250) {
          tradeoffs.push(
            L(
              `تنطلق من ${wilayahName(campaign.wilayahId, 'ar')}، وهي بعيدة عنك نسبيًا.`,
              `Departs from ${wilayahName(campaign.wilayahId, 'en')}, a fair distance from you.`,
            ),
          )
        }
        total += add('location', L('الموقع', 'Location'), ratio)
      }
    }

    // -------------------------------------------------------------- date
    {
      if (!input.season || input.season === 'any') {
        total += add('date', L('التاريخ', 'Dates'), 0.8)
      } else {
        const window = SEASON_WINDOWS[input.season]
        const dep = campaign.departureDate
        if (dep >= window.from && dep <= window.to) {
          reasons.push(
            L(
              `تغادر في الفترة التي اخترتها.`,
              `Departs inside the travel window you chose.`,
            ),
          )
          total += add('date', L('التاريخ', 'Dates'), 1)
        } else {
          // Partial credit for near misses — a trip two weeks outside the
          // window is a far better suggestion than one six months away.
          const days = Math.min(
            Math.abs(daysBetween(dep, window.from)),
            Math.abs(daysBetween(dep, window.to)),
          )
          const ratio = Math.max(0, 1 - days / 120)
          if (days > 45) {
            tradeoffs.push(
              L(
                `موعد المغادرة خارج الفترة التي فضّلتها.`,
                `The departure date sits outside your preferred window.`,
              ),
            )
          }
          total += add('date', L('التاريخ', 'Dates'), ratio)
        }
      }
    }

    // ------------------------------------------------------------ method
    {
      if (input.travelMethod === 'any') {
        total += add('method', L('وسيلة السفر', 'Travel method'), 0.8)
      } else if (campaign.travelMethod === input.travelMethod) {
        reasons.push(
          input.travelMethod === 'air'
            ? L('رحلة جوية كما فضّلت.', 'An air trip, as you preferred.')
            : L('رحلة برية كما فضّلت.', 'A land trip, as you preferred.'),
        )
        total += add('method', L('وسيلة السفر', 'Travel method'), 1)
      } else {
        tradeoffs.push(
          campaign.travelMethod === 'air'
            ? L('رحلة جوية وليست برية.', 'This is an air trip, not a land trip.')
            : L('رحلة برية وليست جوية.', 'This is a land trip, not an air trip.'),
        )
        total += add('method', L('وسيلة السفر', 'Travel method'), 0.15)
      }
    }

    // ----------------------------------------------------------- quality
    {
      const ratingPart = Math.max(0, (campaign.rating - 3.8) / 1.2) // 3.8→0, 5.0→1
      const verifiedPart = provider?.verification === 'verified' ? 1 : 0.4
      const ratio = Math.min(1, ratingPart * 0.7 + verifiedPart * 0.3)
      if (campaign.rating >= 4.7) {
        reasons.push(
          L(
            `تقييم ${campaign.rating} من ${campaign.reviewCount} مسافرًا.`,
            `Rated ${campaign.rating} by ${campaign.reviewCount} travellers.`,
          ),
        )
      }
      if (provider && provider.verification !== 'verified') {
        tradeoffs.push(
          L('الحملة قيد التوثيق لدى ناسِك.', 'This campaign is still awaiting NASEK verification.'),
        )
      }
      total += add('quality', L('الجودة والتقييم', 'Quality'), ratio)
    }

    // ------------------------------------------------------------- seats
    {
      const need = Math.max(1, input.travellers)
      if (campaign.seatsAvailable >= need) {
        const ratio = campaign.seatsAvailable >= need * 2 ? 1 : 0.75
        if (campaign.seatsAvailable <= 5) {
          tradeoffs.push(
            L(
              `لم يتبقَ سوى ${campaign.seatsAvailable} مقاعد — قد تنفد سريعًا.`,
              `Only ${campaign.seatsAvailable} seats left — these may go quickly.`,
            ),
          )
        }
        total += add('seats', L('المقاعد', 'Seats'), ratio)
      } else {
        tradeoffs.push(
          L(
            `المقاعد المتاحة (${campaign.seatsAvailable}) أقل من عدد مسافريك.`,
            `Only ${campaign.seatsAvailable} seats remain — fewer than your party of ${need}.`,
          ),
        )
        total += add('seats', L('المقاعد', 'Seats'), 0)
      }
    }

    return {
      campaign,
      score: Math.round(Math.max(0, Math.min(100, total))),
      reasons: reasons.slice(0, 4),
      tradeoffs: tradeoffs.slice(0, 3),
      breakdown,
    }
  })

  return results
    .sort((a, b) => b.score - a.score || a.campaign.price - b.campaign.price)
    .slice(0, 6)
}
