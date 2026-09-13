/**
 * Administration strings.
 *
 * Held apart from `en.ts` for one reason, and it is not tidiness: these values
 * are only imported by `src/admin/main.tsx`, so they are absent from the public
 * site's bundle entirely.
 *
 * Without the split, a pilgrim's browser would download the phrase "NASEK
 * administration", "Suspend account" and "Review permit" along with everything
 * else — and someone reading the JavaScript would learn that an administration
 * area exists and roughly what it can do, which is precisely what separating
 * the two applications was meant to prevent. Routes and components were the
 * obvious half of that; the dictionary is the half that is easy to miss.
 *
 * The *keys* still appear in `MessageKey`, because types are erased at build
 * time and cost nothing at runtime. `t('admin.users')` therefore stays
 * type-checked everywhere, while the string it resolves to ships only where it
 * is needed.
 */
export const adminEn = {
  // ------------------------------------------------------- admin dashboard
  'admin.gateTitle': 'NASEK administration',
  'admin.gateSubtitle': 'Enter the administration passphrase to continue.',
  'admin.gatePassphrase': 'Passphrase',
  'admin.gateEnter': 'Enter',
  'admin.gateChecking': 'Checking…',
  'admin.gateWrong': 'That passphrase is not correct.',
  'admin.gateEmpty': 'Enter the passphrase to continue.',
  'admin.gateOther': 'Not an administrator?',
  'admin.gateNote':
    'Only the NASEK owner holds this passphrase. Nothing you do on this page affects your customer or campaign owner account.',
  'admin.showingOf': 'Showing {shown} of {total}',
  'admin.attention': 'Needs your attention',
  'admin.attentionSub': 'Everything waiting on a decision from you, in one place.',
  'admin.attentionClear': 'Nothing is waiting. The platform is up to date.',
  'admin.awaitingVerification': 'Registered and waiting for verification',
  'admin.reviewPermit': 'Review permit',
  'admin.queueSuspendedCampaigns': '{n} campaigns are suspended and hidden from the public site',
  'admin.queueSuspendedUsers': '{n} accounts are suspended and cannot sign in',
  'admin.ownersVerified': 'Verified',
  'admin.ownersPendingHint': 'Open the Campaign owners tab to review their permits.',
  'admin.ownerSearch': 'Search owners by name, email or phone',
  'admin.ownerFilter': 'Filter owners',
  'admin.noOwnerMatch': 'No owners match',
  'admin.noProvidersBody': 'Campaign owners appear here once they register and upload a permit.',
  'admin.noAccounts': 'No accounts yet',
  'admin.noAccountsBody': 'Accounts appear here as people register on NASEK.',
  'admin.campTotal': 'All campaigns',
  // ------------------------------------------- trip moderation, after the queue
  /*
   * Individual trips are no longer approved — the company is. What is left here
   * is moderation, so the wording is moderation's rather than approval's: a
   * trip is taken down or put back, not refused or let in.
   *
   * Retired with the queue: `admin.campaignQueue`, `admin.campaignQueueBody`,
   * `admin.campaignApprove`, `admin.campaignApproved`, `admin.campaignReject`,
   * `admin.campaignRejected`, `admin.campaignBackToQueue`, `admin.filterPending`,
   * `admin.campaignReviewed`, `admin.addTripPending`.
   */
  'admin.campDeactivate': 'Take off the site',
  'admin.campDeactivated': 'Off the site',
  'admin.campDeactivated_toast': '“{name}” has been taken off the site',
  'admin.campReinstate': 'Put back on the site',
  'admin.campReinstated': '“{name}” is back on the site',
  'admin.campModerationNote':
    'Companies are approved by NASEK; their trips are not. An approved company publishes a trip and it goes live immediately. Use these controls to take a trip off the site if something is wrong with it.',
  'admin.campLive': 'Live',
  'admin.campFeatured': 'Featured',
  'admin.campSuspended': 'Suspended',
  'admin.campSearch': 'Search campaigns by title or owner',
  'admin.campFilter': 'Filter campaigns',
  'admin.addTrip': 'Add trip',
  'admin.addTripDone': 'The trip has been added and approved.',
  'admin.addTripFailed': 'The trip could not be saved. Nothing was created.',
  'admin.campFeature': 'Feature on the home page',
  'admin.campUnfeature': 'Remove from the home page',
  'admin.campSuspend': 'Suspend',
  'admin.campRestore': 'Restore',
  'admin.campDelete': 'Delete campaign',
  'admin.campOpenPublic': 'View the public page',
  'admin.campDeleteTitle': 'Delete this campaign?',
  'admin.campDeleteBody': '“{name}” will be removed from NASEK.',
  'admin.campDeleteHint':
    'This cannot be undone from here. To take a campaign off the site while you talk to its owner, suspend it instead — that is reversible.',
  'admin.featuredToast': '“{name}” is now featured on the home page',
  'admin.unfeaturedToast': '“{name}” is no longer featured',
  'admin.campaignSuspendedToast': '“{name}” is suspended and hidden from pilgrims',
  'admin.campaignRestoredToast': '“{name}” is live again',
  'admin.campaignDeletedToast': '“{name}” has been deleted',
  'admin.noCampaigns': 'No campaigns yet',
  'admin.noCampaignsBody': 'Trips appear here as campaign owners publish them.',
  'admin.noCampaignMatch': 'No campaigns match',
  'admin.campNote':
    'Suspending hides a campaign from pilgrims but keeps everything intact, and can be undone. Featuring promotes it onto the home page. Deleting is permanent.',
  'admin.bookingSearch': 'Search by reference, name, email or phone',
  'admin.bookingFilter': 'Filter bookings',
  'admin.statusConfirmed': 'Confirmed',
  'admin.statusPending': 'Pending',
  'admin.statusCompleted': 'Completed',
  'admin.statusCancelled': 'Cancelled',
  'admin.bookingCapped': 'Showing the first {n}. Use the search to find a specific booking.',
  'admin.noBookings': 'No bookings yet',
  'admin.noBookingsBody': 'Bookings appear here as pilgrims reserve their trips.',
  'admin.noBookingMatch': 'No bookings match',
  'admin.reviewsLow': 'Low ratings',
  'admin.reviewsLowHint': 'Two stars or fewer — usually where complaints are.',
  'admin.reviewsHidden': 'Hidden',
  'admin.reviewSearch': 'Search reviews by traveller or wording',
  'admin.reviewFilter': 'Filter reviews',
  'admin.reviewHide': 'Hide',
  'admin.reviewShow': 'Show again',
  'admin.reviewHiddenToast': 'Review hidden from the public site',
  'admin.reviewShownToast': 'Review is visible again',
  'admin.noReviewMatch': 'No reviews match',
  'admin.noReviewsBody': 'Reviews appear here once travellers rate their trips.',
  'admin.reviewNote':
    'Hiding takes a review off the public site and can be undone. Reviews are never edited — a traveller’s words stay their own, or the ratings stop meaning anything.',
  'admin.title': 'NASEK administration',
  'admin.overview': 'Overview',
  'admin.users': 'Users',
  'admin.usersTotal': 'All accounts',
  'admin.usersCustomers': 'Customers',
  'admin.usersOwners': 'Campaign owners',
  'admin.usersSuspended': 'Suspended',
  'admin.userSearch': 'Search by name, email or phone',
  'admin.userFilter': 'Filter accounts',
  'admin.userAll': 'All',
  'admin.roleCustomer': 'Customer',
  'admin.roleOwner': 'Owner',
  'admin.roleAdmin': 'Administrator',
  'admin.userAccount': 'Account',
  'admin.userRole': 'Role',
  'admin.userJoined': 'Joined',
  'admin.userSpend': 'Spend',
  'admin.userActions': 'Actions',
  'admin.userActive': 'Active',
  'admin.userSuspended': 'Suspended',
  'admin.userRemoved': 'Removed',
  'admin.userSuspend': 'Suspend',
  'admin.userReactivate': 'Reactivate',
  'admin.userRemove': 'Remove account',
  'admin.userRestore': 'Restore',
  'admin.userSuspendedToast': '{name} has been suspended',
  'admin.userReactivatedToast': '{name} is active again',
  'admin.userRemovedToast': '{name} has been removed',
  'admin.userRestoredToast': '{name} has been restored',
  'admin.noUsers': 'No accounts match',
  'admin.noUsersBody': 'Try a different search, or switch the filter back to All.',
  'admin.userOwnerNote':
    'This account runs a campaign. Verifying the campaign itself, and reviewing its permit, is done from the Campaign owners tab.',
  'admin.campaignModerationFailed': 'That change was refused and nothing was saved. Reload and try again.',
  'admin.reviewModerationFailed': 'That change was refused and nothing was saved. Reload and try again.',
  'admin.userNotAnAccount': 'No account',
  'admin.userModerationFailed': 'That change was refused and nothing was saved. Reload and try again.',
  'admin.userNote':
    'Customers are listed from the booking history, which is the record the platform keeps of them. Removing an account hides it here and can be undone — the bookings behind it stay, so revenue figures elsewhere in this dashboard do not silently change.',
  'admin.providers': 'Campaign owners',
  'admin.campaigns': 'Campaigns',
  'admin.bookings': 'Bookings',
  'admin.reviews': 'Reviews',
  // -------------------------------------------- manual payment, admin side
  /*
   * NASEK issues the invoice and takes none of the money. The ledger therefore
   * reports two figures rather than one: what has been confirmed as paid, and
   * what has been asked for and is still outstanding between a customer and a
   * campaign owner. `admin.kpiGmv` is kept — the overview tab still uses it for
   * platform-wide booking value.
   */
  'admin.kpiConfirmedValue': 'Confirmed booking value',
  'admin.kpiAwaitingPayment': 'Awaiting payment',
  'admin.awaitingPaymentHint': 'Requested, not yet confirmed as paid by the campaign owner.',
  'admin.noConfirmedFinancial': 'No confirmed financial data yet',
  'admin.paymentNotProcessed':
    'NASEK does not process payments. Customers pay campaign owners directly, and a booking is confirmed here only when its owner records that they have been paid.',
  'admin.ownerNoPhone': 'No contact number on file',
  'admin.kpiGmv': 'Booking value',
  'admin.kpiProviders': 'Campaign owners',
  'admin.kpiCampaigns': 'Live campaigns',
  'admin.kpiBookings': 'Bookings',
  'admin.kpiPending': 'Awaiting verification',
  'admin.verify': 'Verify',
  'admin.unverify': 'Remove verification',
  'admin.verified': 'Verified',
  'admin.verifiedToast': '{name} is now verified',
  'admin.unverifiedToast': 'Verification removed from {name}',
  /*
   * There is no NASEK revenue key here at all, and that is the point.
   *
   * `admin.revenueSplit`, `admin.revSubscriptions` and `admin.revPromotions`
   * went with the doughnut whose slices this file was inventing prices for.
   * `admin.revCommission` — "Mediation fees" — went with the fee itself: NASEK
   * charges no percentage to anyone, so the administration reports the value of
   * the business and never calls it NASEK's.
   */
  'admin.bookingsByType': 'Bookings by trip type',
  'admin.growth': 'Platform growth',
  'admin.noData': 'No data yet',
  'admin.licence': 'Permit',
  'admin.viewLicence': 'View permit',
  'admin.noLicence': 'No permit uploaded',
  'admin.noProviders': 'No campaign owners have registered yet',
  // -------------------------------------------------- administration shell
  'admin.badge': 'Administration',
  'admin.navLabel': 'Administration menu',
  'admin.groupPlatform': 'Platform',
  'admin.groupPeople': 'People',
  'admin.groupCatalogue': 'Catalogue',
  'admin.backToSite': 'Open the public site',
  'admin.checking': 'Checking your access…',
  'admin.mfaTitle': 'Two-factor required',
  'admin.mfaSubtitle': 'One more step',
  'admin.mfaBody': 'This account has an authenticator enrolled. Enter the current six-digit code from your authenticator app to finish signing in.',
  'admin.mfaCodeLabel': 'Authenticator code',
  'admin.deniedTitle': 'You cannot open this dashboard',
  'admin.deniedNotAdmin':
    'You are signed in, but this account is not an administrator. Access is granted in the database by someone who already holds it.',
  'admin.deniedSuspended': 'This administrator account has been suspended.',
  'admin.deniedUnavailable':
    'We could not reach the database to confirm your access. Check your connection and try again.',
  'admin.signOutAndRetry': 'Sign out and use another account',
  'admin.localModeTitle': 'Local mode — no database configured',
  'admin.localModeBody':
    'This dashboard is running against data held in this browser only. The passphrase below is the prototype gate; it is not a security control. Configure Supabase for real, server-enforced administration.',
  'admin.sectionCount': '{n} in this section',

  // -------------------------------------------------- verification queue
  'admin.approve': 'Approve',
  'admin.reject': 'Refuse',
  'admin.suspend': 'Suspend',
  'admin.restore': 'Restore',
  'admin.rejected': 'Refused',
  'admin.suspendedFilter': 'Suspended',
  'admin.rejectBody':
    'The owner sees this reason word for word, and can correct their application and send it back. Say what is wrong with the permit or the details.',
  'admin.suspendBody':
    'Suspending withdraws every trip this campaign has published. The owner sees this reason and cannot undo the suspension themselves.',
  'admin.reasonLabel': 'Reason',
  'admin.reasonHint': 'Written to the campaign owner. Be specific enough to act on.',
  'admin.reasonRequired': 'A reason is required — the owner cannot fix what they were not told.',
  'admin.rejectedToast': '{name} was refused, and has been told why',
  'admin.suspendedToast': '{name} has been suspended',

  // --------------------------------------------------- the admin account
  'admin.security': 'Security',
  'admin.groupAccount': 'Your account',
  'admin.securityTitle': 'Your administrator account',
  'admin.securityBody':
    'An administration account can suspend a campaign, hide a review and read every booking. It is the most valuable credential on NASEK — treat it as one.',
  'admin.securityLocalMode':
    'Passwords and two-factor need a Supabase project. This dashboard is running against data held in this browser only.',
  'admin.mfaOnTitle': 'Two-factor is on',
  'admin.mfaOnBody':
    'Signing in needs your password and a code from your authenticator app. A stolen password on its own gets nobody in.',
  'admin.mfaTurnOff': 'Turn two-factor off',
  'admin.mfaRemoved': 'Two-factor is off',
  'admin.mfaRemoveFailed': 'That could not be removed. Sign in again and retry.',
  'admin.mfaOffTitle': 'Two-factor is off',
  'admin.mfaOffBody':
    'Add an authenticator app so a password alone is not enough to open this dashboard. Takes about a minute.',
  'admin.mfaTurnOn': 'Turn two-factor on',
  'admin.mfaSetupTitle': 'Scan this with your authenticator',
  'admin.mfaSetupBody':
    'Google Authenticator, 1Password, Aegis — any of them. Then type the six digits it shows to confirm. Nothing changes until you do.',
  'admin.mfaSecret': 'Or type this key in by hand',
  'admin.mfaConfirmLabel': 'Code from the app',
  'admin.mfaConfirm': 'Confirm and turn on',
  'admin.mfaWrongCode': 'That code was not accepted. Codes change every 30 seconds — try the current one.',
  'admin.mfaEnabled': 'Two-factor is on',
  'admin.passwordTitle': 'Password',
  'admin.passwordBody': 'Changes the password this dashboard is opened with. Takes effect immediately.',
  'admin.passwordSave': 'Save password',
  'admin.passwordSaved': 'Password saved',
  'admin.passwordFailed': 'That password was not accepted. Try a longer one.',

  // ======================================================== the access code
  // The dashboard's only door. The code itself lives in the `admin-access`
  // Edge Function's secrets and is never in this bundle, which is why none of
  // these strings can say anything about what it is — only about what happened
  // when one was tried.
  'admin.codeTitle': 'NASEK administration',
  'admin.codeSubtitle': 'Enter the administration access code',
  'admin.codeLabel': 'Access code',
  'admin.codeEnter': 'Open the dashboard',
  'admin.codeChecking': 'Checking…',
  'admin.codeEmpty': 'Enter the access code.',
  'admin.codeWrong': 'That code was not accepted.',
  'admin.codeRateLimited':
    'Too many attempts from here. Wait a few minutes and try again.',
  'admin.codeUnavailable':
    'The access service could not be reached. Check that the admin-access function is deployed.',
  'admin.codeNotConfigured':
    'No access code has been set on the server. Deploy the admin-access function and set ADMIN_ACCESS_CODE.',
  'admin.codeNoAdmin':
    'No administrator account exists yet. Create one and run promote_to_admin() in SQL.',
  'admin.codeAmbiguous':
    'More than one administrator account exists. Set NASEK_ADMIN_EMAIL on the admin-access function to name the one this code opens.',
  'admin.codeSessionFailed':
    'The code was accepted but the session could not be established. Try again.',
  'admin.codeNote':
    'The code is checked on the server. Holding it grants a session, not authority — what this dashboard can read is still decided by is_admin() inside Postgres.',
  'admin.codeSignOut': 'Sign out',

  // ====================================================== trip moderation
  'admin.campaignRejectTitle': 'Take this trip off the site',
  'admin.campaignRejectBody':
    'The trip comes off the public site and the owner sees this word for word. Say what is wrong and what would put it right — they can correct the trip and it goes back up when you reinstate it.',
  'admin.campaignRejectReason': 'Reason',
  'admin.campaignRejectConfirm': 'Take it off the site',
  'admin.campaignReasonRequired': 'A refusal needs a reason the owner can act on.',
  'admin.campaignStatusFailed': 'That decision was refused and nothing was saved. {detail}',
  /* See the Arabic file for why these three exist rather than one. */
  'admin.campaignBlockedSuspended':
    'A trip cannot be published for a suspended company. “{company}” is suspended — restore it under Campaign owners, then try again.',
  'admin.campaignBlockedUnverified':
    'A trip cannot be published for a company that is not approved. Approve “{company}” under Campaign owners first, then try again.',
  'admin.campaignBlockedNotAdmin':
    'This session no longer holds administrator access. Sign in again and try once more.',
  'admin.campaignOwnerUnverified':
    'This campaign belongs to a company that is not approved yet. Approve the company first.',
  'admin.filterActive': 'Live',
  'admin.filterRejected': 'Refused',
  'admin.filterSuspended': 'Suspended',
  'admin.filterAll': 'All',
  'admin.reviewDetail': 'Review',
  'admin.campaignSubmitted': 'Submitted',
  'admin.campaignNoImages': 'No photographs',
  'admin.campaignDeadline': 'Registration closes',
  'admin.campaignExcluded': 'Not included',
  'admin.campaignTerms': 'Terms',
  'admin.campaignContact': 'Contact',

  // ================================================== the owner queue, split
  'admin.ownersPendingTitle': 'Awaiting review',
  'admin.ownersApprovedTitle': 'Approved',
  'admin.ownersRejectedTitle': 'Refused',
  'admin.ownerPermitNumber': 'Permit number',
  'admin.ownerPermitExpiry': 'Permit expires',
  'admin.ownerPermitExpired': 'Expired',
  'admin.ownerCommercialRegistration': 'Commercial registration',
  'admin.ownerAddress': 'Address',
  'admin.ownerGovernorate': 'Governorate',
  'admin.ownerIncomplete': 'Registered before these details were collected',

  // ======================================================= message delivery
  'admin.mailTitle': 'Message delivery',
  'admin.mailBody':
    'Approvals and refusals are queued inside the decision itself, then sent by the send-emails function. Rows sit here as “queued” until that function runs — the owner is told in their portal either way.',
  'admin.mailEmpty': 'Nothing has been queued yet.',
  'admin.mailQueued': 'Queued',
  'admin.mailSending': 'Sending',
  'admin.mailSent': 'Sent',
  'admin.mailFailed': 'Failed',
  'admin.mailRefresh': 'Refresh',
  // ==================================================== taking on an owner
  'admin.newOwnerTitle': 'Add a campaign owner',
  'admin.newOwnerBody':
    'Enter the company as it appears on the permit, upload the permit itself, and NASEK emails an invitation. The owner sets their own password and signs in at the Campaign Owner Portal. There is no public registration.',
  'admin.newOwnerCreate': 'Create and send the invitation',
  'admin.newOwnerCreated': '{name} has been added and invited',
  'admin.newOwnerCreatedNoEmail':
    '{name} has been added, but the invitation could not be sent. The account exists — check email delivery, then ask them to use “forgot password” on the owner portal.',
  'admin.newOwnerEmailHint': 'Where the invitation goes, and the address they will sign in with.',
  'admin.newOwnerStatus': 'Verification',
  'admin.newOwnerStatusHint':
    'Approved is the usual answer — you have the permit in front of you. Choose the queue only when you are taking a company on before the paperwork is complete.',
  'admin.newOwnerButton': 'Add campaign owner',
  'admin.newOwnerOffline': 'This needs a configured backend. Nothing has been created.',
  'admin.newOwnerForbidden': 'That was refused. Sign in again and retry.',
  'admin.newOwnerIsAdmin':
    'That address belongs to an administrator account, which cannot also run a campaign. Use a different address.',
  'admin.newOwnerInviteFailed':
    'The company could not be created because the invitation could not be sent. Check the email settings and try again.',
  'admin.newOwnerExists': 'That account already runs a campaign on NASEK.',
  'admin.newOwnerFailed': 'That could not be completed. Nothing has been created.',
  'admin.newOwnerNoneBody':
    'No campaign owners yet. Add the first one — NASEK emails them an invitation to the Campaign Owner Portal.',

  // =========================================== owner profile change review
  'admin.ownerChangesTitle': 'A campaign owner profile update is awaiting review',
  'admin.ownerChangesBody':
    'An approved company has proposed a change to the details NASEK verified it on. It keeps its current approved information until you decide.',
  'admin.ownerChangeField': 'Field',
  'admin.ownerChangeNow': 'Now',
  'admin.ownerChangeProposed': 'Proposed',
  'admin.ownerChangePermit': 'New permit',
  'admin.ownerChangeApprove': 'Approve the change',
  'admin.ownerChangeReject': 'Refuse',
  'admin.ownerChangeApproved': '{name} — the change has been applied',
  'admin.ownerChangeRejected': '{name} — refused, and the owner has been told why',
  'admin.ownerChangeRejectTitle': 'Refuse this change',
  'admin.ownerChangeRejectBody':
    'The owner reads this word for word and corrects their submission against it. Say what is wrong and what would fix it. Their current approved details are kept.',

}

export type AdminMessageKey = keyof typeof adminEn
