import { useEffect, useRef, useState } from 'react'

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
