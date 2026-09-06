/*
 * Do eight one-time-code boxes fit on a phone?
 *
 * They did not. `CodeInput` laid its boxes out as a flex row of `size-12`
 * squares — 48px each, 8px apart — and neither number was derived from
 * anything. Six of them come to 328px, which survives a 375px screen by
 * accident, so the arithmetic was never questioned. When the project's
 * `Email OTP Length` moved to eight, the row became 440px wide inside a card
 * that offers about 240 on a 320px phone: it drew straight through both edges
 * of the card, clipped the first and last digits, and gave the whole page a
 * horizontal scrollbar.
 *
 * WHY THIS FILE EXISTS AT ALL, GIVEN THAT jsdom HAS NO LAYOUT
 *
 * The interaction harness can type into these boxes but cannot measure them —
 * jsdom implements no CSS layout, so every width it reports is zero. Rather
 * than pretend, this harness does the arithmetic itself: it reads the styles
 * the component actually emits, reads the page chrome the sign-in screen
 * actually wraps it in, and computes the used width of every box at each
 * viewport the design has to survive.
 *
 * That makes it a test of a *contract* rather than of a rendering, and the
 * contract is checked from both ends:
 *
 *   * The structural invariants below are what make overflow impossible at any
 *     width, not just the nine sampled: a grid of `1fr` columns cannot exceed
 *     its container, and `min-width: 0` is what stops a text input's intrinsic
 *     width from overriding the column it was given. Those two lines are the
 *     fix; the measurements are the evidence.
 *   * The measurements then catch the other half — a row that technically fits
 *     but is unusable, either because a box has shrunk below a thumb or grown
 *     to fill a laptop.
 *
 * If the sizing ever moves back to fixed pixels, the invariant checks fail
 * before any of the arithmetic is reached.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { CodeInput, TOTP_CODE_LENGTH } from '@/components/auth/CodeInput'
import { AuthShell } from '@/pages/AuthPages'
import { EMAIL_CODE_LENGTH } from '@/services/auth/otp'
import { ar } from '@/i18n/ar'
import { en } from '@/i18n/en'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

// --------------------------------------------------------- reading the CSS

/**
 * `clamp(min, preferred, max)`, evaluated at a viewport width.
 *
 * Only the two unit forms the component uses — `rem` and `vw` — because a
 * general CSS calculator is not the point and a wrong one would be worse than
 * none. Anything else throws rather than guessing.
 */
const ROOT_FONT = 16

function toPx(token: string, viewport: number): number {
  const text = token.trim()
  let m = /^(-?[\d.]+)rem$/.exec(text)
  if (m) return Number(m[1]) * ROOT_FONT
  m = /^(-?[\d.]+)px$/.exec(text)
  if (m) return Number(m[1])
  m = /^(-?[\d.]+)vw$/.exec(text)
  if (m) return (Number(m[1]) / 100) * viewport
  throw new Error(`unsupported CSS length: "${token}"`)
}

function clampPx(expression: string, viewport: number): number {
  const m = /^clamp\(([^,]+),([^,]+),([^,]+)\)$/.exec(expression.replace(/\s+/g, ' ').trim())
  if (!m) throw new Error(`not a clamp(): "${expression}"`)
  const [min, preferred, max] = [m[1], m[2], m[3]].map((t) => toPx(t, viewport))
  return Math.min(Math.max(min, preferred), max)
}

/** `calc(N * 3.25rem + M * 0.5rem)`, which is the one calc this file meets. */
function calcPx(expression: string): number {
  const m = /^calc\(\s*(\d+)\s*\*\s*([\d.]+rem)\s*\+\s*(\d+)\s*\*\s*([\d.]+rem)\s*\)$/.exec(
    expression.replace(/\s+/g, ' ').trim(),
  )
  if (!m) throw new Error(`unsupported calc(): "${expression}"`)
  return Number(m[1]) * toPx(m[2], 0) + Number(m[3]) * toPx(m[4], 0)
}

/*
 * React 19 writes `inputMode` and `autoComplete` into static markup in the
 * camelCase spelling of the prop. HTML parses attribute names
 * case-insensitively so a browser sees no difference, but a string search does
 * — hence the exact spellings below rather than the HTML ones.
 */
const BOX = 'inputMode="numeric"'
const ROW = 'role="group"'

/** The inline `style="..."` of the first tag matching `marker`. */
function styleOf(html: string, marker: string): Record<string, string> {
  const at = html.indexOf(marker)
  if (at < 0) throw new Error(`no element matching ${marker}`)
  const open = html.lastIndexOf('<', at)
  const close = html.indexOf('>', at)
  const tag = html.slice(open, close)
  const style = /style="([^"]*)"/.exec(tag)?.[1] ?? ''
  const out: Record<string, string> = {}
  for (const rule of style.split(';')) {
    const i = rule.indexOf(':')
    if (i > 0) out[rule.slice(0, i).trim()] = rule.slice(i + 1).trim().replace(/&#x27;/g, "'")
  }
  return out
}

function classOf(html: string, marker: string): string {
  const at = html.indexOf(marker)
  const open = html.lastIndexOf('<', at)
  const tag = html.slice(open, html.indexOf('>', at))
  return /class="([^"]*)"/.exec(tag)?.[1] ?? ''
}

// ------------------------------------------------------------- the chrome

/**
 * What the sign-in card actually leaves for the row, at a given viewport.
 *
 * These are the classes on `AuthShell`'s `<main>` and on the `<Card>` inside
 * it, converted to pixels. They are written out rather than measured because
 * there is nothing here to measure them with — and they are asserted against
 * the real components in "the card this row sits in" below, so a change to the
 * padding fails this file rather than silently invalidating every number.
 *
 * Two details in this arithmetic are the kind that are wrong the first time,
 * and both were caught by comparing it against real Chrome rather than by
 * reading it again.
 *
 *   * `max-w-lg` caps the *border box*, because Tailwind's preflight sets
 *     `box-sizing: border-box` on everything. The page padding therefore comes
 *     out of the 512, rather than sitting outside it, and subtracting it before
 *     the cap — the obvious order — overstates the room by 48px on a laptop.
 *   * `.surface` gives the card a 1px border on each side, which the padding
 *     does not include. Two pixels sounds like rounding until it is the two
 *     pixels that decide whether the row fits.
 *
 * With both, this reproduces Chrome exactly: 238px of usable width at 320 and
 * 406px at 1440, which is what `getBoundingClientRect` reports on the page.
 */
const SM_BREAKPOINT = 640
const CHROME = {
  /** `max-w-lg` on <main>, capping its border box. */
  maxWidth: 32 * ROOT_FONT,
  /** `px-4 sm:px-6` on <main>. */
  pagePad: (w: number) => (w >= SM_BREAKPOINT ? 24 : 16),
  /** `p-6 sm:p-7` on the <Card>. */
  cardPad: (w: number) => (w >= SM_BREAKPOINT ? 28 : 24),
  /** The 1px `.surface` border, on both sides. */
  cardBorder: 1,
}

const cardInnerWidth = (viewport: number) =>
  Math.min(CHROME.maxWidth, viewport) -
  2 * CHROME.pagePad(viewport) -
  2 * CHROME.cardPad(viewport) -
  2 * CHROME.cardBorder

/** The nine widths the design has to survive, and what each one is. */
const VIEWPORTS: [number, string][] = [
  [320, 'the narrowest phone still in use'],
  [360, 'a common Android'],
  [375, 'iPhone SE / mini'],
  [390, 'iPhone 14/15'],
  [430, 'iPhone Pro Max'],
  [768, 'tablet'],
  [1024, 'small laptop'],
  [1366, 'laptop'],
  [1440, 'desktop'],
]

/** How a box actually resolves, following the same rules the browser would. */
function layout(html: string, length: number, viewport: number) {
  const row = styleOf(html, ROW)
  const box = styleOf(html, BOX)

  const gap = clampPx(row.gap, viewport)
  const rowMax = calcPx(row['max-width'])
  // `width: 100%` capped by `max-width`, inside the card.
  const rowWidth = Math.min(cardInnerWidth(viewport), rowMax)
  // Equal `1fr` columns with `min-width: 0`: the track is whatever is left.
  const boxWidth = (rowWidth - (length - 1) * gap) / length
  // `aspect-square` raised by `min-height`.
  const boxHeight = Math.max(boxWidth, toPx(box['min-height'], viewport))
  const font = clampPx(box['font-size'], viewport)

  return { gap, rowMax, rowWidth, boxWidth, boxHeight, font, total: boxWidth * length + gap * (length - 1) }
}

// ----------------------------------------------------------------- render

/*
 * Rendered bare, with no provider around it, and that is deliberate.
 *
 * `CodeInput` reads nothing from the i18n context — its label arrives as a
 * prop — so its geometry cannot depend on the language, and drawing it inside
 * a direction is the wrong way to prove that. What the two "languages" below
 * really vary is the direction of the page around the boxes, which is what
 * `dir="ltr"` on the row exists to be immune to.
 */
const field = (length: number, lang: 'ar' | 'en' = 'ar') =>
  renderToStaticMarkup(
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <CodeInput
        value=""
        onChange={() => {}}
        label={lang === 'ar' ? 'رمز الدخول' : 'sign-in code'}
        length={length}
      />
    </div>,
  )

const email = field(EMAIL_CODE_LENGTH)
const totp = field(TOTP_CODE_LENGTH)

// ================================================================= the boxes

console.log(`\n--- how many boxes ${'-'.repeat(37)}\n`)

const countBoxes = (html: string) => (html.match(/inputMode="numeric"/g) ?? []).length

check(
  `the customer's emailed code gets exactly ${EMAIL_CODE_LENGTH} boxes`,
  countBoxes(email) === EMAIL_CODE_LENGTH && EMAIL_CODE_LENGTH === 8,
  `${countBoxes(email)} boxes, EMAIL_CODE_LENGTH=${EMAIL_CODE_LENGTH}`,
)

/*
 * The administration dashboard's authenticator code, which shares this
 * component and must not have moved.
 *
 * Six is RFC 6238 and every authenticator app on earth; it is not a project
 * setting and changing it would lock every administrator out. Asserted here
 * because the responsive work touched the file both codes are drawn by.
 */
check(
  'an authenticator code still gets exactly 6, untouched by the email length',
  countBoxes(totp) === 6 && TOTP_CODE_LENGTH === 6,
  `${countBoxes(totp)} boxes, TOTP_CODE_LENGTH=${TOTP_CODE_LENGTH}`,
)

// ====================================================== why it cannot overflow

console.log(`\n--- the shape that makes overflow impossible ${'-'.repeat(11)}\n`)

{
  const row = styleOf(email, ROW)
  const rowClass = classOf(email, ROW)
  const box = styleOf(email, BOX)
  const boxClass = classOf(email, BOX)

  check(
    'the row is a grid of one column per digit',
    /grid/.test(rowClass) &&
      row['grid-template-columns'] === `repeat(${EMAIL_CODE_LENGTH}, minmax(0, 1fr))`,
    row['grid-template-columns'],
  )
  check(
    'the columns are allowed to shrink below their content (minmax(0, …))',
    row['grid-template-columns'].includes('minmax(0, 1fr)'),
  )
  check('the row takes the width it is given, no more', /(^|\s)w-full(\s|$)/.test(rowClass))
  check('and is centred inside it', /(^|\s)mx-auto(\s|$)/.test(rowClass))
  check(
    'the row caps its own width so a wide card does not stretch it',
    !!row['max-width'] && row['max-width'].startsWith('calc('),
    row['max-width'],
  )
  check(
    'a box may be narrower than an input wants to be (min-width: 0)',
    box['min-width'] === '0' || box['min-width'] === '0px',
    box['min-width'],
  )
  check('a box fills its column', /(^|\s)w-full(\s|$)/.test(boxClass))
  check('the gap scales with the viewport', /^clamp\(/.test(row.gap ?? ''), row.gap)
  check('so does the digit', /^clamp\(/.test(box['font-size'] ?? ''), box['font-size'])

  /*
   * The regression itself, named. `size-12` was the fixed 48px that could not
   * shrink; a `w-`/`h-` pair with a number would be the same mistake spelled
   * differently.
   */
  check(
    'no fixed pixel size survives on a box',
    !/\bsize-\d|\bw-\d+(\s|$)|\bh-\d+(\s|$)/.test(boxClass),
    boxClass,
  )
}

// ================================================== the card this row sits in

console.log(`\n--- the card this row sits in ${'-'.repeat(26)}\n`)

/*
 * The chrome numbers above are only as good as their agreement with the real
 * screen. Read off `AuthShell` rather than trusted, so that changing the card's
 * padding fails this file instead of quietly making every width below wrong.
 */
{
  const shell = renderToStaticMarkup(
    <MemoryRouter>
      <I18nProvider>
        <AuthShell title="t" subtitle="s">{null}</AuthShell>
      </I18nProvider>
    </MemoryRouter>,
  )
  const main = /<main[^>]*class="([^"]*)"/.exec(shell)?.[1] ?? ''
  check('the sign-in page is still max-w-lg with px-4 sm:px-6', /max-w-lg/.test(main) && /px-4/.test(main) && /sm:px-6/.test(main), main.slice(0, 80))
  check('and the card inside it is still p-6 sm:p-7', /class="[^"]*\bp-6 sm:p-7\b/.test(shell))
  // `.surface` is where the card's 1px border comes from, and those two pixels
  // are subtracted above. If that class goes, the arithmetic silently gains
  // room the page does not have.
  check('the card is still a .surface, so the 1px border is still there', /class="surface/.test(shell))
}

// ============================================================ every viewport

console.log(`\n--- ${EMAIL_CODE_LENGTH} boxes, at every width ${'-'.repeat(24)}\n`)

for (const [width, what] of VIEWPORTS) {
  const card = cardInnerWidth(width)
  const l = layout(email, EMAIL_CODE_LENGTH, width)
  const fits = l.total <= card + 0.01

  console.log(
    `      ${String(width).padStart(4)}px  ${what.padEnd(30)} ` +
      `card ${card.toFixed(0)}px · box ${l.boxWidth.toFixed(1)}×${l.boxHeight.toFixed(1)} · ` +
      `gap ${l.gap.toFixed(1)} · font ${l.font.toFixed(1)} · row ${l.total.toFixed(1)}`,
  )

  check(`  ${width}px: all ${EMAIL_CODE_LENGTH} boxes stay inside the card`, fits, `${l.total.toFixed(1)}px in ${card.toFixed(0)}px`)
  check(`  ${width}px: nothing is clipped or pushed off the edge`, l.boxWidth > 0 && l.rowWidth <= card + 0.01)
  check(`  ${width}px: the page needs no horizontal scroll`, l.total <= width - 2 * CHROME.pagePad(width))
  check(`  ${width}px: the digit still fits in its box`, l.font <= l.boxWidth, `font ${l.font.toFixed(1)} in ${l.boxWidth.toFixed(1)}px`)
  check(`  ${width}px: the box is still tappable`, l.boxHeight >= 44, `${l.boxHeight.toFixed(1)}px tall`)
  check(`  ${width}px: and has not grown unnecessarily large`, l.boxWidth <= 52.001, `${l.boxWidth.toFixed(1)}px wide`)
}

/*
 * The old layout, measured the same way, so the numbers in the report are not
 * a story anyone has to take on trust. 48px boxes with an 8px gap.
 */
/*
 * Checked against real headless Chrome over the DevTools protocol at all nine
 * widths in both languages, walking the actual sign-in flow: at 320px Chrome
 * reports boxes of 25.83px in a 238px row, and at 1440px 43.75px in a 406px
 * row. Both are what the arithmetic above produces, which is why it is allowed
 * to stand in for a browser inside `npm run verify`.
 */
{
  const before = 8 * 48 + 7 * 8
  const card = cardInnerWidth(320)
  check(
    'the layout this replaced really did overflow a 320px phone',
    before > card,
    `${before}px of boxes in a ${card}px card — ${(before - card).toFixed(0)}px over`,
  )
}

// =================================================== six boxes, same treatment

console.log(`\n--- 6 boxes, at the widths that matter ${'-'.repeat(17)}\n`)

for (const width of [320, 768, 1440]) {
  const card = cardInnerWidth(width)
  const l = layout(totp, TOTP_CODE_LENGTH, width)
  check(
    `  ${width}px: the 6-digit authenticator row fits too`,
    l.total <= card + 0.01,
    `${l.total.toFixed(1)}px in ${card.toFixed(0)}px`,
  )
  check(
    `  ${width}px: and caps narrower than the 8-digit one`,
    l.rowMax < layout(email, EMAIL_CODE_LENGTH, width).rowMax,
    `${l.rowMax}px vs ${layout(email, EMAIL_CODE_LENGTH, width).rowMax}px`,
  )
}

// ================================================================ both scripts

console.log(`\n--- Arabic and English ${'-'.repeat(33)}\n`)

for (const [language, lang] of [['Arabic', 'ar'], ['English', 'en']] as const) {
  const html = field(EMAIL_CODE_LENGTH, lang)
  check(`${language}: still ${EMAIL_CODE_LENGTH} boxes`, countBoxes(html) === EMAIL_CODE_LENGTH)
  check(
    `${language}: the row reads left to right, because a number does`,
    /role="group"[^>]*dir="ltr"/.test(html),
  )
  check(
    `${language}: the boxes are not mirrored by a direction utility`,
    !/rtl:/.test(classOf(html, ROW)) && !/rtl:/.test(classOf(html, BOX)),
  )
  check(
    `${language}: only the first box offers the platform's one-time code`,
    (html.match(/autoComplete="one-time-code"/g) ?? []).length === 1,
  )
  check(`${language}: every box still asks for a numeric keypad`, countBoxes(html) === EMAIL_CODE_LENGTH)
}

/*
 * The sizing must not depend on the language: an Arabic reader gets the same
 * boxes as an English one, in the same places.
 */
check(
  'the two languages produce identical geometry',
  JSON.stringify(styleOf(field(EMAIL_CODE_LENGTH, 'ar'), ROW)) ===
    JSON.stringify(styleOf(field(EMAIL_CODE_LENGTH, 'en'), ROW)),
)

// ====================================================== no magic-link offer

console.log(`\n--- one road in ${'-'.repeat(40)}\n`)

/*
 * The customer sign-in screen offers a code and nothing else.
 *
 * The collapsible "وصلَك رابط بدل الرمز؟" panel is gone, and so is the line
 * above the Verify button that pointed at it. Asserted against the dictionaries
 * as well as the screen: a string that no longer exists cannot be rendered by
 * a key somebody reintroduces later.
 */
for (const [language, dict] of [['Arabic', ar], ['English', en]] as const) {
  const keys = Object.keys(dict)
  check(
    `${language}: no "paste your sign-in link" strings remain`,
    !keys.some((k) => k.startsWith('auth.pasteLink')),
    keys.filter((k) => k.startsWith('auth.pasteLink')).join(', '),
  )
  check(`${language}: no "use the link instead" line remains`, !keys.includes('auth.orUseLink'))

  /*
   * ...but the wording for a link that is *clicked* stays, because that path
   * is untouched: `completeAuthRedirect` still finishes a sign-in that arrives
   * from an email link, on the customer site and in the Owner Portal, and it
   * needs something to say when it cannot.
   */
  for (const kept of ['auth.linkExpired', 'auth.linkWrongBrowser', 'auth.linkFailed', 'auth.completingSignIn'] as const) {
    check(`${language}: ${kept} is kept, because arriving by link still works`, keys.includes(kept))
  }
}

console.log(`\n${failures === 0 ? 'All OTP layout checks passed.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
