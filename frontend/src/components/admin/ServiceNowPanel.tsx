import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Boxes, CloudCog, FlaskConical, Paperclip, RefreshCw } from 'lucide-react'
import {
  ApiError,
  fetchAccessLog,
  fetchServiceNowStatus,
  fetchSyncRun,
  fetchSyncRuns,
  startServiceNowSync,
} from '../../api'
import type { AccessLogEntry, ServiceNowStatus, SyncMode, SyncRun } from '../../types'
import ClassificationBadge from '../knowledge/ClassificationBadge'
import Skeleton from '../ui/Skeleton'
import { formatDateTime, timeAgo } from '../../lib/format'
import page from '../../styles/page.module.css'
import styles from './ServiceNowPanel.module.css'

const POLL_MS = 1500

const RUN_BADGE: Record<SyncRun['status'], string> = {
  running: `${page.badge} ${page.badgeAccent}`,
  success: `${page.badge} ${page.badgeSuccess}`,
  partial: `${page.badge} ${page.badgeWarning}`,
  failed: `${page.badge} ${page.badgeDanger}`,
}

const RUN_LABEL: Record<SyncRun['status'], string> = {
  running: 'Running',
  success: 'Succeeded',
  partial: 'Partly failed',
  failed: 'Failed',
}

interface Data {
  status: ServiceNowStatus
  runs: SyncRun[]
  audit: AccessLogEntry[]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function runSummary(run: SyncRun): string {
  const parts = [
    `${run.articles_created} created`,
    `${run.articles_updated} updated`,
    `${run.articles_retired} retired`,
    plural(run.documents_downloaded, 'document'),
  ]
  if (run.articles_failed) parts.push(`${plural(run.articles_failed, 'article')} failed`)
  if (run.documents_rejected) parts.push(`${plural(run.documents_rejected, 'document')} rejected`)
  return parts.join(', ')
}

/** Admin view of the ServiceNow integration: connection, sync now, recent runs and the access audit. */
export default function ServiceNowPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [syncing, setSyncing] = useState<SyncMode | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchServiceNowStatus(), fetchSyncRuns(10), fetchAccessLog(20)])
      .then(([status, runs, audit]) => alive.current && setData({ status, runs, audit }))
      .catch((err: Error) => alive.current && setLoadError(err.message || 'Could not load the ServiceNow status'))
  }, [reload])

  const waitFor = useCallback(async (runId: number): Promise<SyncRun | null> => {
    while (alive.current) {
      const run = await fetchSyncRun(runId)
      if (run.status !== 'running') return run
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS))
    }
    return null
  }, [])

  const sync = async (mode: SyncMode) => {
    setSyncing(mode)
    setMessage(null)
    try {
      const started = await startServiceNowSync(mode)
      const run = await waitFor(started.run_id)
      if (run && alive.current) {
        setMessage(
          run.status === 'failed'
            ? { tone: 'error', text: `Sync failed. ${run.error_summary ?? ''}`.trim() }
            : { tone: 'ok', text: `Sync ${RUN_LABEL[run.status].toLowerCase()}: ${runSummary(run)}.` },
        )
      }
    } catch (err) {
      if (!alive.current) return
      const text =
        err instanceof ApiError && err.status === 409
          ? 'A sync is already running. Its result will appear in the table below.'
          : (err as Error).message || 'The sync could not be started'
      setMessage({ tone: 'error', text })
    } finally {
      if (alive.current) {
        setSyncing(null)
        setReload((n) => n + 1)
      }
    }
  }

  if (loadError) {
    return (
      <p className={page.error} role="alert">
        {loadError}
      </p>
    )
  }
  if (!data) return <Skeleton lines={4} height={44} label="Loading ServiceNow status" />

  const { status, runs, audit } = data
  const busy = syncing !== null || status.running

  return (
    <div className={styles.panel}>
      <div className={styles.connection}>
        <CloudCog size={20} aria-hidden="true" className={styles.connectionIcon} />
        <div className={styles.connectionText}>
          <p className={styles.connectionTitle}>
            {!status.enabled
              ? 'Integration disabled'
              : status.mock_mode
                ? 'Mock mode: synthetic fixtures, no connection to ServiceNow'
                : `Connected to ${status.instance_host ?? 'ServiceNow'} (${status.auth_mode})`}
          </p>
          <p className={styles.connectionSub}>
            {status.scheduler_running
              ? `Automatic sync every ${status.sync_interval_minutes} minutes; full reconciliation nightly.`
              : 'Automatic sync is off; use Sync now.'}
          </p>
        </div>
        {status.mock_mode && (
          <span className={`${page.badge} ${page.badgeWarning}`}>
            <FlaskConical size={12} aria-hidden="true" /> Mock mode
          </span>
        )}
      </div>

      <div className={styles.stats}>
        <Stat icon={BookOpen} label="Active articles" value={status.counts.articles_active} />
        <Stat icon={Boxes} label="Applications" value={status.counts.applications} />
        <Stat icon={Paperclip} label="Documents" value={status.counts.documents} />
        <div className={styles.stat}>
          <span className={styles.statLabel}>Last successful sync</span>
          <span className={styles.statText}>{status.last_success_at ? timeAgo(status.last_success_at) : 'Never'}</span>
          <span className={styles.statSub}>
            Next: {status.next_incremental ? formatDateTime(status.next_incremental) : 'not scheduled'}
          </span>
        </div>
      </div>

      <div className={styles.syncRow}>
        <button
          type="button"
          className={`${page.btn} ${page.btnPrimary}`}
          disabled={busy || !status.enabled}
          onClick={() => sync('incremental')}
        >
          <RefreshCw size={16} aria-hidden="true" className={syncing ? styles.spin : undefined} />
          {syncing === 'incremental' ? 'Syncing…' : 'Sync now'}
        </button>
        <button type="button" className={page.btn} disabled={busy || !status.enabled} onClick={() => sync('full')}>
          {syncing === 'full' ? 'Running full sync…' : 'Full sync'}
        </button>
        <p className={styles.syncHelp}>
          Sync now fetches changes since the last sync. Full sync also retires articles that were removed, unpublished
          or expired in ServiceNow.
        </p>
      </div>
      <div role="status" aria-live="polite" className={styles.liveRegion}>
        {busy && !message && 'A sync is running.'}
        {message && <p className={message.tone === 'ok' ? styles.ok : page.error}>{message.text}</p>}
      </div>

      <h3 className={styles.subTitle}>Recent sync runs</h3>
      {runs.length === 0 ? (
        <p className={page.muted}>No sync has run yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Mode</th>
                <th scope="col">Status</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    {formatDateTime(run.started_at)}
                    <span className={styles.sub}>{run.trigger === 'schedule' ? 'Scheduled' : 'Manual'}</span>
                  </td>
                  <td>{run.mode === 'full' ? 'Full' : 'Incremental'}</td>
                  <td>
                    <span className={RUN_BADGE[run.status]}>{RUN_LABEL[run.status]}</span>
                  </td>
                  <td>
                    {run.status === 'running' ? 'In progress' : runSummary(run)}
                    {run.error_summary && (
                      <details className={styles.details}>
                        <summary>Details</summary>
                        <p>{run.error_summary}</p>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className={styles.subTitle}>Access to confidential and restricted content</h3>
      {audit.length === 0 ? (
        <p className={page.muted}>Nobody has opened confidential or restricted content yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
                <th scope="col">Classification</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.id}>
                  <td>{formatDateTime(e.at)}</td>
                  <td>
                    {e.user_name}
                    <span className={styles.sub}>{e.user_email}</span>
                  </td>
                  <td>
                    {e.action === 'download' ? 'Downloaded ' : 'Viewed '}
                    {e.title ? (
                      <Link to={`/knowledge/${e.article_id}`}>
                        {e.kb_number} {e.title}
                      </Link>
                    ) : (
                      <span>
                        {e.kb_number} <span className={page.muted}>(title above your clearance)</span>
                      </span>
                    )}
                    {e.document_name && <span className={styles.sub}>{e.document_name}</span>}
                  </td>
                  <td>
                    <ClassificationBadge level={e.classification} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>
        <Icon size={14} aria-hidden="true" /> {label}
      </span>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}
