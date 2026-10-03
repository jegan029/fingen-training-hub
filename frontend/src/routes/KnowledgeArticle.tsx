import { useEffect, useId, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, ExternalLink, FileQuestion, GitBranch, MessageSquare, Link2 } from 'lucide-react'
import { ApiError, documentDownloadUrl, fetchArticle } from '../api'
import type { ArticleDetail } from '../types'
import Markdown from '../components/Markdown'
import ClassificationBadge from '../components/knowledge/ClassificationBadge'
import FileIcon from '../components/knowledge/FileIcon'
import SourceTag from '../components/knowledge/SourceTag'
import StaleBanner from '../components/knowledge/StaleBanner'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import { formatBytes, formatDate, formatDateTime } from '../lib/format'
import { CLASSIFICATION_LABEL, KIND_LABEL } from '../lib/knowledge'
import page from '../styles/page.module.css'
import styles from './KnowledgeArticle.module.css'

type State = { article: ArticleDetail } | { missing: true } | { error: string }

export default function KnowledgeArticle() {
  const { articleId } = useParams()
  const [state, setState] = useState<State | null>(null)
  const tutorHint = useId()

  // The page remounts per URL (ErrorBoundary keyed by pathname), so no reset is needed here.
  useEffect(() => {
    fetchArticle(Number(articleId))
      .then((article) => setState({ article }))
      .catch((err: Error) =>
        setState(err instanceof ApiError && err.status === 404 ? { missing: true } : { error: err.message }),
      )
  }, [articleId])

  if (!state) {
    return (
      <div className={page.page}>
        <Skeleton height={36} width="60%" label="Loading article" />
        <div className={styles.loadingBody}>
          <Skeleton lines={8} height={18} label="Loading article" />
        </div>
      </div>
    )
  }

  if ('missing' in state || 'error' in state) {
    return (
      <div className={page.page}>
        <StateMessage
          icon={'missing' in state ? FileQuestion : undefined}
          tone={'error' in state ? 'error' : 'empty'}
          title={'missing' in state ? 'Article not available' : 'The article could not be loaded'}
          action={
            <Link to="/knowledge" className={page.btn}>
              Back to the Knowledge Library
            </Link>
          }
        >
          {'missing' in state
            ? 'It does not exist, it was retired in ServiceNow, or it is not available at your clearance.'
            : state.error}
        </StateMessage>
      </div>
    )
  }

  const a = state.article
  return (
    <div className={page.page}>
      <nav aria-label="Breadcrumb">
        <ol className={`${page.crumbs} ${styles.crumbs}`}>
          <li>
            <Link to="/knowledge">Knowledge Library</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{a.kb_number}</li>
        </ol>
      </nav>

      <header className={page.header}>
        <div className={styles.tags}>
          <ClassificationBadge level={a.classification} />
          <SourceTag source="servicenow" />
          <span className={`${page.badge}`}>{KIND_LABEL[a.kind]}</span>
        </div>
        <h1 className={page.title}>{a.title}</h1>
        {a.summary && <p className={page.lead}>{a.summary}</p>}
      </header>

      <StaleBanner />

      <div className={styles.actions}>
        {a.llm_allowed ? (
          <Link to={`/chat?article=${a.id}`} className={`${page.btn} ${page.btnPrimary}`}>
            <MessageSquare size={16} aria-hidden="true" /> Ask the AI Tutor about this
          </Link>
        ) : (
          <>
            <button type="button" className={`${page.btn} ${page.btnPrimary}`} disabled aria-describedby={tutorHint}>
              <MessageSquare size={16} aria-hidden="true" /> Ask the AI Tutor about this
            </button>
            <p id={tutorHint} className={styles.hint}>
              {CLASSIFICATION_LABEL[a.classification]} articles are never sent to the AI Tutor, so it cannot answer
              questions about this one.
            </p>
          </>
        )}
        {a.source_url && (
          <a href={a.source_url} target="_blank" rel="noopener noreferrer" className={page.btn}>
            <ExternalLink size={16} aria-hidden="true" /> View in ServiceNow{' '}
            <span className={page.srOnly}>(opens in a new tab)</span>
          </a>
        )}
      </div>

      <div className={styles.layout}>
        <article className={`${page.card} ${styles.body}`} aria-label="Article">
          {a.body_markdown ? (
            <Markdown className="md-lesson">{a.body_markdown}</Markdown>
          ) : (
            <p className={page.muted}>This article has no body text. See its documents or open it in ServiceNow.</p>
          )}
        </article>

        <aside className={styles.side} aria-label="Article details">
          <section className={page.card}>
            <h2 className={page.sectionTitle}>Details</h2>
            <dl className={styles.meta}>
              <dt>KB number</dt>
              <dd className={styles.mono}>{a.kb_number}</dd>
              <dt>Version</dt>
              <dd>{a.version || 'Not set'}</dd>
              <dt>Classification</dt>
              <dd>
                <ClassificationBadge level={a.classification} />
              </dd>
              <dt>Applications</dt>
              <dd>
                {a.applications.length === 0 ? (
                  'None'
                ) : (
                  <ul className={styles.plainList}>
                    {a.applications.map((app) => (
                      <li key={app.id}>
                        <Link to={`/applications/${app.id}`}>
                          <span className={styles.mono}>{app.app_number}</span> {app.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
              {a.knowledge_base && (
                <>
                  <dt>Knowledge base</dt>
                  <dd>{a.knowledge_base}</dd>
                </>
              )}
              {a.category && (
                <>
                  <dt>Category</dt>
                  <dd>{a.category}</dd>
                </>
              )}
              <dt>Updated in ServiceNow</dt>
              <dd>{formatDate(a.source_updated_at)}</dd>
              <dt>Last synced</dt>
              <dd>{formatDateTime(a.synced_at)}</dd>
            </dl>
          </section>

          <section className={page.card} aria-labelledby="docs-title">
            <h2 id="docs-title" className={page.sectionTitle}>
              Documents
            </h2>
            {a.documents.length === 0 ? (
              <p className={page.muted}>No documents are attached.</p>
            ) : (
              <ul className={styles.docs}>
                {a.documents.map((d) => (
                  <li key={d.id} className={styles.doc}>
                    <FileIcon contentType={d.content_type} />
                    <span className={styles.docName}>
                      {d.file_name}
                      <span className={styles.docSize}>{formatBytes(d.size_bytes)}</span>
                    </span>
                    <a href={documentDownloadUrl(d.id)} download className={`${page.btn} ${page.btnSm}`}>
                      <Download size={14} aria-hidden="true" /> Download{' '}
                      <span className={page.srOnly}>{d.file_name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {a.linked_articles.length > 0 && (
            <section className={page.card} aria-labelledby="linked-title">
              <h2 id="linked-title" className={page.sectionTitle}>
                Linked articles
              </h2>
              <ul className={styles.links}>
                {a.linked_articles.map((l) => (
                  <li key={l.id}>
                    <Link2 size={14} aria-hidden="true" />
                    <Link to={`/knowledge/${l.id}`}>
                      <span className={styles.mono}>{l.kb_number}</span> {l.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={page.card} aria-labelledby="nodes-title">
            <h2 id="nodes-title" className={page.sectionTitle}>
              Related training topics
            </h2>
            {a.related_nodes.length === 0 ? (
              <p className={page.muted}>Not linked to a training topic yet.</p>
            ) : (
              <ul className={styles.links}>
                {a.related_nodes.map((n) => (
                  <li key={n.id}>
                    <GitBranch size={14} aria-hidden="true" />
                    <Link to={`/roadmaps/${n.path_id}?node=${n.id}`}>{n.title}</Link>
                    <span className={styles.sub}>{n.path_title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
