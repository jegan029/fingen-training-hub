import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ClipboardCheck, Lock, MessageSquare, Target, X, FileText } from 'lucide-react'
import type { NodeStatus, NodeSummary } from '../../types'
import NodeArticles from './NodeArticles'
import { STATUS_META, STATUS_ORDER, StatusIcon, statusForKey } from './status'
import styles from './NodeDrawer.module.css'

interface NodeDrawerProps {
  node: NodeSummary
  pathId: number
  busy: boolean
  error: string | null
  onStatus: (status: NodeStatus) => void
  onClose: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'

export default function NodeDrawer({ node, pathId, busy, error, onStatus, onClose }: NodeDrawerProps) {
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  // Move focus into the dialog when it opens (the caller restores focus on close).
  useEffect(() => {
    closeButton.current?.focus()
  }, [node.id])

  const canSet = (status: NodeStatus) => !node.locked || status === 'pending'

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'Tab' && panel.current) {
      // Keep focus inside the dialog.
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
      return
    }
    const target = e.target as HTMLElement
    if (e.ctrlKey || e.metaKey || e.altKey || target.matches('input, textarea, select')) return
    const status = statusForKey(e.key)
    if (status && !busy && canSet(status)) {
      e.preventDefault()
      onStatus(status)
    }
  }

  const chatUrl = `/chat?path=${pathId}&q=${encodeURIComponent(`Explain ${node.title} and what an L2 engineer should know about it.`)}`

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <h2 id="drawer-title" className={styles.title}>
            {node.title}
          </h2>
          <button ref={closeButton} type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden="true" />
            <kbd className={styles.kbd}>Esc</kbd>
          </button>
        </header>

        <section aria-labelledby="drawer-status" className={styles.block}>
          <h3 id="drawer-status" className={styles.label}>
            Status
          </h3>
          <div className={styles.statuses} role="group" aria-labelledby="drawer-status">
            {STATUS_ORDER.map((status) => {
              const meta = STATUS_META[status]
              return (
                <button
                  key={status}
                  type="button"
                  className={styles.statusButton}
                  data-status={status}
                  aria-pressed={node.status === status}
                  aria-keyshortcuts={meta.key}
                  disabled={busy || !canSet(status)}
                  onClick={() => onStatus(status)}
                >
                  <StatusIcon status={status} size={16} />
                  <span>{status === 'pending' ? 'Reset' : meta.label}</span>
                  <kbd className={styles.kbd}>{meta.key}</kbd>
                </button>
              )
            })}
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {node.locked && (
            <p className={styles.locked}>
              <Lock size={16} aria-hidden="true" />
              <span>
                Locked. Complete or skip {node.locked_by.join(' and ')} first. You can still read everything here.
              </span>
            </p>
          )}
        </section>

        <p className={styles.summary}>{node.description}</p>

        <nav className={styles.actions} aria-label="Topic actions">
          <Link className={styles.primary} to={`/learn/${node.id}`}>
            <BookOpen size={16} aria-hidden="true" />
            Read full lesson
          </Link>
          <Link className={styles.secondary} to={`/assessment/${node.id}`}>
            <ClipboardCheck size={16} aria-hidden="true" />
            Take assessment
          </Link>
          <Link className={styles.secondary} to={`/scenario/${node.id}`}>
            <Target size={16} aria-hidden="true" />
            Try scenario
          </Link>
          <Link className={styles.secondary} to={chatUrl}>
            <MessageSquare size={16} aria-hidden="true" />
            Ask the AI Tutor about this
          </Link>
        </nav>

        {node.prerequisites.length > 0 && (
          <section className={styles.block} aria-labelledby="drawer-prereqs">
            <h3 id="drawer-prereqs" className={styles.label}>
              Prerequisites
            </h3>
            <ul className={styles.list}>
              {node.prerequisites.map((p) => (
                <li key={p.id}>
                  <StatusIcon status={p.status} size={14} />
                  <span>{p.title}</span>
                  <span className={styles.muted}>{STATUS_META[p.status].label}</span>
                  {p.path_id !== pathId && (
                    <Link className={styles.inlineLink} to={`/roadmaps/${p.path_id}?node=${p.id}`}>
                      Other path
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {node.subtopics.length > 0 && (
          <section className={styles.block} aria-labelledby="drawer-subtopics">
            <h3 id="drawer-subtopics" className={styles.label}>
              In this topic
            </h3>
            <ul className={styles.subtopics}>
              {node.subtopics.map((s) => (
                <li key={s.id}>
                  <strong>{s.title}</strong>
                  {s.summary && <span className={styles.muted}>{s.summary}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.block} aria-labelledby="drawer-runbooks">
          <h3 id="drawer-runbooks" className={styles.label}>
            Related runbooks
          </h3>
          {node.runbooks.length > 0 ? (
            <ul className={styles.list}>
              {node.runbooks.map((r) => (
                <li key={r.id}>
                  <FileText size={14} aria-hidden="true" />
                  <Link className={styles.inlineLink} to={`/runbooks?open=${r.id}`}>
                    {r.title}
                  </Link>
                  <span className={styles.muted}>{r.category}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>
              No runbook is linked to this topic.{' '}
              <Link className={styles.inlineLink} to="/runbooks">
                Browse the runbook library
              </Link>
            </p>
          )}
        </section>

        <NodeArticles key={node.id} nodeId={node.id} />

        <p className={styles.hint}>
          Shortcuts: <kbd className={styles.kbd}>D</kbd> done, <kbd className={styles.kbd}>P</kbd> in progress,{' '}
          <kbd className={styles.kbd}>S</kbd> skip, <kbd className={styles.kbd}>R</kbd> reset,{' '}
          <kbd className={styles.kbd}>Esc</kbd> close
        </p>
      </div>
    </>
  )
}
