import type { NodeStatus, NodeSummary } from '../../types'
import { STATUS_META } from './status'

/** What a status change did to the roadmap, for the completion moment and its announcement. */
export interface StatusChange {
  nodeId: number
  status: NodeStatus
  /** The next topic on the spine, whose connector lights up when this one is done. */
  nextId: number | null
  /** Topics that were locked before the change and are not any more. */
  unlockedIds: number[]
  /** Text for the polite live region. */
  message: string
}

export function describeChange(before: NodeSummary[], after: NodeSummary[], nodeId: number): StatusChange | null {
  const index = after.findIndex((n) => n.id === nodeId)
  const node = after[index]
  const previous = before.find((n) => n.id === nodeId)
  if (!node || !previous || previous.status === node.status) return null

  const wasLocked = new Set(before.filter((n) => n.locked).map((n) => n.id))
  const unlocked = after.filter((n) => !n.locked && wasLocked.has(n.id))

  const label = node.status === 'pending' ? 'reset' : `marked ${STATUS_META[node.status].label.toLowerCase()}`
  let message = `${node.title} ${label}.`
  if (unlocked.length > 0) message += ` ${unlocked.map((n) => n.title).join(', ')} unlocked.`

  return {
    nodeId,
    status: node.status,
    nextId: after[index + 1]?.id ?? null,
    unlockedIds: unlocked.map((n) => n.id),
    message,
  }
}

export type Celebration = 'done' | 'unlocked' | 'changed'

/** How a topic acknowledges the last status change: done rings, unlocked rings later, any other change pops its icon. */
export function celebration(change: StatusChange | null | undefined, nodeId: number): Celebration | undefined {
  if (!change) return undefined
  if (change.nodeId === nodeId) return change.status === 'done' ? 'done' : 'changed'
  return change.unlockedIds.includes(nodeId) ? 'unlocked' : undefined
}
