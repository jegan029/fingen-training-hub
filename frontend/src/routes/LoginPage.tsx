import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, loginUser } from '../api'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'
import BrandPanel from '../components/login/BrandPanel'
import LoginScene from '../components/login/LoginScene'
import SignInCard, { type SignInPhase } from '../components/login/SignInCard'
import { navigateWithTransition } from '../lib/motion'
import styles from './LoginPage.module.css'

// How long the check on the button shows before home takes over (the transition itself is 250 ms).
const SUCCESS_HOLD_MS = 200
// Used only if a 429 arrives without Retry-After; the login limit is 5 per minute.
const FALLBACK_WAIT_S = 60

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState<SignInPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  // Seconds left before another attempt is allowed, and whether a rate limit is (or was) in force.
  const [retryIn, setRetryIn] = useState(0)
  const [limited, setLimited] = useState(false)
  const [attempt, setAttempt] = useState(0)

  /* Already logged in → go home */
  useEffect(() => {
    if (user && phase === 'idle') navigate('/', { replace: true })
  }, [user, phase, navigate])

  useEffect(() => {
    if (retryIn <= 0) return
    const timer = window.setTimeout(() => setRetryIn((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [retryIn])

  const handleSubmit = async () => {
    setError(null)
    setLimited(false)
    setPhase('submitting')
    try {
      const u = await loginUser(email.trim(), password)
      setPhase('success')
      window.setTimeout(() => {
        navigateWithTransition(navigate, '/', { replace: true, prepare: () => login(u), kind: 'signin' })
      }, SUCCESS_HOLD_MS)
    } catch (err) {
      setPhase('idle')
      setAttempt((n) => n + 1)
      if (err instanceof ApiError && err.status === 429) {
        setLimited(true)
        setRetryIn(err.retryAfter ?? FALLBACK_WAIT_S)
      } else {
        setError('Invalid email or password. Please try again.')
      }
    }
  }

  const status = limited
    ? retryIn > 0
      ? `Too many attempts. Try again in ${retryIn} ${retryIn === 1 ? 'second' : 'seconds'}.`
      : 'You can try again now.'
    : error

  return (
    <div className={styles.screen}>
      <section className={styles.brand} aria-label="About FinGen Training Hub">
        <LoginScene />
        <BrandPanel />
      </section>

      <div className={styles.signin}>
        <div className={styles.center}>
          <SignInCard
            email={email}
            password={password}
            onEmail={(v) => {
              setEmail(v)
              if (!limited) setError(null)
            }}
            onPassword={setPassword}
            onSubmit={handleSubmit}
            phase={phase}
            status={status}
            retryIn={retryIn}
            attempt={attempt}
          />

          {/* Development builds only; passwords are never shipped in the bundle. */}
          {import.meta.env.DEV && (
            <aside className={styles.dev} aria-label="Development build">
              <p className={styles.devTitle}>Development build</p>
              <p className={styles.devText}>Demo accounts (passwords come from the backend .env or its console):</p>
              <div className={styles.devRow}>
                {['admin@fingen.demo', 'learner@fingen.demo'].map((demo) => (
                  <button
                    key={demo}
                    type="button"
                    className={styles.devEmail}
                    onClick={() => {
                      setEmail(demo)
                      setError(null)
                    }}
                  >
                    {demo}
                  </button>
                ))}
              </div>
            </aside>
          )}
        </div>

        <footer className={styles.smallPrint}>
          <span>Version {__APP_VERSION__}</span>
          <ThemeToggle />
        </footer>
      </div>
    </div>
  )
}
