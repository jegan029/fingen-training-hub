import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, type LucideIcon } from 'lucide-react'
import styles from './ui.module.css'

interface StateMessageProps {
  title: string
  children?: ReactNode
  /** Usually a link or button that gets the user unstuck. */
  action?: ReactNode
  tone?: 'empty' | 'error'
  icon?: LucideIcon
}

/** Empty and error states: say what happened and what to do next. */
export default function StateMessage({ title, children, action, tone = 'empty', icon }: StateMessageProps) {
  const Icon = icon ?? (tone === 'error' ? AlertTriangle : Inbox)
  return (
    <div
      className={`${styles.state} ${tone === 'error' ? styles.error : ''}`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <span className={styles.stateIcon}>
        <Icon size={24} aria-hidden="true" />
      </span>
      <p className={styles.stateTitle}>{title}</p>
      {children && <p className={styles.stateText}>{children}</p>}
      {action && <div className={styles.stateAction}>{action}</div>}
    </div>
  )
}
