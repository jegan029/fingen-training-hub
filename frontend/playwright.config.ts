import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { E2E_ADMIN, E2E_LEARNER } from './e2e/accounts'

/*
 * End to end tests run against their own backend (fresh SQLite file, offline LLM provider)
 * and their own Vite server, on ports that do not clash with a normal dev setup.
 * Nothing touches backend/app/data/app.db.
 */
const API_PORT = 8100
const WEB_PORT = 5190

// Set once in the main process; workers inherit it, so everyone agrees on the DB file.
process.env.E2E_RUN_ID ??= String(Date.now())
const dbPath = join(tmpdir(), `fingen-e2e-${process.env.E2E_RUN_ID}.db`)

// The backend's virtualenv if there is one (path relative to backend/), otherwise python on PATH (CI).
const venvPython =
  process.platform === 'win32' ? join('.venv', 'Scripts', 'python.exe') : join('.venv', 'bin', 'python')
const python = process.env.E2E_PYTHON ?? (existsSync(join('..', 'backend', venvPython)) ? venvPython : 'python')

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: use an installed Chromium based browser instead of Playwright's download.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: '../backend',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        APP_ENV: 'development',
        APP_SECRET_KEY: 'e2e-only-secret-key-that-is-at-least-32-bytes', // gitleaks:allow (test-only value)
        DB_PATH: dbPath,
        SEED_ADMIN_PASSWORD: E2E_ADMIN.password,
        SEED_LEARNER_PASSWORD: E2E_LEARNER.password,
        LLM_PROVIDER: 'offline',
        // The suite signs in from one address more than the production limit of 5 a minute allows.
        LOGIN_RATE_LIMIT: '30/minute',
        // ServiceNow in mock mode (synthetic fixtures, no network). No schedule: the admin test syncs.
        SERVICENOW_ENABLED: 'true',
        SERVICENOW_MOCK_MODE: 'true',
        SERVICENOW_SCHEDULER: 'false',
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
})
