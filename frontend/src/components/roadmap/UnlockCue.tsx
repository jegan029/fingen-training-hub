import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { prefersReducedMotion } from '../../lib/motion'
import styles from './UnlockCue.module.css'

interface UnlockCueProps {
  /** Topics the last status change unlocked. */
  topics: { id: number; title: string }[]
  /** Called when the cue has done its job (shown topic, pressed, or timed out). */
  onDone: () => void
  /** Called after the cue brings a topic into view, so the roadmap can ring it again. */
  onShow: (nodeId: number) => void
}

const SHOW_FOR_MS = 8000
const EXIT_MS = 150

/**
 * When a status change unlocks a topic the learner cannot see, a small button says so and offers to
 * show it. The page only moves when the learner presses it. Screen readers already heard the unlock
 * in the drawer's status message, so the cue is not announced again.
 */
export default function UnlockCue({ topics, onDone, onShow }: UnlockCueProps) {
  // null until measured; then where the first unlocked topic sits relative to the viewport.
  const [where, setWhere] = useState<'visible' | 'above' | 'below' | null>(null)
  const [leaving, setLeaving] = useState(false)

  const first = topics[0]

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-node-id="${first.id}"]`)
    if (!target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.99) setWhere('visible')
        else setWhere(entry.boundingClientRect.top < 0 ? 'above' : 'below')
      },
      { threshold: [0, 0.99] },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [first.id])

  // Leave with a short fade, then report done.
  const dismiss = () => {
    setLeaving(true)
    window.setTimeout(onDone, EXIT_MS)
  }

  // The cue retires once the topic is on screen, or after a while.
  useEffect(() => {
    if (where === 'visible') {
      const timer = window.setTimeout(onDone, 0)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      setLeaving(true)
      window.setTimeout(onDone, EXIT_MS)
    }, SHOW_FOR_MS)
    return () => window.clearTimeout(timer)
  }, [where, onDone])

  if (where !== 'above' && where !== 'below') return null

  const show = () => {
    const target = document.querySelector<HTMLElement>(`[data-node-id="${first.id}"]`)
    target?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    target?.focus({ preventScroll: true })
    onShow(first.id)
    dismiss()
  }

  const Arrow = where === 'above' ? ArrowUp : ArrowDown
  const label = topics.length === 1 ? `${first.title} unlocked` : `${topics.length} topics unlocked`

  return (
    <button type="button" className={styles.cue} data-leaving={leaving || undefined} onClick={show}>
      <Arrow size={16} aria-hidden="true" />
      <span className={styles.text}>{label}</span> <span className={styles.action}>Show</span>
    </button>
  )
}
