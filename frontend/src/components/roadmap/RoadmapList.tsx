import type { NodeSummary } from '../../types'
import { motion, staggerStyle } from '../../lib/motion'
import { sectionFor } from './layout'
import { StatusIcon, statusText } from './status'
import { celebrateClass, celebration, sweepStep, type StatusChange } from './statusChange'
import styles from './RoadmapList.module.css'

interface RoadmapListProps {
  nodes: NodeSummary[]
  onOpen: (nodeId: number, opener: HTMLElement) => void
  /** The status change that just happened, if any: plays the completion moment once. */
  change?: StatusChange | null
}

/** Single-column roadmap for narrow screens: each main topic with its subtopics indented below. */
export default function RoadmapList({ nodes, onOpen, change }: RoadmapListProps) {
  return (
    <ol className={styles.list}>
      {nodes.map((node, index) => {
        const section = sectionFor(index, nodes.length)
        const newSection = index === 0 || sectionFor(index - 1, nodes.length) !== section
        const celebrate = celebration(change, node.id)
        return (
          <li key={node.id} className={styles.item} style={staggerStyle(Math.min(index, 8))}>
            {newSection && <p className={styles.section}>{section}</p>}
            <button
              type="button"
              className={`${styles.main} ${celebrate ? motion.keep : ''}`}
              data-status={node.status}
              data-locked={node.locked || undefined}
              data-celebrate={celebrate}
              data-node-id={node.id}
              onClick={(e) => onOpen(node.id, e.currentTarget)}
            >
              <span
                key={`${node.status}-${node.locked}`}
                className={`${styles.icon} ${celebrateClass(celebrate)}`}
                data-celebrate={celebrate}
                style={celebrate === 'sweep' ? staggerStyle(sweepStep(nodes, change, index)) : undefined}
              >
                <StatusIcon status={node.status} locked={node.locked} size={18} />
              </span>
              <span className={styles.title}>{node.title}</span>
              <span className={styles.status}>{statusText(node.status, node.locked)}</span>
            </button>
            {node.subtopics.length > 0 && (
              <ul className={styles.subs}>
                {node.subtopics.map((s) => (
                  <li key={s.id}>{s.title}</li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}
