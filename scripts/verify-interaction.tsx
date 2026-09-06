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
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { ownerAr } from '@/i18n/ownerAr'
import { ownerEn } from '@/i18n/ownerEn'
import { AppStoreProvider, useStore } from '@/store/AppStore'
import { CampaignForm } from '@/components/campaign/CampaignForm'
import { DashboardPage } from '@/owner/DashboardPage'
import { DashboardPage as CustomerDashboardPage } from '@/pages/DashboardPage'
import { NotificationsPanel } from '@/owner/panels/NotificationsPanel'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CodeInput, TOTP_CODE_LENGTH } from '@/components/auth/CodeInput'
import { OtpFlow } from '@/components/auth/OtpFlow'
import { EMAIL_CODE_LENGTH } from '@/services/auth/otp'
import { ar } from '@/i18n/ar'
import { en } from '@/i18n/en'
import { SERVICE_KEYS } from '@/data/services'
import type { Notification, NotificationAudience, Provider, User } from '@/types'

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

/** The form on its own, as each caller passes it. */
const bareForm = (providers?: Provider[]) => () =>
  mount(
    <CampaignForm
      campaign={null}
      providerId={providers ? '' : 'p1'}
      providers={providers}
      onClose={() => {}}
      onSave={() => {}}
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

function suite(name: string, open: () => Mounted) {
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

  // ----------------------------------- 4. every canonical service, on and off
  const canonical = () =>
    [...container.querySelectorAll('fieldset')[0].querySelectorAll('input[type=checkbox]')]

  let crashedOn = ''
  let inert = ''
  for (let pass = 0; pass < 2 && !crashedOn && !inert; pass += 1) {
    for (const [i, key] of SERVICE_KEYS.entries()) {
      const boxes = canonical() as HTMLInputElement[]
      if (boxes.length !== SERVICE_KEYS.length) {
        crashedOn = `${key} (${boxes.length} of ${SERVICE_KEYS.length} boxes on screen)`
        break
      }
      const was = boxes[i].checked
      click(boxes[i])
      if (ui.errors.length || ui.blank()) {
        crashedOn = key
        break
      }
      // A click that changes nothing would make every other assertion here
      // vacuous, so the toggle is proved rather than assumed.
      const now = (canonical() as HTMLInputElement[])[i]?.checked
      if (now === was) {
        inert = `${key} stayed ${was ? 'ticked' : 'unticked'}`
        break
      }
    }
  }
  check(
    'every canonical included service toggles on and off without crashing',
    !crashedOn,
    crashedOn ? `died on ${crashedOn} — ${ui.errors.map(describe).join('; ')}` : '',
  )
  check('and each tick actually registers', !inert, inert)
  if (ui.blank()) {
    check('the form is still on screen after the canonical services', false, 'the tree is gone')
    return
  }

  // ------------------------------------------------- 5. five extra services
  const addService = byText(container, 'button', 'إضافة خدمة')!
  for (let i = 0; i < 5; i += 1) {
    click(addService)
    if (ui.errors.length || ui.blank()) break
  }
  const rows = () => byAria(container, 'خدمات أخرى مشمولة') as HTMLInputElement[]
  check(
    'five additional services can be added',
    !ui.errors.length && !ui.blank() && rows().length === 5,
    ui.errors.length
      ? ui.errors.map(describe).join('; ')
      : ui.blank()
        ? 'blank page'
        : `${rows().length} row(s)`,
  )
  if (ui.blank()) return

  // -------------------------------------- 6. edit each, without losing focus
  let rowLost = ''
  EXTRAS.forEach((text, i) => {
    const row = rows()[i]
    act(() => row.focus())
    for (let c = 0; c < text.length; c += 1) {
      keystroke(row, text.slice(0, c + 1))
      if (document.activeElement !== rows()[i] && !rowLost) rowLost = `row ${i + 1}, character ${c + 1}`
    }
  })
  check('each additional service can be typed into continuously', !rowLost, rowLost)
  check(
    'and each holds its own text',
    rows().every((row, i) => row.value === EXTRAS[i]),
    rows().map((r) => r.value).join(' | '),
  )

  // --------------------------------------------------- 7. remove the middle
  click(byAria(container, 'إزالة')[2])
  check(
    'removing a service from the middle removes exactly that one',
    !ui.errors.length &&
      rows().map((r) => r.value).join('|') ===
        [EXTRAS[0], EXTRAS[1], EXTRAS[3], EXTRAS[4]].join('|'),
    ui.errors.length ? ui.errors.map(describe).join('; ') : rows().map((r) => r.value).join(' | '),
  )

  // ------------------------------------------------------------ 8. reorder
  const before = rows().map((r) => r.value)
  click(byAria(container, 'تحريك لأعلى')[1])
  const after = rows().map((r) => r.value)
  check(
    'a service moves up a place and takes its text with it',
    !ui.errors.length && after.join('|') === [before[1], before[0], before[2], before[3]].join('|'),
    ui.errors.length ? ui.errors.map(describe).join('; ') : after.join(' | '),
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

suite('Owner — Add Trip, on its own', bareForm())
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
   * The magic link is asserted alongside it, because it is the other half of
   * this screen and had to survive the fix untouched. On a project whose email
   * templates are not editable the message carries a link and no code at all, so
   * for many deployments it is not a fallback — it is the way in. The redemption
   * itself belongs to `verify:redirect`, which drives `parseSignInLink` and
   * `verifyEmailLink` over two dozen URL shapes; what is checked here is that
   * the screen still offers it and still explains it.
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
     * The link copy is read off the dictionary rather than the screen, and that
     * is a limitation worth naming: both link affordances render only when
     * `isDemoOtp` is false, and this harness runs with no backend, which is
     * exactly the case that makes it true. So this proves the wording still
     * exists to be shown; `verify:redirect` proves the arrival still works.
     */
    for (const key of ['auth.orUseLink', 'auth.pasteLinkTitle', 'auth.pasteLinkBody'] as const) {
      check(`the emailed-link path still has its ${key} wording`, (ar[key] ?? '').length > 10)
    }

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
