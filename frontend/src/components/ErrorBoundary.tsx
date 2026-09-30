import { Component, type ErrorInfo, type ReactNode } from 'react'
import StateMessage from './ui/StateMessage'
import page from '../styles/page.module.css'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render errors (and failed lazy chunk loads) so one broken page does not blank the app.
 * App.tsx keys it by pathname, so navigating elsewhere clears the error.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    // A new deploy renames chunks; a reload fetches the current ones.
    const chunkFailed = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(
      this.state.error.message,
    )
    return (
      <div className={page.page}>
        <StateMessage
          tone="error"
          title={chunkFailed ? 'This page could not be loaded' : 'Something went wrong on this page'}
          action={
            <div className={page.actions}>
              <button
                type="button"
                className={`${page.btn} ${page.btnPrimary}`}
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
              <a className={page.btn} href="/">
                Go to the home page
              </a>
            </div>
          }
        >
          {chunkFailed
            ? 'The app may have been updated. Reloading usually fixes this.'
            : 'The rest of the app still works. Reload to try again, or head back to the home page.'}
        </StateMessage>
      </div>
    )
  }
}
