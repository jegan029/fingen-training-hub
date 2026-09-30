import { act, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCountUp } from '../lib/motion'
import HomePage from '../routes/HomePage'
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
