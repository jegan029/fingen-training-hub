import { useCountUp } from '../../lib/motion'
import styles from './ProgressRing.module.css'

interface ProgressRingProps {
  /** Percentage, 0 to 100. */
  value: number
  /** Accessible name of the progress bar, for example "Platform Core progress". */
  label: string
  size?: number
  tone?: 'accent' | 'success'
}

/**
 * Circular progress: the arc fills from 0 to the value while the number counts up with it.
 * Reduced motion shows the final arc and number straight away.
 */
export default function ProgressRing({ value, label, size = 56, tone = 'accent' }: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const shown = useCountUp(pct, true)
  return (
    <span
      className={styles.ring}
      data-tone={tone}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle className={styles.track} cx={24} cy={24} r={20} />
        {/* pathLength 100 makes the dash offset a percentage. */}
        <circle
          className={styles.arc}
          cx={24}
          cy={24}
          r={20}
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - pct}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <span className={styles.value} aria-hidden="true">
        {shown}%
      </span>
    </span>
  )
}
