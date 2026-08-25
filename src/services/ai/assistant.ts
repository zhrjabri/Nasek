import type { Campaign, Lang } from '@/types'
import { CAMPAIGNS } from '@/data/campaigns'
import { wilayahName } from '@/data/geo'
import { providerById } from '@/data/providers'
import { serviceLabel } from '@/data/services'
import { INTENT_WORDS, RELIGIOUS_RULING_WORDS, findWord, prepare } from './lexicon'
import { parseNaturalQuery } from './nlSearch'
import type { AssistantMessage } from './types'

type Reply = Pick<AssistantMessage, 'text' | 'campaignIds' | 'suggestions'>

/**
 * NASEK Assistant — intent routing over the live campaign data.
 *
 * The assistant answers from the same in-memory catalogue the listing page
 * reads, so it can never quote a price or a seat count that the site
 * contradicts. Where a hosted model would be given tools, this build gives
 * the same functions to a rule-based router: classify intent, retrieve, then
 * render a grounded answer.
 *
 * Two rules are hard-wired, per the brief:
 *   1. Religious rulings are always redirected to qualified authorities.
 *   2. No claim of official licensing is ever made about a campaign.
 */
export function answer(message: string, lang: Lang): Reply {
  const text = prepare(message)
  const L = (ar: string, en: string) => (lang === 'ar' ? ar : en)

  // ------------------------------------------------- 1. religious guardrail
  if (findWord(text, RELIGIOUS_RULING_WORDS)) {
    return {
      text: L(
        'هذا سؤال في الحكم الشرعي، ولست الجهة المناسبة للإجابة عنه. يُرجى الرجوع إلى أهل العلم أو وزارة الأوقاف والشؤون الدينية في سلطنة عُمان.\n\nأستطيع مساعدتك في اختيار الحملة ومقارنة الأسعار والخدمات وإتمام الحجز.',
        'That is a question of religious ruling, and I am not the right source for it. Please refer to qualified scholars or the Ministry of Endowments and Religious Affairs in Oman.\n\nI can help you choose a campaign, compare prices and services, and complete a booking.',
      ),
      suggestions: [
        L('أرخص عمرة من مسقط', 'Cheapest Umrah from Muscat'),
        L('ماذا تشمل باقة الحج؟', 'What does a Hajj package include?'),
      ],
    }
  }

  // ------------------------------------------------------- 2. greetings etc.
  if (findWord(text, ['سلام', 'السلام عليكم', 'مرحبا', 'هلا', 'اهلا', 'hi', 'hello', 'hey', 'salam'])) {
    return {
      text: L(
        'وعليكم السلام، أهلًا بك في ناسِك. أخبرني بما تبحث عنه — نوع الرحلة، وولاية المغادرة، وميزانيتك — وسأقترح عليك أنسب الحملات.',
        'Hello, and welcome to NASEK. Tell me what you are looking for — trip type, departure wilayah and budget — and I will suggest the campaigns that fit.',
      ),
      suggestions: defaultSuggestions(lang),
    }
  }

  if (findWord(text, ['شكرا', 'مشكور', 'يعطيك العافيه', 'thanks', 'thank you', 'thx'])) {
    return {
      text: L(
        'العفو، وفقك الله في رحلتك. إن احتجت أي مساعدة أخرى فأنا هنا.',
        'You’re welcome — I hope your journey goes well. I’m here if you need anything else.',
      ),
    }
  }

  // ---------------------------------------------- 3. how the platform works
  if (
    findWord(text, [
      'كيف احجز', 'كيف اححز', 'طريقه الحجز', 'خطوات الحجز', 'كيف تتم عمليه الحجز', 'كيف يعمل',
      'how do i book', 'how does booking work', 'booking process', 'how it works', 'how to book',
    ])
  ) {
    return {
      text: L(
        'الحجز في ناسِك يمر بسبع خطوات:\n\n١. اختر الرحلة من صفحة الحملات.\n٢. حدد موعد المغادرة.\n٣. أدخل عدد المسافرين.\n٤. أدخل بيانات المسافرين (الرقم المدني وجواز السفر، وبيانات الإقامة والكفيل لغير العُمانيين).\n٥. راجع الحجز والتكلفة.\n٦. أكمل الدفع.\n٧. تصلك صفحة تأكيد برقم حجز، وتتواصل معك الحملة لاستكمال الإجراءات.\n\nملاحظة: هذا نموذج أولي ولا يتم فيه دفع حقيقي.',
        'Booking on NASEK takes seven steps:\n\n1. Choose a trip from the campaigns page.\n2. Pick your departure date.\n3. Enter the number of travellers.\n4. Enter traveller details (civil ID and passport; residence and sponsor details for non-Omani residents).\n5. Review the booking and the total.\n6. Complete payment.\n7. You get a confirmation with a booking reference, and the campaign contacts you to finish the paperwork.\n\nNote: this is a prototype — no real payment is taken.',
      ),
      suggestions: [
        L('ما الفرق بين الرحلة البرية والجوية؟', 'What is the difference between land and air trips?'),
        L('كيف أقارن بين حملتين؟', 'How do I compare two campaigns?'),
      ],
    }
  }

  if (findWord(text, ['مقارنه', 'قارن', 'اقارن', 'compare', 'comparison', 'side by side'])) {
    return {
      text: L(
        'اضغط زر «قارن» على أي حملة لإضافتها إلى المقارنة — يمكنك اختيار حتى ثلاث حملات. ثم افتح صفحة المقارنة لترى السعر والتقييم والسكن والمسافة عن الحرم والمقاعد والخدمات في جدول واحد، مع تمييز الأفضل في كل بند.',
        'Press “Compare” on any campaign to add it — you can hold up to three. Then open the comparison page to see price, rating, accommodation, distance from the Haram, seats and services in one table, with the best value in each row highlighted.',
      ),
      suggestions: defaultSuggestions(lang),
    }
  }

  if (findWord(text, ['الغاء', 'استرداد', 'ارجاع المبلغ', 'cancel', 'refund', 'cancellation'])) {
    return {
      text: L(
        'سياسة الإلغاء تحددها كل حملة، والسياسة المعروضة في هذا النموذج هي: الإلغاء قبل المغادرة بأكثر من ٤٥ يومًا قابل للاسترداد بعد خصم الرسوم الإدارية. راجع دائمًا بند «الشروط والأحكام» في صفحة الرحلة قبل الدفع.',
        'Each campaign sets its own cancellation policy. The policy shown in this prototype is: cancellation more than 45 days before departure is refundable minus administrative fees. Always read the “Terms & conditions” section on the trip page before paying.',
      ),
    }
  }

  if (
    findWord(text, [
      'وثائق', 'اوراق', 'مستندات', 'جواز', 'اقامه', 'كفيل', 'ما المطلوب',
      'documents', 'papers', 'passport', 'residence', 'sponsor', 'what do i need',
    ])
  ) {
    return {
      text: L(
        'للمسافر العُماني: الرقم المدني وصورة جواز السفر ساري المفعول ستة أشهر على الأقل.\n\nللمقيم غير العُماني: إضافة إلى الجواز، صورة بطاقة الإقامة وبطاقة الكفيل وصورة شخصية بخلفية بيضاء.\n\nوإذا كان معك مرافقون، تُطلب البيانات نفسها لكل مرافق. المتطلبات الرسمية النهائية تحددها الجهات المختصة، فيرجى التأكد منها.',
        'For an Omani traveller: civil ID and a passport valid for at least six months.\n\nFor a non-Omani resident: in addition to the passport, a residence card, sponsor card and a photo with a white background.\n\nIf you are travelling with companions, the same details are needed for each of them. Final official requirements are set by the relevant authorities — please confirm with them.',
      ),
    }
  }

  if (
    findWord(text, [
      'ماذا تشمل', 'شو تشمل', 'وش تشمل', 'الخدمات المشموله', 'ايش فيها',
      'what does it include', 'what is included', 'whats included', 'package include',
    ])
  ) {
    const isHajj = findWord(text, ['حج', 'hajj'])
    return {
      text: isHajj
        ? L(
            'باقات الحج على ناسِك تشمل عادة: السكن في مكة والمدينة، والوجبات، والمواصلات الداخلية، والإرشاد الديني، وإجراءات التأشيرة، وغالبًا جولات الزيارة والمرافقة الطبية. أما خيام منى والمشاعر فتختلف تفاصيلها بين حملة وأخرى، لذا اقرأ صفحة الرحلة بعناية.',
            'Hajj packages on NASEK typically include: Makkah and Madinah accommodation, meals, internal transport, religious guidance, visa processing, and usually ziyarat tours and medical support. Mina and Mashaer arrangements differ between campaigns, so read the trip page carefully.',
          )
        : L(
            'باقات العمرة تختلف كثيرًا. الرحلات الاقتصادية تشمل عادة السكن في مكة والمواصلات والتأشيرة فقط، بينما تشمل الباقات الأشمل السكن في المدينة والوجبات والمرشد الديني وجولات الزيارة. كل بطاقة رحلة على ناسِك تعرض خدماتها بوضوح.',
            'Umrah packages vary a lot. Budget trips usually include Makkah accommodation, transport and the visa only, while fuller packages add Madinah accommodation, meals, a religious guide and ziyarat tours. Every trip card on NASEK lists exactly what it includes.',
          ),
      suggestions: defaultSuggestions(lang),
    }
  }

  if (
    findWord(text, [
      'الفرق بين البري والجوي', 'بري او جوي', 'ايهما افضل بري',
      'difference between land and air', 'land or air', 'land vs air',
    ])
  ) {
    const land = CAMPAIGNS.filter((c) => c.travelMethod === 'land')
    const air = CAMPAIGNS.filter((c) => c.travelMethod === 'air')
    const landMin = Math.min(...land.map((c) => c.price))
    const airMin = Math.min(...air.map((c) => c.price))
    return {
      text: L(
        `الرحلة البرية أوفر بكثير — تبدأ من ${landMin} ريال على المنصة — لكنها تستغرق يومين تقريبًا في الطريق ذهابًا وإيابًا، وهي مناسبة لمن لديه وقت ويريد خفض التكلفة.\n\nالرحلة الجوية تبدأ من ${airMin} ريال وتختصر السفر إلى ساعتين، وهي الخيار المعتاد لكبار السن والعائلات التي لا تحتمل الطريق الطويل.`,
        `Land trips are far cheaper — from ${landMin} OMR on the platform — but the road takes roughly two days each way. They suit travellers with time who want to keep costs down.\n\nAir trips start at ${airMin} OMR and cut the journey to about two hours, which is the usual choice for elderly pilgrims and families who cannot manage a long road trip.`,
      ),
      suggestions: [
        L('أرخص عمرة برية', 'Cheapest land Umrah'),
        L('عمرة جوية من مسقط', 'Air Umrah from Muscat'),
      ],
    }
  }

  if (findWord(text, ['موثقه', 'توثيق', 'مرخصه', 'ترخيص', 'مضمونه', 'verified', 'licence', 'license', 'trusted', 'safe'])) {
    return {
      text: L(
        'شارة «موثّقة من ناسِك» تعني أن فريق ناسِك راجع بيانات صاحب الحملة داخل المنصة. وهي ليست ترخيصًا رسميًا ولا بديلًا عنه — تحقق دائمًا من ترخيص الحملة لدى وزارة الأوقاف والشؤون الدينية قبل دفع أي مبلغ.\n\nكما أن هذا النموذج الأولي يعرض حملات افتراضية لأغراض العرض فقط.',
        'The “Verified by NASEK” badge means the NASEK team has reviewed the campaign owner’s details inside the platform. It is not an official licence and is not a substitute for one — always confirm a campaign’s licence with the Ministry of Endowments and Religious Affairs before paying.\n\nAlso note that this prototype shows fictional campaigns for demonstration only.',
      ),
    }
  }

  // ---------------------------------------------- 4. campaign retrieval
  const parsed = parseNaturalQuery(message, lang)
  const wantsCheap = !!findWord(text, INTENT_WORDS.cheap)
  const wantsBest = !!findWord(text, INTENT_WORDS.best)
  const wantsNear = !!findWord(text, INTENT_WORDS.near)
  const wantsElderly = !!findWord(text, INTENT_WORDS.elderly)

  let pool = CAMPAIGNS.slice()
  const f = parsed.filters

  if (f.type) pool = pool.filter((c) => c.type === f.type)
  if (f.wilayahIds?.length) pool = pool.filter((c) => f.wilayahIds!.includes(c.wilayahId))
  if (f.travelMethod && f.travelMethod !== 'all') pool = pool.filter((c) => c.travelMethod === f.travelMethod)
  if (f.priceMax != null) pool = pool.filter((c) => c.price <= f.priceMax!)
  if (f.priceMin != null) pool = pool.filter((c) => c.price >= f.priceMin!)
  if (f.dateFrom) pool = pool.filter((c) => c.departureDate >= f.dateFrom!)
  if (f.dateTo) pool = pool.filter((c) => c.departureDate <= f.dateTo!)
  if (f.services?.length) pool = pool.filter((c) => f.services!.every((s) => c.services.includes(s)))
  if (f.minSeats) pool = pool.filter((c) => c.seatsAvailable >= f.minSeats!)
  if (wantsElderly) pool = pool.filter((c) => c.services.includes('medical') || c.services.includes('wheelchair'))

  if (pool.length === 0) {
    // Nothing matched. Say so honestly and relax the tightest constraint.
    const relaxed = relaxSearch(parsed.filters)
    return {
      text: L(
        `لم أجد رحلة تطابق كل ما ذكرته. ${relaxed.length ? 'هذه أقرب الخيارات إذا خفّفنا بعض الشروط:' : 'جرّب توسيع الميزانية أو فترة السفر.'}`,
        `I couldn’t find a trip matching everything you described. ${relaxed.length ? 'Here are the closest options if we loosen a condition:' : 'Try widening your budget or your travel window.'}`,
      ),
      campaignIds: relaxed.slice(0, 3).map((c) => c.id),
      suggestions: defaultSuggestions(lang),
    }
  }

  // Ordering follows the stated intent, defaulting to value-for-money.
  if (wantsBest) pool.sort((a, b) => b.rating - a.rating || a.price - b.price)
  else if (wantsNear) pool.sort((a, b) => a.haramDistanceM - b.haramDistanceM)
  else pool.sort((a, b) => a.price - b.price)

  const top = pool.slice(0, 3)
  return {
    text: describe(top, pool.length, { wantsCheap, wantsBest, wantsNear }, lang),
    campaignIds: top.map((c) => c.id),
    suggestions: followUps(top[0], lang),
  }
}

// ------------------------------------------------------------------ helpers

function describe(
  top: Campaign[],
  totalFound: number,
  intent: { wantsCheap: boolean; wantsBest: boolean; wantsNear: boolean },
  lang: Lang,
): string {
  const L = (ar: string, en: string) => (lang === 'ar' ? ar : en)
  const best = top[0]
  const provider = providerById(best.providerId)
  const providerName = provider ? provider.name[lang] : ''

  const lead =
    totalFound === 1
      ? L('وجدت رحلة واحدة تطابق طلبك.', 'I found one trip matching your request.')
      : L(
          `وجدت ${totalFound} رحلة تطابق طلبك. هذه أقربها لما وصفته:`,
          `I found ${totalFound} trips matching your request. These are the closest to what you described:`,
        )

  const why = intent.wantsBest
    ? L(
        `أعلاها تقييمًا «${best.title.ar}» من ${providerName} بتقييم ${best.rating}.`,
        `The highest rated is “${best.title.en}” from ${providerName}, at ${best.rating}.`,
      )
    : intent.wantsNear
      ? L(
          `أقربها للحرم «${best.title.ar}» — السكن على بعد ${best.haramDistanceM} مترًا.`,
          `The closest to the Haram is “${best.title.en}” — accommodation ${best.haramDistanceM} m away.`,
        )
      : L(
          `أوفرها «${best.title.ar}» من ${providerName} بسعر ${best.price} ريال للفرد، تغادر من ${wilayahName(best.wilayahId, 'ar')} ${best.travelMethod === 'air' ? 'جوًا' : 'برًا'}، وبقي فيها ${best.seatsAvailable} مقعدًا.`,
          `The best value is “${best.title.en}” from ${providerName} at ${best.price} OMR per person, departing from ${wilayahName(best.wilayahId, 'en')} by ${best.travelMethod}, with ${best.seatsAvailable} seats left.`,
        )

  const services = best.services
    .slice(0, 4)
    .map((s) => serviceLabel(s, lang))
    .join(lang === 'ar' ? '، ' : ', ')

  const includes = L(`تشمل: ${services}.`, `It includes: ${services}.`)

  return `${lead}\n\n${why}\n${includes}`
}

/** Drop the price cap, then the date window, until something matches. */
function relaxSearch(filters: Partial<import('@/types').SearchFilters>): Campaign[] {
  let pool = CAMPAIGNS.slice()
  if (filters.type) pool = pool.filter((c) => c.type === filters.type)
  if (filters.wilayahIds?.length) {
    const narrowed = pool.filter((c) => filters.wilayahIds!.includes(c.wilayahId))
    if (narrowed.length) pool = narrowed
  }
  return pool.sort((a, b) => a.price - b.price)
}

function followUps(campaign: Campaign | undefined, lang: Lang): string[] {
  const L = (ar: string, en: string) => (lang === 'ar' ? ar : en)
  if (!campaign) return defaultSuggestions(lang)
  return [
    L('أرخص من هذا؟', 'Anything cheaper?'),
    L('ما الذي تشمله؟', 'What does it include?'),
    L('كيف أحجز؟', 'How do I book?'),
  ]
}

export function defaultSuggestions(lang: Lang): string[] {
  const L = (ar: string, en: string) => (lang === 'ar' ? ar : en)
  return [
    L('أرخص عمرة من مسقط', 'Cheapest Umrah from Muscat'),
    L('ماذا تشمل باقة الحج؟', 'What does a Hajj package include?'),
    L('رحلات بمجموعات نسائية', 'Trips with women-only groups'),
    L('كيف تتم عملية الحجز؟', 'How does booking work?'),
  ]
}
