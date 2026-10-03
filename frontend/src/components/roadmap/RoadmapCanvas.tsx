import { useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { NodeSummary } from '../../types'
import { layoutRoadmap } from './layout'
import { StatusIcon, statusText } from './status'
import type { StatusChange } from './statusChange'
import motion from '../../styles/motion.module.css'
import styles from './RoadmapCanvas.module.css'

interface RoadmapCanvasProps {
  nodes: NodeSummary[]
  pathTitle: string
  selectedId: number | null
  onOpen: (nodeId: number, opener: HTMLElement) => void
  /** The status change that just happened, if any: plays the completion moment once. */
  change?: StatusChange | null
}

/** Where an element sits down the canvas (0 to 1), so it arrives as the connectors draw past it. */
function arrival(y: number, height: number): CSSProperties {
  return { '--at': (y / height).toFixed(3) } as CSSProperties
}

function celebration(change: StatusChange | null | undefined, nodeId: number): 'done' | 'unlocked' | undefined {
  if (!change) return undefined
  if (change.nodeId === nodeId && change.status === 'done') return 'done'
  return change.unlockedIds.includes(nodeId) ? 'unlocked' : undefined
}

/**
 * 2D roadmap: main topics on a central spine, subtopics branching left and right.
 * Keyboard: the topics form one tab stop; arrow keys move between them, Home/End jump, Enter opens.
 * Motion: on first render the connectors draw in from the top and each topic arrives as they reach it;
 * a topic marked done lights its connector to the next one, and newly unlocked topics ring once.
 */
export default function RoadmapCanvas({ nodes, pathTitle, selectedId, onOpen, change }: RoadmapCanvasProps) {
  const layout = useMemo(() => layoutRoadmap(nodes), [nodes])
  const maskId = `roadmap-reveal-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [focusIndex, setFocusIndex] = useState(0)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  // Prerequisite arcs show for the node being pointed at, focused, or open in the drawer.
  const activeId = hoverId ?? focusedId ?? selectedId

  const moveFocus = (index: number) => {
    const next = Math.max(0, Math.min(nodes.length - 1, index))
    setFocusIndex(next)
    buttons.current[next]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const keys: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: nodes.length - 1,
    }
    if (e.key in keys) {
      e.preventDefault()
      moveFocus(keys[e.key])
    }
  }

  return (
    <div className={styles.scroller}>
      <p id="roadmap-help" className={styles.srOnly}>
        Use the arrow keys to move between topics and Enter to open a topic.
      </p>
      <div
        className={styles.canvas}
        style={{ width: layout.width, height: layout.height }}
        role="group"
        aria-label={`${pathTitle} roadmap`}
        aria-describedby="roadmap-help"
      >
        <svg className={styles.lines} width={layout.width} height={layout.height} aria-hidden="true" focusable="false">
          <defs>
            {/* A white sheet slides down through the mask, so lines (dashed ones included) draw top to bottom. */}
            <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={layout.width} height={layout.height}>
              <rect className={styles.curtain} width={layout.width} height={layout.height} fill="white" />
            </mask>
          </defs>
          <g mask={`url(#${maskId})`}>
            {layout.edges.map((edge) => {
              if (edge.kind === 'dependency' && edge.to !== activeId) return null
              return <path key={edge.id} d={edge.d} className={styles[edge.kind]} />
            })}
            {/* The spine below each done topic is lit; the one just completed draws down to the next topic. */}
            {layout.nodes.slice(0, -1).map((box, i) => {
              if (byId.get(box.id)?.status !== 'done') return null
              const next = layout.nodes[i + 1]
              const top = box.y + box.h
              const drawing = change?.status === 'done' && change.nodeId === box.id && change.nextId === next.id
              return (
                <rect
                  key={`lit-${box.id}`}
                  className={styles.lit}
                  data-draw={drawing || undefined}
                  x={layout.centerX - 2}
                  y={top}
                  width={4}
                  height={next.y - top}
                  rx={2}
                />
              )
            })}
          </g>
        </svg>

        {layout.sections.map((section) => (
          <div
            key={section.text}
            className={styles.section}
            style={{ top: section.y, left: layout.centerX, ...arrival(section.y, layout.height) }}
          >
            {section.text}
          </div>
        ))}

        {layout.subtopics.map((sub) => {
          const parent = byId.get(sub.nodeId)!
          return (
            <button
              key={sub.id}
              type="button"
              tabIndex={-1}
              className={styles.sub}
              data-status={parent.status}
              style={{ left: sub.x, top: sub.y, width: sub.w, height: sub.h, ...arrival(sub.y, layout.height) }}
              title={sub.summary || sub.title}
              onClick={(e) => onOpen(sub.nodeId, e.currentTarget)}
              onMouseEnter={() => setHoverId(sub.nodeId)}
              onMouseLeave={() => setHoverId(null)}
            >
              <span className={styles.subTitle}>{sub.title}</span>
            </button>
          )
        })}

        {layout.nodes.map((box) => {
          const node = byId.get(box.id)!
          const label = statusText(node.status, node.locked)
          const lockHint = node.locked ? `Complete ${node.locked_by.join(' and ')} first` : undefined
          const celebrate = celebration(change, node.id)
          return (
            <button
              key={node.id}
              ref={(el) => {
                buttons.current[box.index] = el
              }}
              type="button"
              tabIndex={box.index === focusIndex ? 0 : -1}
              className={styles.main}
              data-status={node.status}
              data-locked={node.locked || undefined}
              data-selected={selectedId === node.id || undefined}
              data-celebrate={celebrate}
              style={{ left: box.x, top: box.y, width: box.w, height: box.h, ...arrival(box.y, layout.height) }}
              aria-label={`${box.index + 1}. ${node.title}, ${label}${lockHint ? `. ${lockHint}` : ''}`}
              title={lockHint}
              onClick={(e) => onOpen(node.id, e.currentTarget)}
              onKeyDown={(e) => onKeyDown(e, box.index)}
              onFocus={() => {
                setFocusIndex(box.index)
                setFocusedId(node.id)
              }}
              onBlur={() => setFocusedId(null)}
              onMouseEnter={() => setHoverId(node.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              {/* Keyed by status so the new icon pops in when the state changes. */}
              <span
                key={`${node.status}-${node.locked}`}
                className={`${styles.icon} ${celebrate ? motion.pop : ''}`}
                data-celebrate={celebrate}
              >
                <StatusIcon status={node.status} locked={node.locked} size={18} />
              </span>
              <span className={styles.mainTitle}>{node.title}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
