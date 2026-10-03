import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, FileQuestion } from 'lucide-react'
import { ApiError, documentDownloadUrl, fetchApplication } from '../api'
import type { ApplicationDetail as Detail, ArticleSummary } from '../types'
import ClassificationBadge from '../components/knowledge/ClassificationBadge'
import FileIcon from '../components/knowledge/FileIcon'
import StaleBanner from '../components/knowledge/StaleBanner'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import { formatBytes, formatDate } from '../lib/format'
import page from '../styles/page.module.css'
import styles from './Applications.module.css'

type State = { app: Detail } | { missing: true } | { error: string }

function ArticleGroup({ id, title, articles }: { id: string; title: string; articles: ArticleSummary[] }) {
  return (
    <section className={page.card} aria-labelledby={id}>
      <h2 id={id} className={page.sectionTitle}>
        {title} <span className={styles.groupCount}>{articles.length}</span>
      </h2>
      {articles.length === 0 ? (
        <p className={page.muted}>None available.</p>
      ) : (
        <ul className={styles.list}>
          {articles.map((a) => (
            <li key={a.id} className={styles.item}>
              <span className={styles.itemMain}>
                <Link to={`/knowledge/${a.id}`}>{a.title}</Link>
                <span className={styles.itemMeta}>
                  {a.kb_number} · Updated {formatDate(a.source_updated_at)}
                </span>
              </span>
              <ClassificationBadge level={a.classification} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function ApplicationDetail() {
  const { applicationId } = useParams()
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    fetchApplication(Number(applicationId))
      .then((app) => setState({ app }))
      .catch((err: Error) =>
        setState(err instanceof ApiError && err.status === 404 ? { missing: true } : { error: err.message }),
      )
  }, [applicationId])

  if (!state) {
    return (
      <div className={page.page}>
        <Skeleton height={36} width="45%" label="Loading application" />
      </div>
    )
  }
  if (!('app' in state)) {
    return (
      <div className={page.page}>
        <StateMessage
          icon={'missing' in state ? FileQuestion : undefined}
          tone={'error' in state ? 'error' : 'empty'}
          title={'missing' in state ? 'Application not available' : 'The application could not be loaded'}
          action={
            <Link to="/applications" className={page.btn}>
              All applications
            </Link>
          }
        >
          {'missing' in state ? 'No articles for it are available at your clearance.' : state.error}
        </StateMessage>
      </div>
    )
  }

  const app = state.app
  return (
    <div className={page.page}>
      <nav aria-label="Breadcrumb">
        <ol className={`${page.crumbs} ${styles.crumbs}`}>
          <li>
            <Link to="/knowledge">Knowledge Library</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to="/applications">Applications</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{app.app_number}</li>
        </ol>
      </nav>
      <header className={page.header}>
        <p className={page.eyebrow}>{app.app_number}</p>
        <h1 className={page.title}>{app.name}</h1>
        {app.description && <p className={page.lead}>{app.description}</p>}
        <p className={styles.headerLink}>
          <Link to={`/knowledge?app=${encodeURIComponent(app.app_number)}`}>Search its articles in the library</Link>
        </p>
      </header>

      <StaleBanner />

      <div className={styles.detail}>
        <ArticleGroup id="group-runbooks" title="Runbooks" articles={app.runbooks} />
        <ArticleGroup id="group-sops" title="SOPs" articles={app.sops} />
        {app.other.length > 0 && <ArticleGroup id="group-other" title="Other articles" articles={app.other} />}
        <section className={page.card} aria-labelledby="group-docs">
          <h2 id="group-docs" className={page.sectionTitle}>
            Documents <span className={styles.groupCount}>{app.documents.length}</span>
          </h2>
          {app.documents.length === 0 ? (
            <p className={page.muted}>No documents are attached to these articles.</p>
          ) : (
            <ul className={styles.list}>
              {app.documents.map((d) => (
                <li key={d.id} className={styles.item}>
                  <FileIcon contentType={d.content_type} />
                  <span className={styles.itemMain}>
                    <span>{d.file_name}</span>
                    <span className={styles.itemMeta}>
                      {formatBytes(d.size_bytes)} · from <Link to={`/knowledge/${d.article_id}`}>{d.kb_number}</Link>
                    </span>
                  </span>
                  <a href={documentDownloadUrl(d.id)} download className={`${page.btn} ${page.btnSm}`}>
                    <Download size={14} aria-hidden="true" /> Download
                    <span className={page.srOnly}> {d.file_name}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
