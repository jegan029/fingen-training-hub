import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom'
import { useMediaQuery } from './useMediaQuery'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * True once the element has scrolled into view (then stays true: reveal animations run once).
 * Without IntersectionObserver (old browsers, tests) content is shown immediately.
 */
export function useInView<T extends Element>(rootMargin = '0px 0px -10% 0px') {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView, rootMargin])

  return [ref, inView] as const
}

/** Counts from 0 to `target` once `active` is true; jumps straight to the value under reduced motion. */
export function useCountUp(target: number, active: boolean, durationMs = 700): number {
  const [value, setValue] = useState(0)
  // Reduced motion (or no rAF): show the final value straight away, without animating.
  const instant = active && (prefersReducedMotion() || typeof requestAnimationFrame === 'undefined')

  useEffect(() => {
    if (!active || instant) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3) // ease out cubic
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, active, instant, durationMs])

  return instant ? target : value
}

/** Class names of the shared motion classes in styles/motion.css. */
export const motion = {
  fadeIn: 'motion-fade-in',
  rise: 'motion-rise',
  fromEnd: 'motion-from-end',
  pop: 'motion-pop',
  sheen: 'motion-sheen',
  meter: 'motion-meter',
} as const

/** Live reduced motion preference, for components that render a different static state. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/** Stagger index for the shared motion classes: the element waits --i steps of --stagger-step. */
export function staggerStyle(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}

/** Position of a `.meter` progress fill, from a 0 to 100 percentage. */
export function meterStyle(pct: number): CSSProperties {
  return { '--p': Math.max(0, Math.min(100, pct)) / 100 } as CSSProperties
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { ready: Promise<void> }
}

export interface TransitionOptions extends NavigateOptions {
  /** CSS selector of an element the new page must show before the transition animates (a shared title). */
  waitFor?: string
}

// How long a transition may hold the old page while the new one renders its shared element.
const WAIT_LIMIT_MS = 300

function waitForElement(selector: string, limitMs: number): Promise<void> {
  const start = performance.now()
  return new Promise((resolve) => {
    const check = () => {
      if (document.querySelector(selector) || performance.now() - start > limitMs) resolve()
      else requestAnimationFrame(check)
    }
    check()
  })
}

/**
 * Navigates inside a View Transition, so the page cross fades and elements that share a
 * view-transition-name morph between pages. Navigates instantly where the API is missing
 * (older browsers, tests) or the user prefers reduced motion.
 */
export function navigateWithTransition(
  navigate: NavigateFunction,
  to: To | number,
  { waitFor, ...options }: TransitionOptions = {},
) {
  const go = () => (typeof to === 'number' ? navigate(to) : navigate(to, options))
  const doc = document as ViewTransitionDocument
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    go()
    return
  }
  const transition = doc.startViewTransition(async () => {
    flushSync(() => {
      go()
    })
    if (waitFor) await waitForElement(waitFor, WAIT_LIMIT_MS)
  })
  // A skipped transition (for example a second click) still navigates; nothing to report.
  transition.ready.catch(() => {})
}

/**
 * A topic title shared between the roadmap drawer and the lesson page: both carry the same
 * view-transition-name, so the title morphs from one into the other during the page transition.
 */
export function sharedTitle(nodeId: number) {
  const name = `node-title-${nodeId}`
  return {
    selector: `[data-shared-title="${name}"]`,
    props: { 'data-shared-title': name, style: { viewTransitionName: name } as CSSProperties },
  }
}
