export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'fingen-theme'

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The theme currently in effect: an explicit choice, otherwise the OS preference. */
export function currentTheme(): Theme {
  return readStored() ?? systemTheme()
}

/** Called once before render so an explicit choice applies without a flash. */
export function applyStoredTheme(): void {
  const stored = readStored()
  if (stored) document.documentElement.dataset.theme = stored
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* storage unavailable: the choice lasts for this page view */
  }
}
