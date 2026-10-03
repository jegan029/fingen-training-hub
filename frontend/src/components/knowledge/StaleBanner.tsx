import { useEffect, useState } from 'react'
import { CloudOff, History } from 'lucide-react'
import { fetchKnowledgeStatus } from '../../api'
import { timeAgo } from '../../lib/format'
import type { KnowledgeStatus } from '../../types'
import styles from './knowledge.module.css'

/**
 * Tells learners when synced content may be out of date. Cached content keeps working either way,
 * so this is information, not an error. Renders nothing when everything is current.
 */
export default function StaleBanner() {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null)

  useEffect(() => {
    fetchKnowledgeStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  if (!status?.enabled || (!status.stale && !status.unreachable)) return null

  const synced = status.last_success_at ? `Last synced ${timeAgo(status.last_success_at)}.` : 'Not synced yet.'
  return (
    <div className={styles.banner} role="status">
      {status.unreachable ? (
        <CloudOff size={18} className={styles.bannerIcon} aria-hidden="true" />
      ) : (
        <History size={18} className={styles.bannerIcon} aria-hidden="true" />
      )}
      <p>
        {status.unreachable
          ? 'ServiceNow could not be reached on the last sync, so you are seeing the last synced versions. '
          : 'Knowledge articles may be out of date. '}
        {synced} Check ServiceNow for the latest version before acting on a runbook.
      </p>
    </div>
  )
}
