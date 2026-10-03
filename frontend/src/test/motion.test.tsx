import { act, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { meterStyle, navigateWithTransition, useCountUp } from '../lib/motion'
import HomePage from '../routes/HomePage'
import ProgressRing from '../components/ui/ProgressRing'
import * as api from '../api'

function mockMatchMedia(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useCountUp', () => {
  it('jumps straight to the target under prefers-reduced-motion', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useCountUp(42, true))
    expect(result.current).toBe(42)
  })

  it('stays at 0 until active', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useCountUp(42, false))
    expect(result.current).toBe(0)
  })

  it('counts up to the exact target', async () => {
    mockMatchMedia(false)
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] })
    const { result } = renderHook(() => useCountUp(30, true, 300))
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(30)
  })
})

describe('home page motion', () => {
  it('gives screen readers final stat values and hides the decorative preview', async () => {
    mockMatchMedia(true)
    vi.spyOn(api, 'fetchProgressOverview').mockResolvedValue({
      user_id: 7,
      user_name: 'Demo Learner',
      overall_pct: 3,
      paths: [1, 2, 3].map((i) => ({
        path_id: i,
        title: `Path ${i}`,
        completed: i === 1 ? 1 : 0,
        total: 10,
        pct: i === 1 ? 10 : 0,
      })),
    })
    vi.spyOn(api, 'fetchRunbooks').mockResolvedValue(new Array(25).fill(null))
    vi.spyOn(api, 'fetchProgressSummary').mockResolvedValue({ streak_days: 0, last_active: null, continue_node: null })
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    const stats = await screen.findByRole('region', { name: 'At a glance' })
    const thirty = await screen.findAllByText('30')
    expect(thirty.some((el) => !el.closest('[aria-hidden="true"]'))).toBe(true)
    expect(stats).toHaveTextContent('Training paths')
    expect(stats).toHaveTextContent('25')
    expect(screen.getByRole('img', { name: '3% of all topics done' })).toBeInTheDocument()
    // The hero roadmap preview is decorative.
    expect(container.querySelector('svg[aria-hidden="true"][viewBox="0 0 360 400"]')).not.toBeNull()
  })
})

describe('navigateWithTransition', () => {
  const doc = document as unknown as { startViewTransition?: unknown }

  afterEach(() => {
    delete doc.startViewTransition
  })

  it('navigates straight away where the View Transitions API is missing', () => {
    mockMatchMedia(false)
    const navigate = vi.fn()
    navigateWithTransition(navigate, '/roadmaps', { replace: true })
    expect(navigate).toHaveBeenCalledWith('/roadmaps', { replace: true })
  })

  it('skips the transition under reduced motion', () => {
    mockMatchMedia(true)
    const start = vi.fn()
    doc.startViewTransition = start
    const navigate = vi.fn()
    navigateWithTransition(navigate, '/chat')
    expect(start).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/chat', {})
  })

  it('navigates inside a view transition when available', async () => {
    mockMatchMedia(false)
    let update: (() => Promise<void> | void) | undefined
    doc.startViewTransition = vi.fn((cb: () => Promise<void> | void) => {
      update = cb
      return { ready: Promise.resolve() }
    })
    const navigate = vi.fn()
    navigateWithTransition(navigate, -1)
    expect(navigate).not.toHaveBeenCalled()
    await update?.()
    expect(navigate).toHaveBeenCalledWith(-1)
  })
})

describe('meterStyle', () => {
  it('clamps the percentage to the track', () => {
    expect(meterStyle(40)).toEqual({ '--p': 0.4 })
    expect(meterStyle(140)).toEqual({ '--p': 1 })
    expect(meterStyle(-5)).toEqual({ '--p': 0 })
  })
})

describe('ProgressRing', () => {
  it('shows the final value at once under reduced motion and exposes it as a progress bar', () => {
    mockMatchMedia(true)
    render(<ProgressRing value={40} label="Platform Core progress" />)
    const bar = screen.getByRole('progressbar', { name: 'Platform Core progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    expect(bar).toHaveTextContent('40%')
  })

  it('clamps and rounds the value', () => {
    mockMatchMedia(true)
    render(<ProgressRing value={104.6} label="Over" />)
    expect(screen.getByRole('progressbar', { name: 'Over' })).toHaveAttribute('aria-valuenow', '100')
  })
})
