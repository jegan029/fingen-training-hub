import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchMe, logoutUser, onUnauthorized } from '../api'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  /** True until the first /auth/me check finishes. */
  loading: boolean
  login: (user: AuthUser) => void
  logout: () => Promise<void>
  /** Cosmetic only: hides admin UI. The server enforces every permission. */
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
  isAdmin: false,
})

// Earlier versions kept the user (including role) in localStorage; remove any stale copy.
const LEGACY_STORAGE_KEY = 'ss_auth_user'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      /* storage unavailable */
    }
    // The session lives in an httpOnly cookie; ask the server who we are.
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))

    onUnauthorized(() => setUser(null))
    return () => onUnauthorized(null)
  }, [])

  const login = useCallback((u: AuthUser) => setUser(u), [])

  const logout = useCallback(async () => {
    try {
      await logoutUser()
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
