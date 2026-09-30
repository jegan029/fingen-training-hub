import styles from './ui.module.css'

interface SkeletonProps {
  height?: number
  width?: number | string
  /** Render several bars; every second one is shorter, like lines of text. */
  lines?: number
  label?: string
}

/** Placeholder shown while content loads. Announced once as busy, not per bar. */
export default function Skeleton({ height = 20, width = '100%', lines = 1, label = 'Loading' }: SkeletonProps) {
  return (
    <div className={styles.skeletonStack} aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={styles.skeleton} style={{ height, width: lines > 1 && i % 2 === 1 ? '65%' : width }} />
      ))}
    </div>
  )
}
