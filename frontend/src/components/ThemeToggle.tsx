import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { currentTheme, setTheme, type Theme } from '../lib/theme'
import styles from './ThemeToggle.module.css'

export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(currentTheme)

  // Track OS changes while the user has not picked a theme explicitly.
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = () => setThemeState(currentTheme())
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => {
        setTheme(next)
        setThemeState(next)
      }}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  )
}
