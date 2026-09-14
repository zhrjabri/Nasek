/**
 * Campaign owner strings.
 *
 * Held apart from `en.ts` for the same reason `adminEn.ts` is, and it is not
 * tidiness: these values are imported only by the owner portal's entry and by
 * the administration entry, so the **public site's bundle contains none of
 * them**.
 *
 * That matters more than it sounds. NASEK has three audiences and three
 * applications, and a pilgrim's browser should download no evidence that the
 * other two exist — not a route, not a component, and not the phrase "Campaign
 * Owner Portal" sitting in a dictionary object that nothing on the public site
 * can render. Routes and components are the obvious half of a separation; the
 * dictionary is the half that is easy to forget, and it is the half a curious
 * reader of the bundle finds first.
 *
 * The administration application loads this file *as well as* its own, because
 * an administrator legitimately manages campaign owners and their campaigns and
 * needs the words for both. The public site loads neither.
 *
 * The *keys* still appear in `MessageKey`, because types are erased at build
 * time and cost nothing at runtime — so `t('owner.portal')` stays type-checked
 * everywhere, while the string it resolves to ships only where it is needed.
 */
export const ownerEn = {
  // ------------------------------------------- the dashboard, as it was
  'prov.title': 'Campaign owner dashboard',
  'prov.overview': 'Overview',
  'prov.myCampaigns': 'My campaigns',
  'prov.customers': 'Customers',
  'prov.reviews': 'Reviews',
  'prov.analytics': 'Analytics',
  'prov.kpiBookings': 'Total bookings',
  'prov.kpiActive': 'Active campaigns',
  'prov.kpiSeats': 'Seats still available',
  'prov.kpiRevenue': 'Revenue',
  'prov.kpiRating': 'Average rating',
  'prov.kpiFill': 'Seat fill rate',
  'prov.addCampaign': 'Add campaign',
  'prov.editCampaign': 'Edit campaign',
  'prov.newCampaign': 'New campaign',
  'prov.formTitleAr': 'Trip title (Arabic)',
  'prov.formDescAr': 'Description (Arabic)',
  'prov.formType': 'Trip type',
  'prov.formPrice': 'Price per traveller (OMR)',
  'prov.formWilayah': 'Departure wilayah',
  'prov.formMethod': 'Travel method',
  'prov.formDeparture': 'Departure date',
  'prov.formReturn': 'Return date',
  'prov.formSeats': 'Total seats',
  'prov.formSeatsAvailable': 'Seats still available',
  'prov.formHotelMakkah': 'Makkah accommodation',
  'prov.formHotelMadinah': 'Madinah accommodation',
  'prov.formHaram': 'Distance from the Haram (metres)',
  'prov.formServices': 'Included services',
  'prov.saveCampaign': 'Save campaign',
  'prov.campaignSaved': 'Campaign saved',
  'prov.campaignDeleted': 'Campaign deleted',
  'prov.deleteConfirm': 'Delete this campaign? Existing bookings are kept.',
  'prov.noCampaigns': 'You haven’t published any trips yet',
  'prov.noCampaignsHint': 'Add your first trip so pilgrims can find and book it.',
  'prov.customerName': 'Customer',
  'prov.customerPeople': 'People',
  'prov.customerTrip': 'Trip',
  'prov.noCustomers': 'No bookings yet on this campaign',
  'prov.chartBookings': 'Bookings over time',
  'prov.chartRevenue': 'Revenue by month',
  'prov.chartTrips': 'Most booked trips',
  'prov.chartLocations': 'Where your customers come from',
  // The subscription half of this card is gone. `prov.planMonthly` and
  // `prov.planThisMonth` priced a tier NASEK has never agreed a price for, so
  // the strings go with the figures rather than waiting to be reused.
  // ------------------------------------------- manual payment, owner side
  /*
   * NASEK does not take payment, so the owner is the only party who knows
   * whether any arrived. These are the strings for the part of the workflow
   * that happens in their portal.
   */
  'prov.paymentWorkflow':
    'A customer creates a booking request and sends you its NASEK invoice on WhatsApp. You reply with your payment details and are paid directly — NASEK is not involved in the payment. Once you have received it, mark the booking as paid here.',
  'prov.temporarilyUnavailable':
    'This action is briefly unavailable while NASEK finishes an update. The booking is unchanged — please try again shortly.',
  'prov.markPaid': 'Mark as paid',
  'prov.markedPaid': 'Booking {ref} is confirmed as paid',
  'prov.noPhoneTitle': 'Your company has no contact number on file',
  'prov.noPhoneBody':
    'Customers send their booking invoice to you on WhatsApp, and that button is disabled until your company record carries a number. Add one on your company profile.',
  /*
   * `prov.planCommission` — "Mediation fee (2%)" — is gone with the fee. NASEK
   * charges the campaign owner nothing, so there is no figure to label.
   */
  'prov.noData': 'No data yet',
  'prov.lowSeats': '{n} trips are almost full',
  'prov.respondReview': 'Reply',
  'prov.viewPublic': 'View public page',
  'prov.deleteAsk': 'Delete this trip?',
  'prov.discardAsk': 'Discard your unsaved changes?',
  'prov.discard': 'Discard',
  'prov.keepEditing': 'Keep editing',
  'prov.fixErrors': 'Check these fields before saving',
  'prov.errReturnBefore': 'The return date must come after the departure date.',
  'prov.errSeatsBelowBooked': 'Cannot be fewer than the {n} seats already confirmed.',
  'prov.seatsAvailableHint': 'Worked out from confirmed bookings. Confirming or cancelling a booking updates it.',
  'prov.servicesCount': '{n} of {total} selected',
  'prov.searchCustomers': 'Search by traveller, trip or reference',
  'prov.statusAll': 'All statuses',
  'prov.showingCount': 'Showing {shown} of {total}',
  'prov.showMore': 'Show 40 more',
  'prov.noMatch': 'No booking matches that search',
  'prov.lowSeatsFix': 'Add seats or let the trip close — a full trip keeps taking bookings otherwise.',
  'prov.replyPlaceholder': 'Write your reply…',
  'prov.replySend': 'Post reply',
  'prov.replyPosted': 'Reply posted',
  'prov.replyYours': 'Your reply',
  'prov.replyNote': 'Prototype — replies are kept for this session only.',

  'prov.pendingTitle': 'Your campaign is being verified',
  'prov.pendingSubtitle': 'We are checking your permit',
  'prov.pendingBody':
    'Your account has been submitted for verification. Our team will review your information before activating your campaign provider account.',
  'prov.pendingMeanwhile':
    'You will be able to publish trips as soon as your permit is approved. Until then your campaign is not visible to pilgrims.',
  'prov.submittedOn': 'Submitted',
  'prov.checkAgain': 'Check again',
  'prov.suspendedTitle': 'This campaign is suspended',
  'prov.suspendedSubtitle': 'Your trips are not visible on NASEK',
  'prov.suspendedBody':
    'A NASEK administrator has suspended this campaign. Your trips have been withdrawn from the site while it is in place.',
  'prov.rejectedTitle': 'Your application was not approved',
  'prov.rejectedSubtitle': 'Correct the details below and send it back',
  'prov.reasonGiven': 'Why it was refused',
  'prov.reasonMissing': 'No reason was recorded. Contact NASEK and we will explain.',
  'prov.replaceLicence': 'Replace the permit (optional)',
  'prov.replaceLicenceHint': 'Leave this empty to resubmit with the permit already on file.',
  'prov.resubmit': 'Send it back for review',
  'prov.resubmitted': 'Sent back — your campaign is in the queue again',
  'prov.contactSupport': 'Contact NASEK',

  // ============================================================== the portal
  'owner.portal': 'Campaign Owner Portal',
  'owner.signInTitle': 'Campaign Owner Portal',
  'owner.signInSubtitle': 'Sign in with your email and password',
  'owner.passwordOnly':
    'Campaign owners sign in with their email address and password. If NASEK invited you and you have no password yet, use the link in the invitation.',
  'owner.wrongDoor':
    'This account is not a campaign owner. If you believe it should be, contact NASEK.',
  'owner.noAccount': 'Not a campaign owner yet?',
  'owner.forgot': 'Forgotten your password?',
  'owner.forgotTitle': 'Reset your password',
  'owner.forgotBody':
    'Enter the email address your company is registered under. We will send a link to set a new password.',
  'owner.forgotSend': 'Send the reset link',
  'owner.forgotSent': 'If that address has an owner account, a reset link is on its way.',
  'owner.forgotBack': 'Back to sign in',
  'owner.signOut': 'Sign out',

  // ------------------------------------------------- setting the first password
  'owner.setPasswordTitle': 'Choose your password',
  'owner.setPasswordBody':
    'NASEK has verified your company. Set a password and the portal is yours.',
  'owner.setPasswordCta': 'Save and open the portal',
  'owner.setPasswordFailed': 'That password was not accepted. Try a longer one.',

  // ------------------------------------------------------------- portal tabs
  // ------------------------------------------------------- the company logo
  /*
   * One logo per company, not per trip. It applies immediately: a logo is
   * presentation, not the evidence NASEK verified the company against, so it
   * does not join the profile-change review queue and it moves no trip.
   */
  'owner.logoTitle': 'Campaign Logo',
  'owner.logoNote':
    'Your company logo appears on every trip you publish, on the NASEK site and in the administration. Upload it once — you do not add it to each trip.',
  'owner.logoUpload': 'Upload Logo',
  'owner.logoChange': 'Change Logo',
  'owner.logoRemove': 'Remove Logo',
  'owner.logoHint':
    'PNG, JPG or WebP, up to 2 MB. A square image works best; it is never stretched or cropped.',
  /*
   * Five ways a logo can fail to save, and five different things to do about
   * it. A single "something went wrong" makes the owner retry the one thing
   * that cannot work. `owner.logoInvalid` — the old catch-all — is kept because
   * it is the one the file picker shows before an upload is attempted, where
   * type and size genuinely are one message.
   */
  'owner.logoWrongType': 'That file is not a PNG, JPG or WebP image. Please choose one of those.',
  'owner.logoTooBig': 'That image is larger than 2 MB. Please choose a smaller one.',
  'owner.logoUploadFailed':
    'The image could not be uploaded. Check your connection and try again — nothing has changed.',
  'owner.logoSignedOut': 'Your session has expired. Sign in again and re-upload the logo.',
  'owner.logoNotAllowed':
    'NASEK would not accept that file for your company. Upload the image again from this page rather than reusing an old link.',
  'owner.logoSaveFailed':
    'The logo was uploaded but could not be saved to your company. Nothing has changed — please try again.',
  'owner.logoInvalid': 'Please upload a PNG, JPG or WebP image no larger than 2 MB.',
  'owner.logoSaved': 'Your campaign logo has been updated',
  'owner.logoRemoved': 'Your campaign logo has been removed',
  'owner.notApprovedToPublish': 'Your company must be approved by Admin before you can publish trips.',
  'owner.tabProfile': 'Company profile',
  'owner.tabNotifications': 'Notifications',

  // ---------------------------------------------------------- company profile
  'owner.profileBody': 'What pilgrims see about your company, and what NASEK verified you with.',
  'owner.profilePublic': 'Shown on your campaigns',
  'owner.profilePrivate': 'Held by NASEK only',
  'owner.profilePrivateNote':
    'These are what an administrator checked your company against. They are never published and never shown to pilgrims.',
  'owner.profileNotSet': 'Not provided',
  'owner.verificationTitle': 'Verification status',
  'owner.verifiedBody':
    'Your company is approved. Campaigns you create are reviewed before they go live.',
  'owner.pendingBody':
    'Your company is with the NASEK team. You will be told as soon as it is decided.',
  'owner.rejectedBody': 'Your company was not approved. The reason is below.',
  'owner.suspendedBody':
    'Your company account is suspended. Your campaigns are not on the public site.',
  'owner.permitOnFile': 'Permit on file',
  'owner.permitView': 'View the permit',
  'owner.permitNone': 'No permit on file',
  'owner.permitOpening': 'Opening…',
  'owner.permitFailed': 'That permit could not be opened. It may have been removed.',
  'owner.governorate': 'Governorate',
  'owner.commercialRegistration': 'Commercial registration number',
  'owner.commercialRegistrationHint':
    'From your Ministry of Commerce record, if the company has one.',
  'owner.permitNumber': 'Permit / licence number',
  'owner.permitNumberHint': 'The number printed on the operating permit.',
  'owner.permitExpiry': 'Permit expiry date',
  'owner.permitExpiryHint': 'Leave empty if the permit does not expire.',
  'owner.description': 'About the company',
  'owner.descriptionHint': 'A short profile pilgrims will read on your campaigns.',
  'owner.permitExpired':
    'That date has already passed. The NASEK team will ask for a current permit.',

  // ------------------------------------------------------------ notifications
  'owner.notificationsEmpty': 'Nothing yet',
  'owner.notificationsEmptyBody':
    'Approvals, refusals and booking activity appear here as they happen.',
  'owner.markAllRead': 'Mark all as read',
  'owner.markRead': 'Mark read',

  // ============================================================ campaign status
  // A trip can only be in this state if it predates 20260911000100 and its
  // company is not eligible to publish. Nothing new ever lands here.
  'campaignStatus.pending_approval': 'Not published',
  'campaignStatus.active': 'Live',
  'campaignStatus.rejected': 'Off the site',
  'campaignStatus.suspended': 'Suspended',
  'campaignStatus.reason': 'Why it was taken off the site',
  'campaignStatus.editsGoLiveNote':
    'This trip is live. Anything you change here — the price, the dates, the services — is on the NASEK site as soon as you save it.',
  'campaignStatus.submittedOn': 'Sent for review',

  // ==================================================== campaign form additions
  'prov.formDeadline': 'Registration deadline',
  'prov.formDeadlineHint': 'The last day someone may book. Never after departure.',
  'prov.errDeadlineAfter': 'The deadline cannot be after the departure date.',
  'prov.formExcluded': 'Not included in the price',
  'prov.formExcludedHint':
    'Only tick what you want stated outright. Anything left unticked is simply not mentioned.',
  'prov.formIncluded': 'Other included services',
  'prov.formIncludedHint':
    'Anything the list above does not cover — add as many as you like. Shown exactly as you type it, so keep each one short and concrete.',
  'prov.addIncluded': 'Add a service',
  'prov.addContact': 'Add another person',
  'prov.moveUp': 'Move up',
  'prov.formProvider': 'Campaign owner',
  'prov.formProviderPick': 'Choose a company…',
  'prov.publishCampaign': 'Publish the trip',
  'prov.publishedActive': 'The trip has been added and is live now.',
  'prov.formImages': 'Photographs',
  'prov.formImagesHint': 'Up to {n}. The first one is used on the campaign card.',
  'prov.imageAdd': 'Add a photograph',
  'prov.imageRemove': 'Remove',
  'prov.imageCover': 'Cover',
  'prov.imageUploading': 'Uploading…',
  'prov.imageTooMany': 'That is the maximum number of photographs.',
  'prov.imageTypeError': 'Photographs must be JPEG, PNG or WebP.',
  'prov.imageSizeError': 'That photograph is larger than 5 MB.',
  'prov.imageFailed': 'That photograph could not be uploaded. Try again.',
  'prov.formContact': 'Contact for this campaign',
  'prov.formContactHint': 'Left empty, pilgrims are given the company details instead.',
  'prov.formContactName': 'Contact name',
  'prov.sectionMedia': 'Photographs and terms',
  'prov.viewPublicPending': 'Not public yet',

  // ------------------------------------------ recovered working-tree keys
  // Entries that existed in the editor but had never been committed when the
  // owner strings were split out of the public dictionary. Kept together so
  // the next reader can see they belong with the sections above rather than
  // being a separate concern.
  'owner.sectionCompany': 'The company',
  'owner.sectionContact': 'Who we speak to',
  'owner.sectionLicensing': 'Licensing',
  'owner.sectionLocation': 'Where you operate',
  'prov.campaignSaveFailed': 'That could not be saved. Nothing has changed — please check the details and try again.',
  'prov.replyFailed': 'That reply could not be saved. Nothing has changed — please try again.',

  // ------------------------------------------------- editing the company
  'owner.profileEdit': 'Edit company profile',
  'owner.profileSaved': 'Company profile saved',
  'owner.profileUnderReview': 'Sent to NASEK — your verified details are under review',
  'owner.profileSubmit': 'Save and send for review',
  'owner.profilePublicEditNote':
    'Marketing and contact details. These save straight away.',
  'owner.profileVerified': 'Verified details',
  'owner.profileVerifiedNote':
    'These are what NASEK checked your company on. Changing any of them sends the change for review — your company stays approved on the details already on file until an administrator agrees to the new ones.',
  'owner.profileVerifiedFree':
    'Your company is not approved yet, so these save straight away and an administrator reads them with the rest of your application.',
  'owner.profileWillReview':
    'This edit changes verified details, so it will be sent to NASEK for review. Everything else on this page saves immediately.',
  'owner.profilePendingTitle': 'Changes awaiting review',
  'owner.profilePendingBody':
    'NASEK has these and will decide shortly. Your company keeps its current approved details until then.',
  'owner.permitReplace': 'Replace the permit',
  'owner.permitReplaceHint':
    'PDF, JPEG, PNG or WebP. Leave empty to keep the permit already on file.',

  // ----------------------------- seats are held on confirmation, not on request
  //
  // The owner is the only person who can turn a request into a held seat, so
  // the owner is who has to understand the rule. Two things they need on the
  // screen: that a pending request is not holding anything, and that if the
  // requests in front of them add up to more than the trip has left, confirming
  // them all is not possible.
  'prov.seatsOnConfirm':
    'A request holds no seat. The seats leave the trip when you confirm payment — first confirmed, first served.',
  'prov.pendingExceedSeats':
    '{pending} seats are requested and {available} remain. Confirm in the order the money arrives; the ones you cannot fit will be refused by the system.',


  // ============================================ registering a company on NASEK
  //
  // Two screens, and the split is the project's own configuration rather than a
  // design choice: email confirmation is on, so `signUp` returns no session and
  // nothing that needs a signed-in caller — the permit upload, `register_provider`
  // — can run until the address is confirmed. Saying "step 1 of 2" out loud is
  // better than a form that appears to have worked and has not finished.
  'owner.registerLink': 'Register your company',
  'owner.registerStep1': 'Step 1 of 2',
  'owner.registerStep2': 'Step 2 of 2',
  'owner.signUpTitle': 'Create your sign-in',
  'owner.signUpSubtitle':
    'The email address and password you will use to reach this portal. Your company details come next.',
  'owner.signUpSubmit': 'Create my sign-in',
  'owner.signUpHaveAccount': 'Already registered?',
  'owner.signUpBackToSignIn': 'Sign in instead',
  'owner.confirmSentTitle': 'Confirm your email address',
  'owner.confirmSentBody':
    'A confirmation link is on its way to {email}. Open it and you will come back here to enter your company details. The link works on any device.',
  'owner.passwordConfirm': 'Confirm password',
  'owner.passwordMismatch': 'The two passwords do not match.',

  'owner.companyTitle': 'Your company',
  'owner.companySubtitle':
    'What NASEK verifies you on. An administrator checks the permit against these details before your trips can be published.',
  'owner.companySubmit': 'Submit for verification',
  'owner.companyWrongAccount':
    'You are signed in as {email}. Registering a company here makes this account its owner.',
  'owner.registerFailed': 'The company could not be registered',
  'owner.registerPhoneNote':
    'The number pilgrims contact you on to arrange payment. It is not used to sign in.',
  'owner.signOutInstead': 'Sign out',

} as const

export type OwnerMessageKey = keyof typeof ownerEn
