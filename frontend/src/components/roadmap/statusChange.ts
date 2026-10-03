import type { NodeStatus, NodeSummary } from '../../types'
import { motion } from '../../lib/motion'
import { STATUS_META } from './status'

/** What a status change did to the roadmap, for the completion moment and its announcement. */
export interface StatusChange {
  nodeId: number
  status: NodeStatus
  /** The next topic on the spine, whose connector lights up when this one is done. */
  nextId: number | null
  /** Topics that were locked before the change and are not any more. */
  unlockedIds: number[]
  /** The topic to offer next after a topic is marked done: open, not done and not skipped. */
  nextUp: { id: number; title: string } | null
  /** Every topic on the path is done (skipped does not count, as for the certificate). */
  pathComplete: boolean
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

  const pathComplete = after.every((n) => n.status === 'done')
  const nextUp = node.status === 'done' && !pathComplete ? findNextUp(after, index) : null
  if (pathComplete) message += ' That completes the path.'
  else if (nextUp) message += ` Next up: ${nextUp.title}.`

  return {
    nodeId,
    status: node.status,
    nextId: after[index + 1]?.id ?? null,
    unlockedIds: unlocked.map((n) => n.id),
    nextUp,
    pathComplete,
    message,
  }
}

/** The first open topic after `index` that still needs work, wrapping round to the top of the path. */
function findNextUp(nodes: NodeSummary[], index: number): { id: number; title: string } | null {
  const open = (n: NodeSummary) => !n.locked && n.status !== 'done' && n.status !== 'skipped'
  const found = nodes.slice(index + 1).find(open) ?? nodes.slice(0, index).find(open)
  return found ? { id: found.id, title: found.title } : null
}

export type Celebration = 'done' | 'unlocked' | 'changed' | 'sweep'

/**
 * How a topic acknowledges the last status change: done rings, unlocked rings later, any other change
 * pops its icon. Completing the whole path sweeps every other topic's icon outward from the one just done.
 */
export function celebration(change: StatusChange | null | undefined, nodeId: number): Celebration | undefined {
  if (!change) return undefined
  if (change.nodeId === nodeId) return change.status === 'done' ? 'done' : 'changed'
  if (change.pathComplete) return 'sweep'
  return change.unlockedIds.includes(nodeId) ? 'unlocked' : undefined
}

/** Classes for a topic icon that is celebrating: the sweep has its own pulse, every other moment pops in. */
export function celebrateClass(celebrate: Celebration | undefined): string {
  if (!celebrate) return ''
  return celebrate === 'sweep' ? motion.keep : `${motion.pop} ${motion.keep}`
}

/** Sweep order: topics nearer the one just completed pulse first, so the wave starts where the learner is looking. */
export function sweepStep(nodes: { id: number }[], change: StatusChange | null | undefined, index: number): number {
  const from = nodes.findIndex((n) => n.id === change?.nodeId)
  return from < 0 ? index : Math.abs(index - from)
}
