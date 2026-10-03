import { useEffect, useState } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, ClipboardCheck, Target } from 'lucide-react'
import { fetchNodeDetail, completeNode } from '../api'
import type { NodeDetail } from '../types'
import Markdown from '../components/Markdown'
import Reveal from '../components/Reveal'
import { navigateWithTransition, sharedTitle } from '../lib/motion'
import { splitSections } from '../lib/markdownSections'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import page from '../styles/page.module.css'
import styles from './NodeContentPage.module.css'

export default function NodeContentPage() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [node, setNode] = useState<NodeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [justCompleted, setJustCompleted] = useState(false)

  // Starts in the loading state; App remounts the page when nodeId changes.
  useEffect(() => {
    if (!nodeId) return
    fetchNodeDetail(Number(nodeId))
      .then(setNode)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [nodeId])

  // The roadmap drawer passes the title along, so the heading is there for the title morph before the lesson loads.
  const passedTitle = (location.state as { title?: string } | null)?.title
  const title = sharedTitle(Number(nodeId))

  // Opened from a bookmark there is no in-app history, so "back" goes to the paths list.
  const goBack = () =>
    location.key === 'default'
      ? navigate('/roadmaps')
      : navigateWithTransition(navigate, -1, { waitFor: title.selector })

  const handleMarkDone = async () => {
    if (!node) return
    setCompleting(true)
    setCompleteError(null)
    try {
      await completeNode(node.id)
      setJustCompleted(true)
    } catch (err) {
      setCompleteError((err as Error).message || 'Could not save your progress')
    } finally {
      setCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className={`${page.page} ${page.narrow}`}>
        {passedTitle ? (
          <h1 className={page.title} {...title.props}>
            {passedTitle}
          </h1>
        ) : (
          <Skeleton height={36} width="55%" label="Loading lesson" />
        )}
        <div className={styles.skeletonBody}>
          <Skeleton lines={8} height={18} label="Loading lesson" />
        </div>
      </div>
    )
  }

  if (error || !node) {
    return (
      <div className={`${page.page} ${page.narrow}`}>
        <StateMessage
          tone="error"
          title="This lesson could not be loaded"
          action={
            <button type="button" className={page.btn} onClick={goBack}>
              Go back
            </button>
          }
        >
          {error || 'The lesson was not found.'}
        </StateMessage>
      </div>
    )
  }

  const done = justCompleted || node.status === 'done'

  return (
    <div className={`${page.page} ${page.narrow}`}>
      <header className={styles.header}>
        <button type="button" onClick={goBack} className={styles.back}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to training path
        </button>
        <div className={styles.titleRow}>
          <div>
            <h1 className={page.title} {...title.props}>
              {node.title}
            </h1>
            <p className={page.lead}>{node.description}</p>
          </div>
          <div className={styles.headerActions}>
            {done ? (
              <span className={`${page.badge} ${page.badgeSuccess} ${styles.doneBadge}`}>
                <Check size={14} aria-hidden="true" /> Done
              </span>
            ) : (
              <button
                type="button"
                onClick={handleMarkDone}
                disabled={completing || node.locked}
                title={node.locked ? `Complete ${node.locked_by.join(', ')} first` : undefined}
                className={`${page.btn} ${page.btnPrimary} ${page.btnSm}`}
              >
                <Check size={14} aria-hidden="true" /> {completing ? 'Saving…' : 'Mark as done'}
              </button>
            )}
            <Link to={`/assessment/${node.id}`} className={`${page.btn} ${page.btnSm}`}>
              <ClipboardCheck size={14} aria-hidden="true" /> Take quiz
            </Link>
            <Link to={`/scenario/${node.id}`} className={`${page.btn} ${page.btnSm}`}>
              <Target size={14} aria-hidden="true" /> Scenario
            </Link>
          </div>
        </div>
        {node.locked && !done && (
          <p className={styles.note}>
            Finish {node.locked_by.join(', ')} before marking this topic done. You can still read it.
          </p>
        )}
        {completeError && (
          <p className={page.error} role="alert">
            {completeError}
          </p>
        )}
      </header>

      <article className={styles.content}>
        {/* Each section rises in as it scrolls into view. */}
        {splitSections(node.content).map((section, i) => (
          <Reveal key={i} className={styles.section}>
            <Markdown className="md-lesson">{section}</Markdown>
          </Reveal>
        ))}
      </article>

      {node.sample_question && (
        <aside className={styles.practice} aria-labelledby="practice-title">
          <p id="practice-title" className={page.eyebrow}>
            Practice question
          </p>
          <p className={styles.practiceText}>{node.sample_question}</p>
          <Link to={`/assessment/${node.id}`} className={`${page.btn} ${page.btnPrimary} ${page.btnSm}`}>
            Answer this question
          </Link>
        </aside>
      )}

      <div className={styles.bottomNav}>
        <button type="button" onClick={goBack} className={page.btn}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to training path
        </button>
        <div className={styles.headerActions}>
          <Link to={`/scenario/${node.id}`} className={page.btn}>
            Scenario
          </Link>
          <Link to={`/assessment/${node.id}`} className={`${page.btn} ${page.btnPrimary}`}>
            Take quiz
          </Link>
        </div>
      </div>
    </div>
  )
}
