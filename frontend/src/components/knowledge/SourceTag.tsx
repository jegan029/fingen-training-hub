import { CloudDownload, FolderOpen } from 'lucide-react'
import styles from './knowledge.module.css'

/** Where content comes from: synced from ServiceNow (read only) or authored in the Training Hub. */
export default function SourceTag({ source }: { source: 'servicenow' | 'local' }) {
  return source === 'servicenow' ? (
    <span className={styles.source} title="Synced from ServiceNow; read only here">
      <CloudDownload size={12} aria-hidden="true" />
      From ServiceNow
    </span>
  ) : (
    <span className={styles.source} title="Written for the Training Hub">
      <FolderOpen size={12} aria-hidden="true" />
      Training Hub
    </span>
  )
}
