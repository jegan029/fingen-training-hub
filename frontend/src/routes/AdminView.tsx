import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Map as MapIcon, TrendingUp, Users, type LucideIcon } from 'lucide-react'
import { fetchAdminUsers, fetchWeakestTopics } from '../api'
import { useAuth } from '../context/AuthContext'
import type { AdminUser, WeakTopic } from '../types'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import page from '../styles/page.module.css'
import styles from './AdminView.module.css'

type Tone = 'success' | 'accent' | 'warning' | 'danger' | 'neutral'

const BADGE: Record<Tone, string> = {
  success: `${page.badge} ${page.badgeSuccess}`,
  accent: `${page.badge} ${page.badgeAccent}`,
  warning: `${page.badge} ${page.badgeWarning}`,
  danger: `${page.badge} ${page.badgeDanger}`,
  neutral: page.badge,
}

function pctTone(pct: number): Tone {
  if (pct === 100) return 'success'
  if (pct >= 60) return 'accent'
  if (pct >= 30) return 'warning'
  return pct > 0 ? 'danger' : 'neutral'
}

function scoreTone(score: number): Tone {
  if (score >= 7) return 'success'
  if (score >= 5) return 'warning'
  return 'danger'
}

function statusLabel(pct: number) {
  return pct === 100 ? 'All paths done' : pct >= 60 ? 'In progress' : pct > 0 ? 'Started' : 'Not started'
}

function formatDate(iso: string | null): string {
  if (!iso) return 'No activity'
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function SummaryCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className={styles.summaryCard}>
      <span className={styles.summaryIcon}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className={styles.summaryValue}>{value}</span>
      <span className={styles.summaryLabel}>{label}</span>
    </div>
  )
}

function WeakestTopics() {
  const [topics, setTopics] = useState<WeakTopic[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchWeakestTopics(8)
      .then(setTopics)
      .catch((err: Error) => setError(err.message || 'Could not load scores'))
  }, [])

  return (
    <section className={styles.section} aria-labelledby="weakest-title">
      <h2 id="weakest-title" className={page.sectionTitle}>
        Weakest topics
      </h2>
      <p className={styles.sectionLead}>
        Lowest average open ended scores across all learners. Consider a refresher session or clearer lesson content for
        these.
      </p>
      {error ? (
        <p className={page.error} role="alert">
          {error}
        </p>
      ) : !topics ? (
        <Skeleton lines={4} height={40} label="Loading weakest topics" />
      ) : topics.length === 0 ? (
        <StateMessage title="No assessment scores yet">
          Scores appear here once learners submit open ended assessments.
        </StateMessage>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col" className={styles.num}>
                  Avg. score
                </th>
                <th scope="col" className={styles.num}>
                  Attempts
                </th>
                <th scope="col" className={styles.num}>
                  Learners
                </th>
                <th scope="col" className={styles.num}>
                  Scenario correct
                </th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.node_id}>
                  <td>
                    <Link to={`/roadmaps/${t.path_id}?node=${t.node_id}`} className={styles.topicLink}>
                      {t.title}
                    </Link>
                    <span className={styles.sub}>{t.path_title}</span>
                  </td>
                  <td className={styles.num}>
                    <span className={BADGE[scoreTone(t.average_score)]}>{t.average_score} / 10</span>
                  </td>
                  <td className={styles.num}>{t.attempts}</td>
                  <td className={styles.num}>{t.learners}</td>
                  <td className={styles.num}>
                    {t.scenario_correct_rate === null ? (
                      <span className={page.muted}>No attempts</span>
                    ) : (
                      `${t.scenario_correct_rate}% of ${t.scenario_attempts}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function AdminView() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch((err: Error) => setError(err.message || 'Could not load learners'))
  }, [])

  const list = users ?? []
  const allDone = list.filter((u) => u.overall_pct === 100).length
  const avgPct = list.length ? Math.round(list.reduce((s, u) => s + u.overall_pct, 0) / list.length) : 0
  const pathHeads = list[0]?.paths ?? []

  return (
    <div className={page.page}>
      <header className={page.header}>
        <h1 className={page.title}>Trainer dashboard</h1>
        <p className={page.lead}>Track L2 engineer onboarding progress across all FinGen training paths.</p>
      </header>

      {error && (
        <p className={page.error} role="alert">
          {error}
        </p>
      )}

      {!users && !error ? (
        <Skeleton lines={5} height={48} label="Loading learners" />
      ) : (
        users && (
          <>
            <div className={styles.summary}>
              <SummaryCard icon={Users} label="Engineers" value={list.length} />
              <SummaryCard icon={CheckCircle2} label="All paths done" value={allDone} />
              <SummaryCard icon={TrendingUp} label="Avg. completion" value={`${avgPct}%`} />
              <SummaryCard icon={MapIcon} label="Training paths" value={pathHeads.length} />
            </div>

            {list.length === 0 ? (
              <StateMessage title="No learners yet">Learners appear here after their first sign in.</StateMessage>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Engineer</th>
                      {pathHeads.map((p) => (
                        <th key={p.path_id} scope="col" className={styles.num}>
                          {p.title}
                        </th>
                      ))}
                      <th scope="col" className={styles.num}>
                        Overall
                      </th>
                      <th scope="col" className={styles.num}>
                        Status
                      </th>
                      <th scope="col" className={styles.num}>
                        Last active
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((u) => {
                      const isYou = u.id === currentUser?.id
                      return (
                        <tr key={u.id}>
                          <td>
                            <div className={styles.person}>
                              <span className={`${styles.avatar} ${isYou ? styles.avatarYou : ''}`} aria-hidden="true">
                                {u.name.charAt(0)}
                              </span>
                              <div>
                                <p className={styles.name}>
                                  {u.name} {isYou && <span className={BADGE.accent}>You</span>}
                                </p>
                                <p className={styles.sub}>{u.email}</p>
                              </div>
                            </div>
                          </td>
                          {u.paths.map((p) => (
                            <td key={p.path_id} className={styles.num}>
                              <span className={styles.cellPct}>{p.pct}%</span>
                              <span className={`${page.bar} ${styles.miniBar}`} aria-hidden="true">
                                <span
                                  className={`${page.fill} ${p.pct === 100 ? page.fillSuccess : ''}`}
                                  style={{ width: `${p.pct}%` }}
                                />
                              </span>
                              <span className={styles.sub}>
                                {p.completed} of {p.total}
                              </span>
                            </td>
                          ))}
                          <td className={styles.num}>
                            <span className={BADGE[pctTone(u.overall_pct)]}>{u.overall_pct}%</span>
                          </td>
                          <td className={styles.num}>
                            <span className={BADGE[pctTone(u.overall_pct)]}>{statusLabel(u.overall_pct)}</span>
                          </td>
                          <td className={styles.num}>
                            <span className={styles.sub}>{formatDate(u.last_active)}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}

      <WeakestTopics />

      <p className={styles.footnote}>Read only view. Data refreshes on page load.</p>
    </div>
  )
}
