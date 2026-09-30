import { describe, expect, it } from 'vitest'
import dataset from '../../../../backend/app/data/demo_dataset.json'
import type { NodeSummary } from '../../types'
import { LAYOUT, layoutRoadmap, sectionFor, type Box } from './layout'

function nodesForPath(pathIndex: number): NodeSummary[] {
  return dataset.paths[pathIndex].nodes.map((n) => ({
    id: n.id,
    slug: n.slug,
    title: n.title,
    description: n.description,
    dependencies: n.dependencies,
    status: 'pending',
    completed: false,
    locked: false,
    locked_by: [],
    prerequisites: [],
    runbooks: [],
    // Four subtopics with realistic title lengths per node.
    subtopics: [
      'Overview of the flow',
      'Environment Check (run first every session)',
      'Diagnostic Query',
      'Escalation Triggers',
    ].map((title, i) => ({ id: `${n.id}-${i}`, title, summary: '' })),
  }))
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

describe('layoutRoadmap', () => {
  it.each([0, 1, 2])('places every box without overlaps for path %i', (pathIndex) => {
    const layout = layoutRoadmap(nodesForPath(pathIndex))
    const boxes: Box[] = [...layout.nodes, ...layout.subtopics]
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false)
    }
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w).toBeLessThanOrEqual(layout.width)
      expect(b.y + b.h).toBeLessThanOrEqual(layout.height)
    }
  })

  it('is deterministic', () => {
    expect(layoutRoadmap(nodesForPath(0))).toEqual(layoutRoadmap(nodesForPath(0)))
  })

  it('keeps main nodes on the spine in order and alternates subtopic sides', () => {
    const layout = layoutRoadmap(nodesForPath(0))
    const centres = layout.nodes.map((n) => n.x + n.w / 2)
    expect(new Set(centres)).toEqual(new Set([layout.centerX]))
    for (let i = 1; i < layout.nodes.length; i++) expect(layout.nodes[i].y).toBeGreaterThan(layout.nodes[i - 1].y)
    expect(layout.nodes.map((n) => n.side).slice(0, 4)).toEqual(['right', 'left', 'right', 'left'])
    for (const sub of layout.subtopics) {
      const parent = layout.nodes.find((n) => n.id === sub.nodeId)!
      expect(sub.side).toBe(parent.side)
      expect(sub.side === 'right' ? sub.x > parent.x + parent.w : sub.x + sub.w < parent.x).toBe(true)
    }
  })

  it('marks spine segments required only when the node depends on its predecessor', () => {
    const nodes = nodesForPath(0)
    const edges = layoutRoadmap(nodes).edges.filter((e) => e.kind.startsWith('spine'))
    expect(edges).toHaveLength(nodes.length - 1)
    for (const edge of edges) {
      const target = nodes.find((n) => n.id === edge.to)!
      expect(edge.kind === 'spine-required').toBe(target.dependencies.includes(edge.from))
    }
  })

  it.each([0, 1, 2])('draws each non-adjacent prerequisite as an arc in its own lane (path %i)', (pathIndex) => {
    const nodes = nodesForPath(pathIndex)
    const layout = layoutRoadmap(nodes)
    const arcs = layout.edges.filter((e) => e.kind === 'dependency')
    // Prerequisites in other paths (node 20 needs node 5) cannot be drawn here; the drawer lists them.
    const onCanvas = new Set(nodes.map((n) => n.id))
    const expected = nodes.flatMap((n, i) =>
      n.dependencies.filter((d) => d !== nodes[i - 1]?.id && onCanvas.has(d)).map((d) => `d-${d}-${n.id}`),
    )
    expect(arcs.map((a) => a.id).sort()).toEqual(expected.sort())

    const laneOf = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number)[2]
    for (const node of nodes) {
      // The canvas shows one node's prerequisites at a time: their lanes must be distinct.
      const lanes = arcs.filter((a) => a.to === node.id).map((a) => laneOf(a.d))
      expect(new Set(lanes).size).toBe(lanes.length)
      // Lanes stay inside the gap between the spine and the left subtopic column.
      for (const lane of lanes) expect(lane).toBeGreaterThan(layout.centerX - LAYOUT.mainW / 2 - LAYOUT.branchGap)
    }
  })

  it('derives section labels from order', () => {
    expect([0, 2, 3, 6, 7, 9].map((i) => sectionFor(i, 10))).toEqual([
      'Foundations',
      'Foundations',
      'Core operations',
      'Core operations',
      'Advanced',
      'Advanced',
    ])
    expect(layoutRoadmap(nodesForPath(0)).sections.map((s) => s.text)).toEqual([
      'Foundations',
      'Core operations',
      'Advanced',
    ])
  })

  it('handles an empty path', () => {
    const layout = layoutRoadmap([])
    expect(layout.nodes).toEqual([])
    expect(layout.edges).toEqual([])
  })
})
