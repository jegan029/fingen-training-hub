import type { CSSProperties } from 'react'
import type { PathProgress } from '../types'
import styles from './ProgressLattice.module.css'

const STEP = 16
const PAD = 6

/**
 * Header graphic for the training paths page: one labelled track of topics per path, in the same
 * order as the cards, lit up to the topics done. It repeats what the cards say in words, so it is
 * hidden from assistive technology.
 */
export default function ProgressLattice({ paths }: { paths: PathProgress[] }) {
  const columns = Math.max(1, ...paths.map((p) => p.total))
  const width = PAD * 2 + (columns - 1) * STEP
  const height = PAD * 2

  return (
    <div className={styles.lattice} aria-hidden="true">
      {paths.map((path, row) => {
        const y = PAD
        const lastX = PAD + (path.total - 1) * STEP
        const litX = PAD + (path.completed - 1) * STEP
        return (
          <div key={path.path_id} className={styles.row} style={{ '--row': row } as CSSProperties}>
            <span className={styles.label}>{path.title}</span>
            <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} focusable="false">
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
                  r={3.5}
                />
              ))}
            </svg>
          </div>
        )
      })}
    </div>
  )
}
