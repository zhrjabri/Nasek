import type { Review } from '@/types'

/** DEMO DATA — sample customer reviews. Names are fictional. */
export const REVIEWS: Review[] = [
  {
    id: 'r1', userId: 'u10', userName: 'أحمد الحارثي', campaignId: 'c1', providerId: 'p1', rating: 5,
    comment: {
      ar: 'التنظيم ممتاز والباص انطلق في وقته بالضبط. السكن كان أبعد قليلًا مما توقعت لكن المشي إلى الحرم كان مريحًا.',
      en: 'Excellent organisation and the coach left exactly on time. The hotel was a bit further than I expected but the walk to the Haram was easy.',
    },
    date: '2026-06-12',
  },
  {
    id: 'r2', userId: 'u11', userName: 'مريم البلوشية', campaignId: 'c1', providerId: 'p1', rating: 4,
    comment: {
      ar: 'رحلة موفقة ومرشد متعاون جدًا. أتمنى لو كانت الوجبات مشمولة في السعر.',
      en: 'A good trip with a very helpful guide. I wish meals had been included in the price.',
    },
    date: '2026-05-30',
  },
  {
    id: 'r3', userId: 'u12', userName: 'سالم الرواحي', campaignId: 'c3', providerId: 'p2', rating: 5,
    comment: {
      ar: 'أفضل حملة تعاملت معها. جولات الزيارة في المدينة كانت منظمة والمواعيد دقيقة.',
      en: 'The best campaign I have travelled with. The ziyarat tours in Madinah were well organised and timings were precise.',
    },
    date: '2026-07-02',
  },
  {
    id: 'r4', userId: 'u13', userName: 'فاطمة الكندية', campaignId: 'c3', providerId: 'p2', rating: 5,
    comment: {
      ar: 'الفندق قريب جدًا من الحرم والوجبات كانت ممتازة. أنصح به للعائلات.',
      en: 'The hotel was very close to the Haram and the food was excellent. I recommend it for families.',
    },
    date: '2026-04-18',
  },
  {
    id: 'r5', userId: 'u14', userName: 'خالد الغافري', campaignId: 'c15', providerId: 'p3', rating: 5,
    comment: {
      ar: 'حج بترتيب لا يوصف. خيام منى كانت مكيفة فعلًا والمشرفون معنا في كل خطوة.',
      en: 'A remarkably well-run Hajj. The Mina tents really were air-conditioned and the supervisors were with us at every step.',
    },
    date: '2026-06-28',
  },
  {
    id: 'r6', userId: 'u15', userName: 'زينب اللواتية', campaignId: 'c15', providerId: 'p3', rating: 5,
    comment: {
      ar: 'الإرشاد الديني اليومي أضاف الكثير للرحلة. السعر مرتفع لكنه يستحق.',
      en: 'The daily religious guidance added a lot to the journey. The price is high but it is worth it.',
    },
    date: '2026-06-25',
  },
  {
    id: 'r7', userId: 'u16', userName: 'يوسف السيابي', campaignId: 'c2', providerId: 'p4', rating: 4,
    comment: {
      ar: 'السعر ممتاز مقابل ما يقدمونه. السكن مشترك فعلًا كما هو موضح، لا مفاجآت.',
      en: 'Great value for what is offered. Rooms really are shared as described — no surprises.',
    },
    date: '2026-05-11',
  },
  {
    id: 'r8', userId: 'u17', userName: 'عبدالله المعمري', campaignId: 'c2', providerId: 'p4', rating: 4,
    comment: {
      ar: 'الرحلة طويلة بالباص لكن التوقفات كانت كافية. حملة صادقة في وعودها.',
      en: 'A long coach journey but the rest stops were adequate. An honest campaign that keeps its promises.',
    },
    date: '2026-03-22',
  },
  {
    id: 'r9', userId: 'u18', userName: 'هدى الهنائية', campaignId: 'c6', providerId: 'p6', rating: 5,
    comment: {
      ar: 'المجموعة الصغيرة أحدثت فرقًا كبيرًا. لا انتظار ولا زحام، وكل شيء كان جاهزًا.',
      en: 'The small group made a real difference. No waiting, no crowding, and everything was ready for us.',
    },
    date: '2026-07-15',
  },
  {
    id: 'r10', userId: 'u19', userName: 'ناصر الشحي', campaignId: 'c11', providerId: 'p1', rating: 5,
    comment: {
      ar: 'العشر الأواخر في مكة تجربة لا تنسى، والسكن على بعد دقيقتين من الحرم.',
      en: 'The last ten nights in Makkah were unforgettable, and the hotel was a two-minute walk from the Haram.',
    },
    date: '2026-04-04',
  },
  {
    id: 'r11', userId: 'u20', userName: 'أمل الجابرية', campaignId: 'c8', providerId: 'p5', rating: 5,
    comment: {
      ar: 'المغادرة من صلالة وفّرت علينا رحلة برية طويلة. المرافقة الطبية كانت طمأنة كبيرة لوالدتي.',
      en: 'Departing from Salalah saved us a long road trip. The medical support was very reassuring for my mother.',
    },
    date: '2026-02-19',
  },
  {
    id: 'r12', userId: 'u21', userName: 'سعيد التوبي', campaignId: 'c4', providerId: 'p8', rating: 4,
    comment: {
      ar: 'حملة عريقة وإدارة محترمة. الغرف كانت نظيفة والتنقل بين مكة والمدينة سلس.',
      en: 'A long-established campaign with respectful management. Rooms were clean and the Makkah–Madinah transfer was smooth.',
    },
    date: '2026-01-28',
  },
  {
    id: 'r13', userId: 'u22', userName: 'رقية الفارسية', campaignId: 'c9', providerId: 'p7', rating: 5,
    comment: {
      ar: 'كمجموعة نسائية شعرنا بالراحة التامة. المرشدة كانت متمكنة ومتعاونة.',
      en: 'As a women-only group we felt completely comfortable. Our guide was knowledgeable and helpful.',
    },
    date: '2026-03-09',
  },
  {
    id: 'r14', userId: 'u23', userName: 'حمد الرشيدي', campaignId: 'c5', providerId: 'p9', rating: 4,
    comment: {
      ar: 'الخدمة لكبار السن مدروسة، والدي استفاد كثيرًا من الكرسي المتحرك والمرافق.',
      en: 'The elderly service is well thought out — my father benefited a lot from the wheelchair and assistant.',
    },
    date: '2026-05-21',
  },
  {
    id: 'r15', userId: 'u24', userName: 'إبراهيم البوسعيدي', campaignId: 'c17', providerId: 'p8', rating: 5,
    comment: {
      ar: 'مشرف لكل 15 حاجًا فكرة ممتازة، لم نشعر بالضياع في أي وقت.',
      en: 'One supervisor per 15 pilgrims is an excellent idea — we never felt lost at any point.',
    },
    date: '2026-06-30',
  },
  {
    id: 'r16', userId: 'u25', userName: 'شيخة العبرية', campaignId: 'c7', providerId: 'p1', rating: 5,
    comment: {
      ar: 'برنامج عائلي مناسب جدًا، والغرف الرباعية وفّرت علينا الكثير.',
      en: 'A very suitable family programme, and the quad rooms saved us a lot.',
    },
    date: '2026-01-11',
  },
  {
    id: 'r17', userId: 'u26', userName: 'طارق الزدجالي', campaignId: 'c16', providerId: 'p3', rating: 4,
    comment: {
      ar: 'السكن بعيد نسبيًا لكن الباصات كانت منتظمة. خيار جيد لمن يريد حجًا منظمًا بتكلفة أقل.',
      en: 'Accommodation is relatively far but the buses ran regularly. A good option for a well-run Hajj at lower cost.',
    },
    date: '2026-06-27',
  },
  {
    id: 'r18', userId: 'u27', userName: 'بدرية الحجرية', campaignId: 'c13', providerId: 'p6', rating: 5,
    comment: {
      ar: 'برنامج قيام الليل الجماعي كان أجمل ما في الرحلة. مجموعة صغيرة ومترابطة.',
      en: 'The group qiyam programme was the highlight of the trip. A small, close-knit group.',
    },
    date: '2026-03-31',
  },
]

export const reviewsForCampaign = (campaignId: string) =>
  REVIEWS.filter((r) => r.campaignId === campaignId)

export const reviewsForProvider = (providerId: string) =>
  REVIEWS.filter((r) => r.providerId === providerId)
