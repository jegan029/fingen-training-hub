import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import AnalyticsDashboard from '../routes/AnalyticsDashboard'
import type { AnalyticsSummary, LearningPath } from '../types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const summary = (path_id: number, completion_rate: number, average_score: number | null): AnalyticsSummary => ({
  path_id,
  completed_nodes: 3.5,
  total_nodes: 10,
  completion_rate,
  average_score,
  learners: 4,
})

describe('analytics overview', () => {
  it('summarises every path, shows final values and marks a failed path unavailable', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.spyOn(api, 'fetchRoadmaps').mockResolvedValue(
      ['Platform Core', 'Transaction Flows', 'L2 Support'].map(
        (title, i) => ({ id: i + 1, slug: `p${i}`, title, description: '' }) as LearningPath,
      ),
    )
    vi.spyOn(api, 'fetchAnalytics').mockImplementation(async (id: number) => {
      if (id === 3) throw new Error('boom')
      return id === 1 ? summary(1, 40, 7.2) : summary(2, 20, null)
    })

    render(
      <MemoryRouter initialEntries={['/analytics/1']}>
        <Routes>
          <Route path="/analytics/:pathId" element={<AnalyticsDashboard />} />
        </Routes>
      </MemoryRouter>,
    )

    const glance = await screen.findByRole('region', { name: 'Onboarding at a glance' })
    const legend = within(glance).getByRole('list', { name: 'Completion by path, outer ring first' })
    expect(legend).toHaveTextContent('Platform Core40% complete')
    expect(legend).toHaveTextContent('L2 SupportUnavailable')
    expect(glance).toHaveTextContent('30% average completion')
    expect(glance).toHaveTextContent('7.2 of 10')
    expect(glance).toHaveTextContent('No scores yet')

    // Per path stats count up, but reduced motion shows the final values.
    expect(await screen.findByText('Avg. topics done per learner')).toBeInTheDocument()
    expect(screen.getAllByText('3.5').length).toBeGreaterThan(0)
  })
})
