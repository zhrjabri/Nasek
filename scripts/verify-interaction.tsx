/*
 * Does the campaign form survive being used?
 *
 * `verify:render` draws every screen once and fails on anything that throws on
 * the first paint. That net has a hole exactly the size of the two defects this
 * harness exists for: an input that lost focus after one character, and a
 * fieldset that took the whole portal down when it was clicked. Both are
 * invisible to a first paint, because both need a second one — the first
 * happens in an effect that `renderToStaticMarkup` never runs, the second on a
 * click that a static render never makes.
 *
 * So this mounts the real component into a real DOM with `createRoot`, types
 * into it one character at a time, clicks the things an owner clicks, and
 * asserts two things after every one of them:
 *
 *   * focus is still where the person put it, and
 *   * nothing reached the root as an uncaught error.
 *
 * The second is what "white screen" means in React 19: an error that escapes
 * render unmounts the entire tree and the portal becomes a blank page. It is
 * caught here through `onUncaughtError` *and* by reading the container back,
 * so an error boundary added later cannot quietly satisfy this file.
 */
import { StrictMode, act, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { ownerAr } from '@/i18n/ownerAr'
import { ownerEn } from '@/i18n/ownerEn'
import { AppStoreProvider, useStore } from '@/store/AppStore'
import { CampaignForm } from '@/components/campaign/CampaignForm'
import { DashboardPage } from '@/owner/DashboardPage'
import { DashboardPage as CustomerDashboardPage } from '@/pages/DashboardPage'
import { CampaignDetailPage } from '@/pages/CampaignDetailPage'
import { NotificationsPanel } from '@/owner/panels/NotificationsPanel'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CodeInput, TOTP_CODE_LENGTH } from '@/components/auth/CodeInput'
import { OtpFlow } from '@/components/auth/OtpFlow'
import { EMAIL_CODE_LENGTH } from '@/services/auth/otp'
import { customerRouteUrl } from '@/lib/publicSite'
import { ar } from '@/i18n/ar'
import { en } from '@/i18n/en'
import type {
  Booking,
  Campaign,
  Notification,
  NotificationAudience,
  Provider,
  Review,
  User,
} from '@/types'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

const describe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

// ----------------------------------------------------------------- the DOM

const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto =
    el instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
}

/** One keystroke, in the order a browser produces it. */
const keystroke = (el: HTMLInputElement | HTMLTextAreaElement, next: string) =>
  act(() => {
    setNativeValue(el, next)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })

const press = (el: Element, key: string) =>
  act(() => {
    el.dispatchEvent(
      new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })

/** A paste of `text` into one box, which the field distributes across the row. */
const paste = (el: Element, text: string) =>
  act(() => {
    const event = new window.Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => text },
    })
    el.dispatchEvent(event)
  })

/*
 * Let the pending work land.
 *
 * `act` flushes React, not the promises React is waiting on. Sending a code is
 * an `await` — a real network call in production, a key derivation in the
 * offline fallback — so without this the assertions run while the button still
 * reads "sending…" and the code screen has not been drawn.
 */
const settle = async (rounds = 8) => {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
}

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })

/** The control a `<Field>` with this label is wrapped around. */
function byLabel(root: ParentNode, text: string): HTMLElement {
  for (const label of [...root.querySelectorAll('label')]) {
    if (!(label.textContent ?? '').trim().startsWith(text)) continue
    const id = label.getAttribute('for')
    if (!id) continue
    const control = root.querySelector(`[id="${id}"]`)
    if (control) return control as HTMLElement
  }
  throw new Error(`no control labelled "${text}"`)
}

const byAria = (root: ParentNode, label: string) =>
  ([...root.querySelectorAll('[aria-label]')] as HTMLElement[]).filter((el) =>
    (el.getAttribute('aria-label') ?? '').startsWith(label),
  )

const byText = (root: ParentNode, selector: string, text: string) =>
  ([...root.querySelectorAll(selector)] as HTMLElement[]).find((el) =>
    (el.textContent ?? '').trim().includes(text),
  )

// --------------------------------------------------------------- the mount

interface Mounted {
  container: HTMLElement
  root: Root
  errors: unknown[]
  /** The tree is gone — which in a browser is the white page. */
  blank: () => boolean
}

function mount(node: React.ReactElement): Mounted {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const errors: unknown[] = []

  const root = createRoot(container, {
    onUncaughtError: (error) => errors.push(error),
    onCaughtError: (error) => errors.push(error),
  })

  act(() => {
    root.render(
      <StrictMode>
        <I18nProvider extra={{ en: ownerEn, ar: ownerAr }}>
          <AppStoreProvider>{node}</AppStoreProvider>
        </I18nProvider>
      </StrictMode>,
    )
  })

  return {
    container,
    root,
    errors,
    blank: () => (container.textContent ?? '').trim() === '',
  }
}

/** What the last bare form handed to `onSave`, so the payload itself is checked. */
let lastSaved: Campaign | null = null

/** The form on its own, as each caller passes it. */
const bareForm = (providers?: Provider[]) => () =>
  mount(
    <CampaignForm
      campaign={null}
      providerId={providers ? '' : 'p1'}
      providers={providers}
      onClose={() => {}}
      onSave={(campaign) => {
        lastSaved = campaign
      }}
    />,
  )

/*
 * The form the way an owner actually reaches it: inside the dashboard, opened
 * by the button, with the whole portal above it to take down.
 *
 * Worth the extra mount rather than trusting the bare one. The blank page this
 * harness is named after was not a defect in the screen that threw — it was a
 * throw with nothing above it to catch, and the bare mount above cannot tell
 * the difference between a form that survives and a form that is the only
 * thing on the page.
 */
const dashboardForm = () => () => {
  const ui = mount(<DashboardPage />)
  const open = byText(ui.container, 'button', 'إضافة رحلة')
  if (!open) throw new Error('the dashboard has no "add a trip" button')
  click(open)
  return ui
}

// --------------------------------------------------------------- the suite

const TITLE = 'رحلة العمرة إلى مكة المكرمة'
const DESCRIPTION =
  'رحلة عمرة متكاملة تشمل السكن والنقل والخدمات المختلفة طوال فترة الرحلة.\n' +
  'تشمل الرحلة زيارة المدينة المنورة ومرشدًا دينيًا طوال الرحلة.'
const EXTRAS = ['زيارة المدينة المنورة', 'مرشد نسائي', 'حقيبة للمعتمر', 'ماء زمزم', 'تأمين صحي']

function suite(name: string, open: () => Mounted, { checksPayload = false } = {}) {
  console.log(`\n--- ${name} ${'-'.repeat(Math.max(3, 56 - name.length))}\n`)
  const ui = open()
  const { container } = ui
  if (ui.blank() || ui.errors.length) {
    check('the form opens at all', false, ui.errors.map(describe).join('; ') || 'blank page')
    return
  }

  // ------------------------------------------------ 1 & 3. the Arabic title
  const title = byLabel(container, 'عنوان الرحلة') as HTMLInputElement
  act(() => title.focus())
  let lostAt = 0
  for (let i = 0; i < TITLE.length; i += 1) {
    keystroke(title, TITLE.slice(0, i + 1))
    if (document.activeElement !== title && !lostAt) lostAt = i + 1
  }
  check(
    `the Arabic title keeps focus across all ${TITLE.length} characters`,
    lostAt === 0,
    lostAt ? `focus left the field after character ${lostAt}` : '',
  )
  check('and the title holds everything that was typed', title.value === TITLE, title.value)

  // The labels ask for a title and a description, not for a language. The
  // form stopped asking for English, so "(in Arabic)" stopped distinguishing
  // anything — and it is easier to reinstate by accident than to notice.
  const labelText = [...container.querySelectorAll('label')]
    .map((l) => (l.textContent ?? '').trim())
    .filter((x) => x.startsWith('عنوان الرحلة') || x.startsWith('الوصف'))
  check(
    'neither Arabic label says "(بالعربية)"',
    labelText.length === 2 && !labelText.some((x) => x.includes('بالعربية')),
    labelText.join(' | '),
  )

  // ------------------------------------------ 2 & 3. the Arabic description
  const desc = byLabel(container, 'الوصف') as HTMLTextAreaElement
  act(() => desc.focus())
  let descLostAt = 0
  for (let i = 0; i < DESCRIPTION.length; i += 1) {
    keystroke(desc, DESCRIPTION.slice(0, i + 1))
    if (document.activeElement !== desc && !descLostAt) descLostAt = i + 1
  }
  check(
    'the multi-line Arabic description keeps focus throughout',
    descLostAt === 0,
    descLostAt ? `focus left the field after character ${descLostAt}` : '',
  )
  check(
    'and the description holds both of its lines',
    desc.value === DESCRIPTION,
    `${desc.value.split('\n').length} line(s)`,
  )

  // ------------------------- 4. no predefined services, and no "not included"
  check(
    'the form offers no predefined service tick-boxes',
    container.querySelectorAll('input[type=checkbox]').length === 0,
    `${container.querySelectorAll('input[type=checkbox]').length} checkbox(es)`,
  )
  check(
    'nor the old add/move service row buttons',
    !byText(container, 'button', 'إضافة خدمة') && byAria(container, 'تحريك لأعلى').length === 0,
  )
  check(
    '"غير شامل في السعر" is gone from the form',
    !(container.textContent ?? '').includes('غير شامل'),
  )

  // --------------------------------- 5. included services is one text area
  const included = byLabel(container, 'الخدمات المشمولة')
  check('included services is a multi-line textarea', included.tagName === 'TEXTAREA', included.tagName)
  check(
    'with a placeholder saying what to write',
    (included.getAttribute('placeholder') ?? '').startsWith('اكتب الخدمات المشمولة'),
    included.getAttribute('placeholder') ?? '',
  )
  const INCLUDED = EXTRAS.join('\n')
  act(() => included.focus())
  let includedLost = 0
  for (let i = 0; i < INCLUDED.length; i += 1) {
    keystroke(included as HTMLTextAreaElement, INCLUDED.slice(0, i + 1))
    if (document.activeElement !== included && !includedLost) includedLost = i + 1
  }
  check(
    'the included services can be typed continuously, line after line',
    includedLost === 0,
    includedLost ? `focus left the field after character ${includedLost}` : '',
  )
  check(
    'and hold every line',
    (included as HTMLTextAreaElement).value === INCLUDED,
    `${(included as HTMLTextAreaElement).value.split('\n').length} line(s)`,
  )

  // -------------------------------- 6. departure location, and office number
  const departure = byLabel(container, 'مكان الانطلاق')
  check('departure location is a textarea', departure.tagName === 'TEXTAREA', departure.tagName)
  check(
    'and is marked required',
    departure.getAttribute('aria-required') === 'true' ||
      (departure.closest('div')?.parentElement?.textContent ?? '').includes('*') ||
      [...container.querySelectorAll('label')].some(
        (l) => (l.textContent ?? '').startsWith('مكان الانطلاق') && (l.textContent ?? '').includes('*'),
      ),
  )
  const office = byLabel(container, 'رقم المكتب')
  check(
    'office number is a plain text input, not a number field',
    office.tagName === 'INPUT' && (office as HTMLInputElement).type === 'text',
    `${office.tagName} type=${(office as HTMLInputElement).type}`,
  )
  check(
    'and is labelled as optional',
    [...container.querySelectorAll('label')].some((l) => (l.textContent ?? '').trim().startsWith('رقم المكتب (إن وجد)')),
  )

  // ---------------------------------------- 9. the responsible-person list
  const addContact = byText(container, 'button', 'إضافة مسؤول آخر')!
  for (let i = 0; i < 3; i += 1) click(addContact)
  const names = () =>
    ([...container.querySelectorAll('label')] as HTMLLabelElement[])
      .filter((l) => (l.textContent ?? '').startsWith('اسم المسؤول'))
      .map((l) => container.querySelector(`[id="${l.getAttribute('for')}"]`) as HTMLInputElement)
  check(
    'three responsible people can be added',
    !ui.errors.length && !ui.blank() && names().length === 3,
    ui.errors.length ? ui.errors.map(describe).join('; ') : `${names().length}`,
  )

  const NAME = 'سالم بن ناصر'
  const first = names()[0]
  act(() => first.focus())
  let contactLost = 0
  for (let c = 0; c < NAME.length; c += 1) {
    keystroke(first, NAME.slice(0, c + 1))
    if (document.activeElement !== names()[0] && !contactLost) contactLost = c + 1
  }
  check(
    "a responsible person's name can be typed continuously",
    contactLost === 0,
    contactLost ? `focus lost after character ${contactLost}` : '',
  )
  check(
    'and typing into one person does not disturb the others',
    names()[0].value === NAME && names().slice(1).every((el) => el.value === ''),
  )

  // ------------------------------------------- 10. what a save will accept
  keystroke(byLabel(container, 'عنوان الرحلة') as HTMLInputElement, TITLE)
  keystroke(byLabel(container, 'تاريخ المغادرة') as HTMLInputElement, '2031-01-10')
  keystroke(byLabel(container, 'تاريخ العودة') as HTMLInputElement, '2031-01-20')
  const submitForm = () =>
    act(() => {
      container.querySelector('form')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    })
  const DEPARTURE_REQUIRED = ownerAr['prov.errDepartureLocation']

  lastSaved = null
  keystroke(departure as HTMLTextAreaElement, '')
  submitForm()
  check(
    'an empty departure location is refused with its own message',
    lastSaved === null && (container.textContent ?? '').includes(DEPARTURE_REQUIRED),
  )
  lastSaved = null
  keystroke(departure as HTMLTextAreaElement, '   \n\t  ')
  submitForm()
  check(
    'a whitespace-only departure location is refused too',
    lastSaved === null && (container.textContent ?? '').includes(DEPARTURE_REQUIRED),
  )

  const PLACE = 'مواقف جامع السلطان قابوس الأكبر – البوابة الجنوبية، مسقط'
  keystroke(departure as HTMLTextAreaElement, `  ${PLACE}\nبجانب المدخل  `)
  keystroke(office as HTMLInputElement, '')
  submitForm()
  if (checksPayload) {
    const saved = lastSaved as Campaign | null
    check('a real departure location lets the trip save', saved !== null, ui.errors.map(describe).join('; '))
    check(
      'saved trimmed, with its line break kept',
      saved?.departureLocation === `${PLACE}\nبجانب المدخل`,
      JSON.stringify(saved?.departureLocation),
    )
    check('the office number is optional — saved as empty', saved?.officeNumber === '', JSON.stringify(saved?.officeNumber))
    check(
      'the included services are saved one per line, as typed',
      JSON.stringify(saved?.includedServices) === JSON.stringify(EXTRAS),
      JSON.stringify(saved?.includedServices),
    )
    check('a new trip carries no predefined service keys', JSON.stringify(saved?.services) === '[]')
    check(
      'and nothing "not included" is sent',
      saved !== null && !('excludedServices' in (saved as object)),
    )

    lastSaved = null
    keystroke(office as HTMLInputElement, '  مكتب 5 - الدور الثاني ')
    submitForm()
    check(
      'an office number with letters and symbols is accepted, trimmed',
      (lastSaved as Campaign | null)?.officeNumber === 'مكتب 5 - الدور الثاني',
      JSON.stringify((lastSaved as Campaign | null)?.officeNumber),
    )
    lastSaved = null
    keystroke(office as HTMLInputElement, 'Office 204')
    submitForm()
    check('…and so is "Office 204"', (lastSaved as Campaign | null)?.officeNumber === 'Office 204')
  } else {
    check(
      'a real departure location clears its error',
      !(container.textContent ?? '').includes(DEPARTURE_REQUIRED),
    )
  }

  // -------------------------------------------------- 11. nothing escaped
  check(
    'no uncaught runtime error reached the root',
    ui.errors.length === 0,
    ui.errors.map(describe).join('; '),
  )
  check('and the form is still on the page', !ui.blank())

  act(() => ui.root.unmount())
  container.remove()
}

const PROVIDERS = [
  {
    id: 'p1',
    name: { ar: 'شركة النور للحج والعمرة', en: 'Al Noor Hajj & Umrah' },
    description: { ar: '', en: '' },
    logo: '',
    wilayahId: 'muscat',
    phone: '+96890000000',
    email: 'owner@example.com',
    licenceNumber: 'L-1',
    verified: true,
    rating: 0,
    reviewCount: 0,
    campaignCount: 0,
    joinedAt: '2026-01-01',
  },
] as unknown as Provider[]

suite('Owner — Add Trip, on its own', bareForm(), { checksPayload: true })
suite('Owner — Add Trip, opened from the dashboard', dashboardForm())
suite('Administration — Add Trip', bareForm(PROVIDERS))

/*
 * ------------------------------------------------- the one-time code field
 *
 * The field promised six digits while the project issued eight. A pilgrim
 * received a code they could not finish typing and was told it was wrong —
 * which it was not — and every layer agreed with the mistake: six boxes, a
 * validator that refused anything but six, and copy in both languages
 * promising six.
 *
 * So what is asserted here is the *agreement* between the constant, the boxes,
 * the token handed to `verifyOtp`, and the words on the screen. Any one of
 * them drifting is the bug again, and a check that only counted boxes would
 * not have caught the version that shipped.
 */
console.log(`\n--- The one-time code field ${'-'.repeat(29)}\n`)
{
  const CODE = '13572468'.slice(0, EMAIL_CODE_LENGTH)

  let value = ''
  let completed: string[] = []
  const Harness = ({ length }: { length: number }) => {
    const [code, setCode] = useState('')
    value = code
    return (
      <CodeInput
        length={length}
        label="رمز التحقق"
        value={code}
        onChange={setCode}
        onComplete={(full) => completed.push(full)}
      />
    )
  }

  const ui = mount(<Harness length={EMAIL_CODE_LENGTH} />)
  const boxes = () =>
    [...ui.container.querySelectorAll('input')] as HTMLInputElement[]

  // 1. As many boxes as the project issues digits.
  check(
    `an emailed code of ${EMAIL_CODE_LENGTH} digits gets ${EMAIL_CODE_LENGTH} boxes`,
    boxes().length === EMAIL_CODE_LENGTH,
    `${boxes().length} box(es)`,
  )

  // 2. Typed straight through, one box to the next, without touching the mouse.
  let advanced = true
  for (let i = 0; i < CODE.length; i += 1) {
    keystroke(boxes()[i], CODE[i])
    // Focus should already be on the *next* box, which is what "typing
    // continuously" means; the last digit has nowhere to go.
    const expected = Math.min(i + 1, EMAIL_CODE_LENGTH - 1)
    if (document.activeElement !== boxes()[expected]) advanced = false
  }
  check('every digit can be typed continuously across the boxes', advanced)
  check('and the boxes hold the code that was typed', value === CODE, value)

  // 7. The token that would reach `verifyOtp`, unchanged and complete.
  check(
    'the full token is handed on exactly as typed',
    completed.length === 1 && completed[0] === CODE,
    completed.join(','),
  )

  // 5. Backspace in an empty box steps back and clears.
  act(() => boxes()[EMAIL_CODE_LENGTH - 1].focus())
  keystroke(boxes()[EMAIL_CODE_LENGTH - 1], '')
  press(boxes()[EMAIL_CODE_LENGTH - 1], 'Backspace')
  check(
    'backspace in an empty box clears the one before it and moves there',
    value === CODE.slice(0, EMAIL_CODE_LENGTH - 2) &&
      document.activeElement === boxes()[EMAIL_CODE_LENGTH - 2],
    value,
  )

  // 6. Letters and punctuation never land.
  const before = value
  keystroke(boxes()[EMAIL_CODE_LENGTH - 2], 'a')
  keystroke(boxes()[EMAIL_CODE_LENGTH - 2], '-')
  check('a non-numeric key puts nothing in the box', value === before, value)

  // 4. A short code neither completes nor submits.
  completed = []
  act(() => ui.root.unmount())
  ui.container.remove()

  const partial = mount(<Harness length={EMAIL_CODE_LENGTH} />)
  const partialBoxes = () => [...partial.container.querySelectorAll('input')] as HTMLInputElement[]
  const SIX = '123456'
  for (let i = 0; i < SIX.length; i += 1) keystroke(partialBoxes()[i], SIX[i])
  check(
    `six digits do not complete a ${EMAIL_CODE_LENGTH}-digit code`,
    completed.length === 0 && value === SIX,
    `value=${value} completions=${completed.length}`,
  )

  // 3. Pasting the whole thing, from anywhere in the row.
  completed = []
  act(() => partial.root.unmount())
  partial.container.remove()

  const pasted = mount(<Harness length={EMAIL_CODE_LENGTH} />)
  const pastedBoxes = () => [...pasted.container.querySelectorAll('input')] as HTMLInputElement[]
  paste(pastedBoxes()[0], `Your NASEK code is ${CODE}`)
  check(
    'pasting the whole code fills every box and completes',
    value === CODE && completed.length === 1 && completed[0] === CODE,
    `value=${value} completions=${completed.length}`,
  )

  act(() => pasted.root.unmount())
  pasted.container.remove()

  /*
   * And the other code, which is a different length and must stay one.
   *
   * An authenticator's code is six digits by RFC 6238. The tempting fix for
   * the eight-digit bug was to change the shared constant, which would have
   * broken administrator two-factor sign-in and the enrolment screen with it —
   * so the two lengths are asserted apart.
   */
  completed = []
  const totp = mount(<Harness length={TOTP_CODE_LENGTH} />)
  check(
    'an authenticator code still gets exactly six boxes',
    totp.container.querySelectorAll('input').length === 6 && TOTP_CODE_LENGTH === 6,
    `${totp.container.querySelectorAll('input').length} box(es)`,
  )
  act(() => totp.root.unmount())
  totp.container.remove()

  check('no uncaught error came out of the code field', ui.errors.length === 0)
}

/*
 * ------------------------------------------------ what the screen promises
 *
 * The copy is part of the bug, not decoration. "أرسلنا رمزًا من ستة أرقام"
 * told the pilgrim the eight-digit code in their inbox was the wrong code, and
 * they believed the screen, because why would they not.
 *
 * These read the rendered screen rather than the dictionaries, so a string
 * reintroduced through a different key is still caught, and they assert the
 * absence of a *number* rather than of one particular sentence — wording that
 * says "six" is wrong today and wording that says "eight" is wrong the next
 * time the setting moves.
 */
console.log(`\n--- What the sign-in screen promises ${'-'.repeat(20)}\n`)
for (const [language, dict, forbidden] of [
  ['Arabic', ar, ['ستة أرقام', 'ثمانية أرقام', 'الأرقام الستة']],
  ['English', en, ['6-digit', '8-digit', 'six digits', 'eight digits', 'six-digit']],
] as const) {
  const claims = (['auth.emailHint', 'auth.codeSentEmail', 'auth.codeSentPhone', 'auth.errCodeFormat'] as const)
    .map((key) => [key, (dict as Record<string, string>)[key]] as const)
    .filter(([, text]) => forbidden.some((phrase) => text.includes(phrase)))

  check(
    `the ${language} sign-in copy names no number of digits`,
    claims.length === 0,
    claims.map(([key, text]) => `${key}: ${text}`).join(' | '),
  )
}

/*
 * The rest of the run is asynchronous, so it lives in a function.
 *
 * Sending a code is an `await`, and this harness is built for a browser
 * target that has no top-level await — so the remaining checks and the
 * summary are wrapped rather than left at module scope.
 */
async function rest() {
  /*
   * ----------------------------------------- the whole screen, end to end
   *
   * The two checks above are about a component and a dictionary. This is the
   * thing the pilgrim actually met: type an address, press send, and count the
   * boxes that appear. It is the only check here that would have failed on the
   * build that shipped.
   *
   * The absence of the magic-link panel is asserted alongside it. That panel —
   * "وصلَك رابط بدل الرمز؟", a collapsible box holding a textarea for a pasted
   * sign-in URL — used to sit under the Verify button, and the customer screen
   * now offers one road in and no fork: an address, then a code. What was
   * removed is the offer, not the mechanism; a link that is *clicked* still
   * lands on the site and is still completed by `completeAuthRedirect`, which
   * `verify:redirect` drives over two dozen URL shapes.
   */
  console.log(`\n--- The sign-in screen, end to end ${'-'.repeat(22)}\n`)
  {
    const ui = mount(<OtpFlow channels={['email']} onSuccess={() => {}} />)
    const email = ui.container.querySelector('input[type=email]') as HTMLInputElement | null
    check('the screen opens asking for an address', !!email)

    if (email) {
      keystroke(email, 'zahra@nasek.om')
      const send = byText(ui.container, 'button', ar['auth.sendCode'])
      check('and offers to send the code', !!send)
      if (send) click(send)
      await settle()
    }

    const boxes = ui.container.querySelectorAll('input[inputmode=numeric]')
    check(
      `after sending, the customer gets ${EMAIL_CODE_LENGTH} boxes to type into`,
      boxes.length === EMAIL_CODE_LENGTH,
      `${boxes.length} box(es)`,
    )

    const text = ui.container.textContent ?? ''
    check(
      'the screen never tells the pilgrim how many digits to expect',
      !/ستة أرقام|الأرقام الستة|ثمانية أرقام/.test(text),
      text.slice(0, 120),
    )

    /*
     * And nothing else is on offer.
     *
     * Read off the rendered screen rather than off the dictionary, because the
     * question is what the pilgrim is shown. The panel was a `<textarea>` — the
     * only one this screen ever had — behind a disclosure button, so both the
     * control and the wording are checked, and the wording is matched on the
     * word "رابط" rather than on the old sentence, so reintroducing it under a
     * different key would still fail.
     */
    check(
      'the screen offers no box to paste a sign-in link into',
      ui.container.querySelectorAll('textarea').length === 0,
    )
    check(
      'and no disclosure that would reveal one',
      ui.container.querySelectorAll('[aria-expanded]').length === 0,
    )
    check(
      'the screen never mentions a link as an alternative to the code',
      !/رابط|link/i.test(ui.container.textContent ?? ''),
      (ui.container.textContent ?? '').slice(0, 160),
    )

    /*
     * What is still there: the two controls that were explicitly kept.
     */
    check('resending a code is still offered', !!byText(ui.container, 'button', ar['auth.resend']))
    check(
      'and so is using a different address',
      !!byText(ui.container, 'button', ar['auth.changeTarget']),
    )

    check('drawing the whole flow raised nothing', ui.errors.length === 0, ui.errors.map(describe).join('; '))
    act(() => ui.root.unmount())
    ui.container.remove()
  }

  /*
   * -------------------------------------------------- the wall around a crash
   *
   * The boundary is the answer to "why was it a *white page* rather than a
   * broken form", and it is only worth having if it does two things at once:
   * contain the failure, and refuse to hide it. Both are asserted, because a
   * boundary that quietly swallowed the error would make every other check in
   * this file pass on a broken build.
   */
  console.log(`\n--- A crash inside a boundary ${'-'.repeat(27)}\n`)
  {
    const Explodes = () => {
      throw new Error('deliberate: a campaign form that throws')
    }
    const ui = mount(
      <div>
        <p>الرحلات</p>
        <ErrorBoundary where="a deliberate test">
          <Explodes />
        </ErrorBoundary>
      </div>,
    )
    const text = ui.container.textContent ?? ''
    check('the page around the failure is still there', text.includes('الرحلات'))
    check('the boundary says something in the reader’s language', text.includes('توقف هذا الجزء'))
    check(
      'and shows the error rather than swallowing it',
      text.includes('deliberate: a campaign form that throws'),
      text.slice(0, 120),
    )
    check('React was told it was caught', ui.errors.length > 0)
    act(() => ui.root.unmount())
    ui.container.remove()
  }

  /*
   * ------------------------------------------- two inboxes, one person
   *
   * A campaign owner opened the customer site and found "تم اعتماد حملتك" in
   * their pilgrim dashboard. Nothing had leaked — the rows were addressed to
   * their own profile by `set_campaign_status`, and `notifications_own` has
   * always been `user_id = auth.uid()`. What was missing was any notion of
   * *which* of their two inboxes a row belonged to.
   *
   * So the store here holds exactly what such a person's store holds: one row
   * of each audience, both theirs. Each screen must show its own and only its
   * own. Seeding the store rather than the network is deliberate — it is the
   * harder case, and the one `.eq('audience', …)` in `loadSnapshot` cannot
   * cover on its own.
   */
  console.log(`\n--- Two inboxes, one person ${'-'.repeat(29)}\n`)
  {
    const PERSON: User = {
      id: 'own-1',
      name: 'الزهراء',
      nameIsPlaceholder: false,
      email: 'owner@example.om',
      phone: '',
      role: 'provider',
      wilayahId: 'muscat',
      avatarColor: '#1c5e4c',
      providerId: 'p1',
      createdAt: '2026-01-01',
      suspended: false,
      removed: false,
    } as User

    const row = (audience: NotificationAudience, titleAr: string): Notification => ({
      id: `n-${audience}`,
      userId: PERSON.id,
      title: { ar: titleAr, en: titleAr },
      body: { ar: '', en: '' },
      date: '2026-09-08',
      read: false,
      kind: 'system',
      audience,
    })

    const OWNER_TITLE = 'تم اعتماد حملتك'
    const CUSTOMER_TITLE = 'تم تأكيد حجزك'

    /*
     * The store's dispatch, lifted out so seeding can happen *after* the mount.
     *
     * Not from an effect inside the tree, which is the obvious way and is
     * wrong: a child's effects run before its parent's, so `AppStoreProvider`
     * hydrates from storage after the child has dispatched and replaces
     * everything the child just put there. Seeding from outside, once the mount
     * has settled, puts the rows in after hydration rather than before it.
     */
    let dispatch: ((action: { type: string; [k: string]: unknown }) => void) | null = null
    function Seed({ children }: { children: ReactNode }) {
      const store = useStore()
      dispatch = store.dispatch as typeof dispatch
      return <>{children}</>
    }

    /*
     * `hydrateRemote` rather than `pushNotification`, because it *sets* the
     * slice instead of prepending to it.
     *
     * StrictMode double-invokes a reducer, which is harmless for a pure one
     * and not harmless for a harness that counts what came out: prepending
     * twice produced two rows with the same React key and a duplicate-key
     * warning, which this file treats as a failure. Setting is idempotent, and
     * it is also the path production uses — the snapshot loader.
     */
    const seed = async (rows: Notification[]) => {
      await settle(2)
      act(() => {
        dispatch?.({ type: 'signIn', user: PERSON })
        dispatch?.({
          type: 'hydrateRemote',
          snapshot: {
            providers: [],
            campaigns: [],
            bookings: [],
            reviews: [],
            notifications: rows,
            savedIds: [],
            profiles: [],
          },
        })
      })
      await settle(2)
    }

    // ------------------------------------------- the customer dashboard
    const customer = mount(
      <MemoryRouter initialEntries={['/dashboard?tab=notifications']}>
        <Seed>
          <CustomerDashboardPage />
        </Seed>
      </MemoryRouter>,
    )
    await seed([row('owner', OWNER_TITLE), row('customer', CUSTOMER_TITLE)])
    const customerText = customer.container.textContent ?? ''
    check(
      'the Customer Dashboard does not show the campaign approval',
      !customerText.includes(OWNER_TITLE),
      customerText.includes(OWNER_TITLE) ? 'the owner notification is on the pilgrim screen' : '',
    )
    check(
      'and does show the booking confirmation, which is the pilgrim’s',
      customerText.includes(CUSTOMER_TITLE),
    )
    check('nothing threw drawing it', customer.errors.length === 0, customer.errors.map(describe).join('; '))
    act(() => customer.root.unmount())
    customer.container.remove()

    // ------------------------------------------------ the owner portal
    const owner = mount(
      <Seed>
        <NotificationsPanel />
      </Seed>,
    )
    await seed([row('owner', OWNER_TITLE), row('customer', CUSTOMER_TITLE)])
    const ownerText = owner.container.textContent ?? ''
    check(
      'the Owner Portal does show the campaign approval',
      ownerText.includes(OWNER_TITLE),
      ownerText.slice(0, 100),
    )
    check(
      'and does not show the pilgrim’s booking confirmation',
      !ownerText.includes(CUSTOMER_TITLE),
    )
    check('nothing threw drawing it', owner.errors.length === 0, owner.errors.map(describe).join('; '))
    act(() => owner.root.unmount())
    owner.container.remove()

    /*
     * And a row belonging to somebody else, which the portal must drop even
     * though the store handed it over. RLS would never return one; this is the
     * offline path, where there is no RLS to rely on.
     */
    const OTHER = 'تم اعتماد حملة شركة أخرى'
    const foreign = mount(
      <Seed>
        <NotificationsPanel />
      </Seed>,
    )
    await seed([{ ...row('owner', OTHER), id: 'n-other', userId: 'own-2' }])
    check(
      'owner A is not shown a notification addressed to owner B',
      !(foreign.container.textContent ?? '').includes(OTHER),
    )
    act(() => foreign.root.unmount())
    foreign.container.remove()
  }

  /*
   * ------------------------------- every section of the owner portal, with data
   *
   * `verify:render` draws this dashboard, and drew it perfectly while "رحلاتي"
   * was an error page in production. Two things hid the defect, and both are
   * the reason this block seeds a store rather than mounting an empty one:
   *
   *   * the store is empty there, so the trips tab rendered its empty state and
   *     never reached the row that threw; and
   *   * the tab is read off `?tab=`, which is `overview` for every render that
   *     does not set it.
   *
   * What threw was a react-router `<Link>` — the "public page" control on an
   * approved trip. The portal mounts no `Router`, deliberately, so every router
   * hook and every router component throws the moment it is drawn here:
   *
   *     Cannot destructure property 'basename' of React.useContext(...) as it is null
   *
   * So this walks all seven sections with a company, four trips in four
   * different states, bookings, reviews and notifications in the store, and
   * fails on anything that throws or comes back blank. The store is seeded from
   * outside the tree and after the mount, for the ordering reason documented
   * above the other `Seed` in this file.
   */
  console.log(`\n--- Every section of the owner portal ${'-'.repeat(19)}\n`)
  {
    const COMPANY: Provider = {
      id: 'p1',
      name: { ar: 'حملة الجابري', en: 'Al Jabri Campaign' },
      tagline: { ar: 'رفقة مطمئنة', en: 'A calm road' },
      description: { ar: 'حملة عُمانية.', en: 'An Omani campaign.' },
      wilayahId: 'muscat',
      verification: 'verified',
      experienceYears: 10,
      rating: 4.7,
      reviewCount: 24,
      phone: '+96891234567',
      email: 'owner@example.om',
      initials: 'AJ',
      brandColor: '#1c5e4c',
      plan: 'plus',
      joinedAt: '2026-01-01',
    }

    const PORTAL_OWNER: User = {
      id: 'own-1',
      name: 'الزهراء',
      nameIsPlaceholder: false,
      email: 'owner@example.om',
      phone: '+96891234567',
      role: 'provider',
      wilayahId: 'muscat',
      avatarColor: '#1c5e4c',
      providerId: 'p1',
      createdAt: '2026-01-01',
      suspended: false,
      removed: false,
    }

    const trip = (id: string, over: Partial<Campaign> = {}): Campaign => ({
      id,
      providerId: 'p1',
      type: 'umrah',
      title: { ar: `رحلة ${id}`, en: `Trip ${id}` },
      description: { ar: 'وصف', en: 'Description' },
      price: 250,
      wilayahId: 'muscat',
      travelMethod: 'air',
      departureDate: '2026-11-01',
      returnDate: '2026-11-12',
      seatsTotal: 40,
      seatsAvailable: 5,
      services: ['hotel_makkah'],
      hotelMakkah: { ar: 'فندق', en: 'Hotel' },
      hotelMadinah: { ar: 'فندق', en: 'Hotel' },
      haramDistanceM: 400,
      rating: 4.5,
      reviewCount: 3,
      featured: false,
      bookingsCount: 12,
      suspended: false,
      deleted: false,
      status: 'active',
      images: [],
      includedServices: [],
      departureLocation: '',
      officeNumber: '',
      contactPersons: [],
      terms: { ar: '', en: '' },
      ...over,
    })

    /*
     * One approved trip, one waiting, one refused and one taken down.
     *
     * The approved one is what draws the public link; the suspended one is what
     * proves the link is withheld when the page it points at is no longer on
     * the public site. Both were wrong at the same time.
     */
    const TRIPS = [
      trip('c1'),
      trip('c2', { status: 'pending_approval', seatsAvailable: 30 }),
      trip('c3', { status: 'rejected', rejectionReason: 'السعر غير واضح' }),
      trip('c4', { suspended: true }),
    ]

    const PORTAL_BOOKINGS: Booking[] = [
      {
        id: 'b1',
        reference: 'NSK-B1',
        userId: 'cust-1',
        campaignId: 'c1',
        travellers: [],
        travellersCount: 2,
        contactName: 'سالم',
        contactPhone: '+96890000001',
        contactEmail: 'salem@example.om',
        totalPrice: 500,
        status: 'confirmed',
        bookingDate: '2026-09-01',
        notes: 'muscat',
      },
    ]

    const PORTAL_REVIEWS: Review[] = [
      {
        id: 'r1',
        userId: 'cust-1',
        userName: 'سالم',
        campaignId: 'c1',
        providerId: 'p1',
        rating: 5,
        comment: { ar: 'ممتاز', en: 'Excellent' },
        date: '2026-09-02',
        reply: { ar: '', en: '' },
        hidden: false,
      },
    ]

    const PORTAL_NOTICES: Notification[] = [
      {
        id: 'n1',
        userId: 'own-1',
        title: { ar: 'تم اعتماد حملتك', en: 'Your trip was approved' },
        body: { ar: '', en: '' },
        date: '2026-09-05',
        read: false,
        kind: 'system',
        audience: 'owner',
      },
    ]

    let portalDispatch: ((action: { type: string; [k: string]: unknown }) => void) | null = null
    function PortalSeed({ children }: { children: ReactNode }) {
      const store = useStore()
      portalDispatch = store.dispatch as typeof portalDispatch
      return <>{children}</>
    }

    const TABS = [
      'overview',
      'campaigns',
      'customers',
      'reviews',
      'analytics',
      'profile',
      'notifications',
    ]

    for (const tab of TABS) {
      window.history.replaceState({}, '', `/?tab=${tab}`)
      const ui = mount(
        <PortalSeed>
          <DashboardPage />
        </PortalSeed>,
      )
      await settle(2)
      act(() => {
        portalDispatch?.({ type: 'signIn', user: PORTAL_OWNER })
        portalDispatch?.({
          type: 'hydrateRemote',
          snapshot: {
            providers: [COMPANY],
            campaigns: TRIPS,
            bookings: PORTAL_BOOKINGS,
            reviews: PORTAL_REVIEWS,
            notifications: PORTAL_NOTICES,
            savedIds: [],
            profiles: [PORTAL_OWNER],
          },
        })
      })
      await settle(2)

      check(
        `"?tab=${tab}" draws for an owner who has trips`,
        ui.errors.length === 0 && !ui.blank(),
        ui.errors.map(describe).join('; ') || (ui.blank() ? 'blank page' : ''),
      )

      /*
       * And the public link is an *anchor to another origin*, not a route.
       *
       * The public page belongs to the customer site, which is a different
       * application on a different host: a router link there is both a crash
       * and, in the administration where there is a router, an address that
       * matches the catch-all and silently returns to the overview. Asserted on
       * the rendered attribute rather than on the component, so reinstating a
       * `<Link>` under any name still fails.
       */
      if (tab === 'campaigns' && !ui.blank()) {
        const hrefs = ([...ui.container.querySelectorAll('a[href]')] as HTMLAnchorElement[])
          .map((a) => a.getAttribute('href') ?? '')
          .filter((href) => href.includes('/campaigns/'))
        check(
          'every public-page link leaves this application entirely',
          hrefs.every((href) => /^https?:\/\//.test(href)),
          hrefs.join(' | ') || 'none drawn',
        )
        check(
          'and no trip a pilgrim cannot open is offered one',
          !hrefs.some((href) => /c2|c3|c4/.test(href)),
          hrefs.join(' | '),
        )
      }

      act(() => ui.root.unmount())
      ui.container.remove()
    }
    window.history.replaceState({}, '', '/')

    /*
     * And the address itself, asserted on the pure function.
     *
     * The rendered check above cannot carry this on its own: the harnesses
     * build with `--mode harness`, which blanks `VITE_SITE_URL` deliberately —
     * `verify:redirect` depends on it being blank — so no link is drawn here at
     * all and "every link is absolute" is vacuously true. What has to hold is
     * the shape of the URL, and that is a pure function of the configured base.
     */
    const built = customerRouteUrl('https://nasek.example', '/campaigns/abc')
    check(
      'a public campaign address is absolute and lands on the trip, not the home page',
      built === 'https://nasek.example/#/campaigns/abc',
      String(built),
    )
    check(
      'a trailing index.html is not carried into it',
      customerRouteUrl('https://nasek.example/index.html', '/campaigns/abc') ===
        'https://nasek.example/#/campaigns/abc',
      String(customerRouteUrl('https://nasek.example/index.html', '/campaigns/abc')),
    )
    check(
      'an unconfigured public site yields no link rather than a broken one',
      customerRouteUrl(undefined, '/campaigns/abc') === null &&
        customerRouteUrl('   ', '/campaigns/abc') === null,
    )
    check(
      'and a malformed one is refused rather than thrown',
      customerRouteUrl('not a url', '/campaigns/abc') === null,
    )
  }

  /*
   * ------------------------------------------ a trip page opened from cold
   *
   * The sequence a shared link and a page refresh both produce: the trip page
   * mounts while the catalogue is still in flight, and the snapshot lands a
   * moment later. A child's effects run before its parent's, so this is the
   * ordering every deep link into `/campaigns/:id` actually had.
   *
   * It resolved to "الصفحة غير موجودة" and stayed there. The lookup ran once,
   * keyed on the id alone with `exhaustive-deps` switched off, against an empty
   * catalogue — and the closure held that empty array for the life of the
   * request, so even a snapshot arriving mid-flight changed nothing. Navigating
   * in from the listing worked, because the catalogue was already there, which
   * is why nothing caught it.
   *
   * Seeded after the mount for exactly that reason: seeding first would
   * reproduce the case that always worked.
   */
  console.log(`\n--- A trip page opened from cold ${'-'.repeat(24)}\n`)
  {
    const TRIP: Campaign = {
      id: 'c1',
      providerId: 'p1',
      type: 'umrah',
      title: { ar: 'رحلة العمرة الفضية', en: 'The Silver Umrah' },
      description: { ar: 'وصف', en: 'Description' },
      price: 250,
      wilayahId: 'muscat',
      travelMethod: 'air',
      departureDate: '2026-12-01',
      returnDate: '2026-12-12',
      seatsTotal: 40,
      seatsAvailable: 12,
      services: ['hotel_makkah'],
      hotelMakkah: { ar: 'فندق', en: 'Hotel' },
      hotelMadinah: { ar: 'فندق', en: 'Hotel' },
      haramDistanceM: 400,
      rating: 4.5,
      reviewCount: 3,
      featured: false,
      bookingsCount: 12,
      suspended: false,
      deleted: false,
      status: 'active',
      images: [],
      includedServices: [],
      departureLocation: '',
      officeNumber: '',
      contactPersons: [],
      terms: { ar: '', en: '' },
    }

    let tripDispatch: ((action: { type: string; [k: string]: unknown }) => void) | null = null
    function TripSeed({ children }: { children: ReactNode }) {
      const store = useStore()
      tripDispatch = store.dispatch as typeof tripDispatch
      return <>{children}</>
    }

    const ui = mount(
      <MemoryRouter initialEntries={['/campaigns/c1']}>
        <TripSeed>
          <Routes>
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
          </Routes>
        </TripSeed>
      </MemoryRouter>,
    )

    // The catalogue arrives *after* the page has mounted and asked for the trip.
    await settle(2)
    act(() => {
      tripDispatch?.({
        type: 'hydrateRemote',
        snapshot: {
          providers: [],
          campaigns: [TRIP],
          bookings: [],
          reviews: [],
          notifications: [],
          savedIds: [],
          profiles: [],
        },
      })
    })

    /*
     * Long enough for the mock API's own latency. `services/api/client.ts`
     * sleeps 180-520ms on every call, deliberately, so the skeletons are
     * visible in a demo — a handful of short ticks would leave this asserting
     * against a skeleton rather than against the page.
     */
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 220))
      })
    }

    const text = ui.container.textContent ?? ''
    check(
      'a trip page opened cold shows the trip rather than "not found"',
      text.includes('رحلة العمرة الفضية'),
      text.replace(/\s+/g, ' ').slice(0, 140),
    )
    check(
      'and says nothing about a missing page',
      !text.includes(ar['state.notFoundTitle']),
    )
    check('nothing threw drawing it', ui.errors.length === 0, ui.errors.map(describe).join('; '))

    act(() => ui.root.unmount())
    ui.container.remove()

    /*
     * Included services, departure location and office number, as a pilgrim
     * reads them — for a trip written in the new form, one without an office
     * number, and one created before any of this existed.
     */
    console.log(`\n--- A trip page: what it includes, and where it leaves from ${'-'.repeat(2)}\n`)
    const openTrip = async (trip: Campaign) => {
      const page = mount(
        <MemoryRouter initialEntries={[`/campaigns/${trip.id}`]}>
          <TripSeed>
            <Routes>
              <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            </Routes>
          </TripSeed>
        </MemoryRouter>,
      )
      await settle(2)
      act(() => {
        tripDispatch?.({
          type: 'hydrateRemote',
          snapshot: { providers: [], campaigns: [trip], bookings: [], reviews: [], notifications: [], savedIds: [], profiles: [] },
        })
      })
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 220))
        })
      }
      return page
    }

    const PLACE = 'مواقف جامع السلطان قابوس الأكبر – البوابة الجنوبية، مسقط'
    const fresh = await openTrip({
      ...TRIP,
      id: 'c-new',
      services: [],
      includedServices: ['تأشيرة العمرة', 'سكن قريب من الحرم'],
      departureLocation: PLACE,
      officeNumber: 'مكتب 5 - الدور الثاني',
    })
    const freshText = fresh.container.textContent ?? ''
    check('the trip page shows the departure location', freshText.includes(ar['campaign.departureLocation']) && freshText.includes(PLACE))
    check('and the office number, because this trip has one', freshText.includes(ar['campaign.officeNumber']) && freshText.includes('مكتب 5 - الدور الثاني'))
    check('and the typed included services, each one', freshText.includes('تأشيرة العمرة') && freshText.includes('سكن قريب من الحرم'))
    check('and no "not included" heading', !freshText.includes('غير شامل'))
    check('nothing threw', fresh.errors.length === 0, fresh.errors.map(describe).join('; '))
    act(() => fresh.root.unmount())
    fresh.container.remove()

    const noOffice = await openTrip({ ...TRIP, id: 'c-no-office', departureLocation: PLACE, officeNumber: '   ' })
    const noOfficeText = noOffice.container.textContent ?? ''
    check('a trip with no office number shows its departure location', noOfficeText.includes(PLACE))
    check('but no office number row at all', !noOfficeText.includes(ar['campaign.officeNumber']))
    act(() => noOffice.root.unmount())
    noOffice.container.remove()

    // Exactly what an existing row maps to: keys, no typed text, no new columns.
    const legacy = await openTrip({
      ...TRIP,
      id: 'c-legacy',
      services: ['hotel_makkah', 'transport', 'visa'],
      includedServices: [],
      departureLocation: undefined as unknown as string,
      officeNumber: undefined as unknown as string,
    })
    const legacyText = legacy.container.textContent ?? ''
    check('an existing trip still opens', legacyText.includes('رحلة العمرة الفضية') && legacy.errors.length === 0, legacy.errors.map(describe).join('; '))
    check(
      'and still lists its old included services by name',
      legacyText.includes('سكن في مكة') && legacyText.includes('مواصلات داخلية') && legacyText.includes('إجراءات التأشيرة'),
    )
    check(
      'with no empty departure or office section',
      !legacyText.includes(ar['campaign.departureLocation']) && !legacyText.includes(ar['campaign.officeNumber']),
    )
    act(() => legacy.root.unmount())
    legacy.container.remove()
  }

  /*
   * React's own development warnings count as failures.
   *
   * "Each child in a list should have a unique key" and "Cannot update a
   * component while rendering a different one" are exactly the class of defect
   * this file exists for, and React prints them rather than throwing them. The
   * runner collects them; this is where they are allowed to fail the run.
   */
  const reactErrors = (globalThis as unknown as { __reactErrors?: string[] }).__reactErrors ?? []
  check('React printed no warnings of its own', reactErrors.length === 0, reactErrors.join(' | '))

  console.log(
    failures === 0
      ? '\nAll interaction checks passed.\n'
      : `\n${failures} interaction check(s) failed.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)

}

void rest()
