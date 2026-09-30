import { lazy, Suspense } from 'react'
import { Route, Routes, Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
// The login and home pages are the usual entry points, so they ship in the main bundle; the rest load on demand.
import LoginPage from './routes/LoginPage'
import HomePage from './routes/HomePage'
import Logo from './components/Logo'
import ThemeToggle from './components/ThemeToggle'
import CommandPalette from './components/CommandPalette'
import ErrorBoundary from './components/ErrorBoundary'
import Skeleton from './components/ui/Skeleton'
import page from './styles/page.module.css'
import styles from './App.module.css'

const RoadmapViewer = lazy(() => import('./routes/RoadmapViewer'))
const ModuleView = lazy(() => import('./routes/ModuleView'))
const NodeContentPage = lazy(() => import('./routes/NodeContentPage'))
const ChatAssistant = lazy(() => import('./routes/ChatAssistant'))
const AssessmentPage = lazy(() => import('./routes/AssessmentPage'))
const ScenarioAssessment = lazy(() => import('./routes/ScenarioAssessment'))
const AnalyticsDashboard = lazy(() => import('./routes/AnalyticsDashboard'))
const RunbookLibrary = lazy(() => import('./routes/RunbookLibrary'))
const Certificate = lazy(() => import('./routes/Certificate'))
const AdminView = lazy(() => import('./routes/AdminView'))
const Credits = lazy(() => import('./routes/Credits'))
const NotFound = lazy(() => import('./routes/NotFound'))

/* ── Route guard ─────────────────────────────────────────── */
function PrivateRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function PageFallback() {
  return (
    <div className={page.page}>
      <Skeleton height={36} width="40%" label="Loading page" />
      <div className={styles.fallbackBody}>
        <Skeleton lines={5} height={18} label="Loading page" />
      </div>
    </div>
  )
}

/* ── Topbar ──────────────────────────────────────────────── */
function Topbar() {
  const { pathname } = useLocation()
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  const active = (path: string) => (pathname === path || pathname.startsWith(path + '/') ? 'active' : '')

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className={`brand ${styles.brand}`}>
          <Logo size={30} />
        </Link>
        <nav className="topnav" aria-label="Main">
          <Link to="/roadmaps" className={active('/roadmaps')}>
            Training Paths
          </Link>
          <Link to="/runbooks" className={active('/runbooks')}>
            Runbooks
          </Link>
          <Link to="/chat" className={active('/chat')}>
            AI Tutor
          </Link>
          {isAdmin && (
            <Link to="/analytics/1" className={pathname.startsWith('/analytics') ? 'active' : ''}>
              Analytics
            </Link>
          )}
          <Link to="/certificate" className={active('/certificate')}>
            Certificate
          </Link>
          {isAdmin && (
            <Link to="/admin" className={`${active('/admin')} nav-admin`}>
              Admin
            </Link>
          )}
        </nav>
        <div className={styles.tools}>
          <CommandPalette />
          <ThemeToggle />
        </div>
        {user && (
          <div className={styles.user}>
            <span className={styles.userName}>{user.name}</span>
            <button onClick={handleLogout} className="ss-btn ss-btn-ghost ss-btn-sm">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

/* ── Footer ──────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="ss-footer">
      <div className="ss-footer-inner">
        <div className="ss-footer-brand">
          <div className="ss-footer-brand-row">
            <Logo tone="light" size={28} subtitle={false} />
          </div>
          <p className="ss-footer-tagline">L2 Support Engineer Training Hub</p>
        </div>
        <div className="ss-footer-links">
          <Link to="/roadmaps">Training Paths</Link>
          <Link to="/chat">AI Tutor</Link>
          <Link to="/analytics/1">Analytics</Link>
          <Link to="/runbooks">Runbooks</Link>
          <Link to="/admin">Admin</Link>
          <Link to="/credits">Image credits</Link>
        </div>
        <p className="ss-footer-copy">
          FinGen Training Hub.
          <br />A demo learning platform.
        </p>
      </div>
    </footer>
  )
}

/* ── App shell (inside BrowserRouter + AuthProvider) ─────── */
function AppShell() {
  const { pathname } = useLocation()
  const { loading } = useAuth()
  const isLogin = pathname === '/login'
  // Until the session check finishes, pages render nothing; hiding the chrome too stops the footer
  // from sitting in view and then jumping down when content arrives (a large layout shift).
  const showChrome = !isLogin && !loading

  return (
    <div className="app-shell">
      {showChrome && <Topbar />}
      <main className="page-content" id="main">
        {/* Keyed by path so an error on one page clears when the user navigates away. */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/credits" element={<Credits />} />
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <HomePage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/roadmaps"
                element={
                  <PrivateRoute>
                    <RoadmapViewer />
                  </PrivateRoute>
                }
              />
              <Route
                path="/roadmaps/:pathId"
                element={
                  <PrivateRoute>
                    <ModuleView />
                  </PrivateRoute>
                }
              />
              <Route
                path="/learn/:nodeId"
                element={
                  <PrivateRoute>
                    <NodeContentPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/chat"
                element={
                  <PrivateRoute>
                    <ChatAssistant />
                  </PrivateRoute>
                }
              />
              <Route
                path="/assessment/:nodeId"
                element={
                  <PrivateRoute>
                    <AssessmentPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/scenario/:nodeId"
                element={
                  <PrivateRoute>
                    <ScenarioAssessment />
                  </PrivateRoute>
                }
              />
              <Route
                path="/analytics/:pathId"
                element={
                  <PrivateRoute adminOnly>
                    <AnalyticsDashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/runbooks"
                element={
                  <PrivateRoute>
                    <RunbookLibrary />
                  </PrivateRoute>
                }
              />
              <Route
                path="/certificate"
                element={
                  <PrivateRoute>
                    <Certificate />
                  </PrivateRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <PrivateRoute adminOnly>
                    <AdminView />
                  </PrivateRoute>
                }
              />
              <Route
                path="*"
                element={
                  <PrivateRoute>
                    <NotFound />
                  </PrivateRoute>
                }
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {showChrome && <Footer />}
    </div>
  )
}

/* ── Root export — wraps AppShell in AuthProvider ────────── */
export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
