import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CommandPalette from '../components/CommandPalette'
import ErrorBoundary from '../components/ErrorBoundary'
import Certificate from '../routes/Certificate'
import HomePage from '../routes/HomePage'
import * as api from '../api'
import type { CertificateStatus } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function Location() {
  const { pathname, search } = useLocation()
  return <p data-testid="location">{pathname + search}</p>
}

function renderPalette() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <CommandPalette />
      <Routes>
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('command palette', () => {
  it('opens with Ctrl+K, searches the API and opens the chosen result', async () => {
    const search = vi.spyOn(api, 'searchAll').mockResolvedValue([
      { kind: 'node', id: 'node-3', title: 'Settlement cycles', subtitle: 'Platform Core', url: '/roadmaps/1?node=3' },
      {
        kind: 'runbook',
        id: 'runbook-4',
        title: 'Failed settlement retry',
        subtitle: 'Transactions',
        url: '/runbooks?open=4',
      },
    ])
    renderPalette()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = screen.getByRole('combobox', { name: 'Search paths, topics, runbooks and articles' })
    expect(input).toHaveFocus()

    fireEvent.change(input, { target: { value: 'settle' } })
    expect(await screen.findByRole('option', { name: /Failed settlement retry/ })).toBeInTheDocument()
    expect(search).toHaveBeenCalledWith('settle')

    // First option is active; move down once and open it.
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByTestId('location')).toHaveTextContent('/runbooks?open=4')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers page shortcuts without a server call and closes on Escape', () => {
    const search = vi.spyOn(api, 'searchAll').mockResolvedValue([])
    renderPalette()
    fireEvent.click(screen.getByRole('button', { name: /Search/ }))
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'r' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Training paths'), expect.stringContaining('Runbook library')]),
    )
    expect(search).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search/ })).toHaveFocus()
  })

  it('says when nothing matches', async () => {
    vi.spyOn(api, 'searchAll').mockResolvedValue([])
    renderPalette()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzqq' } })
    expect(await screen.findByText('No matches for "zzqq"')).toBeInTheDocument()
  })
})

describe('error boundary', () => {
  it('shows a recovery message instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // React in development rethrows caught render errors to window; keep jsdom from printing them.
    const quiet = (e: ErrorEvent) => e.preventDefault()
    window.addEventListener('error', quiet)
    const Boom = () => {
      throw new Error('kaboom')
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    window.removeEventListener('error', quiet)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on this page')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.queryByText('kaboom')).not.toBeInTheDocument()
  })
})

const CERT: CertificateStatus = {
  eligible: false,
  user_name: 'Demo Learner',
  awarded_on: null,
  average_score: 5.5,
  assessed_nodes: 2,
  min_average_score: 7,
  paths: [
    { path_id: 1, title: 'Platform Core', completed: 10, total: 10 },
    { path_id: 2, title: 'Transaction Flows', completed: 4, total: 10 },
  ],
  missing: ['Transaction Flows: 6 more topics to mark done', 'Raise your assessment average from 5.5 to 7 or more'],
}

describe('certificate', () => {
  it('lists what is still missing, as decided by the server', async () => {
    vi.spyOn(api, 'fetchCertificate').mockResolvedValue(CERT)
    render(
      <MemoryRouter>
        <Certificate />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Certificate not yet earned' })).toBeInTheDocument()
    for (const item of CERT.missing) expect(screen.getByText(item)).toBeInTheDocument()
    expect(screen.getByText('5.5 of 10 across 2 topics')).toBeInTheDocument()
  })

  it('shows the certificate when eligible', async () => {
    vi.spyOn(api, 'fetchCertificate').mockResolvedValue({
      ...CERT,
      eligible: true,
      missing: [],
      average_score: 8,
      awarded_on: '2026-09-29',
    })
    render(
      <MemoryRouter>
        <Certificate />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('article', { name: 'Certificate of completion' })).toHaveTextContent('Demo Learner')
    expect(screen.getByText('Awarded on 29 September 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Print certificate/ })).toBeInTheDocument()
  })
})

describe('home page continue card', () => {
  it('links to the in progress topic and shows the streak', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.spyOn(api, 'fetchRunbooks').mockResolvedValue([])
    vi.spyOn(api, 'fetchProgressOverview').mockResolvedValue({
      user_id: 7,
      user_name: 'Demo Learner',
      overall_pct: 10,
      paths: [{ path_id: 2, title: 'Transaction Flows', completed: 3, total: 10, pct: 30 }],
    })
    vi.spyOn(api, 'fetchProgressSummary').mockResolvedValue({
      streak_days: 3,
      last_active: '2026-09-30',
      continue_node: {
        node_id: 11,
        title: 'Payment initiation',
        path_id: 2,
        path_title: 'Transaction Flows',
        status: 'in_progress',
        reason: 'in_progress',
      },
    })
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Continue where you left off')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/roadmaps/2?node=11')
    expect(screen.getByText(/3 days in a row/)).toBeInTheDocument()
    await act(async () => {})
    vi.unstubAllGlobals()
  })
})

describe('loading states', () => {
  it('shows a labelled skeleton while the certificate loads', async () => {
    vi.spyOn(api, 'fetchCertificate').mockReturnValue(new Promise(() => {}))
    render(
      <MemoryRouter>
        <Certificate />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('status', { name: 'Checking your certificate' })).toBeInTheDocument())
  })
})
