import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, BookMarked, LifeBuoy, Server, type LucideIcon } from 'lucide-react'
import { fetchProgressOverview, fetchRoadmaps } from '../api'
import type { LearningPath, PathProgress } from '../types'
import styles from './RoadmapViewer.module.css'

const ICONS: Record<string, LucideIcon> = {
  'platform-core': Server,
  'transaction-flows': ArrowLeftRight,
  'l2-support-ops': LifeBuoy,
}

// Role based paths prepare you for a job; skill based paths go deep on one area.
const ROLE_BASED = new Set(['l2-support-ops'])

function PathCard({ path, progress }: { path: LearningPath; progress?: PathProgress }) {
  const Icon = ICONS[path.slug] ?? BookMarked
  const pct = progress?.pct ?? 0
  return (
    <Link to={`/roadmaps/${path.id}`} className={styles.card}>
      <span className={styles.icon}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>{path.title}</span>
        <span className={styles.cardDesc}>{path.description}</span>
        <span className={styles.meta}>{progress ? `${progress.completed} of ${progress.total} topics done` : ' '}</span>
        <span
          className={styles.bar}
          role="progressbar"
          aria-label={`${path.title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span className={styles.fill} style={{ width: `${pct}%` }} />
        </span>
      </span>
    </Link>
  )
}

export default function RoadmapViewer() {
  const [paths, setPaths] = useState<LearningPath[] | null>(null)
  const [progress, setProgress] = useState<Record<number, PathProgress>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRoadmaps()
      .then(setPaths)
      .catch((err: Error) => setError(err.message || 'Failed to load training paths'))
    fetchProgressOverview()
      .then((o) => setProgress(Object.fromEntries(o.paths.map((p) => [p.path_id, p]))))
      .catch(() => {})
  }, [])

  const groups = [
    {
      title: 'Role based',
      blurb: 'Everything you need for the role, end to end.',
      items: paths?.filter((p) => ROLE_BASED.has(p.slug)) ?? [],
    },
    {
      title: 'Skill based',
      blurb: 'Go deep on one area of the platform.',
      items: paths?.filter((p) => !ROLE_BASED.has(p.slug)) ?? [],
    },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Training paths</h1>
        <p className={styles.lead}>Structured onboarding modules for L2 support engineers on the Fingen platform.</p>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!paths && !error && (
        <div className={styles.grid} aria-busy="true" aria-label="Loading training paths">
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      )}

      {paths &&
        groups.map(
          (group) =>
            group.items.length > 0 && (
              <section key={group.title} className={styles.group} aria-labelledby={`group-${group.title}`}>
                <div className={styles.groupHeader}>
                  <h2 id={`group-${group.title}`} className={styles.groupTitle}>
                    {group.title}
                  </h2>
                  <p className={styles.groupBlurb}>{group.blurb}</p>
                </div>
                <div className={styles.grid}>
                  {group.items.map((p) => (
                    <PathCard key={p.id} path={p} progress={progress[p.id]} />
                  ))}
                </div>
              </section>
            ),
        )}
    </div>
  )
}
