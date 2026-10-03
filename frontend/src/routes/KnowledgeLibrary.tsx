import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Boxes, SearchX } from 'lucide-react'
import { fetchArticles } from '../api'
import type { ArticleKind, ArticlePage, ArticleQuery } from '../types'
import ClassificationBadge from '../components/knowledge/ClassificationBadge'
import FilterChips from '../components/knowledge/FilterChips'
import SourceTag from '../components/knowledge/SourceTag'
import StaleBanner from '../components/knowledge/StaleBanner'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import { formatDate } from '../lib/format'
import { CLASSIFICATION_LABEL, KIND_LABEL, isClassification } from '../lib/knowledge'
import page from '../styles/page.module.css'
import styles from './KnowledgeLibrary.module.css'

const PAGE_SIZE = 20
const KINDS: ArticleKind[] = ['runbook', 'sop', 'other']
const FILTER_KEYS = ['q', 'classification', 'app', 'type', 'category', 'node'] as const

/** URL search params to an API query; unknown values are dropped rather than sent. */
function toQuery(params: URLSearchParams): ArticleQuery {
  const type = params.get('type')
  const classification = params.get('classification')
  return {
    q: params.get('q') ?? undefined,
    classification: isClassification(classification) ? classification : undefined,
    app_number: params.get('app') ?? undefined,
    article_type: KINDS.includes(type as ArticleKind) ? (type as ArticleKind) : undefined,
    category: params.get('category') ?? undefined,
    // Set by "See all" in the roadmap drawer: articles linked to one training topic.
    node_id: Number(params.get('node')) || undefined,
    sort: params.get('sort') === 'title' ? 'title' : 'updated',
    page: Math.max(1, Number(params.get('page')) || 1),
    page_size: PAGE_SIZE,
  }
}

interface Result {
  key: string
  data?: ArticlePage
  error?: string
}

export default function KnowledgeLibrary() {
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState(() => params.get('q') ?? '')
  const [result, setResult] = useState<Result | null>(null)
  const [lastData, setLastData] = useState<ArticlePage | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = `${params.toString()}#${attempt}`

  useEffect(() => {
    let alive = true
    fetchArticles(toQuery(new URLSearchParams(key.split('#')[0])))
      .then((data) => {
        if (!alive) return
        setResult({ key, data })
        setLastData(data)
      })
      .catch((err: Error) => alive && setResult({ key, error: err.message || 'Could not load articles' }))
    return () => {
      alive = false
    }
  }, [key])

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [name, value] of Object.entries(changes)) {
            if (value) next.set(name, value)
            else next.delete(name)
          }
          if (!('page' in changes)) next.delete('page') // a new filter starts at page 1
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  // Debounced search: the URL (and the request) follow the box 300 ms after typing stops.
  const committedQ = params.get('q') ?? ''
  useEffect(() => {
    if (draft.trim() === committedQ) return
    const timer = window.setTimeout(() => update({ q: draft.trim() || null }), 300)
    return () => window.clearTimeout(timer)
  }, [draft, committedQ, update])

  const loading = result?.key !== key
  const data = loading ? lastData : (result?.data ?? null)
  const error = !loading ? result?.error : undefined
  const query = toQuery(params)
  const hasFilters = FILTER_KEYS.some((k) => params.get(k))
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const first = data && data.total ? (data.page - 1) * PAGE_SIZE + 1 : 0
  const last = data ? Math.min(data.total, data.page * PAGE_SIZE) : 0

  const clearFilters = () => {
    setDraft('')
    setParams(new URLSearchParams(params.get('sort') ? { sort: params.get('sort')! } : {}), { replace: true })
  }

  return (
    <div className={page.page}>
      <header className={`${page.header} ${styles.header}`}>
        <div>
          <p className={page.eyebrow}>Runbooks and SOPs from ServiceNow</p>
          <h1 className={page.title}>Knowledge Library</h1>
          <p className={page.lead}>
            The current, approved versions of support articles, synced from ServiceNow. You only see what your clearance
            allows.
          </p>
        </div>
        <Link to="/applications" className={page.btn}>
          <Boxes size={16} aria-hidden="true" /> Browse by application
        </Link>
      </header>

      <StaleBanner />

      <section className={styles.filters} aria-label="Search and filters">
        <div className={styles.searchRow}>
          <label className={page.srOnly} htmlFor="kb-search">
            Search articles
          </label>
          <input
            id="kb-search"
            type="search"
            className={`${page.input} ${styles.search}`}
            placeholder="Search by title, KB number or text"
            value={draft}
            maxLength={100}
            onChange={(e) => setDraft(e.target.value)}
          />
          <label className={styles.sortLabel} htmlFor="kb-sort">
            Sort by
          </label>
          <select
            id="kb-sort"
            className={`${page.input} ${styles.sort}`}
            value={query.sort}
            onChange={(e) => update({ sort: e.target.value === 'title' ? 'title' : null })}
          >
            <option value="updated">Last updated</option>
            <option value="title">Title</option>
          </select>
        </div>

        {data && (
          <div className={styles.groups}>
            <FilterGroup title="Classification">
              <FilterChips
                label="Classification"
                selected={query.classification ?? null}
                onChange={(v) => update({ classification: v })}
                options={data.facets.classifications.map((f) => ({
                  value: f.value,
                  label: isClassification(f.value) ? CLASSIFICATION_LABEL[f.value] : f.label,
                  count: f.count,
                }))}
              />
            </FilterGroup>
            <FilterGroup title="Application">
              <FilterChips
                label="Application"
                selected={query.app_number ?? null}
                onChange={(v) => update({ app: v })}
                options={data.facets.applications.map((f) => ({
                  value: f.value,
                  label: `${f.value} ${f.label}`,
                  count: f.count,
                }))}
              />
            </FilterGroup>
            <FilterGroup title="Type">
              <FilterChips
                label="Type"
                selected={query.article_type ?? null}
                onChange={(v) => update({ type: v })}
                options={data.facets.kinds.map((f) => ({
                  value: f.value,
                  label: KIND_LABEL[f.value as ArticleKind] ?? f.label,
                  count: f.count,
                }))}
              />
            </FilterGroup>
            <FilterGroup title="Category">
              <FilterChips
                label="Category"
                selected={query.category ?? null}
                onChange={(v) => update({ category: v })}
                options={data.facets.categories}
              />
            </FilterGroup>
          </div>
        )}
      </section>

      {error ? (
        <StateMessage
          tone="error"
          title="Articles could not be loaded"
          action={
            <button type="button" className={page.btn} onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          }
        >
          {error}
        </StateMessage>
      ) : !data ? (
        <Skeleton lines={6} height={84} label="Loading articles" />
      ) : (
        <div aria-busy={loading}>
          <p className={styles.count} role="status">
            {data.total === 0
              ? 'No articles'
              : `Showing ${first} to ${last} of ${data.total} article${data.total === 1 ? '' : 's'}`}
            {query.node_id && (
              <>
                {' '}
                linked to one training topic.{' '}
                <button type="button" className={styles.linkButton} onClick={() => update({ node: null })}>
                  Show all topics
                </button>
              </>
            )}
          </p>
          {data.items.length === 0 ? (
            <StateMessage
              icon={SearchX}
              title="No articles match these filters"
              action={
                hasFilters && (
                  <button type="button" className={page.btn} onClick={clearFilters}>
                    Clear filters
                  </button>
                )
              }
            >
              {hasFilters
                ? 'Try fewer filters or a different search.'
                : 'Nothing has been synced from ServiceNow yet, or nothing is available at your clearance.'}
            </StateMessage>
          ) : (
            <ul className={`${styles.results} ${loading ? styles.stale : ''}`}>
              {data.items.map((a) => (
                <li key={a.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.meta}>
                      <span className={styles.kb}>{a.kb_number}</span>
                      <span aria-hidden="true">·</span>
                      <span>{KIND_LABEL[a.kind]}</span>
                      {a.category && a.category !== KIND_LABEL[a.kind] && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{a.category}</span>
                        </>
                      )}
                    </p>
                    <h2 className={styles.rowTitle}>
                      <Link to={`/knowledge/${a.id}`}>{a.title}</Link>
                    </h2>
                    {a.summary && <p className={styles.summary}>{a.summary}</p>}
                    {a.applications.length > 0 && (
                      <p className={styles.apps}>
                        <span className={page.srOnly}>Applications: </span>
                        {a.applications.map((app) => (
                          <span key={app.id} className={styles.app}>
                            {app.app_number} {app.name}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className={styles.rowSide}>
                    <ClassificationBadge level={a.classification} />
                    <SourceTag source="servicenow" />
                    <span className={styles.updated}>Updated {formatDate(a.source_updated_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <nav className={styles.pager} aria-label="Pages">
              <button
                type="button"
                className={page.btn}
                disabled={data.page <= 1}
                onClick={() => update({ page: String(data.page - 1) })}
              >
                Previous
              </button>
              <span className={styles.pageInfo}>
                Page {data.page} of {pages}
              </span>
              <button
                type="button"
                className={page.btn}
                disabled={data.page >= pages}
                onClick={() => update({ page: String(data.page + 1) })}
              >
                Next
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.group}>
      <p className={styles.groupTitle} aria-hidden="true">
        {title}
      </p>
      {children}
    </div>
  )
}
