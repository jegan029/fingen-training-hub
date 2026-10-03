import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, CircleDot, SkipForward } from 'lucide-react'
import { ApiError, fetchRoadmapNodes, fetchRoadmaps, setNodeStatus } from '../api'
import type { LearningPath, NodeStatus, NodeSummary } from '../types'
import RoadmapCanvas from '../components/roadmap/RoadmapCanvas'
import RoadmapList from '../components/roadmap/RoadmapList'
import NodeDrawer, { type Handover } from '../components/roadmap/NodeDrawer'
import Legend from '../components/roadmap/Legend'
import UnlockCue from '../components/roadmap/UnlockCue'
import { describeChange, type StatusChange } from '../components/roadmap/statusChange'
import { meterStyle, motion, useCountUp } from '../lib/motion'
import { useMediaQuery } from '../lib/useMediaQuery'
import styles from './ModuleView.module.css'

export default function ModuleView() {
  const { pathId: pathParam } = useParams<{ pathId: string }>()
  const pathId = Number(pathParam)
  const [searchParams, setSearchParams] = useSearchParams()
  const [path, setPath] = useState<LearningPath | null>(null)
  const [nodes, setNodes] = useState<NodeSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  // The last status change: drives the completion moment and the live region announcement.
  const [change, setChange] = useState<StatusChange | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // Topics the last change unlocked; the cue offers to show them if they are out of view.
  const [pendingUnlock, setPendingUnlock] = useState<{ id: number; title: string }[]>([])
  // What to do next after a topic is marked done; stays until another topic opens or the status changes.
  const [handover, setHandover] = useState<(Handover & { nodeId: number }) | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const narrow = useMediaQuery('(max-width: 767px)')

  // The open node lives in the URL (?node=ID) so it can be linked to and closed with Back.
  const selectedId = searchParams.get('node') ? Number(searchParams.get('node')) : null
  const selected = nodes?.find((n) => n.id === selectedId) ?? null

  const loadNodes = useCallback(() => fetchRoadmapNodes(pathId).then(setNodes), [pathId])

  // The moment plays once; clearing it lets the same topic celebrate again after a reset.
  useEffect(() => {
    if (!change) return
    const timer = window.setTimeout(() => setChange(null), 1600)
    return () => window.clearTimeout(timer)
  }, [change])

  // No state reset needed when pathId changes: App remounts each page on a new pathname.
  useEffect(() => {
    fetchRoadmaps()
      .then((paths) => setPath(paths.find((p) => p.id === pathId) ?? null))
      .catch(() => {})
    loadNodes().catch((err: Error) => setLoadError(err.message || 'Could not load this path'))
  }, [pathId, loadNodes])

  const open = (nodeId: number, from: HTMLElement) => {
    opener.current = from
    setStatusError(null)
    setAnnouncement('')
    setHandover(null)
    setSearchParams({ node: String(nodeId) })
  }

  // Open the topic the handover offers. Closing it later returns focus to that topic on the roadmap.
  const openNext = (nodeId: number) => {
    setPendingUnlock([])
    const target = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)
    open(nodeId, target ?? opener.current ?? document.body)
  }

  const close = () => {
    setSearchParams({})
    // Return focus to the element that opened the drawer.
    requestAnimationFrame(() => opener.current?.focus())
  }

  const changeStatus = async (status: NodeStatus) => {
    if (!selected || !nodes || status === selected.status) return
    const before = nodes
    setBusy(true)
    setStatusError(null)
    try {
      await setNodeStatus(selected.id, status)
      const after = await fetchRoadmapNodes(pathId) // dependents may have unlocked
      setNodes(after)
      const next = describeChange(before, after, selected.id)
      setChange(next)
      if (next) setAnnouncement(next.message)
      setPendingUnlock(after.filter((n) => next?.unlockedIds.includes(n.id)).map((n) => ({ id: n.id, title: n.title })))
      setHandover(next?.status === 'done' ? toHandover(next, after, path?.title ?? 'this path') : null)
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Could not update the status')
    } finally {
      setBusy(false)
    }
  }

  const counts = { done: 0, in_progress: 0, skipped: 0 }
  nodes?.forEach((n) => {
    if (n.status in counts) counts[n.status as keyof typeof counts]++
  })
  const total = nodes?.length ?? 0
  const pct = total ? Math.round((counts.done / total) * 100) : 0

  // Completion lands as one beat: the header meter, count and percentage move when the lit connector
  // reaches the next topic (--motion-slow), not on the click. Progress bar aria values stay current.
  const landing = change?.status === 'done'
  const LAND_MS = 450
  const shownDone = useCountUp(counts.done, nodes !== null, LAND_MS, landing ? LAND_MS : 0)
  const shownPct = useCountUp(pct, nodes !== null, LAND_MS, landing ? LAND_MS : 0)

  const clearUnlock = useCallback(() => setPendingUnlock([]), [])
  // After the cue brings a topic into view, ring it again so the eye lands on it.
  const ringTopic = useCallback(
    (nodeId: number) =>
      setChange({
        nodeId: -1,
        status: 'pending',
        nextId: null,
        unlockedIds: [nodeId],
        nextUp: null,
        pathComplete: false,
        message: '',
      }),
    [],
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/roadmaps" className={styles.back}>
          <ArrowLeft size={16} aria-hidden="true" />
          All training paths
        </Link>
        <h1 className={styles.title}>{path?.title ?? 'Training path'}</h1>
        {path && <p className={styles.description}>{path.description}</p>}

        <div className={styles.progress} data-landing={landing || undefined}>
          <div className={styles.progressText}>
            <span>
              <strong>
                {shownDone} of {total}
              </strong>{' '}
              done
            </span>
            <span>{shownPct}%</span>
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label="Path progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className={styles.fill} style={meterStyle(pct)} />
          </div>
          <ul className={styles.counters} aria-label="Status counts">
            <li>
              <CheckCircle2 size={14} aria-hidden="true" />
              Done {/* Shows the old count until the beat lands, then the new one pops in. */}
              <span key={shownDone} className={landing ? `${motion.pop} ${styles.count}` : styles.count}>
                {shownDone}
              </span>
            </li>
            <li>
              <CircleDot size={14} aria-hidden="true" />
              In progress {counts.in_progress}
            </li>
            <li>
              <SkipForward size={14} aria-hidden="true" />
              Skipped {counts.skipped}
            </li>
          </ul>
          {total > 0 && counts.done === total && (
            <p className={landing ? `${styles.complete} ${motion.rise}` : styles.complete}>
              <CheckCircle2 size={16} aria-hidden="true" />
              Path complete. <Link to="/certificate">Check your certificate</Link>
            </p>
          )}
        </div>
      </header>

      {loadError && (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      )}

      {!nodes && !loadError && (
        <div className={styles.skeleton} aria-busy="true" aria-label="Loading roadmap">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={styles.skeletonNode} />
          ))}
        </div>
      )}

      {nodes && (
        <div className={styles.body}>
          <div className={styles.legend}>
            <Legend />
          </div>
          {narrow ? (
            <RoadmapList nodes={nodes} onOpen={open} change={change} />
          ) : (
            <RoadmapCanvas
              nodes={nodes}
              pathTitle={path?.title ?? 'Path'}
              selectedId={selectedId}
              onOpen={open}
              change={change}
            />
          )}
        </div>
      )}

      {pendingUnlock.length > 0 && !selected && (
        <UnlockCue
          key={pendingUnlock.map((t) => t.id).join('-')}
          topics={pendingUnlock}
          onDone={clearUnlock}
          onShow={ringTopic}
        />
      )}

      {selected && (
        <NodeDrawer
          node={selected}
          pathId={pathId}
          busy={busy}
          error={statusError}
          onStatus={changeStatus}
          onClose={close}
          announcement={announcement}
          celebrating={change?.status === 'done'}
          handover={handover?.nodeId === selected.id ? handover : null}
          onOpenNext={openNext}
        />
      )}
    </div>
  )
}

/** The drawer's handover line for a topic just marked done. */
function toHandover(change: StatusChange, nodes: NodeSummary[], pathTitle: string): Handover & { nodeId: number } {
  const nextId = change.nextUp?.id
  return {
    nodeId: change.nodeId,
    nextUp: change.nextUp,
    nextUnlocked: nextId !== undefined && change.unlockedIds.includes(nextId),
    alsoUnlocked: nodes.filter((n) => n.id !== nextId && change.unlockedIds.includes(n.id)).map((n) => n.title),
    pathComplete: change.pathComplete,
    pathTitle,
  }
}
