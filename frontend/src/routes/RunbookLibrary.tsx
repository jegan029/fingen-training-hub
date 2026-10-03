import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, SearchX, X } from 'lucide-react'
import { fetchRunbooks } from '../api'
import type { Runbook } from '../types'
import ClassificationBadge from '../components/knowledge/ClassificationBadge'
import SourceTag from '../components/knowledge/SourceTag'
import { formatDate } from '../lib/format'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import page from '../styles/page.module.css'
import styles from './RunbookLibrary.module.css'

const CATEGORIES = ['All', 'Transactions', 'Account & User', 'Batch & Reporting', 'Integration', 'Incident Management']

type SourceFilter = 'all' | Runbook['source']

const SOURCES: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'local', label: 'Training Hub' },
  { value: 'servicenow', label: 'ServiceNow' },
]

const CATEGORY_BADGE: Record<string, string> = {
  Transactions: page.badgeAccent,
  'Account & User': page.badgeSuccess,
  'Batch & Reporting': page.badgeWarning,
  'Incident Management': page.badgeDanger,
}

function CategoryBadge({ category }: { category: string }) {
  return <span className={`${page.badge} ${CATEGORY_BADGE[category] ?? ''}`}>{category}</span>
}

function RunbookDialog({ runbook, onClose }: { runbook: Runbook; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  // A modal <dialog> traps focus, closes on Esc and makes the page behind it inert. No close() on cleanup:
  // unmounting removes it from the top layer anyway, and close() would fire onClose (and clear ?open=)
  // during React's development double mount.
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal?.()
  }, [])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="runbook-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.dialogInner}>
        <div className={styles.dialogHead}>
          <div>
            <CategoryBadge category={runbook.category} />
            <h2 id="runbook-title" className={styles.dialogTitle}>
              {runbook.title}
            </h2>
            <p className={styles.meta}>
              {runbook.version} · Updated {runbook.updated} · Status:{' '}
              <strong className={styles.approved}>Approved</strong>
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close runbook">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.dialogBody}>
          <p className={styles.description}>{runbook.description}</p>

          <section className={`${styles.box} ${styles.pre}`}>
            <h3 className={styles.boxTitle}>Preconditions</h3>
            <ul>
              {runbook.preconditions.map((pc, i) => (
                <li key={i}>{pc}</li>
              ))}
            </ul>
          </section>

          <h3 className={styles.procedure}>Procedure</h3>
          <ol className={styles.steps}>
            {runbook.steps.map((step, i) => (
              <li key={i}>
                {step.includes('\n') ? <pre className={styles.code}>{step.replace(/^[^:]+:\s*/, '')}</pre> : step}
              </li>
            ))}
          </ol>

          <section className={`${styles.box} ${styles.escalate}`}>
            <h3 className={styles.boxTitle}>Escalation triggers</h3>
            <ul>
              {runbook.escalation_triggers.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>

          <section className={styles.rollback}>
            <h3 className={styles.boxTitle}>Rollback</h3>
            <p>
              If any step produces an unexpected result, stop immediately. Do not improvise. Escalate to L3 Engineering
              with the step number, the expected outcome and the actual outcome documented.
            </p>
          </section>
        </div>

        <div className={styles.dialogFoot}>
          <button type="button" className={`${page.btn} ${page.btnPrimary}`} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  )
}

export default function RunbookLibrary() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [activeSource, setActiveSource] = useState<SourceFilter>('all')
  const [search, setSearch] = useState('')
  const [runbooks, setRunbooks] = useState<Runbook[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    fetchRunbooks()
      .then(setRunbooks)
      .catch((err: Error) => setLoadError(err.message || 'Could not load runbooks'))
  }, [])

  // The open runbook lives in ?open=<id>, so the roadmap drawer and search can deep link to it.
  const openId = Number(searchParams.get('open'))
  const openRunbook = runbooks?.find((r) => r.id === openId) ?? null
  const setOpen = (id: number | null) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id) next.set('open', String(id))
      else next.delete('open')
      return next
    })

  const q = search.trim().toLowerCase()
  const list = runbooks ?? []
  // ServiceNow runbooks bring their own categories (Runbook, SOP); add them after the local ones.
  const categories = [...CATEGORIES, ...new Set(list.map((r) => r.category).filter((c) => !CATEGORIES.includes(c)))]
  const filtered = list.filter((r) => {
    const matchCat = activeCategory === 'All' || r.category === activeCategory
    const matchSource = activeSource === 'all' || r.source === activeSource
    const matchSearch = !q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
    return matchCat && matchSource && matchSearch
  })

  // ServiceNow runbooks are read only articles: an old ?open= link goes to the article page instead.
  if (openRunbook?.source === 'servicenow' && openRunbook.kb_article_id) {
    return <Navigate to={`/knowledge/${openRunbook.kb_article_id}`} replace />
  }

  return (
    <div className={page.page}>
      <header className={page.header}>
        <h1 className={page.title}>Runbook library</h1>
        <p className={page.lead}>
          Approved operational runbooks for L2 support engineers on the Fingen platform, including runbooks and SOPs
          synced from ServiceNow. Always use the latest approved version.
        </p>
      </header>

      <div className={styles.filters}>
        <input
          type="search"
          className={`${page.input} ${styles.search}`}
          placeholder="Search runbooks"
          aria-label="Search runbooks"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.chips} role="group" aria-label="Category">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={styles.chip}
              aria-pressed={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className={styles.chips} role="group" aria-label="Source">
          {SOURCES.map((src) => (
            <button
              key={src.value}
              type="button"
              className={styles.chip}
              aria-pressed={activeSource === src.value}
              onClick={() => setActiveSource(src.value)}
            >
              {src.label}
            </button>
          ))}
        </div>
      </div>

      {loadError ? (
        <StateMessage
          tone="error"
          title="Runbooks could not be loaded"
          action={
            <button type="button" className={page.btn} onClick={() => window.location.reload()}>
              Try again
            </button>
          }
        >
          {loadError}
        </StateMessage>
      ) : !runbooks ? (
        <div className={styles.grid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={170} label="Loading runbooks" />
          ))}
        </div>
      ) : (
        <>
          <p className={styles.count} role="status">
            Showing {filtered.length} of {list.length} runbooks
          </p>
          {filtered.length === 0 ? (
            <StateMessage
              icon={SearchX}
              title="No runbooks match"
              action={
                <button
                  type="button"
                  className={page.btn}
                  onClick={() => {
                    setSearch('')
                    setActiveCategory('All')
                    setActiveSource('all')
                  }}
                >
                  Clear filters
                </button>
              }
            >
              Try a different word, or search every category.
            </StateMessage>
          ) : (
            <div className={styles.grid}>
              {filtered.map((rb) => (
                <article key={rb.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <CategoryBadge category={rb.category} />
                    <span className={styles.version}>{rb.version}</span>
                  </div>
                  <h2 className={styles.cardTitle}>{rb.title}</h2>
                  <p className={styles.cardDesc}>{rb.description}</p>
                  <div className={styles.cardTags}>
                    <SourceTag source={rb.source} />
                    <ClassificationBadge level={rb.classification} />
                  </div>
                  <div className={styles.cardFoot}>
                    <span className={styles.version}>
                      Updated {rb.source === 'servicenow' ? formatDate(rb.updated) : rb.updated}
                    </span>
                    {rb.source === 'servicenow' && rb.kb_article_id ? (
                      <Link
                        to={`/knowledge/${rb.kb_article_id}`}
                        className={`${page.btn} ${page.btnPrimary} ${page.btnSm}`}
                      >
                        Open article <span className={page.srOnly}>{rb.title}</span>{' '}
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={`${page.btn} ${page.btnPrimary} ${page.btnSm}`}
                        onClick={() => setOpen(rb.id)}
                      >
                        View <span className={page.srOnly}>{rb.title}</span> <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {openRunbook && <RunbookDialog key={openRunbook.id} runbook={openRunbook} onClose={() => setOpen(null)} />}
    </div>
  )
}
