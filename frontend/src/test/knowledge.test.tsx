import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import ClassificationBadge from '../components/knowledge/ClassificationBadge'
import StaleBanner from '../components/knowledge/StaleBanner'
import ServiceNowPanel from '../components/admin/ServiceNowPanel'
import NodeArticles from '../components/roadmap/NodeArticles'
import KnowledgeArticle from '../routes/KnowledgeArticle'
import KnowledgeLibrary from '../routes/KnowledgeLibrary'
import type { ArticleDetail, ArticlePage, ArticleSummary, ServiceNowStatus, SyncRun } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function Location() {
  const { pathname, search } = useLocation()
  return <p data-testid="location">{pathname + search}</p>
}

const SUMMARY: ArticleSummary = {
  id: 1,
  kb_number: 'KB0010001',
  title: 'Ledger Gateway posting failure',
  summary: 'Postings stuck in PENDING_GL.',
  classification: 'internal',
  kind: 'runbook',
  category: 'Runbook',
  knowledge_base: 'Payments Operations',
  version: '1.0',
  source_updated_at: '2026-09-01 08:00:00',
  synced_at: '2026-10-03T07:00:00+00:00',
  applications: [{ id: 1, app_number: 'APM0001001', name: 'Ledger Gateway' }],
  source: 'servicenow',
}

const PAGE: ArticlePage = {
  items: [SUMMARY],
  total: 1,
  page: 1,
  page_size: 20,
  facets: {
    classifications: [
      { value: 'public', label: 'public', count: 3 },
      { value: 'internal', label: 'internal', count: 4 },
    ],
    kinds: [{ value: 'runbook', label: 'runbook', count: 3 }],
    categories: [{ value: 'Runbook', label: 'Runbook', count: 3 }],
    applications: [{ value: 'APM0001001', label: 'Ledger Gateway', count: 2 }],
  },
}

const DETAIL: ArticleDetail = {
  ...SUMMARY,
  body_markdown: '## Steps\n\n1. Check the queue.',
  source_url: 'https://example.service-now.com/kb_view.do?sysparm_article=KB0010001',
  llm_allowed: true,
  documents: [
    {
      id: 7,
      file_name: 'posting-flow.pdf',
      content_type: 'application/pdf',
      size_bytes: 2048,
      article_id: 1,
      kb_number: 'KB0010001',
      article_title: SUMMARY.title,
    },
  ],
  linked_articles: [],
  related_nodes: [{ id: 4, title: 'Transaction Engine', path_id: 1, path_title: 'Fingen Platform Core' }],
}

describe('classification badge', () => {
  it.each([
    ['public', 'Public'],
    ['internal', 'Internal'],
    ['confidential', 'Confidential'],
    ['restricted', 'Restricted'],
  ] as const)('shows %s as text and an icon, not colour alone', (level, label) => {
    const { container } = render(<ClassificationBadge level={level} />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge).toHaveTextContent(`Classification: ${label}`)
    expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(badge).toHaveAttribute('title', expect.stringContaining(label))
  })
})

describe('knowledge library', () => {
  function renderLibrary(url = '/knowledge') {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/knowledge" element={<KnowledgeLibrary />} />
        </Routes>
        <Location />
      </MemoryRouter>,
    )
  }

  it('lists articles and filters with chips through the URL and the API', async () => {
    vi.spyOn(api, 'fetchKnowledgeStatus').mockResolvedValue({
      enabled: true,
      stale: false,
      unreachable: false,
      last_success_at: '2026-10-03T07:00:00+00:00',
    })
    const fetch = vi.spyOn(api, 'fetchArticles').mockResolvedValue(PAGE)
    renderLibrary()

    expect(await screen.findByRole('link', { name: 'Ledger Gateway posting failure' })).toHaveAttribute(
      'href',
      '/knowledge/1',
    )
    expect(screen.getByText('KB0010001')).toBeInTheDocument()
    expect(screen.getByText('From ServiceNow')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '' })).toBeDefined()

    const classification = screen.getByRole('group', { name: 'Classification' })
    fireEvent.click(within(classification).getByRole('button', { name: /Public/ }))
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ classification: 'public' })))
    expect(within(classification).getByRole('button', { name: /Public/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location')).toHaveTextContent('/knowledge?classification=public')

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Application' })).getByRole('button', { name: /APM0001001/ }),
    )
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        expect.objectContaining({ classification: 'public', app_number: 'APM0001001', page: 1 }),
      ),
    )
  })

  it('debounces the search box into the query', async () => {
    vi.spyOn(api, 'fetchKnowledgeStatus').mockRejectedValue(new Error('offline'))
    const fetch = vi.spyOn(api, 'fetchArticles').mockResolvedValue(PAGE)
    renderLibrary()
    await screen.findByRole('link', { name: SUMMARY.title })

    fireEvent.change(screen.getByLabelText('Search articles'), { target: { value: 'ledger' } })
    expect(fetch).not.toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ledger' }))
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ledger' })))
  })

  it('shows the empty state with a way out when filters match nothing', async () => {
    vi.spyOn(api, 'fetchKnowledgeStatus').mockRejectedValue(new Error('offline'))
    vi.spyOn(api, 'fetchArticles').mockResolvedValue({ ...PAGE, items: [], total: 0 })
    renderLibrary('/knowledge?category=Nope')

    expect(await screen.findByText('No articles match these filters')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/knowledge$/)
  })
})

describe('knowledge article', () => {
  function renderArticle() {
    vi.spyOn(api, 'fetchKnowledgeStatus').mockRejectedValue(new Error('offline'))
    return render(
      <MemoryRouter initialEntries={['/knowledge/1']}>
        <Routes>
          <Route path="/knowledge/:articleId" element={<KnowledgeArticle />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('offers the AI Tutor, the ServiceNow link and document downloads', async () => {
    vi.spyOn(api, 'fetchArticle').mockResolvedValue(DETAIL)
    renderArticle()

    expect(await screen.findByRole('heading', { level: 1, name: SUMMARY.title })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ask the AI Tutor about this/ })).toHaveAttribute('href', '/chat?article=1')
    const external = screen.getByRole('link', { name: /View in ServiceNow/ })
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noopener noreferrer')
    const download = screen.getByRole('link', { name: /Download posting-flow.pdf/ })
    expect(download).toHaveAttribute('href', '/api/knowledge/documents/7/download')
    expect(download).toHaveAttribute('download')
    expect(screen.getByRole('link', { name: 'Transaction Engine' })).toHaveAttribute('href', '/roadmaps/1?node=4')
  })

  it('disables the AI Tutor with an explanation for restricted articles', async () => {
    vi.spyOn(api, 'fetchArticle').mockResolvedValue({ ...DETAIL, classification: 'restricted', llm_allowed: false })
    renderArticle()

    const button = await screen.findByRole('button', { name: /Ask the AI Tutor about this/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/Restricted articles are never sent to the AI Tutor/)
    expect(screen.queryByRole('link', { name: /Ask the AI Tutor/ })).not.toBeInTheDocument()
  })

  it('shows a neutral message when the article is hidden or missing', async () => {
    vi.spyOn(api, 'fetchArticle').mockRejectedValue(new api.ApiError(404, 'Article not found'))
    renderArticle()

    expect(await screen.findByText('Article not available')).toBeInTheDocument()
    expect(screen.getByText(/not available at your clearance/)).toBeInTheDocument()
  })
})

describe('stale banner', () => {
  it('explains that cached content is shown when ServiceNow was unreachable', async () => {
    vi.spyOn(api, 'fetchKnowledgeStatus').mockResolvedValue({
      enabled: true,
      stale: false,
      unreachable: true,
      last_success_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    })
    render(<StaleBanner />)
    expect(await screen.findByRole('status')).toHaveTextContent(
      /could not be reached.*last synced versions.*Last synced 3 hours ago/,
    )
  })

  it('stays hidden when content is current', async () => {
    const status = vi
      .spyOn(api, 'fetchKnowledgeStatus')
      .mockResolvedValue({ enabled: true, stale: false, unreachable: false, last_success_at: null })
    const { container } = render(<StaleBanner />)
    await waitFor(() => expect(status).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('roadmap drawer knowledge section', () => {
  it('lists articles linked to the topic with their classification', async () => {
    const fetch = vi.spyOn(api, 'fetchArticles').mockResolvedValue(PAGE)
    render(
      <MemoryRouter>
        <NodeArticles nodeId={4} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: SUMMARY.title })).toHaveAttribute('href', '/knowledge/1')
    expect(screen.getByText('Internal')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ node_id: 4 }))
  })

  it('says when nothing is linked', async () => {
    vi.spyOn(api, 'fetchArticles').mockResolvedValue({ ...PAGE, items: [], total: 0 })
    render(
      <MemoryRouter>
        <NodeArticles nodeId={4} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/No knowledge article is linked to this topic/)).toBeInTheDocument()
  })
})

describe('admin ServiceNow panel', () => {
  const RUN: SyncRun = {
    id: 5,
    started_at: '2026-10-03T07:00:00+00:00',
    finished_at: '2026-10-03T07:00:02+00:00',
    mode: 'incremental',
    trigger: 'manual',
    status: 'success',
    articles_seen: 13,
    articles_created: 12,
    articles_updated: 0,
    articles_unchanged: 0,
    articles_retired: 0,
    articles_failed: 0,
    documents_downloaded: 5,
    documents_rejected: 1,
    error_summary: 'export-checklist.pdf rejected: content does not match the declared type',
  }
  const STATUS: ServiceNowStatus = {
    enabled: true,
    mock_mode: true,
    auth_mode: 'oauth',
    instance_host: null,
    scheduler_running: true,
    sync_interval_minutes: 60,
    running: false,
    last_run: RUN,
    last_success_at: RUN.finished_at,
    next_incremental: '2026-10-03T08:00:00+00:00',
    next_full: '2026-10-04T02:00:00+00:00',
    counts: {
      articles_active: 12,
      articles_inactive: 1,
      by_classification: { internal: 4 },
      applications: 4,
      documents: 5,
    },
  }

  function mockLoad() {
    vi.spyOn(api, 'fetchServiceNowStatus').mockResolvedValue(STATUS)
    vi.spyOn(api, 'fetchSyncRuns').mockResolvedValue([RUN])
    vi.spyOn(api, 'fetchAccessLog').mockResolvedValue([])
  }

  function renderPanel() {
    return render(
      <MemoryRouter>
        <ServiceNowPanel />
      </MemoryRouter>,
    )
  }

  it('shows mock mode, counts and recent runs with error details', async () => {
    mockLoad()
    renderPanel()
    expect(await screen.findByText(/Mock mode: synthetic fixtures/)).toBeInTheDocument()
    expect(screen.getByText('Active articles').parentElement).toHaveTextContent('12')
    const runs = screen.getAllByRole('table')[0]
    expect(within(runs).getByText('Succeeded')).toBeInTheDocument()
    expect(within(runs).getByText(/12 created.*5 documents, 1 document rejected/)).toBeInTheDocument()
    expect(within(runs).getByText(/content does not match/)).toBeInTheDocument()
  })

  it('starts a sync, polls the run and reports the result', async () => {
    mockLoad()
    const start = vi
      .spyOn(api, 'startServiceNowSync')
      .mockResolvedValue({ run_id: 6, mode: 'incremental', status: 'running' })
    const poll = vi
      .spyOn(api, 'fetchSyncRun')
      .mockResolvedValueOnce({ ...RUN, id: 6, status: 'running' })
      .mockResolvedValueOnce({ ...RUN, id: 6, articles_created: 0, articles_updated: 2, documents_rejected: 0 })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }))
    expect(start).toHaveBeenCalledWith('incremental')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    await waitFor(() => expect(screen.getByText(/Sync succeeded: 0 created, 2 updated/)).toBeInTheDocument())
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('explains a conflict when a sync is already running', async () => {
    mockLoad()
    vi.spyOn(api, 'startServiceNowSync').mockRejectedValue(new api.ApiError(409, 'A sync is already running'))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Full sync' }))
    expect(await screen.findByText(/A sync is already running. Its result will appear/)).toBeInTheDocument()
  })
})
