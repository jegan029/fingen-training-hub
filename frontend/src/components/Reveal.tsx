import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import styles from './Reveal.module.css'

/**
 * Fades and lifts its content in the first time it scrolls into view. Content already on screen when
 * the page appears is left alone, so nothing above the fold starts blank. Without IntersectionObserver,
 * under reduced motion and in print the content simply shows, and find in page still reaches it.
 */
export default function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  // Before paint: hide only what starts below the fold, then show it when it scrolls in.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return
    if (el.getBoundingClientRect().top < window.innerHeight) return
    el.dataset.hidden = ''
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          delete el.dataset.hidden
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`${styles.reveal} ${className}`}>
      {children}
    </div>
  )
}
