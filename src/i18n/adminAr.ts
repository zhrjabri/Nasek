import type { AdminMessageKey } from './adminEn'

/**
 * Administration strings in Arabic — the platform's primary language.
 *
 * Typed as `Record<AdminMessageKey, string>` so it can never drift out of sync
 * with `adminEn.ts`. Same reasoning as `ar.ts`: a missing translation is a
 * compile error rather than a blank label found in production.
 */
export const adminAr: Record<AdminMessageKey, string> = {
  // ------------------------------------------------------- admin dashboard
  'admin.gateTitle': 'إدارة ناسِك',
  'admin.gateSubtitle': 'أدخل عبارة مرور الإدارة للمتابعة.',
  'admin.gatePassphrase': 'عبارة المرور',
  'admin.gateEnter': 'دخول',
  'admin.gateChecking': 'جارٍ التحقق…',
  'admin.gateWrong': 'عبارة المرور غير صحيحة.',
  'admin.gateEmpty': 'أدخل عبارة المرور للمتابعة.',
  'admin.gateOther': 'لست مشرفًا؟',
  'admin.gateNote':
    'عبارة المرور هذه بيد مالك ناسِك وحده. ولا يؤثر شيء مما تفعله هنا على حسابك كعميل أو كصاحب حملة.',
  'admin.showingOf': 'عرض {shown} من {total}',
  'admin.attention': 'بانتظار قرارك',
  'admin.attentionSub': 'كل ما ينتظر قرارًا منك، في مكان واحد.',
  'admin.attentionClear': 'لا شيء ينتظر. المنصّة محدّثة.',
  'admin.awaitingVerification': 'مسجّلة وبانتظار التوثيق',
  'admin.reviewPermit': 'مراجعة التصريح',
  'admin.queueSuspendedCampaigns': '{n} حملات موقوفة ومخفية عن الموقع العام',
  'admin.queueSuspendedUsers': '{n} حسابات موقوفة ولا يمكنها تسجيل الدخول',
  'admin.ownersVerified': 'موثّقة',
  'admin.ownersPendingHint': 'افتح تبويب «أصحاب الحملات» لمراجعة تصاريحهم.',
  'admin.ownerSearch': 'ابحث عن صاحب حملة بالاسم أو البريد أو الهاتف',
  'admin.ownerFilter': 'تصفية أصحاب الحملات',
  'admin.noOwnerMatch': 'لا يوجد أصحاب حملات مطابقون',
  'admin.noProvidersBody': 'يظهر أصحاب الحملات هنا بعد التسجيل ورفع التصريح.',
  'admin.noAccounts': 'لا توجد حسابات بعد',
  'admin.noAccountsBody': 'تظهر الحسابات هنا كلما سجّل أحد في ناسِك.',
  'admin.campTotal': 'كل الحملات',
  // ------------------------------------------- trip moderation, after the queue
  'admin.campDeactivate': 'إيقاف العرض',
  'admin.campDeactivated': 'موقوفة عن العرض',
  'admin.campDeactivated_toast': 'تم إيقاف عرض «{name}»',
  'admin.campReinstate': 'إعادة العرض',
  'admin.campReinstated': 'تمت إعادة عرض «{name}»',
  'admin.campModerationNote':
    'تعتمد إدارة ناسِك الشركات لا رحلاتها. الشركة المعتمدة تنشر رحلتها فتظهر فورًا. استخدم هذه الأدوات لإيقاف عرض رحلة إذا كان بها ما يستوجب ذلك.',
  'admin.campLive': 'منشورة',
  'admin.campFeatured': 'مميّزة',
  'admin.campSuspended': 'موقوفة',
  'admin.campSearch': 'ابحث في الحملات بالعنوان أو صاحب الحملة',
  'admin.campFilter': 'تصفية الحملات',
  'admin.addTrip': 'إضافة رحلة',
  'admin.addTripDone': 'تمت إضافة الرحلة واعتمادها.',
  'admin.addTripFailed': 'تعذّر حفظ الرحلة. لم يتم إنشاء أي شيء.',
  'admin.campFeature': 'إبراز في الصفحة الرئيسية',
  'admin.campUnfeature': 'إزالة من الصفحة الرئيسية',
  'admin.campSuspend': 'إيقاف',
  'admin.campRestore': 'استرجاع',
  'admin.campDelete': 'حذف الحملة',
  'admin.campOpenPublic': 'عرض الصفحة العامة',
  'admin.campDeleteTitle': 'حذف هذه الحملة؟',
  'admin.campDeleteBody': 'ستُزال «{name}» من ناسِك.',
  'admin.campDeleteHint':
    'لا يمكن التراجع عن ذلك من هنا. إن أردت إخفاء الحملة ريثما تتواصل مع صاحبها، فأوقفها بدل حذفها — والإيقاف قابل للتراجع.',
  'admin.featuredToast': '«{name}» صارت مميّزة في الصفحة الرئيسية',
  'admin.unfeaturedToast': '«{name}» لم تعد مميّزة',
  'admin.campaignSuspendedToast': '«{name}» موقوفة ومخفية عن الحجّاج',
  'admin.campaignRestoredToast': '«{name}» منشورة من جديد',
  'admin.campaignDeletedToast': 'تم حذف «{name}»',
  'admin.noCampaigns': 'لا توجد حملات بعد',
  'admin.noCampaignsBody': 'تظهر الرحلات هنا كلما نشرها أصحاب الحملات.',
  'admin.noCampaignMatch': 'لا توجد حملات مطابقة',
  'admin.campNote':
    'الإيقاف يخفي الحملة عن الحجّاج مع بقاء كل شيء كما هو، ويمكن التراجع عنه. والإبراز ينشرها في الصفحة الرئيسية. أما الحذف فنهائي.',
  'admin.bookingSearch': 'ابحث برقم الفاتورة أو العميل أو الشركة أو الرحلة',
  'admin.bookingFilter': 'تصفية الحجوزات',
  'admin.statusConfirmed': 'مؤكّد',
  'admin.statusPending': 'قيد الانتظار',
  'admin.statusCompleted': 'مكتمل',
  'admin.statusCancelled': 'ملغى',
  'admin.bookingCapped': 'يُعرض أول {n}. استخدم البحث للوصول إلى حجز بعينه.',
  'admin.noBookings': 'لا توجد حجوزات بعد',
  'admin.noBookingsBody': 'تظهر الحجوزات هنا كلما حجز الحجّاج رحلاتهم.',
  'admin.noBookingMatch': 'لا توجد حجوزات مطابقة',
  'admin.reviewsLow': 'تقييمات منخفضة',
  'admin.reviewsLowHint': 'نجمتان فأقل — وهي غالبًا موضع الشكاوى.',
  'admin.reviewsHidden': 'مخفية',
  'admin.reviewSearch': 'ابحث في التقييمات بالمسافر أو النص',
  'admin.reviewFilter': 'تصفية التقييمات',
  'admin.reviewHide': 'إخفاء',
  'admin.reviewShow': 'إظهار',
  'admin.reviewHiddenToast': 'أُخفي التقييم عن الموقع العام',
  'admin.reviewShownToast': 'عاد التقييم ظاهرًا',
  'admin.noReviewMatch': 'لا توجد تقييمات مطابقة',
  'admin.noReviewsBody': 'تظهر التقييمات هنا بعد أن يقيّم المسافرون رحلاتهم.',
  'admin.reviewNote':
    'الإخفاء يزيل التقييم من الموقع العام ويمكن التراجع عنه. ولا تُعدّل التقييمات أبدًا — تبقى كلمات المسافر كما كتبها، وإلا فقدت التقييمات معناها.',
  'admin.title': 'إدارة ناسِك',
  'admin.overview': 'نظرة عامة',
  'admin.users': 'المستخدمون',
  'admin.usersTotal': 'كل الحسابات',
  'admin.usersCustomers': 'العملاء',
  'admin.usersOwners': 'أصحاب الحملات',
  'admin.usersSuspended': 'موقوفة',
  'admin.userSearch': 'ابحث بالاسم أو البريد أو الهاتف',
  'admin.userFilter': 'تصفية الحسابات',
  'admin.userAll': 'الكل',
  'admin.roleCustomer': 'عميل',
  'admin.roleOwner': 'صاحب حملة',
  'admin.roleAdmin': 'مدير',
  'admin.userAccount': 'الحساب',
  'admin.userRole': 'الدور',
  'admin.userJoined': 'تاريخ الانضمام',
  'admin.userSpend': 'الإنفاق',
  'admin.userActions': 'إجراءات',
  'admin.userActive': 'نشط',
  'admin.userSuspended': 'موقوف',
  'admin.userRemoved': 'محذوف',
  'admin.userSuspend': 'إيقاف',
  'admin.userReactivate': 'إعادة التفعيل',
  'admin.userRemove': 'حذف الحساب',
  'admin.userRestore': 'استرجاع',
  'admin.userSuspendedToast': 'تم إيقاف {name}',
  'admin.userReactivatedToast': 'عاد {name} إلى النشاط',
  'admin.userRemovedToast': 'تم حذف {name}',
  'admin.userRestoredToast': 'تم استرجاع {name}',
  'admin.noUsers': 'لا توجد حسابات مطابقة',
  'admin.noUsersBody': 'جرّب بحثًا آخر، أو أعد التصفية إلى «الكل».',
  'admin.userOwnerNote':
    'هذا الحساب يدير حملة. توثيق الحملة نفسها ومراجعة تصريحها يتمّان من تبويب «أصحاب الحملات».',
  'admin.campaignModerationFailed': 'رُفض هذا التغيير ولم يُحفظ شيء. أعد التحميل وحاول مرة أخرى.',
  'admin.reviewModerationFailed': 'رُفض هذا التغيير ولم يُحفظ شيء. أعد التحميل وحاول مرة أخرى.',
  'admin.userNotAnAccount': 'لا يوجد حساب',
  'admin.userModerationFailed': 'رُفض هذا التغيير ولم يُحفظ شيء. أعد التحميل وحاول مرة أخرى.',
  'admin.userNote':
    'يُستخرج العملاء من سجل الحجوزات، وهو ما تحتفظ به المنصّة عنهم. حذف الحساب يخفيه من هنا ويمكن التراجع عنه — وتبقى حجوزاته كما هي، فلا تتغيّر أرقام الإيرادات في بقية اللوحة دون أن تدري.',
  'admin.providers': 'أصحاب الحملات',
  'admin.campaigns': 'الحملات',
  'admin.bookings': 'الحجوزات',
  'admin.reviews': 'التقييمات',
  // -------------------------------------------- manual payment, admin side
  'admin.kpiConfirmedValue': 'قيمة الحجوزات المؤكدة',
  'admin.kpiAwaitingPayment': 'بانتظار الدفع',
  'admin.awaitingPaymentHint': 'طُلبت ولم يؤكد صاحب الحملة استلام قيمتها بعد.',
  'admin.noConfirmedFinancial': 'لا توجد بيانات مالية مؤكدة بعد',
  'admin.paymentNotProcessed':
    'ناسِك لا ينفّذ عمليات الدفع. يدفع العملاء لأصحاب الحملات مباشرة، ولا يُؤكد الحجز هنا إلا عندما يسجّل صاحب الحملة استلامه المبلغ.',
  'admin.ownerNoPhone': 'لا يوجد رقم تواصل مسجل',
  'admin.kpiGmv': 'قيمة الحجوزات',
  'admin.kpiProviders': 'أصحاب الحملات',
  'admin.kpiCampaigns': 'الرحلات المعروضة',
  'admin.kpiBookings': 'الحجوزات',
  'admin.kpiPending': 'بانتظار التوثيق',
  'admin.verify': 'توثيق',
  'admin.unverify': 'إلغاء التوثيق',
  'admin.verified': 'موثّقة',
  'admin.verifiedToast': 'تم توثيق {name}',
  'admin.unverifiedToast': 'أُلغي توثيق {name}',
  'admin.bookingsByType': 'الحجوزات حسب نوع الرحلة',
  'admin.growth': 'نمو المنصة',
  'admin.noData': 'لا توجد بيانات بعد',
  'admin.plan': 'الباقة',
  'admin.licence': 'الترخيص',
  'admin.viewLicence': 'عرض الترخيص',
  'admin.noLicence': 'لم يُرفع ترخيص',
  'admin.noProviders': 'لم تسجّل أي حملة بعد',
  // -------------------------------------------------- واجهة لوحة الإدارة
  'admin.badge': 'الإدارة',
  'admin.navLabel': 'قائمة الإدارة',
  'admin.groupPlatform': 'المنصّة',
  'admin.groupPeople': 'الأشخاص',
  'admin.groupCatalogue': 'المحتوى',
  'admin.backToSite': 'فتح الموقع العام',
  'admin.checking': 'جارٍ التحقق من صلاحيتك…',
  'admin.mfaTitle': 'مطلوب التحقّق بخطوتين',
  'admin.mfaSubtitle': 'خطوة أخيرة',
  'admin.mfaBody': 'هذا الحساب مرتبط بتطبيق مُصادقة. أدخل الرمز المكوّن من ستّة أرقام من التطبيق لإتمام تسجيل الدخول.',
  'admin.mfaCodeLabel': 'رمز المُصادقة',
  'admin.deniedTitle': 'لا يمكنك فتح هذه اللوحة',
  'admin.deniedNotAdmin':
    'أنت مُسجّل الدخول، لكن هذا الحساب ليس حساب إدارة. تُمنح الصلاحية من قاعدة البيانات بواسطة من يملكها.',
  'admin.deniedSuspended': 'حساب الإدارة هذا موقوف.',
  'admin.deniedUnavailable':
    'تعذّر الوصول إلى قاعدة البيانات للتحقق من صلاحيتك. تأكد من اتصالك وحاول مرة أخرى.',
  'admin.signOutAndRetry': 'تسجيل الخروج واستخدام حساب آخر',
  'admin.localModeTitle': 'وضع محلي — لا توجد قاعدة بيانات مُهيّأة',
  'admin.localModeBody':
    'تعمل هذه اللوحة على بيانات محفوظة في هذا المتصفح فقط. عبارة المرور أدناه بوابة النموذج الأولي، وليست وسيلة حماية. هيّئ Supabase لإدارة حقيقية محميّة من الخادم.',
  'admin.sectionCount': '{n} في هذا القسم',

  // -------------------------------------------------- verification queue
  'admin.approve': 'اعتماد',
  'admin.reject': 'رفض',
  'admin.suspend': 'إيقاف',
  'admin.restore': 'استعادة',
  'admin.rejected': 'مرفوضة',
  'admin.suspendedFilter': 'موقوفة',
  'admin.rejectBody':
    'يرى صاحب الحملة هذا السبب حرفياً، ويمكنه تصحيح طلبه وإعادة إرساله. وضّح ما الخطأ في الترخيص أو البيانات.',
  'admin.suspendBody':
    'الإيقاف يسحب كل رحلة نشرتها هذه الحملة. يرى صاحبها هذا السبب ولا يستطيع رفع الإيقاف بنفسه.',
  'admin.reasonLabel': 'السبب',
  'admin.reasonHint': 'يُكتب لصاحب الحملة. كن محدداً بما يكفي ليتصرّف.',
  'admin.reasonRequired': 'السبب مطلوب — لا يستطيع تصحيح ما لم يُخبَر به.',
  'admin.rejectedToast': 'رُفضت {name}، وأُبلغ صاحبها بالسبب',
  'admin.suspendedToast': 'أُوقفت {name}',

  // --------------------------------------------------- the admin account
  'admin.security': 'الأمان',
  'admin.groupAccount': 'حسابك',
  'admin.securityTitle': 'حساب المشرف الخاص بك',
  'admin.securityBody':
    'حساب الإشراف يستطيع إيقاف حملة وإخفاء تقييم وقراءة كل حجز. هو أثمن بيانات دخول في ناسِك — تعامل معه على هذا الأساس.',
  'admin.securityLocalMode':
    'كلمات المرور والتحقق بخطوتين تحتاج مشروع Supabase. هذه اللوحة تعمل الآن على بيانات هذا المتصفح فقط.',
  'admin.mfaOnTitle': 'التحقق بخطوتين مفعّل',
  'admin.mfaOnBody':
    'تسجيل الدخول يحتاج كلمة المرور ورمزاً من تطبيق المصادقة. كلمة مرور مسروقة وحدها لا تُدخِل أحداً.',
  'admin.mfaTurnOff': 'إيقاف التحقق بخطوتين',
  'admin.mfaRemoved': 'أُوقف التحقق بخطوتين',
  'admin.mfaRemoveFailed': 'تعذّر الإيقاف. سجّل الدخول مجدداً وحاول.',
  'admin.mfaOffTitle': 'التحقق بخطوتين متوقف',
  'admin.mfaOffBody':
    'أضف تطبيق مصادقة حتى لا تكفي كلمة المرور وحدها لفتح هذه اللوحة. يستغرق دقيقة تقريباً.',
  'admin.mfaTurnOn': 'تفعيل التحقق بخطوتين',
  'admin.mfaSetupTitle': 'امسح هذا الرمز بتطبيق المصادقة',
  'admin.mfaSetupBody':
    'Google Authenticator أو 1Password أو Aegis — أيّها كان. ثم أدخل الأرقام الستة التي يعرضها للتأكيد. لا يتغير شيء قبل ذلك.',
  'admin.mfaSecret': 'أو أدخل هذا المفتاح يدوياً',
  'admin.mfaConfirmLabel': 'الرمز من التطبيق',
  'admin.mfaConfirm': 'تأكيد وتفعيل',
  'admin.mfaWrongCode': 'لم يُقبل هذا الرمز. الرموز تتغير كل ٣٠ ثانية — جرّب الرمز الحالي.',
  'admin.mfaEnabled': 'فُعّل التحقق بخطوتين',
  'admin.passwordTitle': 'كلمة المرور',
  'admin.passwordBody': 'تغيّر كلمة المرور التي تُفتح بها هذه اللوحة. تسري فوراً.',
  'admin.passwordSave': 'حفظ كلمة المرور',
  'admin.passwordSaved': 'حُفظت كلمة المرور',
  'admin.passwordFailed': 'لم تُقبل كلمة المرور. جرّب واحدة أطول.',

  // ========================================================== رمز الدخول
  'admin.codeTitle': 'إدارة ناسِك',
  'admin.codeSubtitle': 'أدخل رمز الدخول إلى لوحة الإدارة',
  'admin.codeLabel': 'رمز الدخول',
  'admin.codeEnter': 'فتح لوحة الإدارة',
  'admin.codeChecking': 'جارٍ التحقق…',
  'admin.codeEmpty': 'أدخل رمز الدخول.',
  'admin.codeWrong': 'لم يُقبل هذا الرمز.',
  'admin.codeRateLimited': 'محاولات كثيرة من هذا الجهاز. انتظر بضع دقائق ثم أعد المحاولة.',
  'admin.codeUnavailable':
    'تعذّر الوصول إلى خدمة الدخول. تأكد من نشر دالة admin-access.',
  'admin.codeNotConfigured':
    'لم يُضبط رمز دخول على الخادم. انشر دالة admin-access واضبط ADMIN_ACCESS_CODE.',
  'admin.codeNoAdmin':
    'لا يوجد حساب إداري بعد. أنشئ حساباً ثم شغّل promote_to_admin() في SQL.',
  'admin.codeAmbiguous':
    'يوجد أكثر من حساب إداري. اضبط NASEK_ADMIN_EMAIL على دالة admin-access لتحديد الحساب الذي يفتحه هذا الرمز.',
  'admin.codeSessionFailed': 'قُبل الرمز لكن تعذّر إنشاء الجلسة. أعد المحاولة.',
  'admin.codeNote':
    'يُتحقق من الرمز على الخادم. امتلاكه يمنح جلسة لا صلاحية؛ فما تقرأه هذه اللوحة تحدده is_admin() داخل قاعدة البيانات.',
  'admin.codeSignOut': 'تسجيل الخروج',

  // ======================================================== اعتماد الحملات
  'admin.campaignRejectTitle': 'إيقاف عرض هذه الرحلة',
  'admin.campaignRejectBody':
    'تُرفع الرحلة من الموقع ويقرأ صاحبها هذا النص حرفيًا. اذكر الخطأ وما يصلحه، ويمكنه تصحيح الرحلة لتعود عند إعادة عرضها.',
  'admin.campaignRejectReason': 'السبب',
  'admin.campaignRejectConfirm': 'إيقاف العرض',
  'admin.campaignReasonRequired': 'الرفض يحتاج سبباً يستطيع صاحب الحملة التصرف بناءً عليه.',
  'admin.campaignStatusFailed': 'رُفض هذا القرار ولم يُحفظ شيء. {detail}',
  /*
   * Why an approval was blocked, in the reader's language.
   *
   * `set_campaign_status` refuses to publish a trip whose company is not
   * approved, and says so — in English, because a Postgres function cannot know
   * which language the dashboard is in. Appended to an Arabic sentence that was
   * all an administrator got, and it read as a button that had simply failed.
   *
   * Two messages rather than one, because the two states need different
   * actions: a suspended company is restored, a company that has never been
   * approved is approved. Both name the company and both name the screen it is
   * done on, so the sentence ends somewhere rather than at "not approved".
   */
  'admin.campaignBlockedSuspended':
    'لا يمكن نشر رحلة تتبع شركة موقوفة. «{company}» موقوفة حالياً — استعِدها من «أصحاب الحملات»، ثم أعد المحاولة.',
  'admin.campaignBlockedUnverified':
    'لا يمكن نشر رحلة تتبع شركة غير معتمدة. اعتمِد «{company}» من «أصحاب الحملات» أولاً، ثم أعد المحاولة.',
  'admin.campaignBlockedNotAdmin':
    'لم تعد هذه الجلسة تملك صلاحية الإدارة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  'admin.campaignOwnerUnverified':
    'هذه الحملة تتبع شركة غير معتمدة بعد. اعتمد الشركة أولاً.',
  'admin.filterActive': 'منشورة',
  'admin.filterRejected': 'مرفوضة',
  'admin.filterSuspended': 'موقوفة',
  'admin.filterAll': 'الكل',
  'admin.reviewDetail': 'مراجعة',
  'admin.campaignSubmitted': 'أُرسلت',
  'admin.campaignNoImages': 'لا توجد صور',
  'admin.campaignDeadline': 'يُغلق التسجيل',
  'admin.campaignExcluded': 'غير شامل',
  'admin.campaignTerms': 'الشروط',
  'admin.campaignContact': 'التواصل',

  'admin.ownersPendingTitle': 'بانتظار المراجعة',
  'admin.ownersApprovedTitle': 'معتمدة',
  'admin.ownersRejectedTitle': 'مرفوضة',
  'admin.ownerPermitNumber': 'رقم التصريح',
  'admin.ownerPermitExpiry': 'انتهاء التصريح',
  'admin.ownerPermitExpired': 'منتهٍ',
  'admin.ownerCommercialRegistration': 'السجل التجاري',
  'admin.ownerGovernorate': 'المحافظة',
  'admin.ownerIncomplete': 'سُجّلت قبل جمع هذه البيانات',

  'admin.mailTitle': 'إرسال الرسائل',
  'admin.mailBody':
    'تُدرج رسائل الاعتماد والرفض ضمن القرار نفسه، ثم ترسلها دالة send-emails. تبقى في «قائمة الانتظار» حتى تُشغَّل تلك الدالة — ويُبلَّغ صاحب الحملة في بوابته في الحالتين.',
  'admin.mailEmpty': 'لم تُدرج أي رسالة بعد.',
  'admin.mailQueued': 'في الانتظار',
  'admin.mailSending': 'جارٍ الإرسال',
  'admin.mailSent': 'أُرسلت',
  'admin.mailFailed': 'فشلت',
  'admin.mailRefresh': 'تحديث',
  // ==================================================== إضافة صاحب حملة
  'admin.newOwnerTitle': 'إضافة صاحب حملة',
  'admin.newOwnerBody':
    'أدخل بيانات الشركة كما وردت في التصريح، وارفع التصريح نفسه، وسترسل ناسِك دعوة بالبريد. يعيّن صاحب الحملة كلمة مروره ويدخل من بوابة أصحاب الحملات. لا يوجد تسجيل عام.',
  'admin.newOwnerCreate': 'إنشاء وإرسال الدعوة',
  'admin.newOwnerCreated': 'تمت إضافة {name} وإرسال الدعوة',
  'admin.newOwnerCreatedNoEmail':
    'تمت إضافة {name}، لكن تعذّر إرسال الدعوة. الحساب موجود — تحقّق من إعدادات البريد، ثم اطلب منهم استخدام «نسيت كلمة المرور» في بوابة أصحاب الحملات.',
  'admin.newOwnerEmailHint': 'إليه تُرسل الدعوة، وبه يسجّل الدخول.',
  'admin.newOwnerStatus': 'التوثيق',
  'admin.newOwnerStatusHint':
    'الاعتماد هو الخيار المعتاد ما دام التصريح بين يديك. ولا تختر قائمة المراجعة إلا إذا كنت تضيف شركة قبل اكتمال أوراقها.',
  'admin.newOwnerButton': 'إضافة صاحب حملة',
  'admin.newOwnerOffline': 'يحتاج ذلك إلى خادم مُهيّأ. لم يُنشأ شيء.',
  'admin.newOwnerForbidden': 'رُفض الطلب. سجّل الدخول مجدداً ثم أعد المحاولة.',
  'admin.newOwnerIsAdmin':
    'هذا العنوان يخص حساباً إدارياً، ولا يمكن للحساب الإداري أن يدير حملة. استخدم عنواناً آخر.',
  'admin.newOwnerInviteFailed':
    'تعذّر إنشاء الشركة لأن الدعوة لم تُرسل. راجع إعدادات البريد ثم أعد المحاولة.',
  'admin.newOwnerExists': 'هذا الحساب يدير حملة على ناسِك بالفعل.',
  'admin.newOwnerFailed': 'تعذّر إتمام العملية. لم يُنشأ شيء.',
  'admin.newOwnerNoneBody':
    'لا يوجد أصحاب حملات بعد. أضف الأول — وسترسل ناسِك إليه دعوة إلى بوابة أصحاب الحملات.',

  // =========================================== مراجعة تعديلات أصحاب الحملات
  'admin.ownerChangesTitle': 'تحديث بيانات صاحب حملة بانتظار المراجعة',
  'admin.ownerChangesBody':
    'قدّمت شركة معتمدة تعديلاً على البيانات التي تحقّقت منها ناسِك. وتبقى بياناتها المعتمدة الحالية سارية حتى تصدر قرارك.',
  'admin.ownerChangeField': 'الحقل',
  'admin.ownerChangeNow': 'الحالي',
  'admin.ownerChangeProposed': 'المقترح',
  'admin.ownerChangePermit': 'التصريح الجديد',
  'admin.ownerChangeApprove': 'اعتماد التعديل',
  'admin.ownerChangeReject': 'رفض',
  'admin.ownerChangeApproved': '{name} — طُبّق التعديل',
  'admin.ownerChangeRejected': '{name} — رُفض التعديل وأُبلغ صاحبه بالسبب',
  'admin.ownerChangeRejectTitle': 'رفض هذا التعديل',
  'admin.ownerChangeRejectBody':
    'يقرأ صاحب الحملة هذا النص حرفياً ويصحّح طلبه بناءً عليه. اذكر الخطأ وما يصلحه. وتبقى بياناته المعتمدة الحالية كما هي.',


  // ============================================================== analytics
  'admin.analytics': 'الإحصاءات',
  'admin.analyticsTitle': 'حركة الموقع',
  'admin.analyticsBody':
    'كم شخصاً فتح الموقع العام وماذا تصفّح. يُحتسب من معرّف عشوائي محفوظ في متصفّح الزائر نفسه — بلا حساب ولا اسم ولا بريد ولا هاتف ولا عنوان إنترنت.',
  'admin.analyticsVisitsTotal': 'مرات الاطّلاع الإجمالية',
  'admin.analyticsVisitorsTotal': 'الزوّار إجمالاً',
  'admin.analyticsVisitsToday': 'مرات الاطّلاع اليوم',
  'admin.analyticsVisitorsToday': 'زوّار اليوم',
  'admin.analyticsVisitsWeek': 'آخر ٧ أيام',
  'admin.analyticsVisitsMonth': 'آخر ٣٠ يوماً',
  'admin.analyticsCampaignViews': 'صفحات رحلات فُتحت',
  'admin.analyticsSmartMatch': 'جلسات المطابقة الذكية',
  'admin.analyticsTopPages': 'أكثر الصفحات زيارة',
  'admin.analyticsTopCampaigns': 'أكثر الرحلات مشاهدة',
  'admin.analyticsPage': 'الصفحة',
  'admin.analyticsViews': 'مرات الاطّلاع',
  'admin.analyticsEmpty': 'لا يوجد مسجّل بعد',
  'admin.analyticsEmptyBody':
    'لم تُحتسب أي زيارة. إمّا أنّ أحداً لم يفتح الموقع العام منذ تفعيل هذا، وإمّا أنّ الموقع لا يصل إلى الخادم.',
  'admin.analyticsUnavailable': 'تعذّرت قراءة الأرقام',
  'admin.analyticsUnavailableBody':
    'لم يستجب الخادم. لا يُعرَض شيء بدلاً من الأصفار — فالصفر هنا يُقرأ كأنّه عدد حقيقي.',
  'admin.analyticsPrivacy':
    'تُسجّل الزيارة صفحةً وتصنيفاً ومعرّفاً عشوائياً للمتصفّح. ولا تُربط بحساب أبداً، ولا يمكن قراءة جدولها سطراً سطراً — ولا حتى لمشرف.',


  // ======================================= an administrator editing a company
  'admin.editOwner': 'تعديل',
  'admin.editOwnerTitle': 'تعديل بيانات الشركة',
  'admin.editOwnerBody':
    'يصحّح ما تحتفظ به ناسِك عن هذه الشركة. يُسجَّل كل تعديل في سجل التدقيق باسمك، ويرى صاحب الحملة البيانات الجديدة فوراً — ولا يُطلب منه اعتمادها.',
  'admin.editOwnerNote':
    'لا يغيّر هذا شارة التوثيق. الاعتماد والرفض والإيقاف أزرارٌ في القائمة.',
  'admin.editOwnerSave': 'حفظ التعديلات',
  'admin.editOwnerSaved': '{name} — حُفظ',
  'admin.editOwnerNoChange': 'لم يتغيّر شيء',
  'admin.editOwnerFailed': 'تعذّر حفظ التعديل',


  // ============================================== the booking / invoice ledger
  'admin.bookingDateFrom': 'من تاريخ الطلب',
  'admin.bookingDateTo': 'إلى تاريخ الطلب',
  'admin.bookingDatesClear': 'مسح التواريخ',
  'admin.bookingConfirmedOn': 'تاريخ السداد',
  'admin.bookingNotConfirmed': 'لم يُسدَّد بعد',
  'admin.viewInvoice': 'الفاتورة',
  'admin.invoiceTitle': 'فاتورة {ref}',
  'admin.invoiceBody':
    'الفاتورة التي أصدرتها ناسِك لهذا الطلب كما وصلت العميل. ولم تستلم ناسِك المبلغ ولا تحتفظ بسجلٍّ له — يؤكّد صاحب الحملة السداد حين يصله المال.',
  'admin.invoiceSeatsHeld': 'حجز المقاعد على الرحلة',
  'admin.invoiceSeatsHeldYes': 'نعم — خُصمت عند تأكيد صاحب الحملة للسداد',
  'admin.invoiceSeatsHeldNo': 'لا — الطلب لا يحجز مقعداً حتى يُسدَّد',

}
