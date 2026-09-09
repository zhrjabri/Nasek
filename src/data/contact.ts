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
 * Customer-facing only. The Campaign Owner Portal's own support line is a
 * different address for a different audience and stays where it is.
 */
export const CONTACT = {
  email: 'aljabrialzahra1@gmail.com',
  /** As it is written for a reader. */
  phone: '+968 0000 0000',
  /** As a dialler needs it: no spaces. */
  tel: 'tel:+96800000000',
  place: 'Muscat, Oman',
  author: 'Alzahra Al Jabri',
  portfolio: 'https://alzahra-portfolio.vercel.app/',
} as const
