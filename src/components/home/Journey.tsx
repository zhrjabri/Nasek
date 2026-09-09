import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { cx } from '@/components/ui'

/**
 * The journey line, and the small motion primitives the home page is built on.
 *
 * Three rules govern everything in this file.
 *
 *   Nothing here is required to read the page. Every animation starts from the
 *   final, readable state and is *armed* by the client only once it has decided
 *   motion is wanted. The server-rendered markup, a browser with JavaScript
 *   off, and a reader who asked for reduced motion all get the finished page on
 *   the first frame — there is no arrangement in which content sits at
 *   `opacity: 0` waiting for an observer that may never run.
 *
 *   Nothing here animates layout. The line moves by `stroke-dashoffset`,
 *   sections by `transform` and `opacity`. No width, no height, no top.
 *
 *   Nothing here runs when it is not on screen. The scroll handler is attached
 *   only when motion is wanted, reads on a rAF, and every observer disconnects
 *   the moment it has fired.
 */

const REDUCED = '(prefers-reduced-motion: reduce)'

/** Whether this reader has asked for less movement. `true` until we know. */
export function usePrefersReducedMotion(): boolean {
  // Starting at `true` is the safe default, not a pessimistic one: it means
  // the first client render matches the server's static markup exactly, and
  // motion is armed on the effect that follows. Starting at `false` would
  // hydrate an armed page and flash the un-revealed state at everybody.
  const [reduced, setReduced] = useState(true)

  useEffect(() => {
    const query = window.matchMedia(REDUCED)
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return reduced
}

// ---------------------------------------------------------------- the line

/**
 * A marker on the journey — one stage of the page.
 *
 * Renders nothing. It is a coordinate: `JourneyLine` reads the position of
 * every one of these inside its container and draws a single path through
 * them, so the line follows the real layout at whatever width the page is
 * being read at rather than a shape guessed in advance.
 *
 * Both coordinates are percentages measured from the *reading start* edge —
 * the right in Arabic, the left in English — so the journey begins where the
 * reader does and the whole line mirrors with the page rather than having to
 * be authored twice. `x` is the desktop meander; `xNarrow` is where it
 * collapses to below 860px: a rail in the gutter, which doubles as the page's
 * progress indicator on a phone.
 */
export function JourneyNode({ x, xNarrow = 3 }: { x: number; xNarrow?: number }) {
  return (
    <span
      aria-hidden
      data-journey-node
      data-x={x}
      data-x-narrow={xNarrow}
      className="block h-0 w-0 overflow-hidden"
    />
  )
}

/** Catmull-Rom through the stage points, emitted as cubic béziers. */
function pathThrough(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  const r = (v: number) => Math.round(v * 10) / 10
  let d = `M${r(points[0].x)},${r(points[0].y)}`

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    // 0.2 is loose enough to read as a drawn line rather than a chart, and
    // tight enough that the curve never doubles back on itself between two
    // stages that sit close together vertically.
    const t = 0.2
    d +=
      `C${r(p1.x + (p2.x - p0.x) * t)},${r(p1.y + (p2.y - p0.y) * t)}` +
      ` ${r(p2.x - (p3.x - p1.x) * t)},${r(p2.y - (p3.y - p1.y) * t)}` +
      ` ${r(p2.x)},${r(p2.y)}`
  }

  return d
}

/**
 * One gold hairline, the length of the page.
 *
 * A faint dotted trace shows the whole route from the first frame; the solid
 * stroke draws over it against scroll position, and each stage marker fills as
 * the head of the line reaches it. The head sits at 62% of the viewport
 * height — a little above where the eye is — so the line arrives at a section
 * just before it is read rather than after.
 *
 * Under reduced motion the path is rendered complete and every marker lit, and
 * no scroll listener is attached at all.
 */
export function JourneyLine({
  containerRef,
  className,
}: {
  containerRef: RefObject<HTMLElement | null>
  className?: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const traceRef = useRef<SVGPathElement>(null)
  const lineRef = useRef<SVGPathElement>(null)
  const markersRef = useRef<SVGGElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const container = containerRef.current
    const svg = svgRef.current
    const trace = traceRef.current
    const line = lineRef.current
    const markers = markersRef.current
    if (!container || !svg || !trace || !line || !markers) return

    let length = 0
    let dots: { el: SVGCircleElement; y: number }[] = []
    let frame = 0

    const paint = () => {
      if (reduced || !length) return
      const top = container.getBoundingClientRect().top + window.scrollY
      const head = window.scrollY + window.innerHeight * 0.62 - top
      const progress = Math.max(0, Math.min(1, head / container.offsetHeight))
      line.style.strokeDashoffset = String(length * (1 - progress))
      for (const dot of dots) {
        dot.el.setAttribute('fill', dot.y <= head ? 'var(--color-gold-500)' : '#faf7f0')
      }
    }

    const build = () => {
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>('[data-journey-node]'),
      )
      if (nodes.length < 2) return

      const width = container.offsetWidth
      const height = container.offsetHeight
      const narrow = window.innerWidth < 860
      const top = container.getBoundingClientRect().top + window.scrollY

      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      svg.style.height = `${height}px`

      // The stage coordinates are written from the reading-start edge, so in
      // Arabic they are measured back from the right.
      const rtl = document.documentElement.dir === 'rtl'
      const points = nodes.map((node) => {
        const fromStart = Number(narrow ? node.dataset.xNarrow : node.dataset.x)
        const percent = rtl ? 100 - fromStart : fromStart
        return {
          x: (width * percent) / 100,
          y: node.getBoundingClientRect().top + window.scrollY - top,
        }
      })

      // The line starts above the first stage and runs on past the last, so it
      // enters and leaves the page rather than beginning and ending on a dot.
      const first = points[0]
      const last = points[points.length - 1]
      const stages = points.slice()
      points.unshift({ x: first.x, y: Math.max(first.y - 240, 24) })
      points.push({ x: last.x, y: last.y + 96 })

      const d = pathThrough(points)
      trace.setAttribute('d', d)
      line.setAttribute('d', d)

      length = line.getTotalLength()
      line.style.strokeDasharray = String(length)
      line.style.strokeDashoffset = reduced ? '0' : String(length)

      markers.replaceChildren()
      dots = stages.map((point, i) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        circle.setAttribute('cx', String(point.x))
        circle.setAttribute('cy', String(point.y))
        // The last marker is the terminus, and reads as one.
        circle.setAttribute('r', i === stages.length - 1 ? '6' : '4')
        circle.setAttribute('fill', reduced ? 'var(--color-gold-500)' : '#faf7f0')
        circle.setAttribute('stroke', 'var(--color-gold-500)')
        circle.setAttribute('stroke-width', '1')
        if (!reduced) circle.style.transition = 'fill 0.42s var(--ease-out-soft)'
        markers.append(circle)
        return { el: circle, y: point.y }
      })

      paint()
    }

    build()

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        paint()
      })
    }

    // The page's height changes when the campaign strips arrive, when a font
    // swaps in, and when the map's detail column fills — all after the first
    // paint, and all of them move every stage below them. A ResizeObserver on
    // the container catches every one without polling.
    const observer = new ResizeObserver(() => build())
    observer.observe(container)

    if (!reduced) window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', build)

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', build)
    }
  }, [containerRef, reduced])

  return (
    <svg
      ref={svgRef}
      aria-hidden
      focusable="false"
      preserveAspectRatio="none"
      className={cx('pointer-events-none absolute inset-x-0 top-0 w-full', className)}
    >
      <path
        ref={traceRef}
        fill="none"
        stroke="var(--color-gold-300)"
        strokeWidth="1"
        strokeDasharray="2 6"
        opacity="0.55"
        vectorEffect="non-scaling-stroke"
      />
      <path
        ref={lineRef}
        fill="none"
        stroke="var(--color-gold-500)"
        strokeWidth="1"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <g ref={markersRef} />
    </svg>
  )
}

// ------------------------------------------------------------- the reveals

/**
 * Fires once, the first time its subject crosses into view.
 *
 * Returns `false` — meaning "show it" — for anything that cannot or should not
 * animate, so callers never have to special-case reduced motion themselves.
 *
 * Anything already at or above the fold when motion is armed is played
 * straight away rather than handed to an observer, and that is a correctness
 * rule rather than a nicety. Arming hides what it is about to reveal, so a
 * section that the observer then never reports — because the page reflowed
 * past it when a font swapped in, because the reader arrived on an anchor
 * below it, because the tab was in the background when it scrolled by — would
 * stay invisible with no way back. Only content genuinely below the fold is
 * allowed to wait for a scroll, and that content can always be scrolled to.
 */
function useArmed(ref: RefObject<HTMLElement | null>, reduced: boolean) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (reduced) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }

    // Already reachable by eye: play it now, as part of the page-load
    // sequence, and never observe it at all.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) {
      const frame = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setShown(true)
          observer.disconnect()
        }
      },
      // Slightly inside the fold: a section that is technically visible by one
      // pixel has not been looked at yet, and revealing it there wastes the
      // motion on something off the bottom of the screen.
      { rootMargin: '0px 0px -12% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, reduced])

  return !reduced && !shown
}

/** A section that rises into place as it is reached. */
export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className,
}: {
  children: ReactNode
  /** Milliseconds behind the trigger, for staggering siblings. */
  delay?: number
  as?: 'div' | 'section' | 'ul' | 'ol' | 'li' | 'p'
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const reduced = usePrefersReducedMotion()
  const armed = useArmed(ref, reduced)

  return (
    <Tag
      // One generic ref across a union of tag names is more trouble to type
      // than it is worth here; the element is only ever read, never written.
      ref={ref as never}
      className={cx('reveal', className)}
      data-armed={armed ? 'true' : undefined}
      data-shown={armed ? undefined : 'true'}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  )
}

/** A headline line that rises out of its own line box. */
export function MaskedLine({
  children,
  delay = 0,
}: {
  children: ReactNode
  delay?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = usePrefersReducedMotion()
  const armed = useArmed(ref, reduced)

  return (
    <span
      ref={ref}
      className="line-mask"
      data-armed={armed ? 'true' : undefined}
      data-shown={armed ? undefined : 'true'}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined}
    >
      <span>{children}</span>
    </span>
  )
}

/**
 * A figure that counts up to itself, once.
 *
 * The value is rendered in full from the first frame; the count only replaces
 * it after the client has both decided motion is wanted and seen the number
 * scroll into view. A figure that reads 0 in a screenshot, in a crawler, or
 * for a reader who asked for stillness would be worse than no animation.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number
  format: (value: number) => string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState<number | null>(null)

  useEffect(() => {
    if (reduced) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    let frame = 0
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          observer.disconnect()
          const started = performance.now()
          const tick = (now: number) => {
            const k = Math.min(1, (now - started) / 1100)
            const eased = 1 - (1 - k) ** 3
            setShown(Math.round(value * eased))
            if (k < 1) frame = requestAnimationFrame(tick)
          }
          frame = requestAnimationFrame(tick)
        }
      },
      { threshold: 0.6 },
    )
    observer.observe(el)

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [reduced, value])

  return (
    <span ref={ref} className={className}>
      {format(shown ?? value)}
    </span>
  )
}

// ------------------------------------------------------------------ ornament

/**
 * The hero's structural element, in place of a photograph.
 *
 * A pointed arch in one gold hairline, with a second struck inside it — the
 * same double rule the rest of the design system uses on a framed panel, at
 * architectural scale. It draws itself once on load, from the springing line
 * up to the apex, which is the only entrance animation on the page.
 */
export function HeroArch({ className }: { className?: string }) {
  const ref = useRef<SVGPathElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) return
    const path = ref.current
    if (!path) return
    const length = path.getTotalLength()
    path.style.strokeDasharray = String(length)
    path.style.strokeDashoffset = String(length)
    // Two frames, not one: the first commits the dash offset, the second is
    // where the transition has something to move away from.
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        path.style.transition = 'stroke-dashoffset 1.6s var(--ease-out-soft) 0.15s'
        path.style.strokeDashoffset = '0'
      }),
    )
    return () => cancelAnimationFrame(frame)
  }, [reduced])

  return (
    <svg
      viewBox="0 0 420 600"
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMax meet"
      className={cx('pointer-events-none', className)}
      fill="none"
      stroke="var(--color-gold-300)"
      strokeWidth="1"
    >
      <path ref={ref} d="M14 600 L14 306 Q14 92 210 22 Q406 92 406 306 L406 600" />
      <path d="M40 600 L40 314 Q40 122 210 58 Q380 122 380 314 L380 600" opacity="0.45" />
      <line x1="14" y1="600" x2="406" y2="600" opacity="0.5" />
    </svg>
  )
}
