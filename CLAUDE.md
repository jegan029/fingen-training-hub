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
cd backend && .venv/Scripts/pip-audit -r requirements.txt && .venv/Scripts/bandit -r app ../scripts/servicenow_probe.py -q
cd frontend && npm audit --audit-level=high

# ServiceNow mapping check (mock mode in development; prints no secrets or article text)
backend/.venv/Scripts/python scripts/servicenow_probe.py --limit 3
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

`app/config.py` loads `backend/.env` via python-dotenv (real env vars take precedence); it is read once at startup, so restart uvicorn after editing it. See `backend/.env.example` for every key. `APP_ENV` defaults to `production`, which **refuses to start without a 32+ byte `APP_SECRET_KEY`**, disables `/docs` and seeds no accounts; local work needs `APP_ENV=development`. LLM keys: `LLM_PROVIDER` (`openai_compatible` default, `anthropic`, or `offline`), `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT` (default 15), `LLM_RETRIES` (default 3). `CERT_MIN_AVG_SCORE` (default 7) gates the certificate. `SERVICENOW_*` keys configure the knowledge sync; with `APP_ENV=development` it is on in mock mode (fixtures, no network) and the first sync runs 15 s after startup, so a dev `app.db` gets the synthetic articles (`SERVICENOW_ENABLED=false` turns it off; tests and e2e set `SERVICENOW_SCHEDULER=false`). The configured provider is NVIDIA (`https://integrate.api.nvidia.com/v1`, model `nvidia/nemotron-3-super-120b-a12b`). Without a working key/model the app still runs; chat/assessment fall back to a canned message.

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
- `security.py` holds `get_current_user` (decodes the cookie, **reloads the user from the DB**), `require_admin`, the slowapi `limiter`, and the CSRF and security-header middleware. Guards are applied per router in `main.py`, so a new router must be mounted with `dependencies=authenticated` (or `admin_only`). The one exception is `routers/public.py` (`GET /api/public/stats`, the sign in page's three aggregate counts, dataset runbooks only, cached 10 minutes, 30 a minute); keep it to aggregate counts. 429 responses go through `security.rate_limit_exceeded`, which adds `Retry-After`.
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
- `search_service` powers `GET /api/search` (Ctrl K palette): escaped `LIKE` over path, node, subtopic and runbook titles plus (within clearance) articles, applications and document names, capped per kind, each result carrying the app URL to open.
- `routers/assessment.py` and `progress.py`/`admin.py` contain inline SQL rather than going through a service.
- **ServiceNow knowledge** (`integrations/servicenow/`, full guide in `docs/SERVICENOW_INTEGRATION.md`): read only client (allowlisted HTTPS host, no redirects, OAuth, retries, circuit breaker), `mapping.yaml` validated at startup (an invalid mapping stops the app when the integration is on), mock client over `fixtures/` in the Table API's shape, and `SyncEngine` (incremental by `sys_updated_on >=` watermark, full retires but never deletes, keyed by KB number, one run at a time via a lock plus a `running` row in `sync_runs`). APScheduler runs in the lifespan. Migration `m006` added `kb_articles`, `applications`, `article_applications`, `article_documents`, `sync_runs`, `article_nodes`, `kb_access_log`, `runbooks.source/kb_article_id/classification` and `users.max_classification`. ServiceNow runbook rows use id `RUNBOOK_ID_OFFSET (100000) + article id`; dataset runbook ids must stay below it. Documents are stored by sha256 in `KB_DOCUMENTS_DIR` (next to the DB) and served only by the access checked download route. Article HTML goes through nh3 + markdownify and `services/prose.normalise_dashes` (the same patterns `check_no_dashes.py` imports); `body_raw_html` is never returned.
- **Classification** (`services/classification.py`): levels public < internal < confidential < restricted; unknown content is restricted, unknown clearance is public. `CurrentUser.max_classification` is reloaded every request. Every query returning articles, documents, applications, runbooks, search results or tutor context filters with `visible_sql` / `visible_sql_named` in SQL, and hidden items return the same 404 as missing ones. Local runbooks are `internal`. `ChatRequest` takes exactly one of `path_id` or `article_id`; articles above `SERVICENOW_LLM_MAX_CLASSIFICATION` get 403 before the provider is called. Views and downloads of confidential and restricted content go to `kb_access_log` (`knowledge_service.record_access`).
- `schemas.py` — Pydantic v2 request/response models; `frontend/src/types.ts` mirrors them by hand.

### Frontend (`frontend/src/`)

- `App.tsx` — router, `PrivateRoute`/`adminOnly` guard, topbar (with `CommandPalette` and `ThemeToggle`) and footer. Every route except Login and Home is `React.lazy`. The routes sit inside an `ErrorBoundary` **keyed by pathname**, so each page remounts with fresh state on navigation; pages rely on this and do not reset state when their URL param changes. The brand mark is `components/Logo.tsx` (original FinGen mark); never reintroduce the former client's name, logo or copyright (public repo).
- `api.ts` — every backend call, typed with `types.ts` (which mirrors `schemas.py` by hand).
- **Styling:** design tokens in `styles/tokens.css` (light and dark; the toggle sets `<html data-theme>`, default follows `prefers-color-scheme`). Components use **CSS Modules** plus tokens, never raw hex; inline `style` is only for runtime geometry (widths, positions). Shared page pieces (page width, title, cards, buttons, badges, bars, form fields) are in `styles/page.module.css`; `components/ui/` has `Skeleton` and `StateMessage` (empty and error states). Global `input:focus` rules in `styles.css` outrank a module class, so override `:focus` explicitly when an input needs a different look. The legacy `--ss-*` variables are mapped onto tokens for the remaining global classes (topbar, footer, `ss-btn`).
- ESLint's `react-hooks/set-state-in-effect` is on: derive values instead of setting state synchronously inside effects.
- **Roadmap** (`/roadmaps/:pathId` → `routes/ModuleView.tsx`, parts in `components/roadmap/`): `layout.ts` is a pure, unit-tested layout (spine, alternating subtopic branches, section labels, SVG paths). Spine segments are solid when a node requires its predecessor, dotted otherwise; prerequisite arcs for skipped-over nodes are drawn only for the hovered/focused/selected node. `NodeDrawer` is a focus-trapped `role=dialog` with D/P/S/R/Esc shortcuts; the open node lives in `?node=ID`. Below 768px `RoadmapList` replaces the canvas and the drawer becomes a bottom sheet.
- **Sign in** (`routes/LoginPage.tsx`, parts in `components/login/`): `LoginScene` (drifting mesh, the `signin` photo, contrast overlay, `Constellation` built from the real curriculum; parallax only at 1024 px and wider with a fine pointer; loops pause while the tab is hidden), `BrandPanel` (stats from `fetchPublicStats`, `TipCard` from `tips.ts`), `SignInCard` (presentation only; the page owns the request, the unchanged 401 message, the 429 countdown from `ApiError.retryAfter` and the success hand off through `navigateWithTransition` with `prepare` and `kind: 'signin'`). Tokens `--scene-*` stay dark in both themes. The e2e backend sets `LOGIN_RATE_LIMIT` higher because the suite signs in more than 5 times a minute; match e2e password fields with `{ exact: true }` (the toggle is named "Show password").
- `RunbookLibrary.tsx` reads `/api/runbooks` and opens `?open=ID` in a native modal `<dialog>` (do not call `close()` in the effect cleanup: under StrictMode it fires `onClose` and clears the URL); `ChatAssistant.tsx` prefills from `?path=&q=`.
- **Motion**: no animation library. Motion shows state or progress only (no decorative hover or fade ins).
  - **Tokens** in `tokens.css`: `--motion-*` durations, `--ease-out`, `--ease-in-out`, `--ease-emphasis`, `--stagger-step`.
  - **Shared classes** in `styles/motion.css`, loaded once globally: `motion-rise`, `motion-fade-in`, `motion-pop`, `motion-from-end`, `motion-sheen` (skeletons) and `motion-meter` (progress fills, set with `meterStyle(pct)`).
    - Use them from TSX through `motion` in `lib/motion.ts`, or with `composes: motion-rise from global` in a module.
    - Never compose from a module file: that copies it into every chunk.
    - Delays come from `--i` (`staggerStyle`) or `--delay`.
    - Animations fill backwards only, so hover transforms keep working.
  - **Helpers** in `lib/motion.ts`: `useInView`, `useCountUp`, `usePrefersReducedMotion`, `navigateWithTransition` and `components/TransitionLink.tsx`.
    - These are View Transitions, instant where unsupported or under reduced motion.
    - The `waitFor` option waits with timers, because frames are paused during the update.
  - **Shared title**: `sharedTitle(nodeId)` morphs the drawer title into the lesson heading.
  - **Roadmap**: connectors draw in through an SVG mask, and the completion moment is driven by `roadmap/statusChange.ts` (`describeChange` also picks `nextUp` for the drawer's handover line and the N key, and `pathComplete` for the sweep and the certificate links).
  - **Rules**:
    - Animate only transform and opacity. Progress ring and analytics arcs (`stroke-dashoffset`) are the paint only exception.
    - Every animation must be static under `prefers-reduced-motion`.
    - Counting numbers are `aria-hidden`, with the final value in hidden text.
  - The app shell hides topbar and footer until the auth check resolves; removing that brings back a large layout shift.
- **Images** are self-hosted in `src/assets/images/`: photos as AVIF + WebP at 400/800/1200 px generated by `scripts/optimize-images.mjs` (source JPEGs are not committed), rendered with `components/Picture.tsx`; original SVG illustrations alongside. Any new image must be credited in both `CREDITS.md` and `src/lib/credits.ts`. The page CSP is self-only, so never hotlink images or fonts.
- Lessons, AI Tutor replies and knowledge articles render through `components/Markdown.tsx` (react-markdown + rehype-sanitize; in app links use the router, external links open in a new tab with `noopener noreferrer`). Never use `dangerouslySetInnerHTML`.
- **Knowledge pages**: `/knowledge` (`KnowledgeLibrary`, all filters in the URL, loading derived from the last result's key rather than set in the effect), `/knowledge/:articleId`, `/knowledge/kb/:kbNumber` (resolves in article links), `/applications`, `/applications/:applicationId`. Shared pieces are in `components/knowledge/` (`ClassificationBadge` always pairs text with an icon), labels in `lib/knowledge.ts`, the admin panel in `components/admin/ServiceNowPanel.tsx`, the drawer section in `components/roadmap/NodeArticles.tsx`. `ChatAssistant` switches to article mode with `?article=ID`. Screen reader only text after visible text needs an explicit `{' '}` before the hidden span, or the accessible name runs the words together.

### API surface

`/api/{roadmaps,progress,assessments,chat,runbooks,knowledge,search,certificate,analytics,admin,auth}` plus `/api/admin/servicenow/*` and `GET /api/health`. FastAPI serves interactive docs at `/docs` when the backend is running — use that rather than a hand-maintained endpoint table.

## Writing user-facing text

No em dashes, en dashes, or hyphens used as separators in anything a user reads (UI strings, dataset content, API messages), and no hyphenated prose compounds such as "real-time" or "open-ended" (write "real time", "open ended"; "rerun", "cutoff", "preproduction" are closed up). Code, SQL, identifiers, slugs, URLs and date formats keep their hyphens. `python scripts/check_no_dashes.py --list` enforces this and runs in pytest (`tests/test_no_dashes.py`).

## Repo notes

- A local scratch notes file with scraped third-party HTML sits at the repo root, excluded via `.git/info/exclude`; don't read, edit or commit it.
- `.claude/` and `settings.local.json` are gitignored.
- `tasks/todo.md` tracks the enhancement brief phase by phase (with a review per phase); `tasks/lessons.md` holds rules learned from past mistakes. Read both before starting work.
- `README.md` is the public overview (features, Docker, configuration, checks); keep it in step when setup or commands change.
