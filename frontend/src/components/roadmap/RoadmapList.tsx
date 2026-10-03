import type { NodeSummary } from '../../types'
import { staggerStyle } from '../../lib/motion'
import { sectionFor } from './layout'
import { StatusIcon, statusText } from './status'
import type { StatusChange } from './statusChange'
import motion from '../../styles/motion.module.css'
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
        const celebrate =
          change?.nodeId === node.id && change.status === 'done'
            ? 'done'
            : change?.unlockedIds.includes(node.id)
              ? 'unlocked'
              : undefined
        return (
          <li key={node.id} className={styles.item} style={staggerStyle(Math.min(index, 8))}>
            {newSection && <p className={styles.section}>{section}</p>}
            <button
              type="button"
              className={styles.main}
              data-status={node.status}
              data-locked={node.locked || undefined}
              data-celebrate={celebrate}
              onClick={(e) => onOpen(node.id, e.currentTarget)}
            >
              <span
                key={`${node.status}-${node.locked}`}
                className={`${styles.icon} ${celebrate ? motion.pop : ''}`}
                data-celebrate={celebrate}
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
