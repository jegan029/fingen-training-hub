import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchAnalytics, fetchRoadmaps } from '../api'
import type { AnalyticsSummary, LearningPath } from '../types'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import page from '../styles/page.module.css'
import styles from './AnalyticsDashboard.module.css'

type Tone = 'good' | 'fair' | 'poor' | 'neutral'

function rateTone(pct: number): Tone {
  return pct >= 70 ? 'good' : pct >= 40 ? 'fair' : 'poor'
}

function scoreTone(score: number | null): Tone {
  if (score === null || score === 0) return 'neutral'
  return score >= 7 ? 'good' : score >= 5 ? 'fair' : 'poor'
}

export default function AnalyticsDashboard() {
  const { pathId } = useParams<{ pathId: string }>()
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [paths, setPaths] = useState<LearningPath[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRoadmaps()
      .then(setPaths)
      .catch(() => {})
  }, [])

  // No state reset needed when pathId changes: App remounts each page on a new pathname.
  useEffect(() => {
    if (!pathId) return
    fetchAnalytics(Number(pathId))
      .then(setAnalytics)
      .catch((err: Error) => setError(err.message || 'Unable to load analytics'))
  }, [pathId])

  const pct = analytics ? Math.round(analytics.completion_rate) : 0
  const score = analytics?.average_score || null

  const stats = analytics
    ? [
        { value: analytics.completed_nodes, label: 'Avg. topics done per learner', tone: 'neutral' as Tone },
        { value: analytics.learners, label: 'Learners', tone: 'neutral' as Tone },
        { value: `${pct}%`, label: 'Completion rate, all learners', tone: rateTone(pct) },
        { value: score?.toFixed(1) ?? 'None yet', label: 'Avg. score out of 10', tone: scoreTone(score) },
      ]
    : []

  return (
    <div className={page.page}>
      <header className={page.header}>
        <h1 className={page.title}>Analytics</h1>
        <p className={page.lead}>Cohort progress and assessment performance for each training path.</p>
      </header>

      {paths.length > 0 && (
        <nav className={styles.tabs} aria-label="Training path">
          {paths.map((p) => {
            const current = Number(pathId) === p.id
            return (
              <Link
                key={p.id}
                to={`/analytics/${p.id}`}
                className={styles.tab}
                aria-current={current ? 'page' : undefined}
              >
                {p.title}
              </Link>
            )
          })}
        </nav>
      )}

      {error ? (
        <StateMessage
          tone="error"
          title="Analytics could not be loaded"
          action={
            <Link to="/analytics/1" className={page.btn}>
              Open the first path
            </Link>
          }
        >
          {error}
        </StateMessage>
      ) : !analytics ? (
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={104} label="Loading analytics" />
          ))}
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {stats.map((s) => (
              <div key={s.label} className={`${styles.stat} ${styles[s.tone]}`}>
                <span className={styles.statValue}>{s.value}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>

          <div className={page.card}>
            <div className={styles.barHead}>
              <span className={styles.barTitle}>Cohort progress</span>
              <span className={page.muted}>
                {analytics.completed_nodes} of {analytics.total_nodes} topics per learner on average
              </span>
            </div>
            <span
              className={page.bar}
              role="progressbar"
              aria-label="Cohort completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <span className={`${page.fill} ${pct >= 70 ? page.fillSuccess : ''}`} style={{ width: `${pct}%` }} />
            </span>
            <p className={styles.barNote}>
              {pct}% of all topics in this path are done across {analytics.learners} learners.
            </p>
          </div>

          <div className={page.actions}>
            <Link to={`/roadmaps/${pathId}`} className={`${page.btn} ${page.btnPrimary}`}>
              Open path
            </Link>
            <Link to="/admin" className={page.btn}>
              View learners and weakest topics
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
