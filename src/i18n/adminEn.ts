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
  'admin.campLive': 'Live',
  'admin.campFeatured': 'Featured',
  'admin.campSuspended': 'Suspended',
  'admin.campSearch': 'Search campaigns by title or owner',
  'admin.campFilter': 'Filter campaigns',
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
  'admin.userNote':
    'Customers are listed from the booking history, which is the record the platform keeps of them. Removing an account hides it here and can be undone — the bookings behind it stay, so revenue figures elsewhere in this dashboard do not silently change.',
  'admin.providers': 'Campaign owners',
  'admin.campaigns': 'Campaigns',
  'admin.bookings': 'Bookings',
  'admin.reviews': 'Reviews',
  'admin.kpiGmv': 'Booking value',
  'admin.kpiRevenue': 'NASEK revenue',
  'admin.kpiProviders': 'Campaign owners',
  'admin.kpiCampaigns': 'Live campaigns',
  'admin.kpiBookings': 'Bookings',
  'admin.kpiPending': 'Awaiting verification',
  'admin.verify': 'Verify',
  'admin.unverify': 'Remove verification',
  'admin.verified': 'Verified',
  'admin.verifiedToast': '{name} is now verified',
  'admin.unverifiedToast': 'Verification removed from {name}',
  'admin.revenueSplit': 'Revenue by source',
  'admin.revSubscriptions': 'Subscriptions',
  'admin.revCommission': 'Mediation fees',
  'admin.revPromotions': 'Promoted listings',
  'admin.bookingsByType': 'Bookings by trip type',
  'admin.growth': 'Platform growth',
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
  'admin.loginTitle': 'NASEK Administration',
  'admin.loginSubtitle': 'This area is restricted to NASEK staff.',
  'admin.loginNote':
    'Administrator access is granted in the database, never from this screen. Signing in with an account that does not hold it will be refused.',
  'admin.checking': 'Checking your access…',
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
  'admin.useCodeInstead': 'Sign in with a one-time code instead',
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
}

export type AdminMessageKey = keyof typeof adminEn
