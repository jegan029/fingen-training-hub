import { useEffect, useState } from 'react'
import { Lightbulb, Pause, Play, SkipForward } from 'lucide-react'
import { motion, usePrefersReducedMotion } from '../../lib/motion'
import { TIPS } from './tips'
import styles from './BrandPanel.module.css'

const ROTATE_MS = 6000

/**
 * One support tip at a time, changing every 6 seconds with a cross fade. It holds still while
 * pointed at or focused, and the button pauses it for good. The region is not live, so screen
 * readers are not interrupted; they read the current tip when they reach it. Under reduced motion
 * it does not rotate on its own and the button shows the next tip instead.
 */
export default function TipCard() {
  const reduced = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [holding, setHolding] = useState(false)
  const rotating = !reduced && !paused && !holding

  useEffect(() => {
    if (!rotating) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % TIPS.length), ROTATE_MS)
    return () => window.clearTimeout(timer)
  }, [rotating, index])

  return (
    <figure
      className={styles.tip}
      onPointerEnter={() => setHolding(true)}
      onPointerLeave={() => setHolding(false)}
      onFocus={() => setHolding(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHolding(false)
      }}
    >
      <Lightbulb size={18} aria-hidden="true" className={styles.tipIcon} />
      <figcaption className={styles.srOnly}>Support tip</figcaption>
      <blockquote className={styles.tipText} aria-live="off">
        <p key={index} className={motion.fadeIn}>
          {TIPS[index]}
        </p>
      </blockquote>
      {reduced ? (
        <button
          type="button"
          className={styles.tipControl}
          onClick={() => setIndex((i) => (i + 1) % TIPS.length)}
          aria-label="Next tip"
        >
          <SkipForward size={16} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className={styles.tipControl}
          aria-pressed={paused}
          aria-label="Pause tips"
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
        </button>
      )}
    </figure>
  )
}
