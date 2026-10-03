import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Lock,
  MessageSquare,
  Target,
  X,
  FileText,
} from 'lucide-react'
import type { NodeStatus, NodeSummary } from '../../types'
import TransitionLink from '../TransitionLink'
import { motion, sharedTitle } from '../../lib/motion'
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
  /** Result of the last status change ("X marked done. Y unlocked."), read out politely. */
  announcement?: string
  /** True while the roadmap plays a completion moment: the backdrop clears so it can be seen. */
  celebrating?: boolean
  /** After this topic is marked done: what comes next, shown as a visible handover line. */
  handover?: Handover | null
  /** Opens the topic the handover offers (button or the N key). */
  onOpenNext?: (nodeId: number) => void
}

export interface Handover {
  nextUp: { id: number; title: string } | null
  /** True when the next topic is one this change unlocked. */
  nextUnlocked: boolean
  /** Other topics this change unlocked, named before the next one. */
  alsoUnlocked: string[]
  pathComplete: boolean
  pathTitle: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'

export default function NodeDrawer({
  node,
  pathId,
  busy,
  error,
  onStatus,
  onClose,
  announcement = '',
  celebrating = false,
  handover = null,
  onOpenNext,
}: NodeDrawerProps) {
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  // Move focus into the dialog when it opens (the caller restores focus on close).
  useEffect(() => {
    closeButton.current?.focus()
  }, [node.id])

  // Load the lesson page's code now, so "Read full lesson" can morph the title straight into its heading.
  useEffect(() => {
    import('../../routes/NodeContentPage').catch(() => {})
  }, [])

  const title = sharedTitle(node.id)

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
    const next = handover?.nextUp
    if (next && onOpenNext && e.key.toLowerCase() === 'n') {
      e.preventDefault()
      onOpenNext(next.id)
      return
    }
    const status = statusForKey(e.key)
    if (status && !busy && canSet(status)) {
      e.preventDefault()
      onStatus(status)
    }
  }

  const chatUrl = `/chat?path=${pathId}&q=${encodeURIComponent(`Explain ${node.title} and what an L2 engineer should know about it.`)}`

  return (
    <>
      <div className={styles.backdrop} data-clear={celebrating || undefined} onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <h2 id="drawer-title" className={styles.title} {...title.props}>
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
          {/* Inside the dialog, so screen readers that ignore content outside a modal still hear it. */}
          <p className={styles.srOnly} role="status">
            {announcement}
          </p>
          {handover && (
            // The live region above already announces this; the line is for the eye and the next step.
            <div className={`${styles.handover} ${motion.rise}`}>
              <p className={styles.handoverText}>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>
                  {handover.pathComplete ? (
                    <>
                      That completes <strong>{handover.pathTitle}</strong>.
                    </>
                  ) : (
                    <>
                      Done.
                      {unlockedLine(handover.alsoUnlocked)}
                      {handover.nextUp && (
                        <>
                          {' '}
                          Next up: <strong>{handover.nextUp.title}</strong>
                          {handover.nextUnlocked && ', now unlocked'}
                        </>
                      )}
                    </>
                  )}
                </span>
              </p>
              {handover.pathComplete ? (
                <div className={styles.handoverLinks}>
                  <Link to="/certificate">Check your certificate</Link>
                  <Link to="/roadmaps">All training paths</Link>
                </div>
              ) : (
                handover.nextUp &&
                onOpenNext && (
                  <button
                    type="button"
                    className={styles.handoverButton}
                    aria-keyshortcuts="N"
                    onClick={() => onOpenNext(handover.nextUp!.id)}
                  >
                    Open next topic
                    <ArrowRight size={16} aria-hidden="true" />
                    <kbd className={styles.kbd}>N</kbd>
                  </button>
                )
              )}
            </div>
          )}
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
          <TransitionLink
            className={styles.primary}
            to={`/learn/${node.id}`}
            state={{ title: node.title }}
            waitFor={title.selector}
          >
            <BookOpen size={16} aria-hidden="true" />
            Read full lesson
          </TransitionLink>
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

/** Names one other unlocked topic; several are counted so the line stays short (the live region names them all). */
function unlockedLine(titles: string[]): string {
  if (titles.length === 0) return ''
  return titles.length === 1 ? ` ${titles[0]} unlocked.` : ` ${titles.length} more topics unlocked.`
}
