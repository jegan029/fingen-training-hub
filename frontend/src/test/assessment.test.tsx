import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import AssessmentPage from '../routes/AssessmentPage'
import type { AssessmentResult } from '../types'

function reduceMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('assessment evaluation', () => {
  it('shows the evaluating state, then the result with focus on it', async () => {
    reduceMotion()
    vi.spyOn(api, 'fetchAssessmentQuestion').mockResolvedValue({ node_id: 1, question: 'Explain the tiers.' })
    let resolve: (r: AssessmentResult) => void = () => {}
    vi.spyOn(api, 'submitAssessment').mockReturnValue(new Promise((r) => (resolve = r)))

    render(
      <MemoryRouter initialEntries={['/assessment/1']}>
        <Routes>
          <Route path="/assessment/:nodeId" element={<AssessmentPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('Explain the tiers.')
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Three tiers.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }))

    expect(await screen.findByRole('status', { name: 'Evaluating your answer' })).toBeInTheDocument()

    await act(async () => {
      resolve({
        node_id: 1,
        score: 7,
        category: 'Good',
        feedback: 'Solid answer.',
        key_points: ['Name the data layer'],
      })
    })

    expect(screen.queryByRole('status', { name: 'Evaluating your answer' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Evaluation' })).toHaveFocus()
    expect(screen.getByText('Score 7 out of 10, Good.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Score' })).toHaveAttribute('aria-valuenow', '7')
    expect(screen.getByText('Name the data layer')).toBeInTheDocument()
  })
})
