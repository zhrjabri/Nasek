/**
 * English strings. This file is the key source of truth — `ar.ts` is typed
 * against it, so a missing Arabic translation is a compile error, not a
 * blank label discovered in production.
 *
 * `{placeholders}` are substituted by `t(key, { placeholder: value })`.
 */
export const en = {
  // ---------------------------------------------------------------- common
  'common.appName': 'NASEK',
  'common.tagline': 'Oman’s Hajj & Umrah campaigns, in one place',
  'common.perPerson': 'per person',
  'common.seatsLeft': '{n} seats left',
  'common.lastSeats': 'Only {n} left',
  'common.soldOut': 'Fully booked',
  'common.reviews': '{n} reviews',
  'common.rating': 'Rating',
  'common.from': 'From',
  'common.to': 'to',
  'common.search': 'Search',
  'common.searching': 'Searching…',
  'common.filters': 'Filters',
  'common.clear': 'Clear',
  'common.clearAll': 'Clear all',
  'common.cancel': 'Cancel',
  'common.remove': 'Remove',
  /*
   * What an error boundary says. Deliberately four short strings and not one
   * paragraph: the panel names what broke, offers the two things that ever
   * help, and then shows the error's own text — because the person reading it
   * is usually the person who can pass it on, and "something went wrong" gives
   * them nothing to pass.
   */
  'error.title': 'This part of the page stopped working',
  'error.body':
    'The rest of the screen is unaffected. Try again, and if it keeps happening send us the message below.',
  'error.retry': 'Try again',
  'error.reload': 'Reload the page',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.skip': 'Skip',
  'common.previous': 'Previous',
  'common.continue': 'Continue',
  'common.save': 'Save',
  'common.saved': 'Saved',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.viewAll': 'View all',
  'common.viewDetails': 'View details',
  'common.bookNow': 'Book now',
  'common.required': 'Required',
  'common.all': 'All',
  'common.verified': 'Verified by NASEK',
  'common.pendingVerification': 'Verification pending',
  'common.hajj': 'Hajj',
  'common.umrah': 'Umrah',
  'common.air': 'By air',
  'common.land': 'By land',
  'common.travellers': 'Travellers',
  'common.departure': 'Departure',
  'common.return': 'Return',
  'common.total': 'Total',
  'common.name': 'Name',
  'common.email': 'Email',
  'common.phone': 'Phone',
  'common.wilayah': 'Wilayah',
  'common.status': 'Status',
  'common.date': 'Date',
  'common.price': 'Price',
  'common.experience': '{n} years of experience',
  'common.language': 'Language',
  'common.menu': 'Menu',
  'common.skipToContent': 'Skip to main content',

  // ------------------------------------------------------------------- nav
  'nav.home': 'Home',
  'nav.campaigns': 'Campaigns',
  'nav.smartMatch': 'Smart Match',
  'nav.map': 'Map',
  'nav.giving': 'NASEK Giving',
  'nav.about': 'About',
  'nav.signIn': 'Sign in',
  /* The navbar control is chromeless — no box to fill — so it can afford the
     full phrase on a laptop and shortens only where the bar is genuinely
     tight. English has nothing to shorten; Arabic drops to 'دخول'. */
  'nav.signInShort': 'Sign in',
  'nav.signOut': 'Sign out',
  'nav.saved': 'Saved',
  'nav.notifications': 'Notifications',
  'nav.myBookings': 'My bookings',

  // ------------------------------------------------------------------ hero
  'hero.titlePre': 'Your journey to ',
  'hero.titleMark': 'the House of God',
  'hero.titlePost': ',',
  'hero.titleB': 'begins here',
  'hero.subtitle':
    'Discover Hajj and Umrah campaigns easily, and find the right one for your journey.',
  'hero.trust': 'Every campaign here is trusted and approved by NASEK',
  'hero.ctaSecondary': 'Browse campaigns',
  'hero.statCampaigns': 'campaigns listed',
  'hero.statProviders': 'campaign owners',
  'hero.statWilayat': 'wilayat covered',
  'hero.statReviews': 'customer reviews',

  // ---------------------------------------------------------------- search
  'search.title': 'Find your trip',
  'search.type': 'Trip type',
  'search.where': 'Departing from',
  'search.anyWilayah': 'Any wilayah',
  'search.budget': 'Budget',
  'search.travellers': 'Travellers',
  'search.submit': 'Search campaigns',
  'search.smartTab': 'Ask in your own words',
  'search.classicTab': 'Search by fields',
  'search.smartPlaceholder':
    'e.g. I want an Umrah trip from Muscat for 2 people under 500 OMR in December',
  'search.smartHint': 'Write in Arabic or English — NASEK will turn it into filters.',
  'search.smartAnalyse': 'Understand my request',
  'search.smartThinking': 'Reading your request…',
  'search.smartUnderstood': 'Here is what NASEK understood',
  'search.smartNothing':
    'NASEK could not pick up any filters from that. Try mentioning a trip type, a wilayah, a budget or a month.',
  'search.smartApply': 'Show {n} matching campaigns',
  'search.tryExample': 'Try an example',

  // --------------------------------------------------------------- filters
  'filters.type': 'Trip type',
  'filters.location': 'Departure wilayah',
  'filters.price': 'Price per person',
  'filters.travelMethod': 'Travel method',
  'filters.date': 'Travel window',
  'filters.rating': 'Minimum rating',
  'filters.seats': 'Minimum available seats',
  'filters.services': 'Services',
  'filters.anyRating': 'Any rating',
  'filters.starsUp': '{n}+ stars',
  'filters.showResults': 'Show {n} results',
  'filters.active': '{n} active',
  'filters.applied': 'Applied filters',
  'filters.remove': 'Remove this filter',
  'filters.chipSeats': '{n}+ seats free',

  // ------------------------------------------------------------------ sort
  'sort.label': 'Sort by',
  'sort.recommended': 'Recommended',
  'sort.price_asc': 'Lowest price',
  'sort.price_desc': 'Highest price',
  'sort.rating': 'Highest rating',
  'sort.popular': 'Most popular',
  'sort.seats': 'Most seats available',

  // -------------------------------------------------------------- campaign
  'campaign.results': '{n} campaigns',
  'campaign.resultsOne': '1 campaign',
  'campaign.noResults': 'No campaigns match these filters',
  'campaign.noResultsHint':
    'Try widening your budget, choosing another wilayah, or clearing some filters.',
  'campaign.includes': 'Included services',
  'campaign.moreServices': '+{n} more',
  'campaign.duration': '{n} days',
  'campaign.coverHajj': 'Makkah · The Holy Sites',
  'campaign.coverMakkahMadinah': 'Makkah · Madinah',
  'campaign.coverMakkah': 'Makkah',
  'campaign.byProvider': 'Operated by',
  'campaign.aboutTrip': 'About this trip',
  'campaign.accommodation': 'Accommodation',
  'campaign.makkah': 'Makkah',
  'campaign.madinah': 'Madinah',
  'campaign.terms': 'Terms & conditions',
  'campaign.termsBody':
    'Prices are per traveller and include the services listed above. Payment and cancellation terms are set by the campaign owner, so confirm them with the owner directly before you pay. Passports must be valid for at least six months from the departure date.',
  'campaign.contact': 'Contact the campaign',
  'review.write': 'Write a review',
  'review.thanks': 'Reviewed',
  'review.formTitle': 'How was the trip?',
  'review.formNote': 'Your review is public and appears on this trip with your first name. You can review a trip once.',
  'review.rating': 'Rating',
  'review.stars': '{n} out of 5',
  'review.comment': 'What should other pilgrims know?',
  'review.submit': 'Post review',
  'review.posted': 'Thank you — your review is published',
  'review.replyTitle': 'Reply from the campaign',
  'review.anonymous': 'A pilgrim',
  'campaign.reviewsTitle': 'What travellers said',
  'campaign.noReviews': 'No reviews yet for this trip.',
  'campaign.report': 'Report this campaign',
  'campaign.reported': 'Thank you — our team will review this listing.',
  'campaign.similar': 'Similar campaigns',
  'campaign.seatsBar': '{booked} of {total} seats booked',
  'campaign.saveNeedsAccount': 'Sign in to keep this trip — saved campaigns follow your account, not this browser.',
  'campaign.saveFailed': 'That could not be saved just now. Please try again.',
  'campaign.savedToast': 'Saved to your list',
  'campaign.unsavedToast': 'Removed from your list',

  'campaign.browse': 'Browse campaigns',
  'campaign.haramLabel': 'Distance from Haram',
  'campaign.seatsLabel': 'Seats available',
  'provider.verificationLabel': 'Verification',

  // ----------------------------------------------------------- smart match
  'smart.navTitle': 'NASEK Smart Match',
  'smart.title': 'Find your perfect campaign',
  'smart.subtitle':
    'Answer a few questions and NASEK will find the campaigns that match your needs.',
  'smart.start': 'Start Smart Match',
  'smart.step': 'Step {n} of {total}',
  'smart.q1': 'Are you looking for Hajj or Umrah?',
  'smart.q2': 'Which wilayah are you travelling from?',
  'smart.q3': 'What is your budget per person?',
  'smart.q4': 'When would you like to travel?',
  'smart.q5': 'Do you prefer travelling by land or by air?',
  'smart.q6': 'Which services matter most to you?',
  'smart.q7': 'How many people are travelling?',
  'smart.q1hint': 'This decides which trips we search.',
  'smart.q2hint': 'We favour campaigns departing close to you.',
  'smart.q3hint': 'Drag to set your maximum comfortable price.',
  'smart.q4hint': 'Pick a season, or leave it open.',
  'smart.q5hint': 'Land trips cost less; air trips are much shorter.',
  'smart.q6hint': 'Choose up to four. We weight these heavily.',
  'smart.q7hint': 'We check that enough seats are free.',
  'smart.noPreference': 'No preference',
  'smart.upTo': 'Up to {n} OMR',
  'smart.analysing': 'Matching you with campaigns…',
  'smart.analysingStep1': 'Reading your preferences',
  'smart.analysingStep2': 'Scoring 20 campaigns',
  'smart.analysingStep3': 'Ranking your best matches',
  'smart.resultsTitle': 'Your NASEK matches',
  'smart.resultsSubtitle': 'Ranked by how closely each trip fits what you asked for.',
  'smart.match': '{n}% match',
  'smart.whyMatch': 'Why this matches',
  'smart.tradeoff': 'Worth knowing',
  'smart.restart': 'Start over',
  'smart.showMatchesNow': 'Show my matches now',
  'smart.answeredNote': 'Answer only what matters to you — we use sensible defaults for the rest.',
  'smart.noMatches': 'No campaign fits those preferences yet',
  'smart.noMatchesHint':
    'Try raising your budget, allowing both travel methods, or opening up the travel dates.',
  'smart.relax': 'Loosen my preferences',

  // ----------------------------------------------------------------- steps
  'how.title': 'How NASEK works',
  'how.subtitle': 'Four steps between you and the right campaign.',
  'how.s1.title': 'Search',
  'how.s1.body': 'Tell us what you need — in your own words or with filters.',
  'how.s2.title': 'Explore',
  'how.s2.body': 'Open a campaign to read its price, services, hotels and reviews in full.',
  'how.s3.title': 'Choose',
  'how.s3.body': 'Pick the campaign that fits your budget and your family.',
  'how.s4.title': 'Book',
  'how.s4.body': 'Reserve your seats and get a confirmation you can keep.',

  // ------------------------------------------------------------------- why
  'why.title': 'Why NASEK',
  'why.subtitle': 'Built around the problems Omani pilgrims actually described.',
  'why.1.title': 'Every campaign in one place',
  'why.1.body':
    'Instead of asking around for phone numbers, browse Oman’s campaigns in one catalogue, each described on the same terms.',
  'why.2.title': 'Honest, complete prices',
  'why.2.body':
    'Prices are shown per traveller with the services they include, so a cheap trip and a complete one are easy to tell apart.',
  'why.3.title': 'Seats you can actually count on',
  'why.3.body':
    'Every trip shows how many seats remain, so you know whether to decide today or think it over.',
  'why.4.title': 'Reviews from real travellers',
  'why.4.body':
    'Ratings come from people who travelled with the campaign, not from the campaign’s own advertising.',
  'why.5.title': 'Close to home',
  'why.5.body':
    'Filter by wilayah to find campaigns that depart near you — the original reason NASEK exists.',
  'why.6.title': 'Permitted owners only',
  'why.6.body':
    'Every owner registers with their trade permit and is approved by NASEK before a single trip appears.',

  // ------------------------------------------------------------- home misc
  'home.featured': 'Featured campaigns',
  'home.featuredSub': 'Hand-picked trips with strong ratings and seats still open.',
  'home.popular': 'Most booked this season',
  'home.popularSub': 'What other pilgrims in Oman are choosing right now.',
  'home.reviewsTitle': 'From travellers who used NASEK',
  'home.mapTitle': 'Campaigns across Oman',
  'home.mapSub': 'Pick a wilayah to see which campaigns depart from there.',
  'home.finalCta.title': 'Ready to find your campaign?',
  'home.finalCta.body': 'Answer seven short questions and see your best matches in under a minute.',
  'home.stage1': 'Start your journey',
  'home.stage2': 'Find what suits you',
  'home.stage3': 'Discover campaigns',
  'home.stage4': 'From Oman to your destination',
  'home.stage5': 'Your journey, step by step',
  'home.stage6': 'Travel with confidence',
  'home.stage7': 'Giving',
  'home.stage8': 'The journey starts now',
  'home.emptyCampaigns': 'No campaigns are listed right now. They open at the start of each season.',
  'home.openNow': 'Open for booking now',
  'home.smartTitle': 'Seven short questions. One result that fits you.',

  // ------------------------------------------------------------------- map
  'map.title': 'Campaigns by wilayah',
  'map.subtitle': 'Select a wilayah to see the campaigns departing from it.',
  'map.campaignsIn': 'Campaigns departing from {name}',
  'map.count': '{n} campaigns',
  'map.countOne': '1 campaign',
  'map.none': 'No campaigns depart from here yet',
  'map.noneHint': 'Campaign owners in this wilayah can be the first to list a trip.',
  'map.selectHint': 'Select a wilayah on the map',
  'map.legend': 'Circle size shows how many campaigns depart from each wilayah.',
  'map.source': 'Boundaries from public geographic data',

  // --------------------------------------------------------------- booking
  /*
   * Booking, after NASEK stopped implying it takes payment.
   *
   * Gone with the payment step and the traveller-details step: `booking.step4`
   * / `step5` / `step6` / `stepTrip`, the whole `nationality` / `civilId` /
   * `passport` / `residence` / `sponsor` / `docsNote` set, `contactTitle` /
   * `contactNote`, `paymentTitle` / `paymentNote` / `paymentDemo`, `subtotal` /
   * `fee` / `grandTotal`, and `confirmTitle` / `confirmBody` — which announced
   * a confirmed booking at the moment nothing had been paid.
   */
  'booking.title': 'Complete your booking',
  'booking.stepPassengers': 'Passengers',
  'booking.stepReview': 'Review',
  'booking.chooseTrip': 'Your selected trip',
  'booking.changeTrip': 'Choose a different trip',
  'booking.passengersTitle': 'Who is travelling?',
  'booking.travellersNote': 'Including yourself. {n} seats are available on this trip.',
  'booking.omani': 'Omani',
  'booking.nonOmani': 'Non-Omani resident',
  'booking.male': 'Male',
  'booking.female': 'Female',
  'booking.totalPassengers': 'Total passengers',
  'booking.atLeastOne': 'A booking needs at least one passenger.',
  'booking.reviewTitle': 'Review your booking request',
  'booking.reviewNote': 'Check every figure. This is what the campaign owner will be sent.',
  'booking.campaign': 'Campaign',
  'booking.tripNo': 'Trip No.',
  'booking.tripDate': 'Trip date',
  'booking.created': 'Request created',
  'booking.manualPaymentNote':
    'NASEK does not take payment. Creating this request issues an invoice you send to the campaign owner on WhatsApp; they reply with their payment details and confirm your booking once they have been paid.',
  'booking.temporarilyUnavailable':
    'Booking is briefly unavailable while NASEK finishes an update. Nothing was charged and nothing was saved — please try again shortly.',
  'booking.createRequest': 'Create booking request',
  'booking.processing': 'Creating your booking request…',
  'booking.pricePerPerson': 'Price per person',
  'booking.notEnoughSeats': 'Only {n} seats remain on this trip.',

  // ------------------------------------------------- the customer's number
  'booking.phoneRequired': 'Please add your phone number to complete the booking request.',
  'booking.phoneRequiredWhy':
    'The campaign owner replies to you directly with their payment details, so your invoice has to carry a number they can reach you on.',
  'booking.phoneAdd': 'Add my phone number',
  'booking.phoneReturn': 'Your trip and passenger choices are kept — you will come straight back here.',

  // -------------------------------------------------------------- invoice
  'booking.requestTitle': 'Your booking request is saved',
  'booking.requestBody':
    'NASEK has issued the invoice below. Send it to the campaign owner to receive their payment details.',
  'booking.invoiceNo': 'NASEK invoice number',
  'booking.awaitingPayment': 'Awaiting payment',
  // ------------------------------ what a request does and does not hold
  //
  // Said plainly, and said before the customer walks away, because it is the
  // one part of the manual-payment workflow that can cost them the trip. A
  // request reserves nothing until the owner records payment — the seats stay
  // on sale in the meantime, and someone who pays first gets them.
  'booking.seatNotHeld': 'Your seat is not reserved yet',
  'booking.seatNotHeldBody':
    'The trip keeps these seats on sale until the campaign owner confirms your payment. Send the invoice and pay as soon as you can — the seats are yours from the moment they confirm, and not before.',
  'booking.sendWhatsapp': 'Send invoice to campaign owner via WhatsApp',
  'booking.sendWhatsappNote':
    'You will contact the campaign owner directly to receive payment details and complete your booking.',
  'booking.noProviderPhone': 'A contact number is not currently available for this campaign.',
  'booking.noProviderPhoneNote':
    'Your booking request is saved and the campaign owner can see it. NASEK has been told that this company has no contact number on file.',
  'booking.viewBookings': 'Go to my bookings',
  'booking.backHome': 'Back to home',
  'booking.signInFirst': 'Sign in to continue your booking',
  'booking.signInNote':
    'It takes an email address and a code. Your selection is kept — you’ll come straight back here.',
  'booking.print': 'Print invoice',

  // ------------------------------------------------------------------ auth
  'auth.passwordRequired': 'Enter your password',
  'auth.signInChecking': 'Checking…',
  'auth.signInFailed': 'Those details do not match an account.',
  'auth.emailTaken': 'An account already uses that email address.',
  'auth.showPassword': 'Show password',
  'auth.hidePassword': 'Hide password',
  'auth.password': 'Password',
  'auth.confirmPassword': 'Confirm password',
  'auth.companyName': 'Campaign name',
  'auth.experienceYears': 'Years of experience',
  'auth.companyTagline': 'Short description',
  'auth.companyTaglineHint': 'One line pilgrims will see on your campaign card.',
  'auth.contactName': 'Person in charge',
  'auth.licenceLabel': 'Permit / licence image',
  'auth.licenceHint': 'A photo or scan of your Ministry of Endowments and Religious Affairs permit. JPG or PNG, up to 8 MB.',
  'auth.licenceUpload': 'Choose an image',
  'auth.licenceRemove': 'Remove',
  'auth.licencePreviewAlt': 'Uploaded permit image',
  'auth.licenceRequired': 'A permit image is required to register',
  'auth.licenceTypeError': 'That file is not an image. Upload a JPG or PNG.',
  'auth.licenceSizeError': 'That image is larger than 8 MB. Try a smaller photo.',
  'auth.licenceDecodeError': 'That image could not be read. Try another file.',
  'auth.emailInvalid': 'Enter a valid email address',
  'auth.passwordShort': 'Password must be at least {n} characters',
  'auth.passwordRejected': 'That password was not accepted.',
  'auth.passwordMismatch': 'Passwords do not match',
  'auth.phoneInvalid': 'Enter a valid Omani phone number',
  'auth.creating': 'Creating your account…',
  // -------------------------------------------- passwordless sign-in (OTP)
  'auth.otpTitle': 'Welcome to NASEK',
  'auth.otpSubtitle': 'Your journey starts with the right campaign.',
  'auth.chooseChannel': 'How would you like to receive your code?',
  'auth.continueEmail': 'Email',
  'auth.continuePhone': 'Phone',
  /*
   * None of these name a number of digits.
   *
   * The length is Supabase's `Email OTP Length` setting rather than anything
   * decided here, and it moved from six to eight without these sentences
   * moving with it — so the screen promised six digits to people who had
   * received eight. Copy that names no length stays true whatever the setting
   * becomes.
   */
  'auth.emailHint': 'We’ll send your sign-in code to this address.',
  'auth.phoneHint': 'Omani numbers work as 9123 4567 or +968 9123 4567.',
  'auth.sendCode': 'Send my code',
  'auth.sending': 'Sending…',
  'auth.codeSentEmail': 'We sent your sign-in code to',
  'auth.codeSentPhone': 'We sent your sign-in code by SMS to',
  'auth.codeLabel': 'Verification code',
  'auth.verify': 'Verify and continue',
  'auth.verifying': 'Verifying…',
  'auth.resend': 'Send it again',
  'auth.resendIn': 'Send again in {n}s',
  'auth.changeTarget': 'Use a different one',
  'auth.noPasswordNote':
    'No password needed. NASEK never asks you to create or remember one — so there is none to forget, and none for us to lose.',
  'auth.demoTitle': 'Demo mode — no backend configured',
  'auth.demoBody':
    'Nothing was sent. This code was generated in your browser so the flow can be tried offline. Configure Supabase for real delivery.',
  'auth.errNotConfigured':
    'Sign-in is unavailable right now — this site is not connected to its authentication service. Please try again later or contact NASEK.',
  'auth.errInvalidTarget': 'That doesn’t look like a valid email address or phone number.',
  'auth.errSendFailed': 'We couldn’t send your code. Check the address and try again.',
  'auth.errMailQuota': 'This NASEK project has sent as many sign-in emails as it is allowed this hour. Codes will work again shortly — or an administrator can lift the limit by configuring an email provider.',
  'auth.errRateLimited': 'Too many requests. Wait a moment before asking for another code.',
  'auth.errWrongCode': 'That code is not correct.',
  'auth.errExpired': 'That code has expired. Ask for a new one.',
  'auth.errTooMany': 'Too many attempts. Start again with a new code.',
  'auth.errCodeFormat': 'Enter the whole code.',
  'auth.blockedSuspended': 'This account has been suspended. Contact NASEK to restore it.',
  'auth.blockedRemoved': 'This account is no longer active.',
  'auth.sessionFailed': 'We verified your code but couldn’t open your session. Try again.',
  // --------------------------------------------- arriving from an email link
  'auth.completingSignIn': 'Signing you in…',
  'auth.linkExpired': 'That sign-in link has expired or has already been used. Ask for a new one.',
  'auth.linkWrongBrowser':
    'Open the link in the same browser you asked for it from. For security, a link cannot finish signing you in anywhere else.',
  'auth.linkFailed': 'We could not finish signing you in from that link. Try asking for a new one.',
  'auth.linkRetry': 'Back to sign in',
  /*
   * No "paste the link" wording here any more.
   *
   * The customer sign-in screen offers one road — address, then code — so the
   * panel that asked someone to paste a URL is gone and its six strings with
   * it. What remains below belongs to a link that is *clicked*: that path still
   * lands on the site, is still completed by `completeAuthRedirect`, and still
   * needs something to say when it fails.
   */

  // ------------------------------------------------------- user dashboard
  'dash.welcome': 'Welcome, {name}',
  'dash.welcomeSub': 'Here’s everything you have on NASEK.',
  'dash.bookings': 'My bookings',
  'dash.saved': 'Saved campaigns',
  'dash.profile': 'Profile',
  'dash.notifications': 'Notifications',
  'dash.upcoming': 'Upcoming',
  'dash.completed': 'Completed',
  'dash.cancelled': 'Cancelled',
  'dash.pending': 'Awaiting payment',
  'dash.awaitingPaymentNote': 'Awaiting payment completion with the campaign owner',
  'dash.seatNotHeld':
    'These seats are still on sale until the campaign owner confirms your payment.',
  'dash.resendInvoice': 'Send the invoice again on WhatsApp',
  'dash.noBookings': 'You have no bookings yet',
  'dash.noBookingsHint': 'When you book a trip it will appear here with its reference number.',
  'dash.noSaved': 'You haven’t saved any campaigns',
  'dash.noSavedHint': 'Tap the bookmark on any campaign to keep it here for later.',
  'dash.noNotifications': 'No notifications',
  'dash.markAllRead': 'Mark all as read',
  'dash.cancelBooking': 'Cancel booking',
  'dash.cancelConfirm': 'Cancel this booking? This cannot be undone.',
  'dash.bookingCancelled': 'Booking cancelled',
  'dash.cancelFailed': 'That booking could not be cancelled. Nothing has changed — please try again.',
  'dash.daysToGo': 'in {n} days',
  'dash.profileSaved': 'Profile updated',

  // --------------------------------------------------- provider dashboard
  // ---------------------------------------------------------------- giving
  'giving.title': 'NASEK Giving',
  'giving.subtitle':
    'Help make a Hajj or Umrah journey possible for families who need support.',
  'giving.body':
    'From the beginning, NASEK’s founders wanted the platform to do more than sell seats. NASEK Giving is a planned programme that lets individuals and campaign owners contribute towards fully funded trips for low-income families in Oman.',
  'giving.how': 'How it will work',
  'giving.h1.title': 'Contributions are collected',
  'giving.h1.body': 'Individuals, campaign owners and sponsors contribute towards a shared fund.',
  'giving.h2.title': 'Families apply',
  'giving.h2.body': 'Applications are reviewed with the relevant charitable bodies in Oman.',
  'giving.h3.title': 'Seats are funded',
  'giving.h3.body': 'The fund books seats on verified campaigns at the price the campaign charges.',
  'giving.h4.title': 'The journey is reported back',
  'giving.h4.body': 'Contributors see how many journeys their support made possible.',
  'giving.plannedTitle': 'A planned feature',
  'giving.plannedBody':
    'NASEK Giving is not yet accepting contributions. No donation system is connected and no money can be collected here. This page describes the intended programme so partners and stakeholders can review it.',
  'giving.interest': 'Register your interest',
  'giving.interestNote': 'We’ll get in touch when the programme opens.',
  'giving.interestFailed': 'That could not be saved just now. Please try again.',
  'giving.interestThanks': 'Thank you — we’ve noted your interest.',
  'giving.statTrips': 'trips targeted in year one',
  'giving.statPartners': 'partner campaigns committed',
  'giving.statCost': 'OMR funds one land Umrah seat',

  // ----------------------------------------------------------------- about
  'about.title': 'About NASEK',
  'about.lead':
    'NASEK is an Omani platform that brings the Sultanate’s Hajj and Umrah campaigns together in one place, so that choosing a campaign is a matter of clear information rather than word of mouth.',
  'about.storyTitle': 'Where it started',
  'about.story':
    'NASEK began as a student project at Gulf College, built on the idea that the sharing economy could connect Omani Hajj and Umrah campaigns with the people looking for them. The team holds intellectual property for the concept, reached the final of the Youth Creativity competition and the fifth stage of INJAZ Oman.',
  'about.problemTitle': 'The problem we started from',
  'about.problemBody':
    'Pilgrims struggled to find campaigns near them, to learn what a price actually included, to know how many seats were left, and to judge which campaigns people were actually happy with. Campaign owners struggled to organise registrations and to reach beyond their own wilayah.',
  'about.missionTitle': 'What NASEK is for',
  'about.missionBody':
    'To make the decision clear: every campaign in one place, honest prices, visible seat counts, and reviews from people who travelled.',

  // --------------------------------------------------------- trust & legal
  'trust.title': 'Trust & safety',
  'trust.subtitle': 'A Hajj or Umrah trip is not an ordinary purchase. We treat it that way.',
  'trust.1.title': 'Verification',
  'trust.1.body':
    'Campaign owners submit their details to the NASEK team before their listings carry a verified badge.',
  'trust.2.title': 'Transparent pricing',
  'trust.2.body':
    'Every price is per traveller and lists what it includes. NASEK adds nothing to it — you pay the campaign the price you see.',
  'trust.3.title': 'Real reviews',
  'trust.3.body': 'Only travellers with a completed booking can review a campaign.',
  'trust.4.title': 'Report anything',
  'trust.4.body':
    'A report button on every campaign sends the listing straight to the NASEK team.',
  'trust.disclaimer':
    'NASEK lists campaigns published by their owners and does not issue licences. Always confirm a campaign’s licence with the Ministry of Endowments and Religious Affairs before paying.',
  'trust.privacy': 'Privacy policy',
  'trust.terms': 'Terms of use',
  'trust.support': 'Contact support',

  // ---------------------------------------------------------------- footer
  'footer.about': 'NASEK brings Oman’s Hajj and Umrah campaigns together so pilgrims can search, choose and book with confidence.',
  'footer.explore': 'Explore',
  'footer.company': 'NASEK',
  'footer.contact': 'Contact',
  /* See the Arabic file: two strings and a link rather than one sentence. */
  'footer.rights': '© {year} NASEK',
  'footer.builtBy': 'Developed by',
  'footer.prototype': 'NASEK does not take payments. You pay the campaign owner directly.',

  // ------------------------------------------------------------ misc/state
  'state.errorBody': 'Something went wrong on our side. Try again in a moment.',
  'state.notFoundTitle': 'Page not found',
  'state.notFoundBody': 'The page you’re looking for doesn’t exist or has moved.',
  'state.notFoundCta': 'Back to home',
  // ------------------------------------------------- social and password
  'auth.passwordHint': 'At least {n} characters. Length matters far more than symbols.',
  'auth.passwordSignInTitle': 'Have a password? Sign in with it',
  'auth.passwordSignInBody':
    'Campaign owners and NASEK staff set a password when they register. Pilgrims do not need one — the code above is the way in.',
  'auth.errEmailUnconfirmed': 'Confirm your email address first. Use the one-time code above.',
  'auth.mfaPrompt': 'Enter the current code from your authenticator app.',
  'auth.mfaLabel': 'Authenticator code',
  'auth.licenceUploadFailed': 'Your permit could not be uploaded. Check your connection and try again.',
  // ------------------------------------------------------ campaign additions
  //
  // These four are genuinely public: they are drawn on the campaign page a
  // signed-out pilgrim reads. Everything else that arrived with campaign
  // approval — the owner portal, the queue, the form that fills these in — is
  // in `ownerEn.ts` and reaches no bundle a customer downloads.
  //
  // `campaign.terms` and `campaign.contact` already exist above and are reused
  // rather than restated: the headings were always there; what was missing was
  // anything for them to display.
  'campaign.excluded': 'Not included',
  'campaign.deadline': 'Register by',
  'campaign.deadlinePassed': 'Registration has closed',
  'campaign.gallery': 'Photographs',
  'auth.noAccountNeeded':
    'No account needed to browse. Signing in for the first time creates yours automatically.',

  // ============================================================== my account
  'account.title': 'My account',
  'account.detailsTitle': 'Personal details',
  'account.detailsBody': 'Used to prefill your bookings, so you are asked once rather than every time.',
  'account.nameHint': 'The name a campaign will look for at the airport.',
  'account.phoneHint': 'How a campaign reaches you about a trip. Optional.',
  'account.governorate': 'Governorate',
  'account.nationality': 'Nationality',
  'account.nationalityHint': 'Prefills your booking forms. Each traveller on a booking still has their own.',
  'account.nationalityNone': 'Prefer not to say',
  'account.notSet': 'Not set',
  'account.discardAsk': 'Discard your unsaved changes?',
  'account.discard': 'Discard',
  'account.keepEditing': 'Keep editing',
  'account.documentsNote':
    'Passport and civil ID numbers are not kept here. They belong to a booking — each traveller has their own — and are collected on the booking form.',

  'account.emailTitle': 'Sign-in email',
  'account.emailBody': 'The address your one-time code is sent to.',
  'account.emailChange': 'Change',
  'account.emailNew': 'New email address',
  'account.emailSend': 'Send confirmation',
  'account.emailConfirmNote':
    'We will email a confirmation link to the new address. Nothing changes until you follow it, and your current address keeps working until then.',
  'account.emailSent':
    'Confirmation sent to {email}. Follow the link in that message to finish the change.',
  'account.emailSame': 'That is already your address.',
  'account.emailTaken': 'That address is already in use on NASEK.',
  'account.emailFailed': 'That change could not be started. Please try again.',
  'account.saveFailed': 'Your details could not be saved just now. Nothing has changed — please try again.',
} as const

/**
 * The keys the public site can name.
 *
 * Administration keys live in `adminEn.ts` and join this union in `index.tsx`
 * — as a type only, so `t('admin.users')` stays checked while the strings
 * themselves stay out of the public bundle.
 */
export type PublicMessageKey = keyof typeof en
