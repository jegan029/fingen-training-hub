import type { NodeSummary } from '../types'

export interface ChatSource {
  label: string
  to: string
}

const MAX_TOPICS = 4

/**
 * Sources to show under a path answer: the path the tutor answered from, then the topics whose
 * titles the answer actually names (the API lists every topic in the path, which is not a citation).
 */
export function pathSources(
  answer: string,
  path: { id: number; title: string } | null,
  nodes: NodeSummary[],
  sourceIds: number[],
): ChatSource[] {
  const text = answer.toLowerCase()
  const allowed = new Set(sourceIds)
  const topics = nodes
    .filter((n) => allowed.has(n.id) && text.includes(n.title.toLowerCase()))
    .slice(0, MAX_TOPICS)
    .map((n) => ({ label: n.title, to: `/learn/${n.id}` }))
  const from = path ? [{ label: `${path.title} lessons`, to: `/roadmaps/${path.id}` }] : []
  return [...from, ...topics]
}
