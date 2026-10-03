import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Boxes,
  FileText,
  GitBranch,
  ListTree,
  Paperclip,
  Search,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import { searchAll } from '../api'
import type { SearchResult } from '../types'
import styles from './CommandPalette.module.css'

type Item = Pick<SearchResult, 'id' | 'title' | 'subtitle' | 'url'> & { kind: SearchResult['kind'] | 'page' }

const PAGES: Item[] = [
  { kind: 'page', id: 'page-roadmaps', title: 'Training paths', subtitle: 'Go to', url: '/roadmaps' },
  { kind: 'page', id: 'page-runbooks', title: 'Runbook library', subtitle: 'Go to', url: '/runbooks' },
  { kind: 'page', id: 'page-chat', title: 'AI Tutor', subtitle: 'Go to', url: '/chat' },
  { kind: 'page', id: 'page-certificate', title: 'Certificate', subtitle: 'Go to', url: '/certificate' },
]

const ICONS: Record<Item['kind'], LucideIcon> = {
  page: ArrowRight,
  path: Waypoints,
  node: GitBranch,
  subtopic: ListTree,
  runbook: FileText,
  article: BookOpen,
  application: Boxes,
  document: Paperclip,
}

const KIND_LABEL: Record<Item['kind'], string> = {
  page: 'Page',
  path: 'Path',
  node: 'Topic',
  subtopic: 'Subtopic',
  runbook: 'Runbook',
  article: 'Article',
  application: 'Application',
  document: 'Document',
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Ctrl+K / Cmd+K search across paths, topics, subtopics and runbooks (ARIA combobox + listbox). */
export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The latest server reply, tagged with the query it answers; anything older is ignored.
  const [reply, setReply] = useState<{ query: string; results: SearchResult[]; failed: boolean } | null>(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const listId = useId()
  const optionId = (i: number) => `${listId}-opt-${i}`

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }, [])

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const q = query.trim()
  const searching = q.length >= 2
  const current = searching && reply?.query === q ? reply : null
  const loading = searching && !current
  const failed = !!current?.failed

  // Debounced server search.
  useEffect(() => {
    if (!searching) return
    const timer = window.setTimeout(() => {
      searchAll(q)
        .then((results) => setReply({ query: q, results, failed: false }))
        .catch(() => setReply({ query: q, results: [], failed: true }))
    }, 150)
    return () => window.clearTimeout(timer)
  }, [q, searching])

  const items = useMemo<Item[]>(() => {
    const lower = q.toLowerCase()
    const pages = lower ? PAGES.filter((p) => p.title.toLowerCase().includes(lower)) : PAGES
    return [...pages, ...(current?.results ?? [])]
  }, [q, current])
  const activeIndex = Math.min(active, Math.max(0, items.length - 1))

  const choose = (item: Item | undefined) => {
    if (!item) return
    setOpen(false)
    setQuery('')
    navigate(item.url)
  }

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(items.length ? (activeIndex + 1) % items.length : 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(items.length ? (activeIndex - 1 + items.length) % items.length : 0)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(Math.max(0, items.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(items[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      // Focus stays in the dialog: the input is its only control.
      e.preventDefault()
    }
  }

  const activeId = items.length ? optionId(activeIndex) : undefined
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  const status = loading
    ? 'Searching'
    : failed
      ? 'Search is unavailable right now'
      : current && current.results.length === 0
        ? `No matches for "${q}"`
        : ''

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="Search"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search size={16} aria-hidden="true" />
        <span className={styles.triggerText}>Search</span>
        <kbd className={styles.kbd}>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      {open && (
        <div
          className={styles.overlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Search the training hub">
            <div className={styles.inputRow}>
              <Search size={18} aria-hidden="true" className={styles.inputIcon} />
              <input
                ref={inputRef}
                className={styles.input}
                role="combobox"
                aria-expanded={items.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                aria-label="Search paths, topics and runbooks"
                placeholder="Search paths, topics and runbooks"
                value={query}
                maxLength={100}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onInputKey}
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className={styles.kbd}>Esc</kbd>
            </div>

            <ul id={listId} role="listbox" aria-label="Results" className={styles.list}>
              {items.map((item, i) => {
                const Icon = ICONS[item.kind]
                return (
                  <li
                    key={item.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={styles.option}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(item)}
                  >
                    <span className={styles.optionIcon}>
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className={styles.optionText}>
                      <span className={styles.optionTitle}>{item.title}</span>
                      <span className={styles.optionSub}>{item.subtitle}</span>
                    </span>
                    <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
                  </li>
                )
              })}
            </ul>

            <p className={styles.status} role="status" aria-live="polite">
              {status}
            </p>

            <div className={styles.footer} aria-hidden="true">
              <span>
                <kbd className={styles.kbd}>↑</kbd> <kbd className={styles.kbd}>↓</kbd> to move
              </span>
              <span>
                <kbd className={styles.kbd}>Enter</kbd> to open
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
