import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Markdown from '../components/Markdown'
import NodeContentPage from '../routes/NodeContentPage'
import * as api from '../api'
import type { NodeDetail } from '../types'

const MALICIOUS = [
  '## Overview',
  'Normal **bold** text and `code`.',
  '<script>window.__pwned = true</script>',
  '<img src="x" onerror="window.__pwned = true">',
  '<a href="#" onclick="window.__pwned = true">click</a>',
  '[link](javascript:window.__pwned=true)',
  '- item with <iframe src="https://evil.example"></iframe>',
].join('\n\n')

function expectInert(container: HTMLElement) {
  expect(container.querySelector('script, iframe, object, embed')).toBeNull()
  for (const el of Array.from(container.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.startsWith('on')).toBe(false)
      expect(attr.value.toLowerCase()).not.toContain('javascript:')
    }
  }
  expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
}

afterEach(() => vi.restoreAllMocks())

describe('Markdown rendering is XSS safe', () => {
  it('keeps formatting but renders embedded HTML and script URLs inert', () => {
    const { container } = render(<Markdown>{MALICIOUS}</Markdown>)
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expectInert(container)
  })

  it('renders stored node content with <script> inert on the lesson page', async () => {
    const node: NodeDetail = {
      id: 1,
      slug: 'x',
      title: 'Injected node',
      description: 'd',
      content: MALICIOUS,
      dependencies: [],
      status: 'pending',
      completed: false,
      locked: false,
      locked_by: [],
      prerequisites: [],
      subtopics: [],
      runbooks: [],
    }
    vi.spyOn(api, 'fetchNodeDetail').mockResolvedValue(node)

    const { container } = render(
      <MemoryRouter initialEntries={['/learn/1']}>
        <Routes>
          <Route path="/learn/:nodeId" element={<NodeContentPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expectInert(container)
  })
})
