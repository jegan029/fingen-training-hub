import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { fetchArticles } from '../../api'
import type { ArticlePage } from '../../types'
import ClassificationBadge from '../knowledge/ClassificationBadge'
import styles from './NodeDrawer.module.css'

const LIMIT = 5

/**
 * Knowledge articles linked to a roadmap topic (by application, by mapping keyword or by an admin).
 * The server only returns articles within the learner's clearance. Mount with key={nodeId}.
 */
export default function NodeArticles({ nodeId }: { nodeId: number }) {
  const [page, setPage] = useState<ArticlePage | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchArticles({ node_id: nodeId, page_size: LIMIT, sort: 'title' })
      .then(setPage)
      .catch(() => setFailed(true))
  }, [nodeId])

  return (
    <section className={styles.block} aria-labelledby="drawer-articles">
      <h3 id="drawer-articles" className={styles.label}>
        Knowledge articles
      </h3>
      {failed ? (
        <p className={styles.muted}>Knowledge articles could not be loaded.</p>
      ) : !page ? (
        <p className={styles.muted} role="status">
          Loading articles…
        </p>
      ) : page.items.length === 0 ? (
        <p className={styles.muted}>
          No knowledge article is linked to this topic.{' '}
          <Link className={styles.inlineLink} to="/knowledge">
            Browse the Knowledge Library
          </Link>
        </p>
      ) : (
        <>
          <ul className={styles.list}>
            {page.items.map((a) => (
              <li key={a.id}>
                <BookOpen size={14} aria-hidden="true" />
                <Link className={styles.inlineLink} to={`/knowledge/${a.id}`}>
                  {a.title}
                </Link>
                <ClassificationBadge level={a.classification} />
              </li>
            ))}
          </ul>
          {page.total > LIMIT && (
            <p className={styles.muted}>
              <Link className={styles.inlineLink} to={`/knowledge?node=${nodeId}`}>
                See all {page.total} articles
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  )
}
