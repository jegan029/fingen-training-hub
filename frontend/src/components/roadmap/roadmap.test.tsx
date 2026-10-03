import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { NodeSummary } from '../../types'
import NodeDrawer from './NodeDrawer'
import RoadmapCanvas from './RoadmapCanvas'
import { describeChange } from './statusChange'

function node(overrides: Partial<NodeSummary> = {}): NodeSummary {
  return {
    id: 1,
    slug: 'n',
    title: 'Platform Architecture',
    description: 'How the platform fits together.',
    dependencies: [],
    status: 'pending',
    completed: false,
    locked: false,
    locked_by: [],
    prerequisites: [],
    subtopics: [{ id: '1-0', title: 'Environments', summary: 'Dev, UAT and Production.' }],
    runbooks: [{ id: 4, slug: 'rb', title: 'Account Activation', category: 'Account & User' }],
    ...overrides,
  }
}

function renderDrawer(n: NodeSummary, props: Partial<React.ComponentProps<typeof NodeDrawer>> = {}) {
  const onStatus = vi.fn()
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <NodeDrawer node={n} pathId={1} busy={false} error={null} onStatus={onStatus} onClose={onClose} {...props} />
    </MemoryRouter>,
  )
  return { onStatus, onClose, dialog: screen.getByRole('dialog') }
}

describe('NodeDrawer', () => {
  it('is a labelled modal dialog that takes focus', () => {
    const { dialog } = renderDrawer(node())
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Platform Architecture')
    expect(screen.getByRole('button', { name: /close/i })).toHaveFocus()
  })

  it.each([
    ['d', 'done'],
    ['p', 'in_progress'],
    ['s', 'skipped'],
    ['r', 'pending'],
  ])('shortcut %s sets status %s', (key, status) => {
    const { onStatus, dialog } = renderDrawer(node({ status: key === 'r' ? 'done' : 'pending' }))
    fireEvent.keyDown(dialog, { key })
    expect(onStatus).toHaveBeenCalledWith(status)
  })

  it('Escape closes', () => {
    const { onClose, dialog } = renderDrawer(node())
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('ignores shortcuts with modifier keys', () => {
    const { onStatus, dialog } = renderDrawer(node())
    fireEvent.keyDown(dialog, { key: 'd', ctrlKey: true })
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('marks the current status as pressed', () => {
    renderDrawer(node({ status: 'in_progress' }))
    expect(screen.getByRole('button', { name: /in progress/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^done/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('on a locked node only allows reset and explains why', () => {
    const { onStatus, dialog } = renderDrawer(node({ locked: true, locked_by: ['Account Module'] }))
    fireEvent.keyDown(dialog, { key: 'd' })
    expect(onStatus).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^done/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reset/i })).toBeEnabled()
    expect(screen.getByText(/complete or skip account module first/i)).toBeInTheDocument()
  })

  it('links to the lesson, assessments, runbooks and a prefilled tutor question', () => {
    renderDrawer(node())
    expect(screen.getByRole('link', { name: /read full lesson/i })).toHaveAttribute('href', '/learn/1')
    expect(screen.getByRole('link', { name: /take assessment/i })).toHaveAttribute('href', '/assessment/1')
    expect(screen.getByRole('link', { name: /try scenario/i })).toHaveAttribute('href', '/scenario/1')
    expect(screen.getByRole('link', { name: 'Account Activation' })).toHaveAttribute('href', '/runbooks?open=4')
    const tutor = screen.getByRole('link', { name: /ask the ai tutor/i }).getAttribute('href')!
    expect(tutor).toMatch(/^\/chat\?path=1&q=/)
    expect(decodeURIComponent(tutor)).toContain('Platform Architecture')
  })
})

describe('RoadmapCanvas', () => {
  const nodes = [
    node(),
    node({ id: 2, title: 'Account Module', dependencies: [1], subtopics: [] }),
    node({ id: 3, title: 'Transaction Engine', subtopics: [] }),
  ]

  function renderCanvas() {
    const onOpen = vi.fn()
    render(<RoadmapCanvas nodes={nodes} pathTitle="Core" selectedId={null} onOpen={onOpen} />)
    const buttons = [/platform architecture/i, /account module/i, /transaction engine/i].map((name) =>
      screen.getByRole('button', { name }),
    )
    return { onOpen, buttons }
  }

  it('is one tab stop with arrow key navigation', () => {
    const { buttons } = renderCanvas()
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1])
    buttons[0].focus()
    fireEvent.keyDown(buttons[0], { key: 'ArrowDown' })
    expect(buttons[1]).toHaveFocus()
    fireEvent.keyDown(buttons[1], { key: 'End' })
    expect(buttons[2]).toHaveFocus()
    fireEvent.keyDown(buttons[2], { key: 'Home' })
    expect(buttons[0]).toHaveFocus()
  })

  it('opens a topic on click (Enter activates the button natively)', () => {
    const { onOpen, buttons } = renderCanvas()
    fireEvent.click(buttons[1])
    expect(onOpen).toHaveBeenCalledWith(2, buttons[1])
  })

  it('announces status in the accessible name', () => {
    renderCanvas()
    expect(screen.getByRole('button', { name: '1. Platform Architecture, Pending' })).toBeInTheDocument()
  })
})

describe('completion moment', () => {
  const before = [
    node({ id: 1, title: 'Kafka Basics', subtopics: [] }),
    node({
      id: 2,
      title: 'Settlement Flow',
      dependencies: [1],
      locked: true,
      locked_by: ['Kafka Basics'],
      subtopics: [],
    }),
    node({ id: 3, title: 'Reconciliation', subtopics: [] }),
  ]
  const after = [
    { ...before[0], status: 'done' as const, completed: true },
    { ...before[1], locked: false, locked_by: [] },
    before[2],
  ]

  it('describes what a status change did, for the announcement', () => {
    expect(describeChange(before, after, 1)).toEqual({
      nodeId: 1,
      status: 'done',
      nextId: 2,
      unlockedIds: [2],
      message: 'Kafka Basics marked done. Settlement Flow unlocked.',
    })
  })

  it('reports nothing when the status did not change', () => {
    expect(describeChange(before, before, 1)).toBeNull()
  })

  it('says reset rather than pending', () => {
    expect(describeChange(after, before, 1)?.message).toBe('Kafka Basics reset.')
  })

  it('lights the connector to the next topic and rings the unlocked one', () => {
    const change = describeChange(before, after, 1)
    const { container } = render(
      <RoadmapCanvas nodes={after} pathTitle="Core" selectedId={null} onOpen={vi.fn()} change={change} />,
    )
    expect(screen.getByRole('button', { name: /kafka basics, done/i })).toHaveAttribute('data-celebrate', 'done')
    expect(screen.getByRole('button', { name: /settlement flow, pending/i })).toHaveAttribute(
      'data-celebrate',
      'unlocked',
    )
    expect(container.querySelectorAll('rect[data-draw]')).toHaveLength(1)
  })

  it('reads the change out inside the drawer', () => {
    renderDrawer(after[0], { announcement: 'Kafka Basics marked done. Settlement Flow unlocked.' })
    expect(screen.getByText('Kafka Basics marked done. Settlement Flow unlocked.')).toHaveAttribute('role', 'status')
  })
})
