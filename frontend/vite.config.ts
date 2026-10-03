import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// Content Security Policy for the production build. The dev server is excluded because
// Vite injects an inline script for hot reload there.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React style={{}} props are applied through the CSSOM, which style-src does not block.
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

// Backend for the dev and preview proxies; the e2e tests point this at their own backend.
const API_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  // Shown in the sign in page's small print.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    // Emit every asset as a file (no data: URIs) so the CSP can stay self only.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: SECURITY_HEADERS,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ holds Playwright specs, run with `npm run test:e2e`.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
