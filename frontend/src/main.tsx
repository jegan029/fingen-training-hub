import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
// Self-hosted fonts (no third-party requests; works under a self-only CSP).
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/900.css'
import '@fontsource/playfair-display/700-italic.css'
import './styles/tokens.css'
import './styles.css'
import { applyStoredTheme } from './lib/theme'

applyStoredTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
