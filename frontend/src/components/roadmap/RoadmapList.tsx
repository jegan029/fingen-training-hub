import type { NodeSummary } from '../../types'
import { sectionFor } from './layout'
import { StatusIcon, statusText } from './status'
import styles from './RoadmapList.module.css'

interface RoadmapListProps {
  nodes: NodeSummary[]
  onOpen: (nodeId: number, opener: HTMLElement) => void
}

/** Single-column roadmap for narrow screens: each main topic with its subtopics indented below. */
export default function RoadmapList({ nodes, onOpen }: RoadmapListProps) {
  return (
    <ol className={styles.list}>
      {nodes.map((node, index) => {
        const section = sectionFor(index, nodes.length)
        const newSection = index === 0 || sectionFor(index - 1, nodes.length) !== section
        return (
          <li key={node.id} className={styles.item}>
            {newSection && <p className={styles.section}>{section}</p>}
            <button
              type="button"
              className={styles.main}
              data-status={node.status}
              data-locked={node.locked || undefined}
              onClick={(e) => onOpen(node.id, e.currentTarget)}
            >
              <StatusIcon status={node.status} locked={node.locked} size={18} />
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
