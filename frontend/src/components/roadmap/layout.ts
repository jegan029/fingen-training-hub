import type { NodeSummary } from '../../types'

/**
 * Pure layout for the roadmap canvas: a vertical spine of main nodes, subtopics branching
 * left and right, and SVG connector paths. No DOM measurement, so it is deterministic and testable.
 */

export const LAYOUT = {
  mainW: 240,
  subW: 220,
  branchGap: 64,
  subGap: 8,
  rowGap: 28,
  labelH: 44,
  padX: 24,
  padY: 16,
  laneStart: 14,
  laneStep: 10,
} as const

export type Side = 'left' | 'right'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface LaidOutNode extends Box {
  id: number
  index: number
  /** Side the node's subtopics branch towards. */
  side: Side
}

export interface LaidOutSubtopic extends Box {
  id: string
  nodeId: number
  side: Side
  title: string
  summary: string
}

export type EdgeKind = 'spine-required' | 'spine-optional' | 'branch' | 'dependency'

export interface Edge {
  id: string
  kind: EdgeKind
  d: string
  from: number
  to: number
}

export interface SectionLabel {
  text: string
  y: number
}

export interface RoadmapLayout {
  width: number
  height: number
  centerX: number
  nodes: LaidOutNode[]
  subtopics: LaidOutSubtopic[]
  edges: Edge[]
  sections: SectionLabel[]
}

// Text height estimates for the fonts used in RoadmapCanvas.module.css.
const MAIN_CHARS_PER_LINE = 22
const MAIN_LINE_H = 20
const SUB_CHARS_PER_LINE = 28
const SUB_LINE_H = 17

function lines(text: string, perLine: number): number {
  return Math.max(1, Math.ceil(text.length / perLine))
}

export function mainHeight(title: string): number {
  return Math.max(52, 24 + lines(title, MAIN_CHARS_PER_LINE) * MAIN_LINE_H)
}

export function subHeight(title: string): number {
  return 16 + Math.min(2, lines(title, SUB_CHARS_PER_LINE)) * SUB_LINE_H
}

/** Section boundaries derived from order: roughly the first 30% are foundations, the last 30% advanced. */
export function sectionFor(index: number, count: number): string {
  if (index < Math.round(count * 0.3)) return 'Foundations'
  if (index < Math.round(count * 0.7)) return 'Core operations'
  return 'Advanced'
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = (x2 - x1) / 2
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

export function layoutRoadmap(nodes: NodeSummary[]): RoadmapLayout {
  const L = LAYOUT
  const half = L.mainW / 2 + L.branchGap + L.subW
  const width = 2 * (half + L.padX)
  const centerX = width / 2

  const laidNodes: LaidOutNode[] = []
  const laidSubs: LaidOutSubtopic[] = []
  const edges: Edge[] = []
  const sections: SectionLabel[] = []

  let y = L.padY
  let currentSection = ''

  nodes.forEach((node, index) => {
    const section = sectionFor(index, nodes.length)
    if (section !== currentSection) {
      currentSection = section
      sections.push({ text: section, y: y + L.labelH / 2 - 4 })
      y += L.labelH
    }

    const side: Side = index % 2 === 0 ? 'right' : 'left'
    const h = mainHeight(node.title)
    const subHeights = node.subtopics.map((s) => subHeight(s.title))
    const stackH = subHeights.reduce((a, b) => a + b, 0) + Math.max(0, subHeights.length - 1) * L.subGap
    const rowH = Math.max(h, stackH)
    const centerY = y + rowH / 2

    const main: LaidOutNode = { id: node.id, index, side, x: centerX - L.mainW / 2, y: centerY - h / 2, w: L.mainW, h }
    laidNodes.push(main)

    // Subtopics stacked beside the node, centred on it.
    let sy = centerY - stackH / 2
    const subX = side === 'right' ? centerX + L.mainW / 2 + L.branchGap : centerX - L.mainW / 2 - L.branchGap - L.subW
    const anchorX = side === 'right' ? main.x + main.w : main.x
    node.subtopics.forEach((sub, i) => {
      const sh = subHeights[i]
      laidSubs.push({
        id: sub.id,
        nodeId: node.id,
        side,
        title: sub.title,
        summary: sub.summary,
        x: subX,
        y: sy,
        w: L.subW,
        h: sh,
      })
      const endX = side === 'right' ? subX : subX + L.subW
      edges.push({
        id: `b-${sub.id}`,
        kind: 'branch',
        from: node.id,
        to: node.id,
        d: curve(anchorX, centerY, endX, sy + sh / 2),
      })
      sy += sh + L.subGap
    })

    y += rowH + L.rowGap
  })

  // Spine segments: solid when the node requires its predecessor, dotted when the order is only suggested.
  for (let i = 1; i < laidNodes.length; i++) {
    const prev = laidNodes[i - 1]
    const cur = laidNodes[i]
    const required = nodes[i].dependencies.includes(prev.id)
    edges.push({
      id: `s-${prev.id}-${cur.id}`,
      kind: required ? 'spine-required' : 'spine-optional',
      from: prev.id,
      to: cur.id,
      d: `M ${centerX} ${prev.y + prev.h} L ${centerX} ${cur.y}`,
    })
  }

  // Prerequisites that skip over nodes are drawn as arcs left of the spine. The canvas only shows
  // the arcs of the active node, so lanes are assigned per target: nearest prerequisite innermost.
  const byId = new Map(laidNodes.map((n) => [n.id, n]))
  const x = centerX - L.mainW / 2
  nodes.forEach((node, i) => {
    const target = laidNodes[i]
    const prereqs = node.dependencies
      .filter((dep) => byId.has(dep) && dep !== laidNodes[i - 1]?.id)
      .map((dep) => byId.get(dep)!)
      .sort((a, b) => b.y - a.y)
    prereqs.forEach((from, lane) => {
      const y1 = from.y + from.h / 2
      const y2 = target.y + target.h / 2
      const laneX = x - L.laneStart - lane * L.laneStep
      edges.push({
        id: `d-${from.id}-${target.id}`,
        kind: 'dependency',
        from: from.id,
        to: target.id,
        d: `M ${x} ${y1} C ${laneX} ${y1}, ${laneX} ${y1}, ${laneX} ${y1 + 12} L ${laneX} ${y2 - 12} C ${laneX} ${y2}, ${laneX} ${y2}, ${x} ${y2}`,
      })
    })
  })

  return { width, height: y - L.rowGap + L.padY, centerX, nodes: laidNodes, subtopics: laidSubs, edges, sections }
}
