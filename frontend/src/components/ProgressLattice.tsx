import type { CSSProperties } from 'react'
import type { PathProgress } from '../types'
import styles from './ProgressLattice.module.css'

const STEP = 22
const ROW_GAP = 30
const PAD = 8

/**
 * Header graphic for the training paths page: one track of topics per path, lit up to the topics done.
 * It repeats what the path cards say in words, so it is hidden from assistive technology.
 */
export default function ProgressLattice({ paths }: { paths: PathProgress[] }) {
  const columns = Math.max(1, ...paths.map((p) => p.total))
  const width = PAD * 2 + (columns - 1) * STEP
  const height = PAD * 2 + Math.max(0, paths.length - 1) * ROW_GAP

  return (
    <svg
      className={styles.lattice}
      viewBox={`0 0 ${width} ${height}`}
      width={width * 1.4}
      height={height * 1.4}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path, row) => {
        const y = PAD + row * ROW_GAP
        const lastX = PAD + (path.total - 1) * STEP
        const litX = PAD + (path.completed - 1) * STEP
        return (
          <g key={path.path_id} style={{ '--row': row } as CSSProperties}>
            <line className={styles.track} x1={PAD} y1={y} x2={lastX} y2={y} />
            {path.completed > 1 && (
              <rect className={styles.lit} x={PAD} y={y - 1.5} width={litX - PAD} height={3} rx={1.5} />
            )}
            {Array.from({ length: path.total }, (_, i) => (
              <circle
                key={i}
                className={styles.dot}
                data-done={i < path.completed || undefined}
                style={{ '--i': i } as CSSProperties}
                cx={PAD + i * STEP}
                cy={y}
                r={4}
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
