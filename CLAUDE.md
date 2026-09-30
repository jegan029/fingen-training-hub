# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Orchestration
### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity 
### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution 
### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project 
### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness 
### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it 
### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing Cl tests without being told how
## Task Management
1. Plan First: Write plan to tasks/todo.md with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to tasks/todo.md
6. Capture Lessons: Update tasks/lessons.md after corrections
## Core Principles
- Simplicity First: Make every change as simple as possible. Impact minimal code.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Changes should only touch what's necessary. Avoid introducing bugs.

## Project Overview

"FinGen Training Hub" — an L2 support-engineer onboarding platform for the Fingen platform (roadmap.sh-inspired). Structured learning paths, LLM-scored assessments, a RAG chat tutor, and a runbook library. Stack: FastAPI + SQLite backend, React 18/TypeScript/Vite frontend.

Security findings and their status live in `SECURITY_REVIEW.md`. CI (`.github/workflows/ci.yml`) runs every check below on pull requests; `.pre-commit-config.yaml` has the fast ones.

### Checks

```bash
# Backend tests (temp DB per test via DB_PATH in tests/conftest.py, which also presets the CSRF header)
cd backend && .venv/Scripts/python -m pytest
.venv/Scripts/python -m pytest tests/test_roadmap.py::test_skipped_unlocks_dependents_but_is_not_done   # single test

# Frontend tests (Vitest + Testing Library, jsdom)
cd frontend && npm test
npx vitest run src/components/roadmap/layout.test.ts    # single file
npx vitest run -t "shortcut d sets status done"         # single test by name

# Lint and format (ruff config in backend/pyproject.toml; ESLint flat config + Prettier in frontend/)
cd backend && .venv/Scripts/ruff check . && .venv/Scripts/ruff format --check .
cd frontend && npm run lint && npm run format:check && npm run typecheck

# End to end (Playwright). Starts its own backend on :8100 (temp DB, LLM_PROVIDER=offline) and Vite on :5190,
# so it never touches app.db. Locally: PLAYWRIGHT_CHROMIUM_EXECUTABLE=<path to brave.exe or chrome.exe>
cd frontend && npm run test:e2e

# Content and security
python scripts/check_no_dashes.py --list                # also runs inside pytest
cd backend && .venv/Scripts/pip-audit -r requirements.txt && .venv/Scripts/bandit -r app -q
cd frontend && npm audit --audit-level=high
```

Formatting-only changes go in their own commit. Home page photos are regenerated with `cd frontend && node scripts/optimize-images.mjs <folder of source JPEGs>`.

## Development Commands

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # Windows PowerShell
pip install -r requirements-dev.txt   # runtime deps + pytest, pip-audit, bandit, ruff

uvicorn app.main:app --reload --port 8000
# without activating the venv:
.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

`app/config.py` loads `backend/.env` via python-dotenv (real env vars take precedence); it is read once at startup, so restart uvicorn after editing it. See `backend/.env.example` for every key. `APP_ENV` defaults to `production`, which **refuses to start without a 32+ byte `APP_SECRET_KEY`**, disables `/docs` and seeds no accounts; local work needs `APP_ENV=development`. LLM keys: `LLM_PROVIDER` (`openai_compatible` default, `anthropic`, or `offline`), `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT` (default 15), `LLM_RETRIES` (default 3). `CERT_MIN_AVG_SCORE` (default 7) gates the certificate. The configured provider is NVIDIA (`https://integrate.api.nvidia.com/v1`, model `nvidia/nemotron-3-super-120b-a12b`). Without a working key/model the app still runs; chat/assessment fall back to a canned message.

### Frontend

```bash
cd frontend
npm install
npm run dev      # port 5173
npm run build    # tsc type-check, then vite build
```

Vite proxies `/api/*` to `http://localhost:8000` (override with the `API_PROXY_TARGET` env var); `api.ts` uses relative `/api` (overridable via `VITE_API_BASE_URL`).

### Docker

`docker compose up --build` serves the app at http://localhost:8080: nginx (`frontend/nginx.conf`, non-root, full CSP, gzip) proxies `/api` to the backend container (non-root, SQLite in the `fingen-data` volume, port not published). Secrets come from `backend/.env` at runtime. The frontend image runs `vite build` only (a unit test imports the backend dataset, outside its build context); type checks happen in CI. Keep the CSP in `nginx.conf` and `vite.config.ts` in step.

### Demo logins (development only, seeded in `db.py`)

`admin@fingen.demo` and `learner@fingen.demo`. A password set in `.env` is re-applied on every startup. Passwords come from `SEED_ADMIN_PASSWORD` / `SEED_LEARNER_PASSWORD`, otherwise they are generated and printed once (`[seed] ...`) in the backend console when the account is created. There are no hardcoded passwords.

## Architecture

### Data and seeding — read this before editing content

Content lives in `backend/app/data/demo_dataset.json`: 3 paths (`platform-core`, `transaction-flows`, `l2-support-ops`) × 10 nodes = 30 nodes, ids 1–30, plus 25 `runbooks`. Each node carries markdown `content`, `dependencies` (can point into another path: node 20 needs node 5), `runbook_ids`, a `sample_question`, and a scenario. The dataset file is CRLF, 2-space indented, `ensure_ascii=False`; rewrite it with exactly that formatting to keep diffs small.

`init_db()` runs from the FastAPI lifespan handler: creates tables, runs migrations (`MIGRATIONS` list in `db.py`, tracked with `PRAGMA user_version`; append new ones, never edit applied ones), then **upserts paths, nodes and runbooks from the dataset by id on every startup** (`_sync_dataset`) and rebuilds the derived `node_runbooks` and `node_subtopics` tables (subtopics come from each node's `## ` headings via `services/subtopics.py`, skipping `Overview`), so dataset edits appear after a restart; users, progress and assessments are untouched. Users and progress are seeded only in development. `_seed_demo_users` hardcodes progress for users 2–5 by node id ranges (e.g. 1–30, 11–15) and `_seed_demo_assessments` gives them open ended scores by node id, so renumbering nodes silently skews the admin/analytics demo data. Tests that count `assessments` rows must filter out these seeded rows.

### Auth and identity

- Login (`routers/auth.py`) verifies argon2id hashes (`passwords.py`) and sets a JWT in the `httpOnly`, `SameSite=Strict` cookie `fingen_session`. Nothing auth-related is stored in `localStorage`; `AuthContext` asks `/api/auth/me` on load.
- `security.py` holds `get_current_user` (decodes the cookie, **reloads the user from the DB**), `require_admin`, the slowapi `limiter`, and the CSRF and security-header middleware. Guards are applied per router in `main.py`, so a new router must be mounted with `dependencies=authenticated` (or `admin_only`).
- The user always comes from the session: request schemas never contain `user_id`. Endpoints needing the id declare `user: CurrentUser = Depends(get_current_user)` (FastAPI caches it per request).
- Every state-changing `/api/*` request must send `X-Requested-With: fetch` (CSRF check); `api.ts` `request()` adds it. Hand-written curl/tests must too.
- Rate-limited endpoints (slowapi decorator) need a `request: Request` parameter.

### Backend (`backend/app/`)

Routers (thin HTTP, mounted under `/api/<name>` in `main.py`) → services (logic; open connections with `with db.connection() as conn:`, which commits, rolls back and closes; no ORM) → SQLite.

- `llm_service.py` builds prompts and parses evaluations; the HTTP call goes through a provider from `llm_providers.py`, picked by `LLM_PROVIDER`: `OpenAICompatibleProvider` (`/chat/completions`), `AnthropicProvider` (`/v1/messages` over plain HTTP, no SDK) or `OfflineProvider` (no network: returns the closest lesson section, and scores answers by keyword coverage in the same JSON shape a model uses). Providers share a linear-backoff retry. The Nemotron model is a reasoning model: its hidden reasoning (`reasoning_content`) counts against `max_tokens`, so keep limits generous or replies truncate. `evaluate_answer` asks for a JSON object (score/category/feedback/key_points) and `_parse_evaluation` extracts the outermost `{...}`; a non-JSON reply raises `LLMClientError`. Callers catch `LLMClientError` and degrade (`fallback_response`, or an "Unavailable" evaluation).
- Learner text is wrapped in `<learner_input>` tags with server-side system prompts (`CHAT_SYSTEM_PROMPT`, `EVAL_SYSTEM_PROMPT`); evaluation categories are allowlisted.
- RAG in `chat.py` is not retrieval: `kb_service.get_context_documents` concatenates the `content` of **every node in the selected path** into the prompt.
- `progress_service.py` — per-user node `status` (`pending`, `in_progress`, `done`, `skipped`; one row per user and node). A node is `locked` while any dependency is not done **or skipped**; skipped unlocks dependents but never counts as done. `PUT /api/progress/node/{id}` sets status and returns 409 on a locked node unless resetting to pending. `annotate_nodes` fills `status`, `locked`, `locked_by` and `prerequisites` (with path and status, including cross-path ones).
- `progress_service.summary` gives the streak (consecutive UTC days with any activity, surviving until a full day is missed) and the node to continue with. `certificate_service` decides eligibility server side: every node `done` and the average of each node's best non-`Unavailable` score at least `CERT_MIN_AVG_SCORE`; it returns a plain language `missing` list the page shows as is.
- `search_service` powers `GET /api/search` (Ctrl K palette): escaped `LIKE` over path, node, subtopic and runbook titles, capped per kind, each result carrying the app URL to open.
- `routers/assessment.py` and `progress.py`/`admin.py` contain inline SQL rather than going through a service.
- `schemas.py` — Pydantic v2 request/response models; `frontend/src/types.ts` mirrors them by hand.

### Frontend (`frontend/src/`)

- `App.tsx` — router, `PrivateRoute`/`adminOnly` guard, topbar (with `CommandPalette` and `ThemeToggle`) and footer. Every route except Login and Home is `React.lazy`. The routes sit inside an `ErrorBoundary` **keyed by pathname**, so each page remounts with fresh state on navigation; pages rely on this and do not reset state when their URL param changes. The brand mark is `components/Logo.tsx` (original FinGen mark); never reintroduce the former client's name, logo or copyright (public repo).
- `api.ts` — every backend call, typed with `types.ts` (which mirrors `schemas.py` by hand).
- **Styling:** design tokens in `styles/tokens.css` (light and dark; the toggle sets `<html data-theme>`, default follows `prefers-color-scheme`). Components use **CSS Modules** plus tokens, never raw hex; inline `style` is only for runtime geometry (widths, positions). Shared page pieces (page width, title, cards, buttons, badges, bars, form fields) are in `styles/page.module.css`; `components/ui/` has `Skeleton` and `StateMessage` (empty and error states). Global `input:focus` rules in `styles.css` outrank a module class, so override `:focus` explicitly when an input needs a different look. The legacy `--ss-*` variables are mapped onto tokens for the remaining global classes (topbar, footer, `ss-btn`).
- ESLint's `react-hooks/set-state-in-effect` is on: derive values instead of setting state synchronously inside effects.
- **Roadmap** (`/roadmaps/:pathId` → `routes/ModuleView.tsx`, parts in `components/roadmap/`): `layout.ts` is a pure, unit-tested layout (spine, alternating subtopic branches, section labels, SVG paths). Spine segments are solid when a node requires its predecessor, dotted otherwise; prerequisite arcs for skipped-over nodes are drawn only for the hovered/focused/selected node. `NodeDrawer` is a focus-trapped `role=dialog` with D/P/S/R/Esc shortcuts; the open node lives in `?node=ID`. Below 768px `RoadmapList` replaces the canvas and the drawer becomes a bottom sheet.
- `RunbookLibrary.tsx` reads `/api/runbooks` and opens `?open=ID` in a native modal `<dialog>` (do not call `close()` in the effect cleanup: under StrictMode it fires `onClose` and clears the URL); `ChatAssistant.tsx` prefills from `?path=&q=`.
- **Motion** (home page): pure CSS keyframes plus `lib/motion.ts` (`useInView`, `useCountUp`). Animate only transform and opacity, 150 to 700ms, and make every animation static under `prefers-reduced-motion`. The app shell hides topbar and footer until the auth check resolves; removing that brings back a large layout shift.
- **Images** are self-hosted in `src/assets/images/`: photos as AVIF + WebP at 400/800/1200 px generated by `scripts/optimize-images.mjs` (source JPEGs are not committed), rendered with `components/Picture.tsx`; original SVG illustrations alongside. Any new image must be credited in both `CREDITS.md` and `src/lib/credits.ts`. The page CSP is self-only, so never hotlink images or fonts.
- Lessons and AI Tutor replies render through `components/Markdown.tsx` (react-markdown + rehype-sanitize). Never use `dangerouslySetInnerHTML`.

### API surface

`/api/{roadmaps,progress,assessments,chat,runbooks,search,certificate,analytics,admin,auth}` plus `GET /api/health`. FastAPI serves interactive docs at `/docs` when the backend is running — use that rather than a hand-maintained endpoint table.

## Writing user-facing text

No em dashes, en dashes, or hyphens used as separators in anything a user reads (UI strings, dataset content, API messages), and no hyphenated prose compounds such as "real-time" or "open-ended" (write "real time", "open ended"; "rerun", "cutoff", "preproduction" are closed up). Code, SQL, identifiers, slugs, URLs and date formats keep their hyphens. `python scripts/check_no_dashes.py --list` enforces this and runs in pytest (`tests/test_no_dashes.py`).

## Repo notes

- A local scratch notes file with scraped third-party HTML sits at the repo root, excluded via `.git/info/exclude`; don't read, edit or commit it.
- `.claude/` and `settings.local.json` are gitignored.
- `tasks/todo.md` tracks the enhancement brief phase by phase (with a review per phase); `tasks/lessons.md` holds rules learned from past mistakes. Read both before starting work.
- `README.md` is the public overview (features, Docker, configuration, checks); keep it in step when setup or commands change.
