/**
 * How NASEK is reached, in one place.
 *
 * The address, the number and the location were written out at each of the five
 * points that show them — twice in the footer, three times on the About page —
 * which is how a site comes to carry two different phone numbers and nobody
 * notices. They are one fact about the platform, so they are one constant, and
 * changing it changes every screen that displays it.
 *
 * Deliberately not translated. An email address, a telephone number and a
 * portfolio URL are the same string in Arabic and in English; only the *labels*
 * around them belong in the dictionaries, and those already do.
 *
 * Read by all three applications now, not only the customer site: the Campaign
 * Owner Portal's status screens offer the same support address, and the second
 * copy of it that used to sit in `owner/StatusPages.tsx` was how the portal came
 * to go on publishing an address the customer site had already retired.
 *
 * What this is NOT. It is the address NASEK publishes for people to write to.
 * It is not an authentication credential, not the address on anybody's account,
 * and not the envelope sender the Edge Functions post from — `EMAIL_FROM` in
 * `send-emails` is delivery configuration and lives in the function's own
 * environment. A campaign's own contact address belongs to the campaign and is
 * read off its row.
 */
export const CONTACT = {
  /*
   * A placeholder, deliberately, and `.example` says so out loud.
   *
   * RFC 2606 reserves `.example` for exactly this: it can never be registered,
   * so nothing here can quietly start delivering to somebody real while it
   * waits for the address NASEK will actually publish.
   */
  email: 'contact@nasek.example',
  /** As it is written for a reader. */
  phone: '+968 0000 0000',
  /** As a dialler needs it: no spaces. */
  tel: 'tel:+96800000000',
  place: 'Muscat, Oman',
  author: 'Alzahra Al Jabri',
  portfolio: 'https://alzahra-portfolio.vercel.app/',
} as const
