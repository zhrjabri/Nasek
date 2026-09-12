import type { OwnerMessageKey } from './ownerEn'

/**
 * Campaign owner strings in Arabic — the platform's primary language.
 *
 * Typed as `Record<OwnerMessageKey, string>` so it can never drift out of sync
 * with `ownerEn.ts`. Same reasoning as `ar.ts`: a missing translation is a
 * compile error rather than a blank label found in production.
 */
export const ownerAr: Record<OwnerMessageKey, string> = {
  // ------------------------------------------- the dashboard, as it was
  'prov.title': 'لوحة صاحب الحملة',
  'prov.overview': 'نظرة عامة',
  'prov.myCampaigns': 'رحلاتي',
  'prov.customers': 'العملاء',
  'prov.reviews': 'التقييمات',
  'prov.analytics': 'التحليلات',
  'prov.kpiBookings': 'إجمالي الحجوزات',
  'prov.kpiActive': 'الرحلات النشطة',
  'prov.kpiSeats': 'المقاعد المتاحة',
  'prov.kpiRevenue': 'الإيرادات',
  'prov.kpiRating': 'متوسط التقييم',
  'prov.kpiFill': 'نسبة إشغال المقاعد',
  'prov.addCampaign': 'إضافة رحلة',
  'prov.editCampaign': 'تعديل الرحلة',
  'prov.newCampaign': 'رحلة جديدة',
  'prov.formTitle': 'عنوان الرحلة',
  /*
   * No "(in Arabic)" on either of these two.
   *
   * The parenthetical earned its place when the form asked for an English
   * title and an English description as well and the owner had to be told
   * which box was which. It no longer does: the form asks once, the Arabic is
   * written into both columns, and there is nothing to disambiguate. What is
   * left is an instruction to an Arabic speaker, in Arabic, to write in
   * Arabic.
   *
   * `ownerEn` keeps its "(Arabic)", deliberately. There the note is still
   * information — it tells an administrator reading the interface in English
   * which alphabet the value is expected in, which is a thing they cannot
   * infer. Here it told an Arabic speaker to write Arabic.
   *
   * The keys keep their `Ar` suffix, and so do the columns behind them. It is
   * the label that stopped being true, not the field.
   */
  'prov.formTitleAr': 'عنوان الرحلة',
  'prov.formTitleEn': 'عنوان الرحلة (بالإنجليزية)',
  'prov.formDescAr': 'الوصف',
  'prov.formDescEn': 'الوصف (بالإنجليزية)',
  'prov.formType': 'نوع الرحلة',
  'prov.formPrice': 'السعر للمسافر (ر.ع)',
  'prov.formWilayah': 'ولاية المغادرة',
  'prov.formMethod': 'وسيلة السفر',
  'prov.formDeparture': 'تاريخ المغادرة',
  'prov.formReturn': 'تاريخ العودة',
  'prov.formSeats': 'إجمالي المقاعد',
  'prov.formSeatsAvailable': 'المقاعد المتاحة',
  'prov.formHotelMakkah': 'السكن في مكة',
  'prov.formHotelMadinah': 'السكن في المدينة',
  'prov.formHaram': 'المسافة عن الحرم (بالأمتار)',
  'prov.formServices': 'الخدمات المشمولة',
  'prov.saveCampaign': 'حفظ الرحلة',
  'prov.campaignSaved': 'حُفظت الرحلة',
  'prov.campaignDeleted': 'حُذفت الرحلة',
  'prov.deleteConfirm': 'هل تريد حذف هذه الرحلة؟ ستبقى الحجوزات القائمة كما هي.',
  'prov.noCampaigns': 'لم تنشر أي رحلة بعد',
  'prov.noCampaignsHint': 'أضف رحلتك الأولى ليتمكن الحجاج من العثور عليها وحجزها.',
  'prov.customerName': 'العميل',
  'prov.customerPeople': 'العدد',
  'prov.customerTrip': 'الرحلة',
  'prov.customerDate': 'تاريخ الحجز',
  'prov.noCustomers': 'لا توجد حجوزات على هذه الحملة بعد',
  'prov.chartBookings': 'الحجوزات عبر الزمن',
  'prov.chartRevenue': 'الإيرادات حسب الشهر',
  'prov.chartTrips': 'الرحلات الأكثر حجزًا',
  'prov.chartLocations': 'من أين يأتي عملاؤك',
  // ------------------------------------------- manual payment, owner side
  'prov.paymentWorkflow':
    'ينشئ العميل طلب حجز ويرسل إليك فاتورة ناسِك عبر واتساب، فترد عليه ببيانات الدفع ويدفع لك مباشرة — ناسِك ليس طرفًا في عملية الدفع. وبعد استلامك المبلغ، علّم الحجز هنا بأنه مدفوع.',
  'prov.temporarilyUnavailable':
    'هذا الإجراء غير متاح مؤقتًا ريثما يكمل ناسِك تحديثًا. الحجز لم يتغير — يرجى المحاولة بعد قليل.',
  'prov.markPaid': 'تعليم كمدفوع',
  'prov.markedPaid': 'تم تأكيد الحجز {ref} كمدفوع',
  'prov.confirmedBookings': 'الحجوزات المؤكدة',
  'prov.noConfirmedFinancial': 'لا توجد بيانات مالية مؤكدة بعد',
  'prov.noPhoneTitle': 'لا يوجد رقم تواصل مسجل لشركتك',
  'prov.noPhoneBody':
    'يرسل العملاء فاتورة الحجز إليك عبر واتساب، وهذا الزر معطّل حتى يحمل سجل شركتك رقمًا. أضف رقمًا من صفحة ملف الشركة.',
  'prov.plan': 'ما يتقاضاه ناسِك',
  'prov.planNote':
    'يتقاضى ناسِك رسوم وساطة بنسبة ٢٪ على الحجوزات التي تتم عبر المنصة، وهي محتسبة أصلًا ضمن المبلغ الذي يدفعه المسافر.',
  'prov.planCommission': 'رسوم الوساطة (٢٪)',
  'prov.noData': 'لا توجد بيانات بعد',
  'prov.lowSeats': '{n} رحلات أوشكت على الاكتمال',
  'prov.respondReview': 'رد',
  'prov.viewPublic': 'الصفحة العامة',
  'prov.deleteAsk': 'حذف هذه الرحلة؟',
  'prov.discardAsk': 'تجاهل التغييرات غير المحفوظة؟',
  'prov.discard': 'تجاهل',
  'prov.keepEditing': 'متابعة التحرير',
  'prov.fixErrors': 'راجع هذه الحقول قبل الحفظ',
  'prov.errReturnBefore': 'يجب أن يكون تاريخ العودة بعد تاريخ المغادرة.',
  'prov.errSeatsExceed': 'لا يمكن أن تزيد عن إجمالي عدد المقاعد.',
  'prov.seatsNewNote': 'تُنشر الرحلة الجديدة وجميع مقاعدها متاحة.',
  'prov.servicesCount': 'اخترت {n} من {total}',
  'prov.searchCustomers': 'ابحث باسم المسافر أو الرحلة أو رقم الحجز',
  'prov.statusAll': 'كل الحالات',
  'prov.showingCount': 'عرض {shown} من {total}',
  'prov.showMore': 'عرض 40 إضافية',
  'prov.noMatch': 'لا يوجد حجز مطابق لهذا البحث',
  'prov.lowSeatsFix': 'أضف مقاعد أو أغلق الرحلة — وإلا ستستمر في استقبال الحجوزات وهي ممتلئة.',
  'prov.replyPlaceholder': 'اكتب ردّك…',
  'prov.replySend': 'انشر الرد',
  'prov.replyPosted': 'نُشر الرد',
  'prov.replyYours': 'ردّك',
  'prov.replyNote': 'نموذج أولي — تُحفظ الردود لهذه الجلسة فقط.',

  'prov.pendingTitle': 'جارٍ توثيق حملتك',
  'prov.pendingSubtitle': 'نراجع ترخيصك الآن',
  'prov.pendingBody':
    'تم إرسال حسابك للتوثيق. سيراجع فريقنا بياناتك قبل تفعيل حساب صاحب الحملة.',
  'prov.pendingMeanwhile':
    'ستتمكن من نشر الرحلات فور اعتماد ترخيصك. حتى ذلك الحين لا تظهر حملتك للحجّاج والمعتمرين.',
  'prov.submittedOn': 'تاريخ الإرسال',
  'prov.checkAgain': 'تحقّق مرة أخرى',
  'prov.suspendedTitle': 'هذه الحملة موقوفة',
  'prov.suspendedSubtitle': 'رحلاتك غير ظاهرة على ناسِك',
  'prov.suspendedBody':
    'أوقف أحد مشرفي ناسِك هذه الحملة. سُحبت رحلاتك من الموقع طوال مدة الإيقاف.',
  'prov.rejectedTitle': 'لم يُعتمد طلبك',
  'prov.rejectedSubtitle': 'صحّح البيانات أدناه ثم أعد إرساله',
  'prov.reasonGiven': 'سبب الرفض',
  'prov.reasonMissing': 'لم يُسجّل سبب. تواصل مع ناسِك وسنوضّح لك.',
  'prov.replaceLicence': 'استبدال الترخيص (اختياري)',
  'prov.replaceLicenceHint': 'اتركه فارغاً لإعادة الإرسال بالترخيص المحفوظ.',
  'prov.resubmit': 'أعد الإرسال للمراجعة',
  'prov.resubmitted': 'أُعيد الإرسال — حملتك في قائمة المراجعة من جديد',
  'prov.contactSupport': 'تواصل مع ناسِك',

  // ============================================================== البوابة
  'owner.portal': 'بوابة أصحاب الحملات',
  'owner.portalShort': 'بوابة الحملات',
  'owner.signInTitle': 'بوابة أصحاب الحملات',
  'owner.signInSubtitle': 'سجّل الدخول بالبريد الإلكتروني وكلمة المرور',
  'owner.signInCta': 'تسجيل الدخول',
  'owner.passwordOnly':
    'يدخل أصحاب الحملات بكلمة مرور. وإن لم تكن لديك كلمة مرور بعد، فقد أرسلت إليك ناسِك دعوة.',
  'owner.wrongDoor': 'هذا الحساب ليس حساب صاحب حملة. إن كنت ترى غير ذلك فتواصل مع ناسِك.',
  'owner.noAccount': 'لست صاحب حملة بعد؟',
  'owner.noAccountBody':
    'يُضاف أصحاب الحملات من قِبل فريق ناسِك. تواصل معنا وسنتولى الإجراءات معك.',
  'owner.forgot': 'نسيت كلمة المرور؟',
  'owner.forgotTitle': 'إعادة تعيين كلمة المرور',
  'owner.forgotBody':
    'أدخل البريد الإلكتروني المسجّلة به شركتك، وسنرسل رابطاً لتعيين كلمة مرور جديدة.',
  'owner.forgotSend': 'أرسل رابط إعادة التعيين',
  'owner.forgotSent': 'إن كان لهذا العنوان حساب صاحب حملة، فرابط إعادة التعيين في طريقه إليه.',
  'owner.forgotBack': 'العودة إلى تسجيل الدخول',
  'owner.signOut': 'تسجيل الخروج',

  'owner.setPasswordTitle': 'اختر كلمة المرور',
  'owner.setPasswordBody': 'اعتمدت ناسِك شركتك. عيّن كلمة مرور لتصبح البوابة لك.',
  'owner.setPasswordCta': 'احفظ وافتح البوابة',
  'owner.setPasswordDone': 'حُفظت كلمة المرور',
  'owner.setPasswordFailed': 'لم تُقبل كلمة المرور. جرّب واحدة أطول.',
  'owner.inviteExpired':
    'انتهت صلاحية رابط الدعوة أو استُخدم من قبل. اطلب من ناسِك إرسال رابط جديد.',

  // ------------------------------------------------------- the company logo
  'owner.logoTitle': 'شعار الحملة',
  'owner.logoNote':
    'يظهر شعار شركتك على كل رحلة تنشرها، في موقع ناسِك وفي لوحة الإدارة. ارفعه مرة واحدة — ولا تحتاج إلى إضافته لكل رحلة.',
  'owner.logoUpload': 'رفع الشعار',
  'owner.logoChange': 'تغيير الشعار',
  'owner.logoRemove': 'حذف الشعار',
  'owner.logoHint':
    'PNG أو JPG أو WebP بحجم لا يتجاوز 2 ميجابايت. الصورة المربعة أنسب، ولا يُمدّ الشعار أو يُقتطع أبدًا.',
  'owner.logoInvalid': 'يرجى رفع صورة PNG أو JPG أو WebP بحجم لا يتجاوز 2 ميجابايت.',
  'owner.logoFailed': 'تعذّر حفظ الشعار. لم يتغيّر شيء — يرجى المحاولة مرة أخرى.',
  'owner.logoSaved': 'تم تحديث شعار الحملة',
  'owner.logoRemoved': 'تم حذف شعار الحملة',
  'owner.notApprovedToPublish': 'يجب اعتماد حساب صاحب الحملة من الإدارة قبل نشر الرحلات.',
  'owner.tabProfile': 'ملف الشركة',
  'owner.tabNotifications': 'الإشعارات',

  'owner.profileTitle': 'ملف الشركة',
  'owner.profileBody': 'ما يراه الحجاج عن شركتك، وما اعتمدت عليه ناسِك في التحقق منها.',
  'owner.profilePublic': 'يظهر في حملاتك',
  'owner.profilePrivate': 'لدى ناسِك فقط',
  'owner.profilePrivateNote':
    'هذه البيانات هي ما تحقّقت به الإدارة من شركتك. لا تُنشر أبداً ولا تظهر للحجاج.',
  'owner.profileNotSet': 'غير مُدخل',
  'owner.verificationTitle': 'حالة التوثيق',
  'owner.verifiedBody': 'شركتك معتمدة، وتخضع كل حملة تنشئها للمراجعة قبل نشرها.',
  'owner.pendingBody': 'شركتك قيد المراجعة لدى فريق ناسِك، وسنخطرك فور اتخاذ القرار.',
  'owner.rejectedBody': 'لم تُعتمد شركتك، والسبب موضّح أدناه.',
  'owner.suspendedBody': 'حساب شركتك موقوف، ولا تظهر حملاتك على الموقع العام.',
  'owner.permitOnFile': 'التصريح المحفوظ',
  'owner.permitView': 'عرض التصريح',
  'owner.permitNone': 'لا يوجد تصريح محفوظ',
  'owner.permitOpening': 'جارٍ الفتح…',
  'owner.permitFailed': 'تعذّر فتح التصريح، ربما تم حذفه.',
  'owner.governorate': 'المحافظة',
  'owner.address': 'العنوان',
  'owner.addressHint': 'الشارع والمبنى وما يحتاجه المندوب للوصول إليكم.',
  'owner.commercialRegistration': 'رقم السجل التجاري',
  'owner.commercialRegistrationHint': 'من سجل وزارة التجارة، إن وُجد للشركة سجل.',
  'owner.permitNumber': 'رقم التصريح / الترخيص',
  'owner.permitNumberHint': 'الرقم المدوّن على تصريح العمل.',
  'owner.permitExpiry': 'تاريخ انتهاء التصريح',
  'owner.permitExpiryHint': 'اتركه فارغاً إذا كان التصريح غير محدد المدة.',
  'owner.description': 'نبذة عن الشركة',
  'owner.descriptionHint': 'تعريف مختصر يقرأه الحجاج والمعتمرون في صفحات حملاتك.',
  'owner.permitExpired': 'هذا التاريخ قد مضى، وسيطلب فريق ناسِك تصريحاً ساري المفعول.',

  'owner.notificationsEmpty': 'لا جديد',
  'owner.notificationsEmptyBody': 'تظهر هنا قرارات الاعتماد والرفض وحركة الحجوزات فور حدوثها.',
  'owner.markAllRead': 'تعليم الكل كمقروء',
  'owner.markRead': 'تعليم كمقروء',

  // ============================================================ حالة الحملة
  'campaignStatus.pending_approval': 'غير منشورة',
  'campaignStatus.active': 'منشورة',
  'campaignStatus.rejected': 'موقوفة عن العرض',
  'campaignStatus.suspended': 'موقوفة',
  'campaignStatus.activeNote': 'منشورة على ناسِك ومتاحة للحجز.',
  'campaignStatus.suspendedNote': 'أوقفت الإدارة هذه الحملة، ولا تظهر على الموقع العام.',
  'campaignStatus.reason': 'سبب إيقاف العرض',
  'campaignStatus.editsGoLiveNote':
    'هذه الرحلة منشورة. أي تغيير هنا — السعر أو المواعيد أو الخدمات — يظهر على موقع ناسِك فور الحفظ.',
  'campaignStatus.submittedOn': 'أُرسلت للمراجعة',

  'prov.formDeadline': 'آخر موعد للتسجيل',
  'prov.formDeadlineHint': 'آخر يوم يمكن فيه الحجز، ولا يكون بعد تاريخ المغادرة.',
  'prov.errDeadlineAfter': 'لا يمكن أن يكون آخر موعد للتسجيل بعد تاريخ المغادرة.',
  'prov.formExcluded': 'غير شامل في السعر',
  'prov.formExcludedHint': 'اختر ما تريد ذكره صراحةً فقط؛ وما لا تختاره لا يُذكر أصلاً.',
  'prov.formIncluded': 'خدمات أخرى مشمولة',
  'prov.formIncludedHint':
    'أي خدمة لا تغطيها القائمة أعلاه — أضف ما تشاء. تظهر كما تكتبها تماماً، فاجعل كل واحدة قصيرة ومحددة.',
  'prov.addIncluded': 'إضافة خدمة',
  'prov.addContact': 'إضافة مسؤول آخر',
  'prov.moveUp': 'تحريك لأعلى',
  'prov.formProvider': 'صاحب الحملة',
  'prov.formProviderPick': 'اختر الشركة…',
  'prov.publishCampaign': 'نشر الرحلة',
  'prov.publishedActive': 'تمت إضافة الرحلة بنجاح وهي ظاهرة الآن.',
  'prov.formImages': 'الصور',
  'prov.formImagesHint': 'حتى {n} صور، وتُستخدم الأولى في بطاقة الحملة.',
  'prov.imageAdd': 'إضافة صورة',
  'prov.imageRemove': 'حذف',
  'prov.imageCover': 'الغلاف',
  'prov.imageUploading': 'جارٍ الرفع…',
  'prov.imageTooMany': 'بلغت الحد الأقصى لعدد الصور.',
  'prov.imageTypeError': 'يجب أن تكون الصور بصيغة JPEG أو PNG أو WebP.',
  'prov.imageSizeError': 'حجم الصورة يتجاوز ٥ ميجابايت.',
  'prov.imageFailed': 'تعذّر رفع الصورة، حاول مرة أخرى.',
  'prov.formContact': 'وسيلة التواصل لهذه الحملة',
  'prov.formContactHint': 'إن تُركت فارغة، تُعرض بيانات الشركة بدلاً منها.',
  'prov.formContactName': 'اسم المسؤول',
  'prov.formTerms': 'الشروط والأحكام',
  'prov.formTermsHint': 'الإلغاء والدفع وما يوافق عليه الحاج. تُعرض في صفحة الحملة.',
  'prov.sectionMedia': 'الصور والشروط',
  'prov.viewPublicPending': 'غير منشورة بعد',

  // ------------------------------------------ recovered working-tree keys
  // Entries that existed in the editor but had never been committed when the
  // owner strings were split out of the public dictionary. Kept together so
  // the next reader can see they belong with the sections above rather than
  // being a separate concern.
  'owner.haveAccount': 'حسابك معتمد بالفعل؟',
  'owner.notOwner': 'تريد حجز رحلة بدلاً من ذلك؟',
  'owner.notOwnerLink': 'انتقل إلى موقع ناسِك',
  'owner.portalBlurb': 'انشر حملات الحج والعمرة على ناسِك، وأدر المقاعد، وتابع كل تسجيل في مكان واحد.',
  'owner.registerCta': 'إرسال الطلب',
  'owner.registerLink': 'تقدّم بطلب الانضمام إلى ناسِك',
  'owner.sectionAccess': 'بيانات الدخول',
  'owner.sectionCompany': 'بيانات الشركة',
  'owner.sectionContact': 'الشخص المسؤول',
  'owner.sectionLicensing': 'التراخيص',
  'owner.sectionLocation': 'مكان العمل',
  'owner.signInLink': 'ادخل إلى البوابة',
  'owner.tabAnalytics': 'التحليلات',
  'owner.tabBookings': 'الحجوزات',
  'owner.tabCampaigns': 'حملاتي',
  'owner.tabOverview': 'نظرة عامة',
  'owner.tabReviews': 'التقييمات',
  'prov.campaignSaveFailed': 'تعذّر الحفظ. لم يتغيّر شيء — يُرجى مراجعة البيانات والمحاولة مرة أخرى.',
  'prov.replyFailed': 'تعذّر حفظ الردّ. لم يتغيّر شيء — يُرجى المحاولة مرة أخرى.',
  'prov.sectionBasics': 'بيانات الرحلة',
  'prov.sectionContact': 'التواصل والشروط',
  'prov.sectionDates': 'المواعيد والمقاعد',
  'prov.sectionStay': 'الإقامة',
  'prov.sentForReview': 'أُرسلت إلى ناسِك للمراجعة',
  // ------------------------------------------------- تعديل بيانات الشركة
  'owner.profileEdit': 'تعديل ملف الشركة',
  'owner.profileSaved': 'حُفظ ملف الشركة',
  'owner.profileUnderReview': 'أُرسل إلى ناسِك — بياناتك الموثّقة قيد المراجعة',
  'owner.profileSubmit': 'حفظ وإرسال للمراجعة',
  'owner.profilePublicEditNote': 'بيانات التعريف والتواصل. تُحفظ فوراً.',
  'owner.profileVerified': 'البيانات الموثّقة',
  'owner.profileVerifiedNote':
    'هذه هي البيانات التي تحقّقت منها ناسِك. أي تعديل عليها يُرسل للمراجعة، وتبقى شركتك معتمدة على البيانات المحفوظة حتى توافق الإدارة على الجديدة.',
  'owner.profileVerifiedFree':
    'شركتك لم تُعتمد بعد، لذا تُحفظ هذه البيانات فوراً ويقرأها المشرف مع بقية طلبك.',
  'owner.profileWillReview':
    'هذا التعديل يمسّ بيانات موثّقة، لذا سيُرسل إلى ناسِك للمراجعة. أما بقية بيانات هذه الصفحة فتُحفظ فوراً.',
  'owner.profilePendingTitle': 'تعديلات بانتظار المراجعة',
  'owner.profilePendingBody':
    'وصلت هذه التعديلات إلى ناسِك وسيصدر القرار قريباً. وتبقى بيانات شركتك المعتمدة كما هي حتى ذلك الحين.',
  'owner.permitReplace': 'استبدال التصريح',
  'owner.permitReplaceHint':
    'PDF أو JPEG أو PNG أو WebP. اتركه فارغاً للإبقاء على التصريح المحفوظ.',

}
