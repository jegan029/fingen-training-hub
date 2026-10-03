import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import ChatAssistant from '../routes/ChatAssistant'
import type { ChatResponse, LearningPath, NodeSummary } from '../types'

afterEach(() => vi.restoreAllMocks())

describe('AI Tutor chat', () => {
  it('shows a typing indicator, then the reply with source chips', async () => {
    vi.spyOn(api, 'fetchRoadmaps').mockResolvedValue([
      { id: 1, slug: 'platform-core', title: 'Fingen Platform Core', description: '' } as LearningPath,
    ])
    vi.spyOn(api, 'fetchRoadmapNodes').mockResolvedValue([
      { id: 1, title: 'Platform Architecture' } as NodeSummary,
      { id: 2, title: 'Settlement Flow' } as NodeSummary,
    ])
    let resolve: (r: ChatResponse) => void = () => {}
    vi.spyOn(api, 'chatQuery').mockReturnValue(new Promise((r) => (resolve = r)))

    render(
      <MemoryRouter>
        <ChatAssistant />
      </MemoryRouter>,
    )
    await screen.findByRole('option', { name: 'Fingen Platform Core' })
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'How does settlement work?' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    expect(await screen.findByText('AI Tutor is typing')).toBeInTheDocument()

    await act(async () => {
      resolve({
        answer: 'The Settlement Flow posts batches nightly.',
        source_node_ids: [1, 2],
        source_article_id: null,
      })
    })

    expect(screen.queryByText('AI Tutor is typing')).not.toBeInTheDocument()
    const sources = screen.getByRole('list', { name: 'Sources' })
    expect(within(sources).getByRole('link', { name: 'Fingen Platform Core lessons' })).toHaveAttribute(
      'href',
      '/roadmaps/1',
    )
    expect(within(sources).getByRole('link', { name: 'Settlement Flow' })).toHaveAttribute('href', '/learn/2')
    expect(within(sources).queryByRole('link', { name: 'Platform Architecture' })).not.toBeInTheDocument()
  })
})
