/*
 * A DOM for the interaction harness.
 *
 * Every other `verify:*` script runs straight under Node, because every other
 * one asks a question that needs no browser. `verify-interaction.tsx` asks two
 * that do — where is the focus, and did clicking that unmount the page — so it
 * needs a document before React is ever loaded.
 *
 * Hence the split: this file builds the window, publishes the handful of
 * globals React and the harness read off `globalThis`, and only then imports
 * the built bundle. Importing it statically would evaluate React against a
 * Node with no `document`, which is the one thing this file exists to prevent.
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html lang="ar" dir="rtl"><body></body></html>', {
  url: 'https://owner.nasek.om/',
  pretendToBeVisual: true,
})

// Arabic, because that is the language the portal opens in and the language
// the labels this harness looks for are written in. `initialLang()` reads this
// key before it falls back to the browser's own language, which under jsdom is
// en-US.
dom.window.localStorage.setItem('nasek.lang', 'ar')

globalThis.window = dom.window
globalThis.document = dom.window.document
// Node 21+ defines `navigator` as a getter-only global, so it has to be
// replaced rather than assigned.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
})
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.HTMLInputElement = dom.window.HTMLInputElement
globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement
globalThis.Event = dom.window.Event
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.KeyboardEvent = dom.window.KeyboardEvent
// jsdom's, not Node's own experimental pair — Node warns loudly when its
// versions are touched without `--localstorage-file`, and that warning would
// be read as a failure by the console hook below.
globalThis.localStorage = dom.window.localStorage
globalThis.sessionStorage = dom.window.sessionStorage
globalThis.Node = dom.window.Node
globalThis.getComputedStyle = dom.window.getComputedStyle
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

// jsdom has no layout, so it has no ResizeObserver. Recharts constructs one on
// mount and would take the dashboard down before the form is ever opened.
class NoLayoutResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoLayoutResizeObserver
dom.window.ResizeObserver = NoLayoutResizeObserver

// React 19 refuses to run `act` outside an environment that admits to being a
// test, and warns about every update made outside one.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/*
 * React's own development warnings, kept rather than merely printed.
 *
 * "Each child in a list should have a unique key" and "Cannot update a
 * component while rendering a different one" are exactly the class of defect
 * this harness is here to catch, and React prints them rather than throwing.
 * The harness reads this array back at the end and fails on anything in it —
 * setting `process.exitCode` from here would not do, because the harness ends
 * with an explicit `process.exit`, which discards it.
 */
const ignorable = [
  // jsdom has no layout engine; recharts and friends say so on every render.
  'ResizeObserver',
  // The harness throws one on purpose, to prove the error boundary contains it.
  'deliberate:',
]

globalThis.__reactErrors = []
const realError = console.error
console.error = (...args) => {
  const text = args.map(String).join(' ')
  realError(...args)
  if (!ignorable.some((allowed) => text.includes(allowed))) {
    // The first line only; a React warning carries a whole component stack.
    globalThis.__reactErrors.push(text.split('\n')[0].trim())
  }
}

await import('../.verify/verify-interaction.js')
