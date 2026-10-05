import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import LoginPage from '../routes/LoginPage'

const login = vi.fn()
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, login }) }))

function media(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return {
    email: screen.getByLabelText('Email address'),
    password: screen.getByLabelText('Password', { selector: 'input' }),
    submit: screen.getByRole('button', { name: /^Sign in/ }),
  }
}

function fill(fields: ReturnType<typeof renderLogin>) {
  fireEvent.change(fields.email, { target: { value: 'learner@fingen.demo' } })
  fireEvent.change(fields.password, { target: { value: 'wrong' } })
}

beforeEach(() => {
  media(true)
  vi.spyOn(api, 'fetchPublicStats').mockResolvedValue({ paths: 3, lessons: 30, runbooks: 25 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  login.mockReset()
})

describe('sign in page', () => {
  it('shows the brand panel and the sign in card', async () => {
    renderLogin()
    const brand = screen.getByRole('region', { name: 'About FinGen Training Hub' })
    expect(within(brand).getByText('Become production ready, faster.')).toBeInTheDocument()
    expect(within(brand).getByText('Live runbooks and SOPs from ServiceNow')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAttribute('autocomplete', 'current-password')
    // Reduced motion: the counts show their final values straight away, and the text holds the real number.
    expect(await within(brand).findByText(/lessons/)).toHaveTextContent('30 30 lessons')
  })

  it('leaves the stats out when the public endpoint fails', async () => {
    vi.spyOn(api, 'fetchPublicStats').mockRejectedValue(new Error('down'))
    renderLogin()
    await act(async () => {})
    expect(screen.queryByText(/lessons/)).not.toBeInTheDocument()
  })

  it('shows and hides the password with a pressed toggle', () => {
    const { password } = renderLogin()
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(password).toHaveAttribute('type', 'password')
    fireEvent.click(toggle)
    expect(password).toHaveAttribute('type', 'text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(password).toHaveAttribute('type', 'password')
  })

  it('warns when Caps Lock is on and links the warning to the password field', () => {
    const { password } = renderLogin()
    fireEvent.keyDown(password, { key: 'A', modifierCapsLock: true })
    const warning = screen.getByText('Caps Lock is on')
    expect(password.getAttribute('aria-describedby')).toContain(warning.id)
    fireEvent.keyUp(password, { key: 'A', modifierCapsLock: false })
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument()
  })

  it('keeps the generic message for a wrong password, announced and linked to both fields', async () => {
    vi.spyOn(api, 'loginUser').mockRejectedValue(new api.ApiError(401, 'Invalid email or password'))
    const fields = renderLogin()
    fill(fields)
    fireEvent.click(fields.submit)
    const status = await screen.findByText('Invalid email or password. Please try again.')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(fields.email).toHaveAttribute('aria-describedby', status.id)
    expect(fields.password.getAttribute('aria-describedby')).toContain(status.id)
    expect(fields.email).toHaveAttribute('aria-invalid', 'true')
    expect(login).not.toHaveBeenCalled()
  })

  it('counts down a rate limit from Retry-After and allows a retry at zero', async () => {
    vi.useFakeTimers()
    vi.spyOn(api, 'loginUser').mockRejectedValue(new api.ApiError(429, 'Rate limit exceeded', 2))
    const fields = renderLogin()
    fill(fields)
    await act(async () => {
      fireEvent.click(fields.submit)
    })
    expect(screen.getByText('Too many attempts. Try again in 2 seconds.')).toBeInTheDocument()
    expect(fields.submit).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Too many attempts. Try again in 1 second.')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('You can try again now.')).toBeInTheDocument()
    expect(fields.submit).toBeEnabled()
  })

  it('signs in, shows the check, then hands over to home', async () => {
    vi.useFakeTimers()
    const user = { id: 7, name: 'Demo Learner', email: 'learner@fingen.demo', role: 'learner' as const }
    vi.spyOn(api, 'loginUser').mockResolvedValue(user)
    const fields = renderLogin()
    fill(fields)
    await act(async () => {
      fireEvent.click(fields.submit)
    })
    expect(fields.submit).toHaveAttribute('data-phase', 'success')
    expect(fields.submit).toHaveTextContent('Signed in')
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(login).toHaveBeenCalledWith(user)
    expect(screen.getByText('Home page')).toBeInTheDocument()
  })

  it('under reduced motion the tips change only on request', async () => {
    vi.useFakeTimers()
    renderLogin()
    const tip = () => screen.getByRole('figure').querySelector('blockquote')!.textContent
    const first = tip()
    await act(async () => {
      vi.advanceTimersByTime(7000)
    })
    expect(tip()).toBe(first)
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }))
    expect(tip()).not.toBe(first)
  })

  it('rotates tips every 6 seconds and the pause button holds them', async () => {
    media(false)
    vi.useFakeTimers()
    renderLogin()
    const tip = () => screen.getByRole('figure').querySelector('blockquote')!.textContent
    const first = tip()
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })
    const second = tip()
    expect(second).not.toBe(first)
    const pause = screen.getByRole('button', { name: 'Pause tips' })
    fireEvent.click(pause)
    expect(pause).toHaveAttribute('aria-pressed', 'true')
    await act(async () => {
      vi.advanceTimersByTime(12000)
    })
    expect(tip()).toBe(second)
  })

  it('explains what to do about a forgotten password', () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true
    }
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('dialog', { name: 'Forgot your password?' })).toHaveTextContent(
      'Contact your training administrator to reset it.',
    )
  })
})
