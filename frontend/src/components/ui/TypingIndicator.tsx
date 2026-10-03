import styles from './TypingIndicator.module.css'

/** Three dots that bob while a reply is being written. Static dots under reduced motion. */
export default function TypingIndicator({ label }: { label: string }) {
  return (
    <span className={styles.typing}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.srOnly}>{label}</span>
    </span>
  )
}
