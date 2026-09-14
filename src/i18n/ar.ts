import type { PublicMessageKey } from './en'

/**
 * Arabic strings — the platform's primary language.
 * Typed as `Record<PublicMessageKey, string>` so it can never drift out of sync
 * with `en.ts`.
 */
export const ar: Record<PublicMessageKey, string> = {
  // ---------------------------------------------------------------- common
  'common.appName': 'ناسِك',
  'common.tagline': 'حملات الحج والعمرة في سلطنة عُمان، في مكان واحد',
  'common.perPerson': 'للفرد',
  'common.seatsLeft': 'بقي {n} مقعدًا',
  'common.lastSeats': 'بقي {n} فقط',
  'common.soldOut': 'اكتمل العدد',
  'common.reviews': '{n} تقييمًا',
  'common.rating': 'التقييم',
  'common.from': 'من',
  'common.to': 'إلى',
  'common.search': 'بحث',
  'common.searching': 'جارٍ البحث…',
  'common.filters': 'خيارات الفرز',
  'common.clear': 'مسح',
  'common.clearAll': 'مسح الكل',
  'common.cancel': 'إلغاء',
  'common.remove': 'إزالة',
  'error.title': 'توقف هذا الجزء من الصفحة عن العمل',
  'error.body':
    'بقية الشاشة تعمل كالمعتاد. حاول مرة أخرى، وإذا تكرر الأمر أرسل لنا الرسالة التالية.',
  'error.retry': 'حاول مرة أخرى',
  'error.reload': 'إعادة تحميل الصفحة',
  'common.close': 'إغلاق',
  'common.back': 'رجوع',
  'common.next': 'التالي',
  'common.skip': 'تخطي',
  'common.previous': 'السابق',
  'common.continue': 'متابعة',
  'common.save': 'حفظ',
  'common.saved': 'محفوظ',
  'common.edit': 'تعديل',
  'common.delete': 'حذف',
  'common.viewAll': 'عرض الكل',
  'common.viewDetails': 'عرض التفاصيل',
  'common.bookNow': 'احجز الآن',
  'common.required': 'مطلوب',
  'common.all': 'الكل',
  'common.verified': 'موثّقة من ناسِك',
  'common.pendingVerification': 'قيد التوثيق',
  'common.hajj': 'حج',
  'common.umrah': 'عمرة',
  'common.air': 'مسار جوي',
  'common.land': 'مسار بري',
  'common.travellers': 'المسافرون',
  'common.departure': 'المغادرة',
  'common.return': 'العودة',
  'common.total': 'الإجمالي',
  'common.name': 'الاسم',
  'common.email': 'البريد الإلكتروني',
  'common.phone': 'رقم الهاتف',
  'common.wilayah': 'الولاية',
  'common.status': 'الحالة',
  'common.date': 'التاريخ',
  'common.price': 'السعر',
  'common.experience': '{n} سنة خبرة',
  'common.language': 'اللغة',
  'common.menu': 'القائمة',
  'common.skipToContent': 'تخطَّ إلى المحتوى',

  // ------------------------------------------------------------------- nav
  'nav.home': 'الرئيسية',
  'nav.campaigns': 'الحملات',
  'nav.smartMatch': 'المطابقة الذكية',
  'nav.map': 'الخريطة',
  'nav.giving': 'ناسِك الخير',
  'nav.about': 'عن ناسِك',
  'nav.signIn': 'تسجيل الدخول',
  'nav.signInShort': 'دخول',
  'nav.signOut': 'تسجيل الخروج',
  'nav.saved': 'المحفوظات',
  'nav.notifications': 'الإشعارات',
  'nav.myBookings': 'حجوزاتي',

  // ------------------------------------------------------------------ hero
  'hero.titlePre': 'رحلتك إلى ',
  'hero.titleMark': 'بيت الله',
  'hero.titlePost': '،',
  'hero.titleB': 'تبدأ من هنا',
  'hero.subtitle':
    'اكتشف حملات الحج والعمرة بسهولة، وابحث عن الحملة المناسبة لك.',
  'hero.trust': 'جميع الحملات المعروضة معتمدة من ناسِك',
  'hero.ctaSecondary': 'تصفّح الحملات',
  'hero.statCampaigns': 'رحلة معروضة',
  'hero.statProviders': 'صاحب حملة',
  'hero.statWilayat': 'ولاية مغطاة',
  'hero.statReviews': 'تقييم عميل',

  // ---------------------------------------------------------------- search
  'search.title': 'ابحث عن رحلتك',
  'search.type': 'نوع الرحلة',
  'search.where': 'المغادرة من',
  'search.anyWilayah': 'كل الولايات',
  'search.budget': 'الميزانية',
  'search.travellers': 'عدد المسافرين',
  'search.submit': 'ابحث عن الحملات',
  'search.smartTab': 'اكتب طلبك بكلماتك',
  'search.classicTab': 'بحث بالخيارات',
  'search.smartPlaceholder':
    'مثال: أبغى عمرة من مسقط لشخصين بأقل من ٥٠٠ ريال في ديسمبر',
  'search.smartHint': 'اكتب بالعربية أو الإنجليزية — وناسِك يحوّل طلبك إلى خيارات بحث.',
  'search.smartAnalyse': 'حلّل طلبي',
  'search.smartThinking': 'جارٍ قراءة طلبك…',
  'search.smartUnderstood': 'هذا ما فهمه ناسِك من طلبك',
  'search.smartNothing':
    'لم يتمكن ناسِك من استخلاص خيارات من هذا النص. جرّب ذكر نوع الرحلة أو الولاية أو الميزانية أو الشهر.',
  'search.smartApply': 'اعرض {n} حملة مطابقة',
  'search.tryExample': 'جرّب مثالًا',

  // --------------------------------------------------------------- filters
  'filters.type': 'نوع الرحلة',
  'filters.location': 'ولاية المغادرة',
  'filters.price': 'السعر للفرد',
  'filters.travelMethod': 'وسيلة السفر',
  'filters.date': 'فترة السفر',
  'filters.rating': 'أقل تقييم',
  'filters.seats': 'أقل عدد مقاعد متاحة',
  'filters.services': 'الخدمات',
  'filters.anyRating': 'أي تقييم',
  'filters.starsUp': '{n} نجوم فأكثر',
  'filters.showResults': 'اعرض {n} نتيجة',
  'filters.active': '{n} مفعّل',
  'filters.applied': 'عوامل الفرز المطبَّقة',
  'filters.remove': 'إزالة هذا الفرز',
  'filters.chipSeats': '{n}+ مقاعد متاحة',

  // ------------------------------------------------------------------ sort
  'sort.label': 'الترتيب حسب',
  'sort.recommended': 'الأنسب لك',
  'sort.price_asc': 'الأقل سعرًا',
  'sort.price_desc': 'الأعلى سعرًا',
  'sort.rating': 'الأعلى تقييمًا',
  'sort.popular': 'الأكثر حجزًا',
  'sort.seats': 'الأكثر مقاعد متاحة',

  // -------------------------------------------------------------- campaign
  'campaign.results': '{n} حملة',
  'campaign.resultsOne': 'حملة واحدة',
  'campaign.noResults': 'لا توجد حملات تطابق هذه الخيارات',
  'campaign.noResultsHint':
    'جرّب توسيع الميزانية، أو اختيار ولاية أخرى، أو إزالة بعض خيارات الفرز.',
  'campaign.includes': 'الخدمات المشمولة',
  'campaign.moreServices': '+{n} أخرى',
  'campaign.duration': '{n} أيام',
  'campaign.coverHajj': 'مكة المكرمة · المشاعر المقدسة',
  'campaign.coverMakkahMadinah': 'مكة المكرمة · المدينة المنورة',
  'campaign.coverMakkah': 'مكة المكرمة',
  'campaign.byProvider': 'تنظّمها',
  'campaign.aboutTrip': 'عن هذه الرحلة',
  'campaign.accommodation': 'السكن',
  'campaign.makkah': 'مكة المكرمة',
  'campaign.madinah': 'المدينة المنورة',
  'campaign.terms': 'الشروط والأحكام',
  'campaign.termsBody':
    'الأسعار للفرد الواحد وتشمل الخدمات المذكورة أعلاه. شروط الدفع والإلغاء يحددها صاحب الحملة، فتأكد منها معه مباشرة قبل الدفع. يجب أن يكون جواز السفر ساري المفعول ستة أشهر على الأقل من تاريخ المغادرة.',
  'campaign.contact': 'تواصل مع الحملة',
  'review.write': 'اكتب تقييمًا',
  'review.thanks': 'تم التقييم',
  'review.formTitle': 'كيف كانت الرحلة؟',
  'review.formNote': 'تقييمك عَلني ويظهر على هذه الرحلة باسمك الأول. يمكنك تقييم الرحلة مرة واحدة.',
  'review.rating': 'التقييم',
  'review.stars': '{n} من 5',
  'review.comment': 'ما الذي يهمّ الحجّاج الآخرين معرفته؟',
  'review.submit': 'انشر التقييم',
  'review.posted': 'شكرًا لك — نُشر تقييمك',
  'review.replyTitle': 'ردّ الحملة',
  'review.anonymous': 'أحد الحجّاج',
  'campaign.reviewsTitle': 'آراء المسافرين',
  'campaign.noReviews': 'لا توجد تقييمات لهذه الرحلة بعد.',
  'campaign.report': 'الإبلاغ عن هذه الحملة',
  'campaign.reported': 'شكرًا لك — سيراجع فريق ناسِك هذه الحملة.',
  'campaign.similar': 'حملات مشابهة',
  'campaign.seatsBar': 'حُجز {booked} من {total} مقعدًا',
  'campaign.saveNeedsAccount': 'سجّل الدخول لحفظ هذه الرحلة — الحملات المحفوظة تتبع حسابك لا هذا المتصفّح.',
  'campaign.saveFailed': 'تعذّر الحفظ الآن. يُرجى المحاولة مرة أخرى.',
  'campaign.savedToast': 'حُفظت في قائمتك',
  'campaign.unsavedToast': 'أُزيلت من قائمتك',

  'campaign.browse': 'تصفّح الحملات',
  'campaign.haramLabel': 'المسافة عن الحرم',
  'campaign.seatsLabel': 'المقاعد المتاحة',
  'provider.verificationLabel': 'التوثيق',

  // ----------------------------------------------------------- smart match
  'smart.navTitle': 'المطابقة الذكية من ناسِك',
  'smart.title': 'اعثر على حملتك المثالية',
  'smart.subtitle':
    'أجب عن بضعة أسئلة وسيجد ناسِك الحملات التي تناسب احتياجاتك.',
  'smart.start': 'ابدأ المطابقة الذكية',
  'smart.step': 'الخطوة {n} من {total}',
  'smart.q1': 'هل تبحث عن حج أم عمرة؟',
  'smart.q2': 'من أي ولاية ستسافر؟',
  'smart.q3': 'ما ميزانيتك للفرد الواحد؟',
  'smart.q4': 'متى تفضّل السفر؟',
  'smart.q5': 'هل تفضّل المسار البري أم الجوي؟',
  'smart.q6': 'ما أهم الخدمات بالنسبة لك؟',
  'smart.q7': 'كم عدد المسافرين؟',
  'smart.q1hint': 'هذا يحدد الرحلات التي سنبحث فيها.',
  'smart.q2hint': 'نرجّح الحملات التي تغادر من قريب منك.',
  'smart.q3hint': 'حرّك المؤشر لتحديد أعلى سعر مريح لك.',
  'smart.q4hint': 'اختر موسمًا، أو اتركه مفتوحًا.',
  'smart.q5hint': 'الرحلات البرية أقل تكلفة، والجوية أقصر بكثير.',
  'smart.q6hint': 'اختر حتى أربع خدمات، ونمنحها وزنًا كبيرًا.',
  'smart.q7hint': 'نتأكد من توفر مقاعد كافية.',
  'smart.noPreference': 'لا تفضيل',
  'smart.upTo': 'حتى {n} ريال',
  'smart.analysing': 'نطابق طلبك مع الحملات…',
  'smart.analysingStep1': 'قراءة تفضيلاتك',
  'smart.analysingStep2': 'تقييم ٢٠ حملة',
  'smart.analysingStep3': 'ترتيب أفضل النتائج',
  'smart.resultsTitle': 'نتائجك من ناسِك',
  'smart.resultsSubtitle': 'مرتّبة حسب مدى مطابقتها لما طلبته.',
  'smart.match': 'مطابقة {n}٪',
  'smart.whyMatch': 'لماذا تناسبك',
  'smart.tradeoff': 'يجدر الانتباه',
  'smart.restart': 'ابدأ من جديد',
  'smart.showMatchesNow': 'اعرض نتائجي الآن',
  'smart.answeredNote': 'أجب عمّا يهمّك فقط — وسنستخدم خيارات افتراضية معقولة لبقية الأسئلة.',
  'smart.noMatches': 'لا توجد حملة تطابق هذه التفضيلات حاليًا',
  'smart.noMatchesHint':
    'جرّب رفع الميزانية، أو السماح بالمسارين البري والجوي، أو توسيع فترة السفر.',
  'smart.relax': 'خفّف تفضيلاتي',

  // ----------------------------------------------------------------- steps
  'how.title': 'كيف يعمل ناسِك',
  'how.subtitle': 'أربع خطوات بينك وبين الحملة المناسبة.',
  'how.s1.title': 'ابحث',
  'how.s1.body': 'أخبرنا بما تحتاجه — بكلماتك أو عبر خيارات الفرز.',
  'how.s2.title': 'استعرض',
  'how.s2.body': 'افتح الحملة لتقرأ سعرها وخدماتها وفنادقها وتقييماتها بالتفصيل.',
  'how.s3.title': 'اختر',
  'how.s3.body': 'اختر الحملة التي تناسب ميزانيتك وعائلتك.',
  'how.s4.title': 'احجز',
  'how.s4.body': 'احجز مقاعدك واحصل على تأكيد يمكنك الاحتفاظ به.',

  // ------------------------------------------------------------------- why
  'why.title': 'لماذا ناسِك',
  'why.subtitle': 'بُنيت المنصة حول المشكلات التي ذكرها الحجاج والمعتمرون فعلًا.',
  'why.1.title': 'كل الحملات في مكان واحد',
  'why.1.body':
    'بدلًا من السؤال هنا وهناك عن أرقام الهواتف، تتصفّح حملات السلطنة في دليل واحد، وكل واحدة موصوفة بالمعايير نفسها.',
  'why.2.title': 'أسعار واضحة ومفصّلة',
  'why.2.body':
    'كل سعر معروض للفرد ومع الخدمات التي يشملها، حتى تميّز بسهولة بين الرحلة الرخيصة والرحلة المتكاملة.',
  'why.3.title': 'مقاعد يمكنك الاعتماد عليها',
  'why.3.body':
    'كل رحلة تعرض عدد المقاعد المتبقية، لتعرف إن كان عليك الحسم اليوم أم أن لديك متسعًا للتفكير.',
  'why.4.title': 'تقييمات من مسافرين حقيقيين',
  'why.4.body':
    'التقييمات تأتي ممن سافروا مع الحملة فعلًا، لا من إعلانات الحملة نفسها.',
  'why.5.title': 'قريبة من بيتك',
  'why.5.body':
    'افرز حسب الولاية لتجد الحملات التي تغادر من قربك — وهو السبب الأصلي لوجود ناسِك.',
  'why.6.title': 'أصحاب حملات مرخّصون فقط',
  'why.6.body':
    'كل صاحب حملة يسجّل بسجله التجاري وتعتمده ناسِك قبل أن تظهر أي رحلة.',

  // ------------------------------------------------------------- home misc
  'home.featured': 'حملات مختارة',
  'home.featuredSub': 'رحلات بتقييمات عالية ولا تزال مقاعدها متاحة.',
  'home.popular': 'الأكثر حجزًا هذا الموسم',
  'home.popularSub': 'ما يختاره الحجاج والمعتمرون في عُمان الآن.',
  'home.reviewsTitle': 'من مسافرين استخدموا ناسِك',
  'home.mapTitle': 'الحملات في أنحاء السلطنة',
  'home.mapSub': 'اختر ولاية لترى الحملات التي تغادر منها.',
  'home.finalCta.title': 'جاهز لتجد حملتك؟',
  'home.finalCta.body': 'أجب عن سبعة أسئلة قصيرة وشاهد أفضل النتائج في أقل من دقيقة.',
  'home.stage1': 'ابدأ رحلتك',
  'home.stage2': 'ما الذي يناسبك',
  'home.stage3': 'اكتشف الحملات',
  'home.stage4': 'من عُمان إلى وجهتك',
  'home.stage5': 'رحلتك خطوة بخطوة',
  'home.stage6': 'سافر باطمئنان',
  'home.stage7': 'ناسِك الخير',
  'home.stage8': 'الرحلة تبدأ الآن',
  'home.emptyCampaigns': 'لا توجد حملات معروضة الآن. تُفتح الحملات مع بداية كل موسم.',
  'home.openNow': 'مفتوح للحجز الآن',
  'home.smartTitle': 'سبعة أسئلة قصيرة، ونتيجة واحدة تناسبك.',

  // ------------------------------------------------------------------- map
  'map.title': 'الحملات حسب الولاية',
  'map.subtitle': 'اختر ولاية لعرض الحملات التي تغادر منها.',
  'map.campaignsIn': 'الحملات المغادرة من {name}',
  'map.count': '{n} حملة',
  'map.countOne': 'حملة واحدة',
  'map.none': 'لا توجد حملات تغادر من هنا بعد',
  'map.noneHint': 'يمكن لأصحاب الحملات في هذه الولاية أن يكونوا أول من يعرض رحلة.',
  'map.selectHint': 'اختر ولاية على الخريطة',
  'map.legend': 'حجم الدائرة يدل على عدد الحملات المغادرة من كل ولاية.',
  'map.source': 'الحدود من بيانات جغرافية عامة',

  // --------------------------------------------------------------- booking
  'booking.title': 'أكمل حجزك',
  'booking.stepPassengers': 'المسافرون',
  'booking.stepReview': 'المراجعة',
  'booking.chooseTrip': 'الرحلة المختارة',
  'booking.changeTrip': 'اختر رحلة أخرى',
  'booking.passengersTitle': 'من سيسافر؟',
  'booking.travellersNote': 'بما فيهم أنت. يتوفر {n} مقعدًا في هذه الرحلة.',
  'booking.omani': 'عُماني',
  'booking.nonOmani': 'مقيم غير عُماني',
  'booking.male': 'ذكور',
  'booking.female': 'إناث',
  'booking.totalPassengers': 'إجمالي المسافرين',
  'booking.atLeastOne': 'الحجز يحتاج مسافرًا واحدًا على الأقل.',
  'booking.reviewTitle': 'راجع طلب الحجز',
  'booking.reviewNote': 'تأكد من كل رقم. هذا ما سيصل إلى صاحب الحملة.',
  'booking.campaign': 'الحملة',
  'booking.tripNo': 'الرحلة رقم',
  'booking.tripDate': 'تاريخ الرحلة',
  'booking.created': 'تاريخ إنشاء الطلب',
  'booking.manualPaymentNote':
    'ناسِك لا يستقبل المدفوعات. إنشاء هذا الطلب يُصدر فاتورة ترسلها إلى صاحب الحملة عبر واتساب، فيرد عليك ببيانات الدفع ويؤكد الحجز بعد استلامه المبلغ.',
  'booking.temporarilyUnavailable':
    'الحجز غير متاح مؤقتًا ريثما يكمل ناسِك تحديثًا. لم يُخصم أي مبلغ ولم يُحفظ أي طلب — يرجى المحاولة بعد قليل.',
  'booking.createRequest': 'إنشاء طلب الحجز',
  'booking.processing': 'جارٍ إنشاء طلب الحجز…',
  'booking.pricePerPerson': 'السعر للفرد',
  'booking.notEnoughSeats': 'لم يتبقَ سوى {n} مقعدًا في هذه الرحلة.',

  // ------------------------------------------------- the customer's number
  'booking.phoneRequired': 'يرجى إضافة رقم هاتفك لإتمام طلب الحجز.',
  'booking.phoneRequiredWhy':
    'يرد صاحب الحملة عليك مباشرة ببيانات الدفع، لذا يجب أن تحمل فاتورتك رقمًا يستطيع الوصول إليك عليه.',
  'booking.phoneAdd': 'إضافة رقم هاتفي',
  'booking.phoneReturn': 'رحلتك وعدد المسافرين محفوظان — وستعود إلى هنا مباشرة.',

  // -------------------------------------------------------------- invoice
  'booking.requestTitle': 'تم حفظ طلب الحجز',
  'booking.requestBody':
    'أصدر ناسِك الفاتورة أدناه. أرسلها إلى صاحب الحملة للحصول على بيانات الدفع.',
  'booking.invoiceNo': 'رقم فاتورة ناسِك',
  'booking.awaitingPayment': 'بانتظار الدفع',
  // ------------------------------ what a request does and does not hold
  'booking.seatNotHeld': 'مقعدك ليس محجوزاً بعد',
  'booking.seatNotHeldBody':
    'تبقى هذه المقاعد معروضة للبيع حتى يؤكّد صاحب الحملة استلام مبلغك. أرسل الفاتورة وسدّد في أقرب وقت — فالمقاعد تصبح لك من لحظة التأكيد، لا قبلها.',
  'booking.sendWhatsapp': 'إرسال الفاتورة لصاحب الحملة عبر واتساب',
  'booking.sendWhatsappNote':
    'سيتم التواصل مع صاحب الحملة مباشرة للحصول على بيانات الدفع وإتمام الحجز.',
  'booking.noProviderPhone': 'لا يتوفر رقم تواصل للحملة حاليًا.',
  'booking.noProviderPhoneNote':
    'طلب حجزك محفوظ ويستطيع صاحب الحملة رؤيته. وقد أُبلغ ناسِك بأن هذه الشركة لا تملك رقم تواصل مسجلًا.',
  'booking.viewBookings': 'الذهاب إلى حجوزاتي',
  'booking.backHome': 'العودة للرئيسية',
  'booking.signInFirst': 'سجّل الدخول لإكمال الحجز',
  'booking.signInNote':
    'يكفي بريد إلكتروني ورمز تحقق. اختيارك محفوظ — وستعود إلى هنا مباشرة.',
  'booking.print': 'طباعة الفاتورة',

  // ------------------------------------------------------------------ auth
  'auth.passwordRequired': 'أدخل كلمة المرور',
  'auth.signInChecking': 'جارٍ التحقق…',
  'auth.signInFailed': 'لا تطابق هذه البيانات أي حساب.',
  'auth.emailTaken': 'يوجد حساب مسجَّل بهذا البريد الإلكتروني.',
  'auth.showPassword': 'إظهار كلمة المرور',
  'auth.hidePassword': 'إخفاء كلمة المرور',
  'auth.password': 'كلمة المرور',
  'auth.confirmPassword': 'تأكيد كلمة المرور',
  'auth.companyName': 'اسم الحملة',
  'auth.experienceYears': 'سنوات الخبرة',
  'auth.companyTagline': 'وصف مختصر',
  'auth.companyTaglineHint': 'سطر واحد يظهر للمعتمرين في بطاقة حملتك.',
  'auth.contactName': 'المسؤول عن الحملة',
  'auth.licenceLabel': 'صورة الترخيص / التصريح',
  'auth.licenceHint': 'صورة أو مسح ضوئي لتصريح وزارة الأوقاف والشؤون الدينية. بصيغة JPG أو PNG وبحدّ أقصى 8 ميجابايت.',
  'auth.licenceUpload': 'اختر صورة',
  'auth.licenceRemove': 'إزالة',
  'auth.licencePreviewAlt': 'صورة الترخيص المرفوعة',
  'auth.licenceRequired': 'صورة الترخيص مطلوبة للتسجيل',
  'auth.licenceTypeError': 'الملف المختار ليس صورة. ارفع ملف JPG أو PNG.',
  'auth.licenceSizeError': 'حجم الصورة يتجاوز 8 ميجابايت. جرّب صورة أصغر.',
  'auth.licenceDecodeError': 'تعذّرت قراءة الصورة. جرّب ملفًا آخر.',
  'auth.emailInvalid': 'أدخل بريدًا إلكترونيًا صحيحًا',
  'auth.passwordShort': 'كلمة المرور يجب ألا تقل عن {n} أحرف',
  'auth.passwordRejected': 'لم تُقبل كلمة المرور.',
  'auth.passwordMismatch': 'كلمتا المرور غير متطابقتين',
  'auth.phoneInvalid': 'أدخل رقم هاتف عُماني صحيح',
  'auth.creating': 'جارٍ إنشاء حسابك…',
  // -------------------------------------------- تسجيل الدخول برمز لمرة واحدة
  'auth.otpTitle': 'أهلاً بك في ناسِك',
  'auth.otpSubtitle': 'رحلتك تبدأ باختيار الحملة المناسبة.',
  'auth.chooseChannel': 'كيف تُفضّل استلام الرمز؟',
  'auth.continueEmail': 'البريد الإلكتروني',
  'auth.continuePhone': 'رقم الهاتف',
  /*
   * لا تذكر هذه النصوص عدد الأرقام.
   *
   * طول الرمز إعداد في Supabase (Email OTP Length) وليس قرارًا في هذا الملف —
   * وقد تغيّر من ستة إلى ثمانية دون أن تتغير هذه الجمل، فوعدت المستخدم بستة
   * أرقام بينما وصلته ثمانية. الصياغة التي لا تذكر عددًا تبقى صحيحة مهما تغيّر
   * الإعداد.
   */
  'auth.emailHint': 'سنرسل رمز تسجيل الدخول إلى هذا العنوان.',
  'auth.phoneHint': 'الأرقام العُمانية تُقبل بصيغة 9123 4567 أو ‎+968 9123 4567‎.',
  'auth.sendCode': 'أرسل الرمز',
  'auth.sending': 'جارٍ الإرسال…',
  'auth.codeSentEmail': 'أرسلنا رمز تسجيل الدخول إلى',
  'auth.codeSentPhone': 'أرسلنا رمز تسجيل الدخول برسالة نصية إلى',
  'auth.codeLabel': 'رمز التحقق',
  'auth.verify': 'تحقّق وتابع',
  'auth.verifying': 'جارٍ التحقق…',
  'auth.resend': 'إعادة الإرسال',
  'auth.resendIn': 'إعادة الإرسال بعد {n} ثانية',
  'auth.changeTarget': 'استخدام عنوان آخر',
  'auth.noPasswordNote':
    'لا حاجة لكلمة مرور. ناسِك لا يطلب منك إنشاءها أو تذكّرها — فلا شيء تنساه، ولا شيء لدينا لنفقده.',
  'auth.demoTitle': 'وضع العرض — لا يوجد خادم مُهيّأ',
  'auth.demoBody':
    'لم يُرسل شيء. أُنشئ هذا الرمز داخل متصفحك لتجربة العملية دون اتصال. هيّئ Supabase للإرسال الحقيقي.',
  'auth.errNotConfigured':
    'تسجيل الدخول غير متاح حاليًا — هذا الموقع غير متصل بخدمة المصادقة. حاول لاحقًا أو تواصل مع ناسِك.',
  'auth.errInvalidTarget': 'هذا لا يبدو بريدًا إلكترونيًا أو رقم هاتف صحيحًا.',
  'auth.errSendFailed': 'تعذّر إرسال الرمز. تأكد من العنوان وحاول مرة أخرى.',
  'auth.errMailQuota': 'بلغت هذه المنصّة الحدّ المسموح به لرسائل تسجيل الدخول خلال هذه الساعة. ستعمل الرموز مرة أخرى قريبًا — أو يمكن للمشرف رفع الحدّ بإعداد مزوّد بريد.',
  'auth.errRateLimited': 'محاولات كثيرة. انتظر قليلًا قبل طلب رمز جديد.',
  'auth.errWrongCode': 'الرمز غير صحيح.',
  'auth.errExpired': 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.',
  'auth.errTooMany': 'محاولات كثيرة. ابدأ من جديد برمز آخر.',
  'auth.errCodeFormat': 'أدخل الرمز كاملًا.',
  'auth.blockedSuspended': 'هذا الحساب موقوف. تواصل مع ناسِك لاستعادته.',
  'auth.blockedRemoved': 'هذا الحساب لم يعد نشطًا.',
  'auth.sessionFailed': 'تحققنا من الرمز لكن تعذّر فتح جلستك. حاول مرة أخرى.',
  // --------------------------------------------- الوصول عبر رابط البريد
  'auth.completingSignIn': 'جارٍ تسجيل دخولك…',
  'auth.linkExpired': 'انتهت صلاحية رابط الدخول أو استُخدم من قبل. اطلب رابطًا جديدًا.',
  'auth.linkWrongBrowser':
    'افتح الرابط في المتصفح نفسه الذي طلبته منه. لأسباب أمنية، لا يمكن للرابط إكمال تسجيل الدخول في مكان آخر.',
  'auth.linkFailed': 'تعذّر إكمال تسجيل الدخول عبر هذا الرابط. اطلب رابطًا جديدًا.',
  'auth.linkRetry': 'العودة لتسجيل الدخول',
  /*
   * لا توجد هنا نصوص "الصق الرابط".
   *
   * أُزيلت شاشة لصق الرابط من واجهة العميل: للعميل طريق واحد — بريد، ثم رمز.
   * ما بقي أدناه يخص الوصول عبر رابط يُضغط فعلًا، وهو مسار ما زال قائمًا.
   */

  // ------------------------------------------------------- user dashboard
  'dash.welcome': 'أهلًا، {name}',
  'dash.welcomeSub': 'هذا كل ما لديك في ناسِك.',
  'dash.bookings': 'حجوزاتي',
  'dash.saved': 'الحملات المحفوظة',
  'dash.profile': 'الملف الشخصي',
  'dash.notifications': 'الإشعارات',
  'dash.upcoming': 'القادمة',
  'dash.completed': 'المنتهية',
  'dash.cancelled': 'الملغاة',
  'dash.pending': 'بانتظار الدفع',
  'dash.awaitingPaymentNote': 'بانتظار إتمام الدفع مع صاحب الحملة',
  'dash.seatNotHeld':
    'ما زالت هذه المقاعد معروضة للبيع حتى يؤكّد صاحب الحملة استلام مبلغك.',
  'dash.resendInvoice': 'إعادة إرسال الفاتورة عبر واتساب',
  'dash.noBookings': 'لا توجد لديك حجوزات بعد',
  'dash.noBookingsHint': 'عند حجز رحلة ستظهر هنا مع رقم الحجز الخاص بها.',
  'dash.noSaved': 'لم تحفظ أي حملة',
  'dash.noSavedHint': 'اضغط على أيقونة الحفظ في أي حملة لتبقى هنا لاحقًا.',
  'dash.noNotifications': 'لا توجد إشعارات',
  'dash.markAllRead': 'تعليم الكل كمقروء',
  'dash.cancelBooking': 'إلغاء الحجز',
  'dash.cancelConfirm': 'هل تريد إلغاء هذا الحجز؟ لا يمكن التراجع عن ذلك.',
  'dash.bookingCancelled': 'أُلغي الحجز',
  'dash.cancelFailed': 'تعذّر إلغاء هذا الحجز. لم يتغيّر شيء — يُرجى المحاولة مرة أخرى.',
  'dash.daysToGo': 'بعد {n} يومًا',
  'dash.profileSaved': 'حُدّث الملف الشخصي',

  // --------------------------------------------------- provider dashboard
  // ---------------------------------------------------------------- giving
  'giving.title': 'ناسِك الخير',
  'giving.subtitle':
    'ساهم في تحقيق رحلة حج أو عمرة لأسرٍ تحتاج إلى الدعم.',
  'giving.body':
    'منذ البداية أراد مؤسسو ناسِك أن تكون المنصة أكثر من مجرد بيع مقاعد. «ناسِك الخير» برنامج مخطط له يتيح للأفراد وأصحاب الحملات المساهمة في تمويل رحلات كاملة لأسر محدودة الدخل في سلطنة عُمان.',
  'giving.how': 'كيف سيعمل البرنامج',
  'giving.h1.title': 'تُجمع المساهمات',
  'giving.h1.body': 'يساهم الأفراد وأصحاب الحملات والرعاة في صندوق مشترك.',
  'giving.h2.title': 'تتقدم الأسر بالطلبات',
  'giving.h2.body': 'تُراجع الطلبات بالتعاون مع الجهات الخيرية المختصة في السلطنة.',
  'giving.h3.title': 'تُموَّل المقاعد',
  'giving.h3.body': 'يحجز الصندوق مقاعد لدى حملات موثّقة بالسعر الذي تحدده الحملة.',
  'giving.h4.title': 'تُوثَّق الرحلة',
  'giving.h4.body': 'يرى المساهمون عدد الرحلات التي أتاحها دعمهم.',
  'giving.plannedTitle': 'ميزة مخطط لها',
  'giving.plannedBody':
    '«ناسِك الخير» لا يستقبل مساهمات بعد. لا يوجد نظام تبرعات متصل ولا يمكن جمع أي مبالغ من خلاله. تشرح هذه الصفحة البرنامج المقترح لاطلاع الشركاء والجهات المعنية ومراجعته.',
  'giving.interest': 'سجّل اهتمامك',
  'giving.interestNote': 'سنتواصل معك عند إطلاق البرنامج.',
  'giving.interestFailed': 'تعذّر الحفظ الآن. يُرجى المحاولة مرة أخرى.',
  'giving.interestThanks': 'شكرًا لك — سجّلنا اهتمامك.',
  'giving.statTrips': 'رحلة مستهدفة في السنة الأولى',
  'giving.statPartners': 'حملة شريكة ملتزمة',
  'giving.statCost': 'ريالًا تموّل مقعد عمرة بري واحد',

  // ----------------------------------------------------------------- about
  'about.title': 'عن ناسِك',
  'about.lead':
    'ناسِك منصة عُمانية تجمع حملات الحج والعمرة في السلطنة في مكان واحد، ليصبح اختيار الحملة مبنيًّا على معلومات واضحة لا على السماع.',
  'about.storyTitle': 'من أين بدأت',
  'about.story':
    'بدأ ناسِك كمشروع طلابي في كلية الخليج، انطلاقًا من فكرة أن الاقتصاد التشاركي يمكنه ربط حملات الحج والعمرة العُمانية بالباحثين عنها. يمتلك الفريق ملكية فكرية للفكرة، وتأهل إلى نهائي مسابقة إبداعات شبابية، ووصل إلى المرحلة الخامسة في إنجاز عُمان.',
  'about.problemTitle': 'المشكلة التي انطلقنا منها',
  'about.problemBody':
    'كان الحاج والمعتمر يجد صعوبة في العثور على الحملات القريبة منه، وفي معرفة ما يشمله السعر من خدمات، وفي معرفة المقاعد المتبقية، وفي تمييز الحملات التي رضي عنها الناس فعلًا. وفي المقابل كان أصحاب الحملات يجدون صعوبة في تنظيم التسجيلات وفي الوصول خارج ولايتهم.',
  'about.missionTitle': 'ما الذي يخدمه ناسِك',
  'about.missionBody':
    'أن يكون القرار واضحًا: كل الحملات في مكان واحد، وأسعار صريحة، ومقاعد ظاهرة، وتقييمات ممن سافروا.',

  // --------------------------------------------------------- trust & legal
  'trust.title': 'الثقة والأمان',
  'trust.subtitle': 'رحلة الحج أو العمرة ليست شراءً عاديًا، ونتعامل معها على هذا الأساس.',
  'trust.1.title': 'التوثيق',
  'trust.1.body':
    'يقدّم أصحاب الحملات بياناتهم لفريق ناسِك قبل أن تحمل عروضهم شارة التوثيق.',
  'trust.2.title': 'أسعار شفافة',
  'trust.2.body':
    'كل سعر معروض للفرد ومع ما يشمله، ولا يضيف ناسِك عليه شيئًا — تدفع للحملة السعر الذي تراه.',
  'trust.3.title': 'تقييمات حقيقية',
  'trust.3.body': 'لا يقيّم الحملة إلا مسافر أكمل حجزًا معها.',
  'trust.4.title': 'أبلغ عن أي شيء',
  'trust.4.body':
    'زر الإبلاغ في كل حملة يرسل العرض مباشرة إلى فريق ناسِك.',
  'trust.disclaimer':
    'تعرض ناسِك الحملات التي ينشرها أصحابها ولا تُصدر التراخيص. تحقق دائمًا من ترخيص الحملة لدى وزارة الأوقاف والشؤون الدينية قبل الدفع.',
  'trust.privacy': 'سياسة الخصوصية',
  'trust.terms': 'شروط الاستخدام',
  'trust.support': 'تواصل مع الدعم',

  // ---------------------------------------------------------------- footer
  'footer.about': 'يجمع ناسِك حملات الحج والعمرة في سلطنة عُمان ليبحث الحاج والمعتمر ويختار ويحجز بثقة.',
  'footer.explore': 'استكشف',
  'footer.company': 'ناسِك',
  'footer.contact': 'تواصل معنا',
  /*
   * The copyright line is two strings and a link, not one sentence.
   *
   * The name it credits is a proper noun and stays in Latin script in both
   * languages, and it has to be an anchor — so it cannot live inside a
   * translated sentence without the dictionary carrying markup. Splitting it
   * keeps the strings translatable and the link a link.
   */
  'footer.rights': '© {year} ناسِك',
  'footer.builtBy': 'تم التطوير بواسطة',
  'footer.prototype': 'ناسِك لا تستقبل المدفوعات؛ يتم الدفع لصاحب الحملة مباشرة.',

  // ------------------------------------------------------------ misc/state
  'state.errorBody': 'حدث خطأ من جانبنا. حاول مرة أخرى بعد قليل.',
  'state.notFoundTitle': 'الصفحة غير موجودة',
  'state.notFoundBody': 'الصفحة التي تبحث عنها غير موجودة أو تم نقلها.',
  'state.notFoundCta': 'العودة للرئيسية',
  // ------------------------------------------------- social and password
  'auth.passwordHint': '{n} أحرف على الأقل. الطول أهم بكثير من الرموز.',
  'auth.passwordSignInTitle': 'لديك كلمة مرور؟ سجّل الدخول بها',
  'auth.passwordSignInBody':
    'أصحاب الحملات وفريق ناسِك يضعون كلمة مرور عند التسجيل. المعتمرون والحجّاج لا يحتاجونها — الرمز أعلاه هو طريق الدخول.',
  'auth.errEmailUnconfirmed': 'أكّد بريدك الإلكتروني أولاً باستخدام الرمز أعلاه.',
  'auth.mfaPrompt': 'أدخل الرمز الحالي من تطبيق المصادقة لديك.',
  'auth.mfaLabel': 'رمز تطبيق المصادقة',
  'auth.licenceUploadFailed': 'تعذّر رفع الترخيص. تحقّق من اتصالك وحاول مرة أخرى.',
  // ------------------------------------------------------ إضافات الحملة
  'campaign.excluded': 'غير شامل',
  'campaign.deadline': 'آخر موعد للتسجيل',
  'campaign.deadlinePassed': 'أُغلق باب التسجيل',
  'campaign.gallery': 'الصور',  'auth.noAccountNeeded':
    'لا حاجة لحساب للتصفّح. وأول تسجيل دخول ينشئ حسابك تلقائياً.',

  // ============================================================== حسابي
  'account.title': 'حسابي',
  'account.detailsTitle': 'بياناتي',
  'account.detailsBody': 'تُستخدم لتعبئة حجوزاتك تلقائياً، فتُسأل مرة واحدة لا في كل مرة.',
  'account.nameHint': 'الاسم الذي تبحث عنه الحملة في المطار.',
  'account.phoneHint': 'وسيلة تواصل الحملة معك بشأن الرحلة. اختياري.',
  'account.governorate': 'المحافظة',
  'account.nationality': 'الجنسية',
  'account.nationalityHint': 'تُعبّئ نماذج الحجز تلقائياً، ويبقى لكل مسافر في الحجز جنسيته الخاصة.',
  'account.nationalityNone': 'أفضّل عدم الإفصاح',
  'account.notSet': 'غير مُدخل',
  'account.discardAsk': 'تجاهل التغييرات غير المحفوظة؟',
  'account.discard': 'تجاهل',
  'account.keepEditing': 'متابعة التحرير',
  'account.documentsNote':
    'لا تُحفظ أرقام الجوازات والبطاقات الشخصية هنا. فهي تخص الحجز — لكل مسافر أرقامه — وتُجمع في نموذج الحجز.',

  'account.emailTitle': 'بريد تسجيل الدخول',
  'account.emailBody': 'العنوان الذي يصلك عليه رمز الدخول لمرة واحدة.',
  'account.emailChange': 'تغيير',
  'account.emailNew': 'البريد الإلكتروني الجديد',
  'account.emailSend': 'إرسال رابط التأكيد',
  'account.emailConfirmNote':
    'سنرسل رابط تأكيد إلى العنوان الجديد. ولا يتغيّر شيء قبل أن تفتحه، ويظل عنوانك الحالي يعمل حتى ذلك الحين.',
  'account.emailSent': 'أُرسل التأكيد إلى {email}. افتح الرابط في تلك الرسالة لإتمام التغيير.',
  'account.emailSame': 'هذا عنوانك الحالي بالفعل.',
  'account.emailTaken': 'هذا العنوان مستخدم بالفعل في ناسِك.',
  'account.emailFailed': 'تعذّر بدء التغيير. يُرجى المحاولة مرة أخرى.',
  'account.saveFailed': 'تعذّر حفظ بياناتك الآن. لم يتغيّر شيء — يُرجى المحاولة مرة أخرى.',

}
