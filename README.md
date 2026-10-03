# FinGen Training Hub

An onboarding platform for L2 support engineers on the (fictional) Fingen platform, inspired by roadmap.sh. Learners work through three training paths laid out as interactive roadmaps, mark topics done, take LLM scored assessments and scenario quizzes, ask a RAG style AI tutor, browse approved runbooks and earn a certificate. Trainers get a cohort dashboard.

Built with FastAPI and SQLite on the backend and React 18, TypeScript and Vite on the frontend. This is a demo: all people, accounts and procedures are made up.

## Features

- **Roadmaps.** Each path is a 2D roadmap: a spine of topics with subtopics branching off, taken from each lesson's `##` headings. A topic can be pending, in progress, done or skipped. Skipping unlocks later topics but does not count as done. The side drawer has keyboard shortcuts (D, P, S, R, Esc), and on phones the roadmap becomes a list with a bottom sheet.
- **Lessons, assessments and scenarios.** Markdown lessons (sanitised), open ended answers scored 0 to 10 by an LLM, and multiple choice scenarios.
- **AI tutor.** Answers only from the selected path's lessons. Learner input is fenced and treated as data.
- **Runbook library.** 25 approved runbooks, linked from the topics they support, plus runbooks and SOPs synced from ServiceNow.
- **ServiceNow knowledge.** A read only sync of ServiceNow knowledge articles with their classification, applications and documents: a Knowledge Library with filters, article and application pages, document downloads, links from roadmap topics, and an admin panel with sync status and an access audit. Classification is enforced on the server for every user, and confidential and restricted articles never reach the LLM. Runs on synthetic fixtures (mock mode) by default; see [`docs/SERVICENOW_INTEGRATION.md`](docs/SERVICENOW_INTEGRATION.md).
- **Search.** Press Ctrl K (Cmd K on a Mac) to search paths, topics, subtopics, runbooks and, within your clearance, articles, applications and documents.
- **Progress.** A daily streak, "continue where you left off", and a certificate the server grants only when every topic is done and the assessment average reaches the threshold.
- **Trainer view.** Per learner progress, cohort analytics and the weakest topics by average score.
- **Accessibility and themes.** Light and dark themes. The UI works by keyboard and respects reduced motion. Lighthouse on the home page: mobile 93/100/100, desktop 100/100/100 (performance, accessibility, best practices).

## Quick start (Docker)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env: set APP_SECRET_KEY (32+ bytes) and, for demo accounts, APP_ENV=development
docker compose up --build
```

Open http://localhost:8080. nginx serves the app with a strict Content Security Policy and proxies `/api` to the backend. The backend container is not exposed directly. The database lives in the `fingen-data` volume.

## Local development

Requirements: Python 3.11+ and Node 20+.

```bash
# Backend
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows; use source .venv/bin/activate elsewhere
pip install -r requirements-dev.txt
cp .env.example .env              # then set APP_ENV=development
uvicorn app.main:app --reload --port 8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                       # http://localhost:5173, proxies /api to :8000
```

With `APP_ENV=development` the backend creates two accounts, `admin@fingen.demo` and `learner@fingen.demo`. Their passwords come from `SEED_ADMIN_PASSWORD` and `SEED_LEARNER_PASSWORD`. If those are unset, passwords are generated and printed once in the backend console. API docs are at http://localhost:8000/docs (development only).

## Configuration

Every setting is documented in [`backend/.env.example`](backend/.env.example). The main ones:

| Variable | Purpose |
|---|---|
| `APP_ENV` | `production` (default: requires `APP_SECRET_KEY`, no demo accounts, no `/docs`) or `development` |
| `APP_SECRET_KEY` | Signs session tokens; at least 32 bytes |
| `CORS_ORIGINS` | Browser origins allowed to call the API directly |
| `LLM_PROVIDER` | `openai_compatible` (OpenAI, NVIDIA NIM, vLLM, Ollama...), `anthropic`, or `offline` (no network; deterministic answers for demos) |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Provider endpoint, key and model |
| `CERT_MIN_AVG_SCORE` | Assessment average needed for the certificate (default 7) |
| `SEED_ADMIN_PASSWORD`, `SEED_LEARNER_PASSWORD` | Demo account passwords (development only) |
| `SERVICENOW_ENABLED`, `SERVICENOW_MOCK_MODE` | ServiceNow knowledge sync; both default to on in development (synthetic fixtures, no network) and off in production |
| `SERVICENOW_INSTANCE_URL`, `SERVICENOW_CLIENT_ID`, `SERVICENOW_CLIENT_SECRET` | Instance and OAuth client for a real sync (read only service account) |
| `SERVICENOW_LLM_MAX_CLASSIFICATION` | Highest article classification ever sent to the LLM (default `internal`) |

Without a working LLM configuration the app still runs: the tutor and the assessments show an "unavailable" message. Set `LLM_PROVIDER=offline` for a fully local demo.

To connect a real ServiceNow instance, follow [`docs/SERVICENOW_INTEGRATION.md`](docs/SERVICENOW_INTEGRATION.md): it covers the integration account's permissions, `mapping.yaml` and `scripts/servicenow_probe.py`, which checks the mapping against an instance without printing secrets or article text.

## Tests and checks

```bash
cd backend
python -m pytest                   # API, security, roadmap, providers, no-dashes content check
ruff check . && ruff format --check .
pip-audit -r requirements.txt && bandit -r app -q

cd frontend
npm run lint && npm run format:check && npm run typecheck
npm test                           # Vitest + Testing Library
npm run test:e2e                   # Playwright; starts its own backend and Vite on spare ports
npm audit --audit-level=high
```

The Playwright run uses a temporary database, the offline LLM provider and ServiceNow mock mode, so it never touches your data or the network. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an installed Chromium based browser instead of Playwright's download.

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on every pull request in ServiceNow mock mode, plus a probe smoke test and gitleaks scans of the full history and the working tree. `.pre-commit-config.yaml` runs the fast checks locally (`pip install pre-commit && pre-commit install`).

## Project layout

```
backend/
  app/
    main.py            FastAPI app, middleware, router mounting
    security.py        session cookie (JWT), auth guards, CSRF and security headers
    db.py              SQLite schema, migrations, dataset sync, dev seeding
    routers/           thin HTTP layer
    services/          logic: progress, search, certificate, knowledge, classification, LLM providers...
    integrations/servicenow/   read only ServiceNow client, mapping.yaml, mock fixtures, sync engine
    data/demo_dataset.json   paths, lessons and runbooks (source of truth for content)
  tests/
frontend/
  src/
    routes/            one component per page (lazy loaded)
    components/        roadmap canvas and drawer, command palette, UI primitives
    styles/            design tokens (light and dark) and shared page styles
  e2e/                 Playwright specs
docs/SERVICENOW_INTEGRATION.md   ServiceNow setup, permissions, mapping, sync and classification
scripts/check_no_dashes.py   content style check
scripts/servicenow_probe.py  checks the ServiceNow mapping against an instance (or the fixtures)
```

## Security

Sessions use an httpOnly, SameSite=Strict cookie. Every state changing request needs a CSRF header. Passwords are hashed with argon2id, and login and LLM endpoints are rate limited. Lesson and AI output is rendered through a sanitising Markdown renderer. ServiceNow content is sanitised on the server, attachments are checked by type, size and magic bytes, the client only talks to an allowlisted HTTPS host, and credentials are redacted from logs. [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) lists every finding and its fix.

## Credits

Photos and illustrations are listed in [`frontend/src/assets/images/CREDITS.md`](frontend/src/assets/images/CREDITS.md) and on the in-app Image credits page.
