import { Building2, Globe, Lock, ShieldAlert, type LucideIcon } from 'lucide-react'
import { CLASSIFICATION_HINT, CLASSIFICATION_LABEL } from '../../lib/knowledge'
import type { Classification } from '../../types'
import styles from './knowledge.module.css'

const ICON: Record<Classification, LucideIcon> = {
  public: Globe,
  internal: Building2,
  confidential: ShieldAlert,
  restricted: Lock,
}

/** Classification as text plus an icon (never colour alone). */
export default function ClassificationBadge({ level }: { level: Classification }) {
  const Icon = ICON[level]
  return (
    <span className={`${styles.badge} ${styles[level]}`} title={CLASSIFICATION_HINT[level]}>
      <Icon size={12} aria-hidden="true" />
      <span>
        <span className={styles.srLabel}>Classification: </span>
        {CLASSIFICATION_LABEL[level]}
      </span>
    </span>
  )
}
