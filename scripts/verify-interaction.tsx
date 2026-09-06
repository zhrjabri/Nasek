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
import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { I18nProvider } from '@/i18n'
import { ownerAr } from '@/i18n/ownerAr'
import { ownerEn } from '@/i18n/ownerEn'
import { AppStoreProvider } from '@/store/AppStore'
import { CampaignForm } from '@/components/campaign/CampaignForm'
import { DashboardPage } from '@/owner/DashboardPage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { SERVICE_KEYS } from '@/data/services'
import type { Provider } from '@/types'

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
