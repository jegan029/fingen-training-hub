import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Eye, EyeOff, KeyRound, Lock, Mail } from 'lucide-react'
import styles from './SignInCard.module.css'

export type SignInPhase = 'idle' | 'submitting' | 'success'

interface SignInCardProps {
  email: string
  password: string
  onEmail: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: () => void
  phase: SignInPhase
  /** Error or rate limit text, read out politely and linked to both fields. */
  status: string | null
  /** Seconds left before another attempt is allowed (429); sign in stays disabled until 0. */
  retryIn: number
  /** Changes on every failed attempt, so the card shakes each time. */
  attempt: number
}

const STATUS_ID = 'signin-status'
const CAPS_ID = 'signin-caps'

/**
 * The sign in form. Presentation only: the page owns the request, the error text and the countdown.
 * Floating labels sit after their inputs so CSS can lift them once a field has focus or a value.
 */
export default function SignInCard({
  email,
  password,
  onEmail,
  onPassword,
  onSubmit,
  phase,
  status,
  retryIn,
  attempt,
}: SignInCardProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  const busy = phase !== 'idle'
  const canSubmit = !busy && retryIn === 0 && email.trim() !== '' && password !== ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canSubmit) onSubmit()
  }

  const trackCaps = (e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'))
  }

  const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined

  return (
    <div className={styles.card} data-shake={attempt === 0 ? undefined : attempt % 2 ? 'a' : 'b'}>
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.subtitle}>Sign in to continue your training</p>

      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <input
            id="login-email"
            className={styles.input}
            type="email"
            inputMode="email"
            placeholder=" "
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            disabled={busy}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            aria-invalid={status && retryIn === 0 ? true : undefined}
            aria-describedby={describedBy(!!status && STATUS_ID)}
          />
          <label className={styles.label} htmlFor="login-email">
            Email address
          </label>
          <Mail size={18} aria-hidden="true" className={styles.icon} />
        </div>

        <div className={styles.field}>
          <input
            id="login-password"
            className={`${styles.input} ${styles.withToggle}`}
            type={showPassword ? 'text' : 'password'}
            placeholder=" "
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            onKeyDown={trackCaps}
            onKeyUp={trackCaps}
            onBlur={() => setCapsOn(false)}
            disabled={busy}
            autoComplete="current-password"
            aria-invalid={status && retryIn === 0 ? true : undefined}
            aria-describedby={describedBy(capsOn && CAPS_ID, !!status && STATUS_ID)}
          />
          <label className={styles.label} htmlFor="login-password">
            Password
          </label>
          <Lock size={18} aria-hidden="true" className={styles.icon} />
          <button
            type="button"
            className={styles.reveal}
            aria-pressed={showPassword}
            aria-label="Show password"
            aria-controls="login-password"
            onClick={() => setShowPassword((s) => !s)}
          >
            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>

        {capsOn && (
          <p id={CAPS_ID} className={styles.caps}>
            <KeyRound size={14} aria-hidden="true" />
            Caps Lock is on
          </p>
        )}

        <p id={STATUS_ID} className={styles.status} aria-live="polite">
          {status}
        </p>

        <button type="button" className={styles.forgot} onClick={() => dialog.current?.showModal()}>
          Forgot password?
        </button>

        <button type="submit" className={styles.submit} data-phase={phase} disabled={!canSubmit}>
          <span className={styles.submitLabel} aria-hidden={busy || undefined}>
            Sign in
          </span>
          <svg className={styles.spinner} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="9" pathLength={1} />
          </svg>
          <svg className={styles.check} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
          </svg>
          <span className={styles.srOnly}>
            {phase === 'submitting' ? 'Signing in' : phase === 'success' ? 'Signed in' : ''}
          </span>
        </button>
      </form>

      <dialog ref={dialog} className={styles.dialog} aria-labelledby="forgot-title">
        <h2 id="forgot-title" className={styles.dialogTitle}>
          Forgot your password?
        </h2>
        <p className={styles.dialogText}>Contact your training administrator to reset it.</p>
        <form method="dialog">
          <button type="submit" className={styles.dialogClose} autoFocus>
            Close
          </button>
        </form>
      </dialog>
    </div>
  )
}
