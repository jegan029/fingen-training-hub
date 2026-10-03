import { describe, expect, it } from 'vitest'
import type { NodeSummary } from '../types'
import { pathSources } from './chatSources'

const node = (id: number, title: string) => ({ id, title }) as NodeSummary
const nodes = [node(1, 'Platform Architecture'), node(2, 'Settlement Flow'), node(3, 'Reconciliation')]
const path = { id: 1, title: 'Fingen Platform Core' }

describe('pathSources', () => {
  it('cites the path, then only the topics the answer names', () => {
    expect(pathSources('The settlement flow runs after reconciliation.', path, nodes, [1, 2, 3])).toEqual([
      { label: 'Fingen Platform Core lessons', to: '/roadmaps/1' },
      { label: 'Settlement Flow', to: '/learn/2' },
      { label: 'Reconciliation', to: '/learn/3' },
    ])
  })

  it('ignores topics the API did not list as sources', () => {
    expect(pathSources('Settlement flow.', path, nodes, [1]).map((s) => s.label)).toEqual([
      'Fingen Platform Core lessons',
    ])
  })

  it('still names the path when no topic is mentioned', () => {
    expect(pathSources('Ask a trainer.', path, nodes, [1, 2, 3])).toHaveLength(1)
  })
})
