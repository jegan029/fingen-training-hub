import { useMemo, useRef, useState } from 'react'
import type { NodeSummary } from '../../types'
import { layoutRoadmap } from './layout'
import { StatusIcon, statusText } from './status'
import styles from './RoadmapCanvas.module.css'

interface RoadmapCanvasProps {
  nodes: NodeSummary[]
  pathTitle: string
  selectedId: number | null
  onOpen: (nodeId: number, opener: HTMLElement) => void
}

/**
 * 2D roadmap: main topics on a central spine, subtopics branching left and right.
 * Keyboard: the topics form one tab stop; arrow keys move between them, Home/End jump, Enter opens.
 */
export default function RoadmapCanvas({ nodes, pathTitle, selectedId, onOpen }: RoadmapCanvasProps) {
  const layout = useMemo(() => layoutRoadmap(nodes), [nodes])
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
          {layout.edges.map((edge) => {
            if (edge.kind === 'dependency' && edge.to !== activeId) return null
            return <path key={edge.id} d={edge.d} className={styles[edge.kind]} />
          })}
        </svg>

        {layout.sections.map((section) => (
          <div key={section.text} className={styles.section} style={{ top: section.y, left: layout.centerX }}>
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
              style={{ left: sub.x, top: sub.y, width: sub.w, height: sub.h }}
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
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
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
              <span className={styles.icon}>
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
