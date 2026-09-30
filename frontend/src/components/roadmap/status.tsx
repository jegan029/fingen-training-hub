import { CheckCircle2, Circle, CircleDot, Lock, SkipForward, type LucideIcon } from 'lucide-react'
import type { NodeStatus } from '../../types'

interface StatusMeta {
  label: string
  Icon: LucideIcon
  /** Keyboard shortcut in the node drawer. */
  key: string
}

export const STATUS_META: Record<NodeStatus, StatusMeta> = {
  pending: { label: 'Pending', Icon: Circle, key: 'R' },
  in_progress: { label: 'In progress', Icon: CircleDot, key: 'P' },
  done: { label: 'Done', Icon: CheckCircle2, key: 'D' },
  skipped: { label: 'Skipped', Icon: SkipForward, key: 'S' },
}

/** Order of the status buttons in the drawer. */
export const STATUS_ORDER: NodeStatus[] = ['done', 'in_progress', 'skipped', 'pending']

export function statusForKey(key: string): NodeStatus | null {
  const upper = key.toUpperCase()
  const match = (Object.keys(STATUS_META) as NodeStatus[]).find((s) => STATUS_META[s].key === upper)
  return match ?? null
}

/** Status is never shown by colour alone: every state has an icon and a text label. */
export function StatusIcon({
  status,
  locked = false,
  size = 16,
}: {
  status: NodeStatus
  locked?: boolean
  size?: number
}) {
  if (locked && status === 'pending') return <Lock size={size} aria-hidden="true" />
  const { Icon } = STATUS_META[status]
  return <Icon size={size} aria-hidden="true" />
}

export function statusText(status: NodeStatus, locked: boolean): string {
  return locked && status === 'pending' ? 'Locked' : STATUS_META[status].label
}
