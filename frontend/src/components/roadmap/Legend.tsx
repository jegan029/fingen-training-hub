import { Lock } from 'lucide-react'
import { STATUS_META, StatusIcon } from './status'
import styles from './Legend.module.css'

export default function Legend() {
  return (
    <aside className={styles.legend} aria-label="Legend">
      <p className={styles.heading}>Legend</p>
      <ul className={styles.list}>
        <li>
          <span className={`${styles.swatch} ${styles.main}`} aria-hidden="true" />
          Main topic
        </li>
        <li>
          <span className={`${styles.swatch} ${styles.sub}`} aria-hidden="true" />
          Subtopic
        </li>
        <li>
          <svg width="28" height="8" aria-hidden="true">
            <line x1="2" y1="4" x2="26" y2="4" className={styles.required} />
          </svg>
          Required order
        </li>
        <li>
          <svg width="28" height="8" aria-hidden="true">
            <line x1="2" y1="4" x2="26" y2="4" className={styles.optional} />
          </svg>
          Order not strict
        </li>
        <li>
          <svg width="28" height="8" aria-hidden="true">
            <line x1="2" y1="4" x2="26" y2="4" className={styles.dependency} />
          </svg>
          Prerequisite (on hover)
        </li>
      </ul>
      <ul className={styles.list}>
        {(['done', 'in_progress', 'skipped', 'pending'] as const).map((s) => (
          <li key={s}>
            <StatusIcon status={s} size={14} />
            {STATUS_META[s].label}
          </li>
        ))}
        <li>
          <Lock size={14} aria-hidden="true" />
          Locked
        </li>
      </ul>
    </aside>
  )
}
