import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, loginUser } from '../api'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'
import page from '../styles/page.module.css'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /* Already logged in → go home */
  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      const u = await loginUser(email.trim(), password)
      login(u)
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Too many sign in attempts. Please wait a minute and try again.'
          : 'Invalid email or password. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.logo}>
        <Logo tone="light" size={36} />
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.subtitle}>L2 Support Engineer Onboarding Platform</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={page.field}>
            <label className={page.label} htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              className={page.input}
              type="email"
              placeholder="you@fingen.demo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoFocus
              autoComplete="email"
            />
          </div>

          <div className={page.field}>
            <label className={page.label} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className={page.input}
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className={page.error} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className={`${page.btn} ${page.btnPrimary} ${styles.submit}`}
            disabled={loading || !email.trim() || !password}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      {/* Demo accounts (development builds only; passwords are never shipped in the bundle) */}
      {import.meta.env.DEV && (
        <div className={styles.demo}>
          <p className={styles.demoTitle}>Demo accounts</p>
          {[
            { role: 'Admin', email: 'admin@fingen.demo' },
            { role: 'Learner', email: 'learner@fingen.demo' },
          ].map((c) => (
            <div key={c.role} className={styles.demoRow}>
              <span className={styles.demoRole}>{c.role}</span>
              <button
                type="button"
                className={styles.demoEmail}
                onClick={() => {
                  setEmail(c.email)
                  setError(null)
                }}
              >
                {c.email}
              </button>
            </div>
          ))}
          <p className={styles.demoNote}>
            Click an email to fill it in. Passwords come from SEED_ADMIN_PASSWORD and SEED_LEARNER_PASSWORD, or are
            printed in the backend console when the accounts are first created.
          </p>
        </div>
      )}
    </div>
  )
}
